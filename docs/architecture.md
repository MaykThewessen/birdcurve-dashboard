# Architecture

## Backend — FastAPI + DuckDB

The backend is a single FastAPI app (`dashboard/backend/app/main.py`) wired to a read-only DuckDB file via `DataEngine`. Each page on the frontend maps to one router under `app/routers/`:

| Page | Router | Responsibility |
|---|---|---|
| Commodities | `routers/commodities.py` | TTF gas, EUA CO₂, Coal API2, EUR/USD KPI cards & series |
| Electricity | `routers/electricity.py` | DA prices, load/PV/wind overlays, duration curve, heatmap |
| Forecast | `routers/forecast.py` | BirdCurve NL DA + ID3 forecasts vs realised |
| ML | `routers/ml.py` | Model diagnostics, feature importance, distributions |
| Ancillary | `routers/ancillary.py` | aFRR/mFRR capacity & energy |
| Scenarios | `routers/scenarios.py` | Long-run capacity & revenue scenarios |

See the [API reference](reference/index.md) for full per-module documentation.

### Server-side downsampling

Every chart payload runs through LTTB (`app/downsampling.py`) so the browser never receives more than a few thousand points — extremes (negative-price spikes, ramp events) survive the downsample.

### Time handling

All timestamps are stored UTC and emitted tz-aware (`+00:00` suffix). The data layer uses `pd.to_datetime(..., utc=True)` everywhere, and the DuckDB connection sets `TimeZone='UTC'` on connect.

## Frontend — React 19 + Vite 7

- **State / data** — TanStack Query, one query per endpoint with `Cache-Control`-aware staleness
- **Charts** — ECharts for analytics, TradingView lightweight-charts for time series
- **Code-splitting** — per-page lazy routes; ECharts in its own vendor chunk

## Data layer

Single read-only DuckDB file (`BIRDCURVE_DUCKDB_PATH`), attached by
`DataEngine` alongside an in-memory `sidecars` catalog for the optional
EUR/USD and Coal API2 CSVs. Every request runs on its own DuckDB cursor
(the shared connection is not safe for concurrent queries) inside FastAPI's
threadpool, keeping the event loop free during large scans.

DuckDB tables:

- `ts_15min` — 15-minute load, PV, wind, cross-border, imbalance prices
- `ts_hourly` — hourly DA prices (15-min-aligned rows mixed in from 2025-09-30; consumers filter to `:00`)
- `ts_4hourly` — aFRR/FCR capacity prices and volumes per auction block
- `ts_daily` — Gas TTF, CO₂ EUA daily settles
- `provenance` — per-(table, source) ingestion bookkeeping for `/api/data-status`

File-based artifacts under `BIRDCURVE_MODEL_RESULTS_DIR` (not DuckDB tables):

- `Production_Ensemble_<ts>/` — metrics.json, feature list, LightGBM booster, `predictions_{training,validation}.csv`
- `Forecast_<ts>_vNN_<Scenario>/` — per-scenario forecast CSV/feather/xlsx files, discovered at startup and re-read per request
