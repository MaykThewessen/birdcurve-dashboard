import pytest
from app.data_loader import DataEngine

class TestDataEngine:
    def test_engine_connects_to_sqlite(self, settings):
        engine = DataEngine(settings)
        result = engine.query("SELECT COUNT(*) as n FROM sqlite_db.ts_daily")
        assert result[0]["n"] > 10000
        engine.close()

    def test_query_commodity_by_date_range(self, settings):
        engine = DataEngine(settings)
        rows = engine.query_commodity(
            source="Gas_TTF",
            column_names=["price_EUR_MWh_HHV", "Gas_Mar"],
            start="2024-01-01",
            end="2024-12-31"
        )
        assert len(rows) > 200
        assert all(k in rows[0] for k in ["date", "price_EUR_MWh_HHV", "Gas_Mar"])
        engine.close()

    def test_discover_latest_production_model(self, settings):
        engine = DataEngine(settings)
        model_dir = engine.latest_production_model
        assert model_dir is not None
        assert "Production_Ensemble_" in model_dir.name
        assert (model_dir / "metrics.json").exists()
        engine.close()

    def test_discover_forecast_scenarios(self, settings):
        engine = DataEngine(settings)
        scenarios = engine.available_scenarios
        assert len(scenarios) >= 1
        assert any("Central" in s for s in scenarios)
        engine.close()

    def test_query_returns_empty_for_invalid_source(self, settings):
        engine = DataEngine(settings)
        rows = engine.query_commodity(
            source="NonExistent",
            column_names=["price"],
            start="2024-01-01",
            end="2024-12-31"
        )
        assert rows == []
        engine.close()
