"""Commodity prices: Gas TTF, CO2 EUA, Coal API2, EUR/USD, marginal costs."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request, Response

from ..downsampling import lttb_downsample
from ._helpers import add_cache_headers

router = APIRouter(prefix="/commodities", tags=["commodities"])

# Wide-format ts_daily columns. Coal_API2 and EUR_USD are not in the live
# DuckDB ts_daily table — return empty arrays for them so the frontend
# contract is preserved (page degrades gracefully).
COMMODITY_COLUMNS = {
    "gas_ttf": "Gas_TTF__price",
    "co2_eua": "CO2_EUA__price",
}

# Frontend-visible series keys that are intentionally empty (not in DB yet).
_EMPTY_SERIES_KEYS = ["coal_api2", "eur_usd"]

# CCGT marginal cost: Gas_TTF / 0.40 + CO2 * 0.400 (40% efficiency, 0.4 tCO2/MWh)
_GAS_EFFICIENCY = 0.40
_GAS_EMISSIONS_T_PER_MWH = 0.400


def _date_str(ts) -> str:
    """Convert pandas.Timestamp/datetime/str into 'YYYY-MM-DD'."""
    return str(ts)[:10]


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _downsample(series: list[dict], max_points: int) -> list[dict]:
    if len(series) <= max_points:
        return series
    for i, d in enumerate(series):
        d["_idx"] = i
    series = lttb_downsample(series, x_key="_idx", y_key="value", max_points=max_points)
    for d in series:
        d.pop("_idx", None)
    return series


@router.get("")
async def get_commodities(
    request: Request,
    response: Response,
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    include_marginal: bool = Query(False),
    max_points: int = Query(5000, ge=10, le=50000),
):
    engine = request.app.state.engine

    rows = engine.query_wide(
        "ts_daily", list(COMMODITY_COLUMNS.values()), start, end
    )

    result: dict[str, list[dict]] = {}
    for key, col in COMMODITY_COLUMNS.items():
        series = [
            {"date": _date_str(row["timestamp_utc"]), "value": row[col]}
            for row in rows
            if row[col] is not None
        ]
        result[key] = _downsample(series, max_points)

    # Empty arrays for series not in the live DB (frontend contract).
    for key in _EMPTY_SERIES_KEYS:
        result[key] = []

    if include_marginal:
        gas_col = COMMODITY_COLUMNS["gas_ttf"]
        co2_col = COMMODITY_COLUMNS["co2_eua"]
        gas_marginal = []
        for row in rows:
            gas, co2 = row[gas_col], row[co2_col]
            if gas is None or co2 is None:
                continue
            gas_marginal.append({
                "date": _date_str(row["timestamp_utc"]),
                "value": gas / _GAS_EFFICIENCY + co2 * _GAS_EMISSIONS_T_PER_MWH,
            })
        result["gas_marginal"] = _downsample(gas_marginal, max_points)
        # No coal data → no coal_marginal.
        result["coal_marginal"] = []

    add_cache_headers(response, end, _today_iso())
    return result


@router.get("/kpi")
async def get_commodity_kpis(request: Request, response: Response):
    """Latest values and daily change for each commodity."""
    engine = request.app.state.engine

    sql = """
        SELECT timestamp_utc, "Gas_TTF__price", "CO2_EUA__price"
        FROM ts_daily
        ORDER BY timestamp_utc DESC
        LIMIT 2
    """
    rows = engine.query(sql)

    kpis: dict = {}
    for key, col in COMMODITY_COLUMNS.items():
        values_with_dates = [
            (r["timestamp_utc"], r[col]) for r in rows if r[col] is not None
        ]
        if len(values_with_dates) >= 2:
            latest_ts, latest = values_with_dates[0]
            _, prev = values_with_dates[1]
            kpis[f"{key}_latest"] = latest
            kpis[f"{key}_change"] = round(latest - prev, 2) if latest is not None and prev is not None else 0
            kpis[f"{key}_date"] = _date_str(latest_ts)
        elif values_with_dates:
            latest_ts, latest = values_with_dates[0]
            kpis[f"{key}_latest"] = latest
            kpis[f"{key}_change"] = 0
            kpis[f"{key}_date"] = _date_str(latest_ts)

    # KPI is always "latest" → short cache.
    response.headers["Cache-Control"] = "public, max-age=300"
    return kpis
