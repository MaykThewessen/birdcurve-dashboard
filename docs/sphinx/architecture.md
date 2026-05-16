# Architecture

## Backend — FastAPI + DuckDB

The backend is a single FastAPI app (`dashboard/backend/app/main.py`) wired to a read-only DuckDB file via `DataEngine` (see [API reference](api/index.md)). Each page on the frontend maps to one router under `app/routers/`:

| Page | Router | Responsibility |
|---|---|---|
| Commodities | `routers/commodities.py` | TTF gas, EUA CO₂, Coal API2, EUR/USD KPI cards & series |
| Electricity | `routers/electricity.py` | DA prices, load/PV/wind overlays, duration curve, heatmap |
| Forecast | `routers/forecast.py` | BirdCurve NL DA + ID3 forecasts vs realised |
| ML | `routers/ml.py` | Model diagnostics, feature importance, distributions |
| Ancillary | `routers/ancillary.py` | aFRR/mFRR capacity & energy |
| Scenarios | `routers/scenarios.py` | Long-run capacity & revenue scenarios |

### Server-side downsampling

Every chart payload runs through LTTB (`app.downsampling`) so the browser never receives more than a few thousand points — extremes (negative-price spikes, ramp events) survive the downsample.

### Time handling

All timestamps are stored UTC and emitted tz-aware (`+00:00` suffix). The data layer uses `pd.to_datetime(..., utc=True)` everywhere, and the DuckDB connection sets `TimeZone='UTC'` on connect.

## Frontend — React 19 + Vite 7

- **State / data** — TanStack Query, one query per endpoint with `Cache-Control`-aware staleness
- **Charts** — ECharts for analytics, TradingView lightweight-charts for time series
- **Code-splitting** — per-page lazy routes; ECharts in its own vendor chunk

## Database

Single read-only DuckDB file (`BIRDCURVE_DB_PATH`). Tables:

- `ts_hourly` — hourly DA prices + load/gen mix (some 15-min granularity mixed in)
- `ts_daily` — Gas TTF, CO₂ EUA daily settles
- `forecast_*` — BirdCurve NL outputs, one CSV per scenario
- `ml_predictions` — held-out predictions for diagnostics
