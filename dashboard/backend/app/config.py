from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Required at runtime; user supplies via BIRDCURVE_DUCKDB_PATH env var
    # or a .env file. Default points to the development location used during
    # extraction so `make dev` works on the original maintainer's box.
    duckdb_path: Path = Path("/Users/mayk/birdcurve_nl/data/birdcurve.duckdb")
    model_results_dir: Path = Path("/Users/mayk/birdcurve_nl/model_results")
    # Glob pattern for historical engineered features file (used by /ml/correlation-matrix).
    # Supports .feather or .parquet (resolved at read time via the file extension).
    historical_features_path: Path = Path(
        "/Users/mayk/birdcurve_nl/Historical_data_features_engineered_*.parquet"
    )
    # CSV with two columns (datetime_UTC, USD_per_EUR), resolved via glob.
    # Optional — endpoints fall back to empty arrays if the file is absent.
    eur_usd_path: Path = Path(
        "/Users/mayk/birdcurve_nl/Coal/EUR_USD_daily_*.csv"
    )
    # CSV with at least (datetime_UTC, price_USD_ton) and optionally
    # the precomputed price_EUR_MWh_LHV. Same fallback semantics as
    # eur_usd_path.
    coal_api2_path: Path = Path(
        "/Users/mayk/birdcurve_nl/Coal/commodity_coal_API2_daily_*.csv"
    )
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_prefix="BIRDCURVE_", env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
