# birdcurve-dashboard

Interactive dashboard for Dutch electricity market data and BirdCurve NL price forecasts.

<!-- TODO: pitch — owner to fill -->

## What it is

A FastAPI backend plus React frontend that reads from a local DuckDB file and a directory of trained model artifacts to visualize commodity prices (TTF gas, EUA CO2), Dutch electricity supply and demand (load, solar PV, wind on/offshore, cross-border flows), Day-Ahead price history and forecasts, ML model metrics and feature importance, and ancillary services (FCR / aFRR capacity and regulation states). It does not ship with data — you bring your own DuckDB file produced by the upstream [BirdCurve NL pipeline](https://github.com/MaykThewessen/BirdCurve_NL).

## Architecture

- **Backend**: FastAPI, native DuckDB (read-only), pydantic-settings, async routers with `run_in_threadpool` for blocking I/O, `Cache-Control` and `ETag` response headers.
- **Frontend**: React 19 + Vite + TypeScript, TanStack Query v5, ECharts and TradingView lightweight-charts, Tailwind v4.
- **Data plane**: a single DuckDB file in wide format (`{source}__{column}` columns) plus a directory of `Production_Ensemble_*` and `Forecast_*` model artifacts.

## Quickstart

```bash
# Backend
cd dashboard
make install-backend
export BIRDCURVE_DUCKDB_PATH=/path/to/your/birdcurve.duckdb
export BIRDCURVE_MODEL_RESULTS_DIR=/path/to/your/model_results
make backend     # serves on :8000

# Frontend (separate terminal)
make install-frontend
make frontend    # serves on :5173

# Or both at once
make dev
```

Open <http://localhost:5173>. The frontend talks to the backend at `http://localhost:8000` by default.

## Configuration

All settings are read from environment variables (or a `.env` file in `dashboard/backend/`).

| Var | Default | Purpose |
|-----|---------|---------|
| `BIRDCURVE_DUCKDB_PATH` | `/Users/mayk/birdcurve_nl/data/birdcurve.duckdb` | Path to the read-only DuckDB file. |
| `BIRDCURVE_MODEL_RESULTS_DIR` | `/Users/mayk/birdcurve_nl/model_results` | Directory containing `Production_Ensemble_*` and `Forecast_*` subdirectories. |
| `BIRDCURVE_HISTORICAL_FEATURES_PATH` | `/Users/mayk/birdcurve_nl/Historical_data_features_engineered_*.parquet` | Glob pattern for the parquet feeding the ML correlation matrix endpoint. |
| `BIRDCURVE_CORS_ORIGINS` | `["http://localhost:5173"]` | JSON array of allowed frontend origins. |

## Schema requirement

The backend expects a DuckDB file with **wide-format** time-series tables. One column per source metric, named `{source}__{column}` with a **double underscore** separator. Tables, by sampling resolution:

```
ts_15min   — 15-minute resolution (load, PV, wind on/off, cross-border, imbalance,
             aFRR/FCR activated energy, regulation state)
             columns include:
               Load_NL__Actual_Load_MW
               NED_PV__PV
               NED_Wind_Onshore__Wind_Onshore
               NED_Wind_Offshore__Wind_Offshore
               CrossBorder_NL__Total_Net
               Imbalance_NL__Price_imb_long
               Imbalance_NL__Price_imb_short
               Imbalance_NL__Price_aFRR_energy_up
               Imbalance_NL__Price_aFRR_energy_down
               Imbalance_NL__reg_state
               aFRR_capacity__Up
               aFRR_capacity__Down
               FCR_activated_energy__FCR_price
               CrossBorder_Belgium__netflow_BE_MW
               CrossBorder_BritNed__BritNed_MW

ts_4hourly — 4-hour resolution (FCR/aFRR capacity prices and volumes)
               aFRR_capacity_price__Up / __Down
               aFRR_capacity_volume__Up / __Down
               FCR_capacity_price / FCR_capacity_volume

ts_hourly  — 1-hour resolution
               DA_price__DA_price
               Temperature_KNMI__T
               Temperature_OpenMeteo__T

ts_daily   — daily resolution
               CO2_EUA__price
               Gas_TTF__price
```

All timestamps are stored in UTC. The dashboard does **not** ship with data; you supply your own DuckDB file conforming to this schema, typically produced by the upstream [BirdCurve NL pipeline](https://github.com/MaykThewessen/BirdCurve_NL).

## Tests

```bash
cd dashboard/backend
BIRDCURVE_DUCKDB_PATH=/path/to/your/birdcurve.duckdb make test-backend
```

31 backend tests cover the data loader (wide-schema queries), router responses, and configuration. The frontend has no test suite yet — `npm run build` is the contract for type-safety.

## License

MIT — see [LICENSE](LICENSE).
