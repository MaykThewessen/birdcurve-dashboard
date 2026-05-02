"""Scenario tech assumptions and capacity data."""
from __future__ import annotations

import csv

from fastapi import APIRouter, Query, Request, HTTPException

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("/list")
async def list_scenarios(request: Request):
    engine = request.app.state.engine
    return {"scenarios": engine.available_scenarios}


@router.get("")
async def get_scenario(
    request: Request,
    scenario: str = Query(..., description="Scenario key, e.g. 'v17_Central'"),
):
    engine = request.app.state.engine
    fdir = engine.forecast_dir(scenario)
    if fdir is None:
        available = engine.available_scenarios
        raise HTTPException(404, f"Scenario '{scenario}' not available. Available: {available}")

    csv_files = list(fdir.glob("BirdSystem_Futures_*.csv"))
    if not csv_files:
        raise HTTPException(404, f"No BirdSystem_Futures CSV in {fdir.name}")

    rows = []
    with open(csv_files[0]) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    return {
        "years": [int(r["Year"]) for r in rows],
        "scenario": rows[0].get("Scenario", scenario) if rows else scenario,
        "solar_pv_gw": [float(r.get("Solar PV", 0)) for r in rows],
        "wind_on_gw": [float(r.get("Wind On", 0)) for r in rows],
        "wind_off_gw": [float(r.get("Wind Off", 0)) for r in rows],
        "bess_gw": [float(r.get("BESS GW", 0)) for r in rows],
        "bess_gwh": [float(r.get("BESS GWh", 0)) for r in rows],
        "gas_price": [float(r.get("Gas TTF", 0)) for r in rows],
        "co2_price": [float(r.get("EUA CO2", 0)) for r in rows],
        "demand_twh": [float(r.get("TWh/y", 0)) for r in rows],
        "power_base": [float(r.get("Power Base", 0)) for r in rows],
        "must_run": [float(r.get("Must-Run", 0)) for r in rows],
        "nuclear": [float(r.get("Nuclear", 0)) for r in rows],
    }
