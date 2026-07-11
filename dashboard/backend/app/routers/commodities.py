"""Commodity prices: Gas TTF, CO2 EUA, Coal API2, EUR/USD, marginal costs."""
from __future__ import annotations

import bisect

from fastapi import APIRouter, Query, Request, Response
from fastapi.concurrency import run_in_threadpool

from ..downsampling import lttb_by_index
from ._helpers import add_cache_headers, end_exclusive, today_iso

router = APIRouter(prefix="/commodities", tags=["commodities"])

# Wide-format ts_daily columns. Coal_API2 and EUR_USD are not in the live
# DuckDB ts_daily table — they come from sidecar CSVs registered by the
# engine at startup (see blocks below); the page degrades gracefully to
# empty arrays when a sidecar is absent.
COMMODITY_COLUMNS = {
    "gas_ttf": "Gas_TTF__price",
    "co2_eua": "CO2_EUA__price",
}

# Gas (CCGT) marginal cost.
#
# Mind the HHV vs LHV gap: TTF (and most EU gas markets) is priced per
# MWh_HHV (gross calorific value), but plant efficiencies are reported on
# the LHV basis (net calorific value, EU convention). For typical Dutch
# H-gas the ratio HHV/LHV ≈ 1.108 — skipping this conversion under-states
# CCGT marginal cost by ~10 %.
#
# IPCC default natural gas combustion factor (56.1 kg CO2/GJ_NCV) is
# already LHV-basis, so 0.202 tCO2/MWh_LHV stays as the canonical number.
#
# Final formula: (gas_HHV * HHV/LHV + co2 * emissions_LHV) / efficiency_LHV
#
# At η=0.58, TTF=50, CO2=70 → (50*1.108 + 70*0.202)/0.58 ≈ 119 EUR/MWh_e.
_GAS_EFFICIENCY_LHV = 0.58  # modern CCGT (KCB, Maasvlakte 3, Sloecentrale class)
_HHV_OVER_LHV_NATURAL_GAS = 1.108  # Dutch H-gas mix; pure CH4 is ~1.109
_GAS_EMISSIONS_T_PER_MWH_LHV = 0.202  # IPCC 2006 NCV factor for natural gas

# Coal marginal cost: (Coal_USD_ton / 6.978 + CO2 * 0.335) / 0.46
# 6.978 ≈ MWh per ton at 25.12 GJ/ton LHV (3.6 GJ/MWh → 6.978 MWh/ton).
# 0.335 tCO2/MWh_th is the standard thermal-coal emissions factor.
# 0.46 is a typical hard-coal plant efficiency.
# Note: coal price is in USD; the simplification treats USD≈EUR for this
# headline metric. Use the EUR/USD series client-side for currency-exact work.
_COAL_MWH_PER_TON = 6.978
_COAL_EMISSIONS_T_PER_MWH = 0.335
_COAL_EFFICIENCY = 0.46


def _date_str(ts) -> str:
    """Convert pandas.Timestamp/datetime/str into 'YYYY-MM-DD'."""
    return str(ts)[:10]


def _get_commodities_sync(
    engine, start: str, end: str, include_marginal: bool, max_points: int,
) -> dict[str, list[dict]]:
    rows = engine.query_wide(
        "ts_daily", list(COMMODITY_COLUMNS.values()), start, end_exclusive(end)
    )

    result: dict[str, list[dict]] = {}
    for key, col in COMMODITY_COLUMNS.items():
        series = [
            {"date": _date_str(row["timestamp_utc"]), "value": row[col]}
            for row in rows
            if row[col] is not None
        ]
        result[key] = lttb_by_index(series, "value", max_points)

    # EUR/USD comes from a sidecar CSV registered by the engine at startup.
    # Its `date` column is a DATE, so `<=` with a bare date is inclusive.
    if engine.has_eur_usd:
        eur_usd_rows = engine.query(
            'SELECT date, USD_per_EUR FROM eur_usd '
            'WHERE date >= ? AND date <= ? '
            'ORDER BY date',
            [start, end],
        )
        eur_usd_series = [
            {"date": _date_str(r["date"]), "value": r["USD_per_EUR"]}
            for r in eur_usd_rows
            if r["USD_per_EUR"] is not None
        ]
        result["eur_usd"] = lttb_by_index(eur_usd_series, "value", max_points)
    else:
        result["eur_usd"] = []

    # Coal API2 (Rotterdam coal futures) — same sidecar pattern as EUR/USD.
    if engine.has_coal_api2:
        coal_rows = engine.query(
            'SELECT date, price_USD_ton FROM coal_api2 '
            'WHERE date >= ? AND date <= ? '
            'ORDER BY date',
            [start, end],
        )
        coal_series = [
            {"date": _date_str(r["date"]), "value": r["price_USD_ton"]}
            for r in coal_rows
            if r["price_USD_ton"] is not None
        ]
        result["coal_api2"] = lttb_by_index(coal_series, "value", max_points)
    else:
        result["coal_api2"] = []

    if include_marginal:
        gas_col = COMMODITY_COLUMNS["gas_ttf"]
        co2_col = COMMODITY_COLUMNS["co2_eua"]
        gas_marginal = []
        for row in rows:
            gas, co2 = row[gas_col], row[co2_col]
            if gas is None or co2 is None:
                continue
            # Convert TTF (HHV-quoted) to LHV basis, then add LHV-basis CO2
            # cost and divide by LHV efficiency. Both terms end up in
            # EUR/MWh_e and the divisor is consistent with how plant
            # efficiency is reported.
            gas_lhv = gas * _HHV_OVER_LHV_NATURAL_GAS
            gas_marginal.append({
                "date": _date_str(row["timestamp_utc"]),
                "value": (gas_lhv + co2 * _GAS_EMISSIONS_T_PER_MWH_LHV) / _GAS_EFFICIENCY_LHV,
            })
        result["gas_marginal"] = lttb_by_index(gas_marginal, "value", max_points)

        # Coal marginal — joins ts_daily gas/CO2 dates against the coal sidecar.
        # Coal is in USD/ton; convert to EUR using the daily EUR/USD rate so
        # the result is currency-correct (without it, a 1.18 EUR/USD makes
        # coal_marginal ~15% too high). Forward-fill missing FX days from
        # the most recent known rate.
        if engine.has_coal_api2:
            coal_lookup = {
                _date_str(r["date"]): r["price_USD_ton"]
                for r in engine.query(
                    'SELECT date, price_USD_ton FROM coal_api2 '
                    'WHERE date >= ? AND date <= ? '
                    'AND price_USD_ton IS NOT NULL',
                    [start, end],
                )
            }
            fx_dates: list[str] = []
            fx_rates: list[float] = []
            if engine.has_eur_usd:
                for r in engine.query(
                    'SELECT date, USD_per_EUR FROM eur_usd '
                    'WHERE date <= ? AND USD_per_EUR IS NOT NULL '
                    'ORDER BY date',
                    [end],
                ):
                    fx_dates.append(_date_str(r["date"]))
                    fx_rates.append(r["USD_per_EUR"])

            coal_marginal = []
            for row in rows:
                gas, co2 = row[gas_col], row[co2_col]
                date_key = _date_str(row["timestamp_utc"])
                coal = coal_lookup.get(date_key)
                if gas is None or co2 is None or coal is None:
                    continue
                # Forward-fill EUR/USD: most recent rate at or before date.
                # Fallback 1.0 (i.e. USD-as-EUR) when no FX data is loaded
                # — preserves the legacy behaviour for repos without the CSV.
                idx = bisect.bisect_right(fx_dates, date_key)
                usd_per_eur = fx_rates[idx - 1] if idx > 0 else 1.0
                coal_eur_per_mwh = coal / _COAL_MWH_PER_TON / usd_per_eur
                coal_marginal.append({
                    "date": date_key,
                    "value": (coal_eur_per_mwh + co2 * _COAL_EMISSIONS_T_PER_MWH)
                             / _COAL_EFFICIENCY,
                })
            result["coal_marginal"] = lttb_by_index(coal_marginal, "value", max_points)
        else:
            result["coal_marginal"] = []

    return result


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
    result = await run_in_threadpool(
        _get_commodities_sync, engine, start, end, include_marginal, max_points
    )
    add_cache_headers(response, end, today_iso())
    return result


def _get_commodity_kpis_sync(engine) -> dict:
    kpis: dict = {}
    for key, col in COMMODITY_COLUMNS.items():
        # NOT isnan: a float NaN passes `IS NOT NULL` in DuckDB but becomes
        # None after JSON sanitising, and `latest - prev` on None would 500.
        sql = f'''
            SELECT timestamp_utc, "{col}" AS value
            FROM ts_daily
            WHERE "{col}" IS NOT NULL AND NOT isnan("{col}")
            ORDER BY timestamp_utc DESC
            LIMIT 2
        '''
        rows = engine.query(sql)
        if not rows:
            continue
        latest_ts, latest = rows[0]["timestamp_utc"], rows[0]["value"]
        prev = rows[1]["value"] if len(rows) >= 2 else None
        kpis[f"{key}_latest"] = latest
        kpis[f"{key}_change"] = round(latest - prev, 2) if prev is not None else 0
        kpis[f"{key}_date"] = _date_str(latest_ts)

    # EUR/USD KPI from sidecar table when available.
    if engine.has_eur_usd:
        rows = engine.query(
            'SELECT date, USD_per_EUR FROM eur_usd '
            'WHERE USD_per_EUR IS NOT NULL AND NOT isnan(USD_per_EUR) '
            'ORDER BY date DESC LIMIT 2'
        )
        if rows:
            latest = rows[0]["USD_per_EUR"]
            prev = rows[1]["USD_per_EUR"] if len(rows) >= 2 else None
            kpis["eur_usd_latest"] = latest
            kpis["eur_usd_change"] = round(latest - prev, 4) if prev is not None else 0
            kpis["eur_usd_date"] = _date_str(rows[0]["date"])

    # Coal API2 KPI from sidecar table when available.
    if engine.has_coal_api2:
        rows = engine.query(
            'SELECT date, price_USD_ton FROM coal_api2 '
            'WHERE price_USD_ton IS NOT NULL AND NOT isnan(price_USD_ton) '
            'ORDER BY date DESC LIMIT 2'
        )
        if rows:
            latest = rows[0]["price_USD_ton"]
            prev = rows[1]["price_USD_ton"] if len(rows) >= 2 else None
            kpis["coal_api2_latest"] = latest
            kpis["coal_api2_change"] = round(latest - prev, 2) if prev is not None else 0
            kpis["coal_api2_date"] = _date_str(rows[0]["date"])

    return kpis


@router.get("/kpi")
async def get_commodity_kpis(request: Request, response: Response):
    """Latest non-null value and change vs prior non-null per commodity.

    Per-column query so a stale tail in one series (e.g. days of NULL
    while the source feed lags) doesn't suppress the others.
    """
    engine = request.app.state.engine
    kpis = await run_in_threadpool(_get_commodity_kpis_sync, engine)
    # KPI is always "latest" → short cache.
    response.headers["Cache-Control"] = "public, max-age=300"
    return kpis
