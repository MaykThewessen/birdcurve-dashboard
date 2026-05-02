"""Historical electricity: DA prices, load, renewables, duration curve, heatmap."""
from __future__ import annotations

from fastapi import APIRouter, Query, Request

from ..downsampling import lttb_downsample

router = APIRouter(prefix="/electricity", tags=["electricity"])


@router.get("/historical")
async def get_historical(
    request: Request,
    start: str = Query(...),
    end: str = Query(...),
    max_points: int = Query(5000, ge=10, le=50000),
):
    engine = request.app.state.engine

    da_rows = engine.query_electricity(
        "ts_hourly",
        {"DA_price": ["DA_price"]},
        start, end,
    )
    da_series = [
        {"timestamp": r["timestamp"], "value": r.get("DA_price")}
        for r in da_rows
        if r.get("DA_price") is not None
    ]

    # Load, PV, Wind from ts_15min (resample to hourly via DuckDB)
    # NOTE: DuckDB strftime() takes (format, timestamp) — opposite of SQLite.
    # SQLite stores timestamps as TEXT, so explicit ::TIMESTAMP cast is needed.
    supply_sql = """
        SELECT
            strftime('%Y-%m-%d %H:00:00', timestamp_utc::TIMESTAMP) as hour,
            source, column_name,
            AVG(value) as value
        FROM sqlite_db.ts_15min
        WHERE source IN ('Load_NL', 'NED_PV', 'NED_Wind_Onshore', 'NED_Wind_Offshore', 'CrossBorder_NL')
          AND column_name IN ('Actual_Load_MW', 'PV_generation_MW', 'Wind_Onshore_generation_MW', 'Wind_Offshore_generation_MW', 'net_total_NL_MW')
          AND timestamp_utc >= ?
          AND timestamp_utc <= ?
        GROUP BY 1, 2, 3
        ORDER BY 1
    """
    supply_rows = engine.query(supply_sql, [start, end])

    supply_pivot: dict[str, dict] = {}
    col_map = {
        "Actual_Load_MW": "load",
        "PV_generation_MW": "pv",
        "Wind_Onshore_generation_MW": "wind_onshore",
        "Wind_Offshore_generation_MW": "wind_offshore",
        "net_total_NL_MW": "import",
    }
    for row in supply_rows:
        h = row["hour"]
        if h not in supply_pivot:
            supply_pivot[h] = {"timestamp": h}
        key = col_map.get(row["column_name"])
        if key:
            supply_pivot[h][key] = round(row["value"] / 1000, 3)  # MW -> GW

    supply_series = list(supply_pivot.values())

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

    return {
        "da_prices": da_series,
        "supply": supply_series,
    }


@router.get("/duration-curve")
async def get_duration_curve(
    request: Request,
    year: int = Query(...),
):
    engine = request.app.state.engine

    sql = """
        SELECT value
        FROM sqlite_db.ts_hourly
        WHERE source = 'DA_price'
          AND column_name = 'DA_price'
          AND timestamp_utc >= ?
          AND timestamp_utc < ?
        ORDER BY value DESC
    """
    start = f"{year}-01-01"
    end = f"{year + 1}-01-01"
    rows = engine.query(sql, [start, end])
    prices = [r["value"] for r in rows]

    negative_hours = sum(1 for p in prices if p < 0)
    peak_hours = sum(1 for p in prices if p > 200)

    return {
        "sorted_prices": prices,
        "negative_hours": negative_hours,
        "peak_hours": peak_hours,
        "total_hours": len(prices),
    }


@router.get("/heatmap")
async def get_heatmap(
    request: Request,
    year: int = Query(...),
):
    engine = request.app.state.engine

    # NOTE: DuckDB strftime() = (format, timestamp), needs ::TIMESTAMP cast from TEXT
    sql = """
        SELECT
            EXTRACT(month FROM timestamp_utc::TIMESTAMP) as month,
            EXTRACT(hour FROM timestamp_utc::TIMESTAMP) as hour,
            AVG(value) as avg_price
        FROM sqlite_db.ts_hourly
        WHERE source = 'DA_price'
          AND column_name = 'DA_price'
          AND timestamp_utc >= ?
          AND timestamp_utc < ?
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

    return {
        "hours": list(range(24)),
        "months": list(range(1, 13)),
        "values": matrix,
    }
