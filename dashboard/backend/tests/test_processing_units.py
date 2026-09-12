"""Data-processing regressions using only temporary fixtures."""
import json
import os
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from app.data_loader import DataEngine
from app.downsampling import lttb_indices
from app.routers.forecast import _get_da_forecast_sync


@pytest.mark.parametrize("resolution", ["15min", "hourly", "daily"])
def test_forecast_empty_and_missing(tmp_path: Path, resolution: str) -> None:
    pd.DataFrame({
        "datetime_UTC": pd.date_range("2025-01-01", periods=48, freq="h", tz="UTC"),
        "Price_actual": [None, 2.0] * 24,
        "Price_pred_ensemble": [1.0, None] * 24,
    }).to_csv(tmp_path / "predictions_DA_hourly_test.csv", index=False)
    result = _get_da_forecast_sync(tmp_path, "2025-01-01", "2025-01-02", 10, resolution)
    assert 0 < len(result["datetime"]) <= 10
    assert len({len(v) for v in result.values()}) == 1
    assert all("T" in dt and dt.endswith("+00:00") for dt in result["datetime"])
    json.dumps(result, allow_nan=False)
    empty = _get_da_forecast_sync(tmp_path, "2026-01-01", "2026-01-02", 10, resolution)
    assert empty == {key: [] for key in result}


def test_forecast_preserves_alignment_and_final_day(tmp_path: Path) -> None:
    pd.DataFrame({
        "datetime_UTC": ["2025-01-01T00:00:00Z", "2025-01-01T23:30:00Z", "2025-01-02T00:00:00Z"],
        "Price_actual": [None, -2.0, 9.0],
        "Price_pred_ensemble": [1.0, None, 8.0],
    }).to_csv(tmp_path / "predictions_DA_hourly_test.csv", index=False)
    result = _get_da_forecast_sync(tmp_path, "2025-01-01", "2025-01-01", 10, "15min")
    assert result["price_actual"] == [None, -2.0]
    assert result["price_predicted"] == [1.0, None]
    assert result["datetime"][-1] == "2025-01-01T23:30:00+00:00"


@pytest.mark.parametrize("table,column", [("eur_usd", "USD_per_EUR"), ("coal_api2", "price_USD_ton")])
def test_sidecar_newest_and_quoted_path(tmp_path: Path, table: str, column: str) -> None:
    engine = DataEngine.__new__(DataEngine)
    with duckdb.connect() as connection:
        engine._conn = connection
        connection.execute("SET TimeZone='UTC'")
        connection.execute("ATTACH ':memory:' AS sidecars")
        assert not engine._register_sidecar(tmp_path / "*.csv", table, column)
        for filename, value, mtime in [("z.csv", 1.0, 1), ("a'quoted.csv", 2.0, 2)]:
            path = tmp_path / filename
            pd.DataFrame({"datetime_UTC": ["2025-01-01"], column: [value]}).to_csv(path, index=False)
            os.utime(path, (mtime, mtime))
        assert engine._register_sidecar(tmp_path / "*.csv", table, column)
        assert connection.execute(f'SELECT "{column}" FROM sidecars."{table}"').fetchone() == (2.0,)


def test_indices_ignore_nonfinite_and_validate_length() -> None:
    x = np.arange(50, dtype=np.float64)
    y = np.full(50, np.nan)
    y[15] = np.inf
    assert lttb_indices(x, y, 10).tolist() == [0, 49]
    with pytest.raises(ValueError, match="same length"):
        lttb_indices(x, y[:-1], 10)
