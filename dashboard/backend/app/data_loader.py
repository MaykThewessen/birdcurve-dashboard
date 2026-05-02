"""DuckDB-based data engine for lazy querying of BirdCurve data sources."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb

from .config import Settings


class DataEngine:
    """Unified query engine. Attaches SQLite on init, discovers model/forecast dirs."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._conn = duckdb.connect()

        # Attach SQLite as 'sqlite_db'
        db_path = str(settings.sqlite_db)
        self._conn.execute("INSTALL sqlite; LOAD sqlite;")
        self._conn.execute(f"ATTACH '{db_path}' AS sqlite_db (TYPE sqlite, READ_ONLY);")

        # Discover model results
        self._model_dir = settings.model_results_dir
        self._latest_production = self._find_latest_dir("Production_Ensemble_")
        self._forecast_dirs = self._discover_forecasts()

        # Load small files into memory
        self._small_files_cache: dict[str, Any] = {}
        self._load_small_files()

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

            # Filter: only include clean version_scenario keys (e.g., "v17_Central")
            # Skip old experimental dirs like "with imb at 89 percent in 2030"
            if scenario_key != "default" and not re.match(r'^v\d+_\w+$', scenario_key):
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
        result = self._conn.execute(sql, params or []).fetchdf()
        return result.to_dict(orient="records")

    def query_commodity(
        self,
        source: str,
        column_names: list[str],
        start: str,
        end: str,
    ) -> list[dict]:
        placeholders = ", ".join(["?" for _ in column_names])
        sql = f"""
            SELECT timestamp_utc, column_name, value
            FROM sqlite_db.ts_daily
            WHERE source = ?
              AND column_name IN ({placeholders})
              AND timestamp_utc >= ?
              AND timestamp_utc <= ?
            ORDER BY timestamp_utc
        """
        params = [source] + column_names + [start, end]
        rows = self._conn.execute(sql, params).fetchall()

        if not rows:
            return []

        pivoted: dict[str, dict] = {}
        for ts, col, val in rows:
            date_key = ts[:10]
            if date_key not in pivoted:
                pivoted[date_key] = {"date": date_key}
            pivoted[date_key][col] = val

        return list(pivoted.values())

    def query_electricity(
        self,
        table: str,
        sources_columns: dict[str, list[str]],
        start: str,
        end: str,
    ) -> list[dict]:
        conditions = []
        params: list = []
        for source, cols in sources_columns.items():
            col_placeholders = ", ".join(["?" for _ in cols])
            conditions.append(f"(source = ? AND column_name IN ({col_placeholders}))")
            params.extend([source] + cols)

        where_clause = " OR ".join(conditions)
        sql = f"""
            SELECT timestamp_utc, source, column_name, value
            FROM sqlite_db.{table}
            WHERE ({where_clause})
              AND timestamp_utc >= ?
              AND timestamp_utc <= ?
            ORDER BY timestamp_utc
        """
        params.extend([start, end])
        rows = self._conn.execute(sql, params).fetchall()

        if not rows:
            return []

        pivoted: dict[str, dict] = {}
        for ts, source, col, val in rows:
            if ts not in pivoted:
                pivoted[ts] = {"timestamp": ts}
            pivoted[ts][col] = val

        return list(pivoted.values())

    def query_forecast_file(
        self,
        scenario: str,
        filename_pattern: str,
        start: str | None = None,
        end: str | None = None,
        datetime_col: str = "datetime_UTC",
    ) -> list[dict]:
        """Query a forecast .feather or .csv file from a scenario directory.

        NOTE: DuckDB read_parquet() CANNOT read .feather (Arrow IPC) files.
        Feather files are loaded via pandas.read_feather() and registered as
        temporary DuckDB tables for SQL filtering.
        """
        import pandas as pd

        fdir = self.forecast_dir(scenario)
        if fdir is None:
            return []

        feather_matches = list(fdir.glob(f"{filename_pattern}.feather"))
        csv_matches = list(fdir.glob(f"{filename_pattern}.csv"))

        if feather_matches:
            df = pd.read_feather(feather_matches[0])
            table_name = f"_tmp_{filename_pattern.replace('-', '_').replace(' ', '_').replace('*', 'x')}"
            self._conn.register(table_name, df)
            read_fn = table_name
        elif csv_matches:
            file_path = str(csv_matches[0])
            read_fn = f"read_csv_auto('{file_path}')"
        else:
            return []

        where_parts = []
        params = []
        if start:
            where_parts.append(f'"{datetime_col}" >= ?')
            params.append(start)
        if end:
            where_parts.append(f'"{datetime_col}" <= ?')
            params.append(end)

        where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

        sql = f'SELECT * FROM {read_fn} {where_clause} ORDER BY "{datetime_col}"'
        result = self._conn.execute(sql, params).fetchdf()
        return result.to_dict(orient="records")

    def close(self):
        self._conn.close()
