"""DuckDB-based data engine for lazy querying of BirdCurve data sources."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

from .config import Settings


def _records_from_df(df: pd.DataFrame) -> list[dict]:
    """Convert DuckDB-fetched DataFrame → list[dict] with NaN/NaT → None.

    pandas leaves NaN/NaT as-is in `to_dict(orient="records")`, which
    serialises to non-standard `NaN` and is rejected by FastAPI's
    JSON encoder (allow_nan=False). Sanitise here so every router
    sees a clean, JSON-compliant contract.

    We also localise naive datetime columns to UTC. The DuckDB
    connection sets TimeZone='UTC', so naive TIMESTAMP values are
    UTC-by-convention — but `str(naive_ts)` drops the marker, and JS
    `new Date()` then interprets the string as local time. At DST
    transitions, two distinct UTC instants can collapse to the same
    local epoch, breaking lightweight-charts' strict-ordering check.

    Note: `.astype(object)` is required — assigning None into a
    float64 column would otherwise be coerced back to NaN.
    """
    naive_dt_cols = df.select_dtypes(include=["datetime64[ns]"]).columns
    if len(naive_dt_cols):
        df = df.assign(**{c: df[c].dt.tz_localize("UTC") for c in naive_dt_cols})
    return df.astype(object).where(pd.notna(df), None).to_dict(orient="records")


class DataEngine:
    """Unified query engine. Attaches the on-disk DuckDB read-only and discovers model/forecast dirs."""

    def __init__(self, settings: Settings):
        self._settings = settings
        # Connect to a transient DB; ATTACH the on-disk DuckDB read-only.
        # Why ATTACH not direct connect: lets us register temp tables for
        # forecast .feather files alongside on-disk data without touching it.
        self._conn = duckdb.connect()
        self._conn.execute(
            f"ATTACH '{settings.duckdb_path}' AS db (READ_ONLY)"
        )
        self._conn.execute("USE db")
        # Pin tz to UTC per project convention
        self._conn.execute("SET TimeZone='UTC'")

        # Discover model results
        self._model_dir = settings.model_results_dir
        self._latest_production = self._find_latest_dir("Production_Ensemble_")
        self._forecast_dirs = self._discover_forecasts()

        # Load small files into memory
        self._small_files_cache: dict[str, Any] = {}
        self._load_small_files()

        # Register optional out-of-DB sidecars (e.g. EUR/USD daily CSV).
        self._eur_usd_registered = self._try_register_eur_usd(settings)
        self._coal_api2_registered = self._try_register_coal_api2(settings)

    _TS_PATTERN = re.compile(r"(\d{8}_\d{6})")

    def _parse_timestamp(self, dirname: str) -> datetime | None:
        m = self._TS_PATTERN.search(dirname)
        if m:
            return datetime.strptime(m.group(1), "%Y%m%d_%H%M%S")
        return None

    def _find_latest_dir(self, prefix: str) -> Path | None:
        candidates = []
        for d in self._model_dir.iterdir():
            if d.is_dir() and d.name.startswith(prefix):
                ts = self._parse_timestamp(d.name)
                if ts:
                    candidates.append((ts, d))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    def _discover_forecasts(self) -> dict[str, Path]:
        """Returns {scenario_key: path} for all forecast dirs, keeping latest per scenario."""
        scenario_map: dict[str, tuple[datetime, Path]] = {}
        for d in self._model_dir.iterdir():
            if not (d.is_dir() and d.name.startswith("Forecast_")):
                continue
            ts = self._parse_timestamp(d.name)
            if not ts:
                continue

            after_ts = self._TS_PATTERN.sub("", d.name.replace("Forecast_", "", 1))
            scenario_key = after_ts.strip("_ ") or "default"

            # Filter: only include clean version_scenario keys (e.g., "v17_Central").
            # Skip old experimental dirs like "with imb at 89 percent in 2030"
            # AND skip the unversioned "default" — those legacy dirs lack the
            # current expected file layout, so frontend fetches against
            # ?scenario=default 404 and crash downstream consumers.
            if not re.match(r'^v\d+_\w+$', scenario_key):
                continue

            # Skip dirs that lack the headline CSVs entirely (empty placeholder
            # dirs from interrupted runs, e.g. older v14_* skeletons). A
            # scenario isn't "available" until it has data the routers can
            # actually serve.
            if not list(d.glob("predictions_DA_hourly_*.csv")):
                continue

            existing = scenario_map.get(scenario_key)
            if existing is None or ts > existing[0]:
                scenario_map[scenario_key] = (ts, d)

        return {k: v[1] for k, v in scenario_map.items()}

    def _load_small_files(self):
        if self._latest_production is None:
            return
        prod = self._latest_production

        for name in ["metrics.json", "ensemble_config.json"]:
            path = prod / name
            if path.exists():
                with open(path) as f:
                    self._small_files_cache[name] = json.load(f)

        fl_path = prod / "feature_list.txt"
        if fl_path.exists():
            self._small_files_cache["feature_list"] = fl_path.read_text().strip().split("\n")

    def _try_register_eur_usd(self, settings: Settings) -> bool:
        """Resolve the eur_usd_path glob and register the CSV as a DuckDB
        temp table named 'eur_usd' (columns: date DATE, USD_per_EUR DOUBLE).
        Returns True if a file was found and registered, False otherwise.
        """
        from glob import glob
        matches = sorted(glob(str(settings.eur_usd_path)))
        if not matches:
            return False
        # Use the most recent (highest sort) file in case multiple are present.
        csv = matches[-1]
        try:
            self._conn.execute(
                f"""
                CREATE TEMP TABLE eur_usd AS
                SELECT CAST(datetime_UTC AS DATE) AS date,
                       USD_per_EUR
                FROM read_csv_auto('{csv}')
                """
            )
            return True
        except Exception:
            return False

    @property
    def has_eur_usd(self) -> bool:
        return self._eur_usd_registered

    def _try_register_coal_api2(self, settings: Settings) -> bool:
        """Register the Coal API2 daily CSV as DuckDB temp table 'coal_api2'.

        The CSV has columns (datetime_UTC, price_USD_ton, ...); we only
        project what the dashboard needs. Returns True on success.
        """
        from glob import glob
        matches = sorted(glob(str(settings.coal_api2_path)))
        if not matches:
            return False
        csv = matches[-1]
        try:
            self._conn.execute(
                f"""
                CREATE TEMP TABLE coal_api2 AS
                SELECT CAST(datetime_UTC AS DATE) AS date,
                       price_USD_ton
                FROM read_csv_auto('{csv}')
                """
            )
            return True
        except Exception:
            return False

    @property
    def has_coal_api2(self) -> bool:
        return self._coal_api2_registered

    @property
    def latest_production_model(self) -> Path | None:
        return self._latest_production

    @property
    def available_scenarios(self) -> list[str]:
        return sorted(self._forecast_dirs.keys())

    def forecast_dir(self, scenario: str) -> Path | None:
        return self._forecast_dirs.get(scenario)

    def get_cached(self, key: str) -> Any:
        return self._small_files_cache.get(key)

    def query(self, sql: str, params: list | None = None) -> list[dict]:
        return _records_from_df(self._conn.execute(sql, params or []).fetchdf())

    def query_wide(
        self,
        table: str,
        columns: list[str],
        start: str | None = None,
        end: str | None = None,
        timestamp_col: str = "timestamp_utc",
    ) -> list[dict]:
        """Select named wide-schema columns + timestamp, optionally filtered by range."""
        quoted = ", ".join(f'"{c}"' for c in columns)
        where, params = [], []
        if start is not None:
            where.append(f'"{timestamp_col}" >= ?')
            params.append(start)
        if end is not None:
            where.append(f'"{timestamp_col}" <= ?')
            params.append(end)
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        sql = f'SELECT "{timestamp_col}", {quoted} FROM {table} {where_sql} ORDER BY "{timestamp_col}"'
        return _records_from_df(self._conn.execute(sql, params).fetchdf())

    # Forecast files emit timestamps under inconsistent column names across
    # versions: 'Datetime_UTC' (v17 csv), 'datetime_UTC' (some lowercase),
    # 'datetime' (v16 feather). We try them in order to insulate routers
    # from the upstream naming drift.
    _DATETIME_COL_CANDIDATES: tuple[str, ...] = (
        "Datetime_UTC",
        "datetime_UTC",
        "datetime",
    )

    def query_forecast_file(
        self,
        scenario: str,
        filename_pattern: str,
        start: str | None = None,
        end: str | None = None,
        datetime_col: str | tuple[str, ...] | None = None,
    ) -> list[dict]:
        """Query a forecast .feather or .csv file from a scenario directory.

        NOTE: DuckDB read_parquet() CANNOT read .feather (Arrow IPC) files.
        Feather files are loaded via pandas.read_feather() and registered as
        temporary DuckDB tables for SQL filtering.

        Returns [] when the file or expected datetime column is missing
        (so callers don't need to special-case partial scenario dirs).
        """
        fdir = self.forecast_dir(scenario)
        if fdir is None:
            return []

        feather_matches = list(fdir.glob(f"{filename_pattern}.feather"))
        csv_matches = list(fdir.glob(f"{filename_pattern}.csv"))

        # Resolve which datetime column the file actually uses.
        candidates: tuple[str, ...]
        if datetime_col is None:
            candidates = self._DATETIME_COL_CANDIDATES
        elif isinstance(datetime_col, str):
            candidates = (datetime_col, *self._DATETIME_COL_CANDIDATES)
        else:
            candidates = tuple(datetime_col)

        if feather_matches:
            df = pd.read_feather(feather_matches[0])
            actual_col = next((c for c in candidates if c in df.columns), None)
            if actual_col is None:
                return []
            table_name = f"_tmp_{filename_pattern.replace('-', '_').replace(' ', '_').replace('*', 'x')}"
            self._conn.register(table_name, df)
            read_fn = table_name
        elif csv_matches:
            file_path = str(csv_matches[0])
            # Peek at the CSV header so we know the actual datetime column
            # without parsing the whole file.
            with open(file_path) as fh:
                header = fh.readline().rstrip("\n").split(",")
            actual_col = next((c for c in candidates if c in header), None)
            if actual_col is None:
                return []
            read_fn = f"read_csv_auto('{file_path}')"
        else:
            return []

        where_parts = []
        params = []
        if start:
            where_parts.append(f'"{actual_col}" >= ?')
            params.append(start)
        if end:
            where_parts.append(f'"{actual_col}" <= ?')
            params.append(end)

        where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

        sql = f'SELECT * FROM {read_fn} {where_clause} ORDER BY "{actual_col}"'
        return _records_from_df(self._conn.execute(sql, params).fetchdf())

    def close(self):
        self._conn.close()
