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


def to_utc_iso(dt_str: str) -> str:
    """Ensure a datetime string carries an explicit UTC offset.

    Several CSV inputs (predictions_DA_hourly, predictions_train) encode
    UTC instants but emit them naive (e.g. '2026-03-25 00:00'). JS Date
    parses naive strings as local time, which silently collapses two
    distinct UTC instants at DST transitions. Idempotent for strings
    that already carry a tz marker.
    """
    if not dt_str:
        return dt_str
    # Already has a marker: trailing 'Z' or [+-]HH:MM at the end.
    if dt_str.endswith("Z"):
        return dt_str
    if len(dt_str) >= 6 and dt_str[-6] in "+-" and dt_str[-3] == ":":
        return dt_str
    return dt_str + "+00:00"
