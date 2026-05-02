import os

# Set env vars before importing app modules so pydantic-settings picks them up.
# These point to the live developer-side data; tests are integration tests
# against the read-only DuckDB.
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


@pytest.fixture
def settings():
    # Ensure cached settings reflect the env we just set above.
    get_settings.cache_clear()
    return get_settings()
