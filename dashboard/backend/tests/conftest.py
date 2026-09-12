from collections.abc import Iterator

import pytest

from app.config import Settings, get_settings
from tests.sample_data import create_sample_data


@pytest.fixture(scope="session", autouse=True)
def settings(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Settings]:
    """Exercise real readers without depending on developer production files."""
    configured = create_sample_data(tmp_path_factory.mktemp("dashboard-data"))
    with pytest.MonkeyPatch.context() as patch:
        for field in ("duckdb_path", "model_results_dir", "eur_usd_path", "coal_api2_path",
                      "historical_features_path"):
            patch.setenv(f"BIRDCURVE_{field.upper()}", str(getattr(configured, field)))
        get_settings.cache_clear()
        yield configured
    get_settings.cache_clear()
