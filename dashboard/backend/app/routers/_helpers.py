"""Shared helpers for scenario-aware routers."""
from fastapi import Request, HTTPException


def get_engine_and_dir(request: Request, scenario: str):
    engine = request.app.state.engine
    fdir = engine.forecast_dir(scenario)
    if fdir is None:
        raise HTTPException(404, f"Scenario '{scenario}' not found. Available: {engine.available_scenarios}")
    return engine, fdir
