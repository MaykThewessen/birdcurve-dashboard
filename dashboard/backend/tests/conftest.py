import os
from pathlib import Path

# Set env vars before importing app modules so pydantic-settings picks them up.
# These point to the live developer-side data; most tests are integration
# tests against the read-only DuckDB and skip cleanly when it is absent
# (CI, contributor machines). Override via the BIRDCURVE_* env vars.
os.environ.setdefault(
    "BIRDCURVE_DUCKDB_PATH", "/Users/mayk/birdcurve_nl/data/birdcurve.duckdb"
)
os.environ.setdefault(
    "BIRDCURVE_MODEL_RESULTS_DIR", "/Users/mayk/birdcurve_nl/model_results"
)
os.environ.setdefault(
    "BIRDCURVE_HISTORICAL_FEATURES_PATH",
    "/Users/mayk/birdcurve_nl/Historical_data_features_engineered_*.parquet",
)

import pytest  # noqa: E402
from app.config import get_settings  # noqa: E402

# Test modules that do not need the live DuckDB.
_DATA_INDEPENDENT = ("test_downsampling",)


def pytest_collection_modifyitems(config, items):
    if Path(os.environ["BIRDCURVE_DUCKDB_PATH"]).exists():
        return
    skip = pytest.mark.skip(
        reason="live BirdCurve DuckDB not available (set BIRDCURVE_DUCKDB_PATH)"
    )
    for item in items:
        if not any(name in item.nodeid for name in _DATA_INDEPENDENT):
            item.add_marker(skip)


@pytest.fixture
def settings():
    # Ensure cached settings reflect the env we just set above.
    get_settings.cache_clear()
    return get_settings()
