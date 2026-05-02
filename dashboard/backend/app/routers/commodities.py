"""Commodity prices: Gas TTF, CO2 EUA, Coal API2, EUR/USD, marginal costs."""
from __future__ import annotations

from fastapi import APIRouter, Query, Request

from ..downsampling import lttb_downsample

router = APIRouter(prefix="/commodities", tags=["commodities"])

_COMMODITY_MAP = {
    "gas_ttf": ("Gas_TTF", "price_EUR_MWh_HHV"),
    "co2_eua": ("CO2_EUA", "price_CO2_EUR_ton"),
    "coal_api2": ("Coal_API2", "price_EUR_MWh_LHV"),
    "eur_usd": ("EUR_USD", "price_USD_per_EUR"),
    "gas_marginal": ("Gas_TTF", "Gas_Mar"),
    "coal_marginal": ("Coal_API2", "Coal_Mar"),
}


def _query_series(engine, source: str, col: str, start: str, end: str) -> list[dict]:
    rows = engine.query_commodity(source, [col], start, end)
    return [{"date": r["date"], "value": r.get(col)} for r in rows if r.get(col) is not None]


@router.get("")
async def get_commodities(
    request: Request,
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    include_marginal: bool = Query(False),
    max_points: int = Query(5000, ge=10, le=50000),
):
    engine = request.app.state.engine

    series_keys = ["gas_ttf", "co2_eua", "coal_api2", "eur_usd"]
    if include_marginal:
        series_keys.extend(["gas_marginal", "coal_marginal"])

    result = {}
    for key in series_keys:
        source, col = _COMMODITY_MAP[key]
        data = _query_series(engine, source, col, start, end)
        if len(data) > max_points:
            for i, d in enumerate(data):
                d["_idx"] = i
            data = lttb_downsample(data, x_key="_idx", y_key="value", max_points=max_points)
            for d in data:
                d.pop("_idx", None)
        result[key] = data

    return result


@router.get("/kpi")
async def get_commodity_kpis(request: Request):
    """Latest values and daily change for each commodity."""
    engine = request.app.state.engine
    kpis = {}

    for key, (source, col) in _COMMODITY_MAP.items():
        sql = """
            SELECT timestamp_utc, value
            FROM sqlite_db.ts_daily
            WHERE source = ? AND column_name = ?
            ORDER BY timestamp_utc DESC LIMIT 2
        """
        rows = engine.query(sql, [source, col])

        if len(rows) >= 2:
            latest = rows[0]["value"]
            prev = rows[1]["value"]
            kpis[f"{key}_latest"] = latest
            kpis[f"{key}_change"] = round(latest - prev, 2) if latest and prev else 0
            kpis[f"{key}_date"] = rows[0]["timestamp_utc"][:10]
        elif rows:
            kpis[f"{key}_latest"] = rows[0]["value"]
            kpis[f"{key}_change"] = 0
            kpis[f"{key}_date"] = rows[0]["timestamp_utc"][:10]

    return kpis
