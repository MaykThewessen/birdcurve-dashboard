"""Shared helpers for scenario-aware routers."""
from __future__ import annotations

from fastapi import Request, HTTPException, Response


def get_engine_and_dir(request: Request, scenario: str):
    engine = request.app.state.engine
    fdir = engine.forecast_dir(scenario)
    if fdir is None:
        raise HTTPException(404, f"Scenario '{scenario}' not found. Available: {engine.available_scenarios}")
    return engine, fdir


def add_cache_headers(response: Response, end_date: str | None, today_iso: str) -> None:
    """Long cache for fully-historical queries; short cache for recent."""
    if end_date and end_date < today_iso:
        response.headers["Cache-Control"] = "public, max-age=86400, immutable"
    else:
        response.headers["Cache-Control"] = "public, max-age=300"
