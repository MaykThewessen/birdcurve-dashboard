"""BirdCurve Dashboard — FastAPI backend."""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings
from .data_loader import DataEngine


class ServerTimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["Server-Timing"] = f"total;dur={elapsed_ms:.1f}"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.engine = DataEngine(settings)
    yield
    app.state.engine.close()


app = FastAPI(
    title="BirdCurve NL Dashboard API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(ServerTimingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

from .routers import health, commodities, electricity, ml, scenarios, forecast, ancillary  # noqa: E402

app.include_router(health.router, prefix="/api")
app.include_router(commodities.router, prefix="/api")
app.include_router(electricity.router, prefix="/api")
app.include_router(ml.router, prefix="/api")
app.include_router(scenarios.router, prefix="/api")
app.include_router(forecast.router, prefix="/api")
app.include_router(ancillary.router, prefix="/api")
