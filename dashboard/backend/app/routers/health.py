"""Health check endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..models import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    engine = request.app.state.engine

    table_counts = {}
    for table in ["ts_15min", "ts_hourly", "ts_daily"]:
        rows = engine.query(f"SELECT COUNT(*) as n FROM {table}")
        table_counts[table] = rows[0]["n"] if rows else 0

    prod = engine.latest_production_model
    scenarios = engine.available_scenarios
    first_scenario = scenarios[0] if scenarios else None
    forecast = engine.forecast_dir(first_scenario) if first_scenario else None

    return HealthResponse(
        status="ok",
        data_loaded=prod is not None,
        last_model=prod.name if prod else None,
        last_forecast=forecast.name if forecast else None,
        scenarios=scenarios,
        db_tables=table_counts,
    )
