"""Ancillary services: aFRR/FCR capacity prices, volumes, revenue."""
from __future__ import annotations

from fastapi import APIRouter, Query, Request, HTTPException

from ..downsampling import lttb_downsample
from ._helpers import get_engine_and_dir

router = APIRouter(prefix="/ancillary", tags=["ancillary"])


@router.get("/capacity")
async def get_capacity(
    request: Request,
    start: str = Query(...),
    end: str = Query(...),
    scenario: str = Query(...),
    max_points: int = Query(5000, ge=10, le=50000),
):
    engine, fdir = get_engine_and_dir(request, scenario)

    data = engine.query_forecast_file(
        scenario,
        "predictions_aFRR_FCR_capacity_4h_2023_2050",
        start, end,
        datetime_col="datetime",
    )

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

    result = []
    for d in data:
        result.append({
            "datetime": str(d.get("datetime", "")),
            "block": _safe(d.get("block")),
            "afrr_cap_up": _safe(d.get("aFRR_cap_up")),
            "afrr_cap_down": _safe(d.get("aFRR_cap_down")),
            "fcr_cap_price": _safe(d.get("FCR_cap_price")),
            "afrr_vol_up": _safe(d.get("aFRR_vol_up")),
            "afrr_vol_down": _safe(d.get("aFRR_vol_down")),
            "fcr_vol": _safe(d.get("FCR_vol")),
            "data_source": d.get("data_source"),
        })

    if len(result) > max_points:
        for i, d in enumerate(result):
            d["_idx"] = i
        result = lttb_downsample(result, "_idx", "afrr_cap_up", max_points)
        for d in result:
            d.pop("_idx", None)

    return {
        "datetime": [r["datetime"] for r in result],
        "afrr_cap_up": [r["afrr_cap_up"] for r in result],
        "afrr_cap_down": [r["afrr_cap_down"] for r in result],
        "fcr_cap_price": [r["fcr_cap_price"] for r in result],
        "afrr_vol_up": [r["afrr_vol_up"] for r in result],
        "afrr_vol_down": [r["afrr_vol_down"] for r in result],
        "fcr_vol": [r["fcr_vol"] for r in result],
    }


@router.get("/revenue")
async def get_revenue(
    request: Request,
    scenario: str = Query(...),
):
    from .forecast import get_annual_stats
    stats = await get_annual_stats(request, scenario=scenario)

    return {
        "years": stats.get("years", []),
        "afrr_cap_revenue": stats.get("afrr_cap_rev", []),
        "fcr_cap_revenue": stats.get("fcr_cap_rev", []),
        "afrr_energy_revenue": stats.get("bess_afrr", []),
    }


@router.get("/regulation-states")
async def get_regulation_states(
    request: Request,
    year: int = Query(...),
    scenario: str = Query(...),
):
    engine, fdir = get_engine_and_dir(request, scenario)

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
