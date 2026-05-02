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


@router.get("/historical")
async def get_historical(
    request: Request,
    response: Response,
    start: str = Query(...),
    end: str = Query(...),
    max_points: int = Query(5000, ge=10, le=50000),
):
    engine = request.app.state.engine

    da_rows = engine.query_wide(
        "ts_hourly", ["DA_price__DA_price"], start, end
    )
    da_series = [
        {"timestamp": str(r["timestamp_utc"]), "value": r["DA_price__DA_price"]}
        for r in da_rows
        if not _is_missing(r["DA_price__DA_price"])
    ]

    # 15-min → hourly rollup directly in DuckDB; wide-format response shape.
    supply_sql = """
        SELECT
            date_trunc('hour', timestamp_utc)             AS hour,
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
            "timestamp":     str(r["hour"]),
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

    sql = """
        SELECT "DA_price__DA_price" AS value
        FROM ts_hourly
        WHERE timestamp_utc >= ? AND timestamp_utc < ?
          AND "DA_price__DA_price" IS NOT NULL
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


@router.get("/heatmap")
async def get_heatmap(
    request: Request,
    response: Response,
    year: int = Query(...),
):
    engine = request.app.state.engine

    sql = """
        SELECT
            EXTRACT(month FROM timestamp_utc) AS month,
            EXTRACT(hour  FROM timestamp_utc) AS hour,
            AVG("DA_price__DA_price")         AS avg_price
        FROM ts_hourly
        WHERE timestamp_utc >= ? AND timestamp_utc < ?
          AND "DA_price__DA_price" IS NOT NULL
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
