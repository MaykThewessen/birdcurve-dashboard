"""Ancillary services: aFRR/FCR capacity prices, volumes, revenue."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request, Response
from fastapi.concurrency import run_in_threadpool

from ..downsampling import lttb_downsample
from ._helpers import get_engine_and_dir, add_cache_headers

router = APIRouter(prefix="/ancillary", tags=["ancillary"])


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _safe(v):
    """Convert NaN/NA pandas values to None for JSON serialization."""
    import math
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


def _avg(a, b):
    """Average up/down values, surviving nulls. Returns None only if both nulls."""
    a, b = _safe(a), _safe(b)
    if a is None and b is None:
        return None
    if a is None:
        return b
    if b is None:
        return a
    return (a + b) / 2


def _sum_pair(a, b):
    """Sum up/down volumes; missing component treated as 0 unless both null."""
    a, b = _safe(a), _safe(b)
    if a is None and b is None:
        return None
    return (a or 0) + (b or 0)


def _get_capacity_sync(engine, scenario: str | None, start: str, end: str, max_points: int):
    """Historical capacity prices/volumes from DuckDB ts_4hourly first;
    forecast CSV only fills in dates beyond the last historical point.

    Why both: ts_4hourly carries actual cleared market data going back to
    when each market started (FCR earlier, aFRR later). The forecast
    file mixes actuals and predictions on the same axis, so historical
    queries shouldn't depend on which scenario the user has selected.
    """
    # 1. Historical leg from DuckDB
    hist_rows = engine.query(
        '''
        SELECT timestamp_utc                  AS dt,
               "aFRR_capacity_price__Up"      AS afrr_cap_up,
               "aFRR_capacity_price__Down"    AS afrr_cap_down,
               "FCR_capacity_price__Up"       AS fcr_up,
               "FCR_capacity_price__Down"     AS fcr_down,
               "aFRR_capacity_volume__Up"     AS afrr_vol_up,
               "aFRR_capacity_volume__Down"   AS afrr_vol_down,
               "FCR_capacity_volume__Up"      AS fcr_vol_up,
               "FCR_capacity_volume__Down"    AS fcr_vol_down
        FROM ts_4hourly
        WHERE timestamp_utc >= ? AND timestamp_utc <= ?
        ORDER BY timestamp_utc
        ''',
        [start, end],
    )

    capacity_keys = (
        "afrr_cap_up", "afrr_cap_down", "fcr_up", "fcr_down",
        "afrr_vol_up", "afrr_vol_down", "fcr_vol_up", "fcr_vol_down",
    )

    result: list[dict] = []
    seen_dts: set[str] = set()
    latest_hist_dt: str | None = None

    for r in hist_rows:
        if all(_safe(r[k]) is None for k in capacity_keys):
            continue
        dt_str = str(r["dt"])
        seen_dts.add(dt_str)
        latest_hist_dt = dt_str
        result.append({
            "datetime": dt_str,
            "block": None,  # ts_4hourly doesn't carry the auction-block label
            "afrr_cap_up": _safe(r["afrr_cap_up"]),
            "afrr_cap_down": _safe(r["afrr_cap_down"]),
            # FCR is symmetric in NL — average up/down for the headline price,
            # sum the volumes since both directions are reserved.
            "fcr_cap_price": _avg(r["fcr_up"], r["fcr_down"]),
            "afrr_vol_up": _safe(r["afrr_vol_up"]),
            "afrr_vol_down": _safe(r["afrr_vol_down"]),
            "fcr_vol": _sum_pair(r["fcr_vol_up"], r["fcr_vol_down"]),
            "data_source": "historical",
        })

    # 2. Forecast tail beyond the last historical timestamp (if a scenario is
    #    selected and the requested range extends past the historical data).
    forecast_pivot = (latest_hist_dt or start)[:10]
    if scenario and forecast_pivot < end:
        try:
            forecast_data = engine.query_forecast_file(
                scenario,
                "predictions_aFRR_FCR_capacity_4h_2023_2050",
                forecast_pivot, end,
                datetime_col="datetime",
            )
        except Exception:
            forecast_data = []
        for d in forecast_data:
            dt_str = str(d.get("datetime", ""))
            if not dt_str or dt_str in seen_dts:
                continue
            seen_dts.add(dt_str)
            result.append({
                "datetime": dt_str,
                "block": _safe(d.get("block")),
                "afrr_cap_up": _safe(d.get("aFRR_cap_up")),
                "afrr_cap_down": _safe(d.get("aFRR_cap_down")),
                "fcr_cap_price": _safe(d.get("FCR_cap_price")),
                "afrr_vol_up": _safe(d.get("aFRR_vol_up")),
                "afrr_vol_down": _safe(d.get("aFRR_vol_down")),
                "fcr_vol": _safe(d.get("FCR_vol")),
                "data_source": "forecast",
            })

    result.sort(key=lambda r: r["datetime"])

    if len(result) > max_points:
        for i, d in enumerate(result):
            d["_idx"] = i
        result = lttb_downsample(result, "_idx", "afrr_cap_up", max_points)
        for d in result:
            d.pop("_idx", None)

    return {
        "datetime":      [r["datetime"]      for r in result],
        "afrr_cap_up":   [r["afrr_cap_up"]   for r in result],
        "afrr_cap_down": [r["afrr_cap_down"] for r in result],
        "fcr_cap_price": [r["fcr_cap_price"] for r in result],
        "afrr_vol_up":   [r["afrr_vol_up"]   for r in result],
        "afrr_vol_down": [r["afrr_vol_down"] for r in result],
        "fcr_vol":       [r["fcr_vol"]       for r in result],
        "data_source":   [r["data_source"]   for r in result],
    }


@router.get("/capacity")
async def get_capacity(
    request: Request,
    response: Response,
    start: str = Query(...),
    end: str = Query(...),
    scenario: str | None = Query(None, description="Optional — only used to fill in dates beyond the historical record"),
    max_points: int = Query(5000, ge=10, le=50000),
):
    # Engine is always available; only resolve fdir when a scenario is named.
    engine = request.app.state.engine
    if scenario:
        # Validate the scenario name (raises 404 for unknown ones) but ignore
        # the path return — the sync helper goes through query_forecast_file.
        get_engine_and_dir(request, scenario)
    payload = await run_in_threadpool(
        _get_capacity_sync, engine, scenario, start, end, max_points
    )
    add_cache_headers(response, end, _today_iso())
    return payload


def _get_imbalance_prices_sync(engine, start: str, end: str, max_points: int):
    """15-minute aFRR energy and imbalance prices from ts_15min.

    Source-of-truth historical-only — no scenario, no forecast tail.
    These signals are what TenneT publishes after each settlement period
    and aren't part of the BirdCurve forecast file.
    """
    rows = engine.query(
        '''
        SELECT timestamp_utc                              AS dt,
               "Imbalance_NL__Price_aFRR_energy_up"       AS afrr_energy_up,
               "Imbalance_NL__Price_aFRR_energy_down"     AS afrr_energy_down,
               "Imbalance_NL__Price_imb_long"             AS imb_long,
               "Imbalance_NL__Price_imb_short"            AS imb_short
        FROM ts_15min
        WHERE timestamp_utc >= ? AND timestamp_utc <= ?
        ORDER BY timestamp_utc
        ''',
        [start, end],
    )

    keys = ("afrr_energy_up", "afrr_energy_down", "imb_long", "imb_short")
    series = []
    for r in rows:
        if all(_safe(r[k]) is None for k in keys):
            continue
        series.append({
            "timestamp": str(r["dt"]),
            "afrr_energy_up":   _safe(r["afrr_energy_up"]),
            "afrr_energy_down": _safe(r["afrr_energy_down"]),
            "imb_long":         _safe(r["imb_long"]),
            "imb_short":        _safe(r["imb_short"]),
        })

    # Server-side LTTB downsample on the most-likely-non-null field.
    if len(series) > max_points:
        for i, d in enumerate(series):
            d["_idx"] = i
            d["_y"] = d["imb_short"] if d["imb_short"] is not None else (d["imb_long"] or 0.0)
        series = lttb_downsample(series, "_idx", "_y", max_points)
        for d in series:
            d.pop("_idx", None)
            d.pop("_y", None)

    return {
        "timestamp":        [r["timestamp"]        for r in series],
        "afrr_energy_up":   [r["afrr_energy_up"]   for r in series],
        "afrr_energy_down": [r["afrr_energy_down"] for r in series],
        "imb_long":         [r["imb_long"]         for r in series],
        "imb_short":        [r["imb_short"]        for r in series],
    }


@router.get("/imbalance-prices")
async def get_imbalance_prices(
    request: Request,
    response: Response,
    start: str = Query(...),
    end: str = Query(...),
    max_points: int = Query(8000, ge=10, le=50000),
):
    """aFRR energy + imbalance long/short prices at 15-min granularity from ts_15min."""
    engine = request.app.state.engine
    payload = await run_in_threadpool(
        _get_imbalance_prices_sync, engine, start, end, max_points
    )
    add_cache_headers(response, end, _today_iso())
    return payload


@router.get("/revenue")
async def get_revenue(
    request: Request,
    scenario: str = Query(...),
):
    # Reuse the annual-stats sync loader directly — avoids the async-handler
    # signature coupling and keeps the file read on the threadpool.
    from .forecast import _get_annual_stats_sync
    _engine, fdir = get_engine_and_dir(request, scenario)
    stats = await run_in_threadpool(_get_annual_stats_sync, fdir)

    return {
        "years": stats.get("years", []),
        "afrr_cap_revenue": stats.get("afrr_cap_rev", []),
        "fcr_cap_revenue": stats.get("fcr_cap_rev", []),
        "afrr_energy_revenue": stats.get("bess_afrr", []),
    }


def _get_regulation_states_sync(engine, scenario: str, year: int):
    start = f"{year}-01-01"
    end = f"{year + 1}-01-01"

    data = engine.query_forecast_file(
        scenario,
        "predictions_DA_ID3_Imb_aFRR_FCR_quarterly_2023_2050",
        start, end,
        datetime_col="Datetime_UTC",
    )

    if not data:
        return {"states": [], "year": year}

    state_counts: dict[int, int] = {}
    total = 0
    for d in data:
        state = int(d.get("Regulation_State", 0))
        state_counts[state] = state_counts.get(state, 0) + 1
        total += 1

    state_labels = {-1: "Down regulation", 0: "No regulation", 1: "Up regulation", 2: "Mixed"}
    states = []
    for state_val in sorted(state_counts.keys()):
        states.append({
            "state": state_val,
            "label": state_labels.get(state_val, f"State {state_val}"),
            "count": state_counts[state_val],
            "percentage": round(100 * state_counts[state_val] / total, 1),
        })

    return {"states": states, "year": year, "total_intervals": total}


@router.get("/regulation-states")
async def get_regulation_states(
    request: Request,
    year: int = Query(...),
    scenario: str = Query(...),
):
    engine, _fdir = get_engine_and_dir(request, scenario)
    return await run_in_threadpool(_get_regulation_states_sync, engine, scenario, year)
