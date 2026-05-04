"""Historical electricity: DA prices, load, renewables, duration curve, heatmap."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request, Response

from ..downsampling import lttb_downsample
from ._helpers import add_cache_headers

router = APIRouter(prefix="/electricity", tags=["electricity"])


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _year_end_iso(year: int) -> str:
    """Last day of the queried year, as ISO date — used for cache freshness."""
    return f"{year}-12-31"

# Conventional thresholds for duration-curve hour counts (EUR/MWh).
_NEGATIVE_PRICE_THRESHOLD = 0.0
_PEAK_PRICE_THRESHOLD = 200.0

# MW -> GW for supply series.
_MW_TO_GW = 1000.0


def _is_missing(value) -> bool:
    """SQL NULL surfaces as None or float NaN via pandas. Both mean 'no data'."""
    if value is None:
        return True
    try:
        return math.isnan(value)
    except TypeError:
        return False


def _to_gw(value):
    return None if _is_missing(value) else round(value / _MW_TO_GW, 3)


_RESOLUTION_BUCKETS = {
    "15min": "time_bucket(INTERVAL '15 minutes', timestamp_utc)",
    "hourly": "date_trunc('hour', timestamp_utc)",
    "daily": "date_trunc('day', timestamp_utc)",
}

# ts_hourly has been polluted with 15-min-aligned rows from 2025-09-30
# onwards (years 2025+ contain ~15k rows instead of ~8.7k). Until upstream
# is fixed, every consumer must filter to :00 minutes to keep counts
# (negative_hours, peak_hours, total_hours) and hourly aggregates honest.
_TS_HOURLY_HOURLY = 'EXTRACT(MINUTE FROM timestamp_utc) = 0'


def _auto_resolution(start: str, end: str) -> str:
    """Pick a sane bucket size from the requested range."""
    try:
        d_start = datetime.fromisoformat(start[:10])
        d_end = datetime.fromisoformat(end[:10])
        days = (d_end - d_start).days
    except ValueError:
        return "hourly"
    if days <= 7:
        return "15min"
    if days <= 90:
        return "hourly"
    return "daily"


@router.get("/historical")
async def get_historical(
    request: Request,
    response: Response,
    start: str = Query(...),
    end: str = Query(...),
    max_points: int = Query(5000, ge=10, le=50000),
    resolution: str = Query("auto", pattern="^(auto|15min|hourly|daily)$"),
):
    engine = request.app.state.engine

    if resolution == "auto":
        resolution = _auto_resolution(start, end)
    bucket = _RESOLUTION_BUCKETS[resolution]

    da_sql = f"""
        SELECT {bucket} AS bucket,
               AVG("DA_price__DA_price") AS value
        FROM ts_hourly
        WHERE timestamp_utc >= ? AND timestamp_utc <= ?
          AND "DA_price__DA_price" IS NOT NULL
          AND {_TS_HOURLY_HOURLY}
        GROUP BY 1
        ORDER BY 1
    """
    da_rows = engine.query(da_sql, [start, end])
    da_series = [
        {"timestamp": str(r["bucket"]), "value": r["value"]}
        for r in da_rows
        if not _is_missing(r["value"])
    ]

    supply_sql = f"""
        SELECT
            {bucket}                                      AS bucket,
            AVG("Load_NL__Actual_Load_MW")                AS load,
            AVG("NED_PV__PV")                             AS pv,
            AVG("NED_Wind_Onshore__Wind_Onshore")         AS wind_onshore,
            AVG("NED_Wind_Offshore__Wind_Offshore")       AS wind_offshore,
            AVG("CrossBorder_NL__Total_Net")              AS import
        FROM ts_15min
        WHERE timestamp_utc >= ? AND timestamp_utc <= ?
        GROUP BY 1
        ORDER BY 1
    """
    supply_rows = engine.query(supply_sql, [start, end])

    supply_series = [
        {
            "timestamp":     str(r["bucket"]),
            "load":          _to_gw(r["load"]),
            "pv":            _to_gw(r["pv"]),
            "wind_onshore":  _to_gw(r["wind_onshore"]),
            "wind_offshore": _to_gw(r["wind_offshore"]),
            "import":        _to_gw(r["import"]),
        }
        for r in supply_rows
    ]

    if len(da_series) > max_points:
        for i, d in enumerate(da_series):
            d["_idx"] = i
        da_series = lttb_downsample(da_series, "_idx", "value", max_points)
        for d in da_series:
            d.pop("_idx", None)

    if len(supply_series) > max_points:
        for i, d in enumerate(supply_series):
            d["_idx"] = i
        supply_series = lttb_downsample(supply_series, "_idx", "load", max_points)
        for d in supply_series:
            d.pop("_idx", None)

    add_cache_headers(response, end, _today_iso())
    return {
        "da_prices": da_series,
        "supply": supply_series,
    }


@router.get("/duration-curve")
async def get_duration_curve(
    request: Request,
    response: Response,
    year: int = Query(...),
):
    engine = request.app.state.engine

    sql = f"""
        SELECT "DA_price__DA_price" AS value
        FROM ts_hourly
        WHERE timestamp_utc >= ? AND timestamp_utc < ?
          AND "DA_price__DA_price" IS NOT NULL
          AND {_TS_HOURLY_HOURLY}
        ORDER BY value DESC
    """
    start = f"{year}-01-01"
    end = f"{year + 1}-01-01"
    rows = engine.query(sql, [start, end])
    prices = [r["value"] for r in rows]

    negative_hours = sum(1 for p in prices if p < _NEGATIVE_PRICE_THRESHOLD)
    peak_hours = sum(1 for p in prices if p > _PEAK_PRICE_THRESHOLD)

    add_cache_headers(response, _year_end_iso(year), _today_iso())
    return {
        "sorted_prices": prices,
        "negative_hours": negative_hours,
        "peak_hours": peak_hours,
        "total_hours": len(prices),
    }


@router.get("/duration-curves")
async def get_duration_curves(
    request: Request,
    response: Response,
    max_points_per_year: int = Query(500, ge=50, le=5000),
    min_hours: int = Query(720, ge=1, description="Drop years with fewer hours than this (default: ~1 month)"),
):
    """All historical years as separate price-duration curves.

    Each year's hourly DA prices are sorted descending and downsampled
    via LTTB to `max_points_per_year` points. X-axis is normalised to
    "percent of hours within that year" (0–100), so years with partial
    data (e.g. the current year) overlay correctly with full years.

    Years with fewer than `min_hours` of data are excluded — these are
    typically stub rows at the edges of the dataset that would render
    as single-point degenerate curves.
    """
    engine = request.app.state.engine

    sql = f"""
        SELECT EXTRACT(YEAR FROM timestamp_utc)::INT AS year,
               "DA_price__DA_price" AS value
        FROM ts_hourly
        WHERE "DA_price__DA_price" IS NOT NULL
          AND {_TS_HOURLY_HOURLY}
    """
    rows = engine.query(sql)

    by_year: dict[int, list[float]] = {}
    for r in rows:
        by_year.setdefault(r["year"], []).append(r["value"])

    # Drop sparse years (typically stubs at dataset edges).
    by_year = {y: p for y, p in by_year.items() if len(p) >= min_hours}

    curves: dict[str, list[list[float]]] = {}
    stats: dict[str, dict] = {}
    for year, prices in by_year.items():
        prices.sort(reverse=True)
        n = len(prices)
        denom = max(n - 1, 1)

        if n <= max_points_per_year:
            curves[str(year)] = [
                [round(i / denom * 100, 3), round(prices[i], 2)] for i in range(n)
            ]
        else:
            data = [{"x": i, "y": v} for i, v in enumerate(prices)]
            sampled = lttb_downsample(data, x_key="x", y_key="y", max_points=max_points_per_year)
            curves[str(year)] = [
                [round(d["x"] / denom * 100, 3), round(d["y"], 2)] for d in sampled
            ]

        stats[str(year)] = {
            "total_hours": n,
            "negative_hours": sum(1 for p in prices if p < _NEGATIVE_PRICE_THRESHOLD),
            "peak_hours": sum(1 for p in prices if p > _PEAK_PRICE_THRESHOLD),
        }

    years_sorted = sorted(by_year.keys())
    cache_anchor = _year_end_iso(years_sorted[-1]) if years_sorted else _today_iso()
    add_cache_headers(response, cache_anchor, _today_iso())
    return {"years": years_sorted, "curves": curves, "stats": stats}


@router.get("/heatmap")
async def get_heatmap(
    request: Request,
    response: Response,
    year: int = Query(...),
):
    engine = request.app.state.engine

    sql = f"""
        SELECT
            EXTRACT(month FROM timestamp_utc) AS month,
            EXTRACT(hour  FROM timestamp_utc) AS hour,
            AVG("DA_price__DA_price")         AS avg_price
        FROM ts_hourly
        WHERE timestamp_utc >= ? AND timestamp_utc < ?
          AND "DA_price__DA_price" IS NOT NULL
          AND {_TS_HOURLY_HOURLY}
        GROUP BY 1, 2
        ORDER BY 1, 2
    """
    start = f"{year}-01-01"
    end = f"{year + 1}-01-01"
    rows = engine.query(sql, [start, end])

    matrix = [[0.0] * 12 for _ in range(24)]
    for r in rows:
        h = int(r["hour"])
        m = int(r["month"]) - 1
        matrix[h][m] = round(r["avg_price"], 1)

    add_cache_headers(response, _year_end_iso(year), _today_iso())
    return {
        "hours": list(range(24)),
        "months": list(range(1, 13)),
        "values": matrix,
    }
