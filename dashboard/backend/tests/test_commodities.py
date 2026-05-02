import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class TestCommoditiesEndpoint:
    def test_commodities_returns_data(self, client):
        resp = client.get("/api/commodities?start=2024-01-01&end=2024-12-31")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["gas_ttf"]) > 100
        assert "date" in data["gas_ttf"][0]
        assert "value" in data["gas_ttf"][0]

    def test_commodities_includes_marginal(self, client):
        resp = client.get("/api/commodities?start=2024-06-01&end=2024-06-30&include_marginal=true")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["gas_marginal"]) > 0
        assert len(data["coal_marginal"]) > 0

    def test_commodities_kpi(self, client):
        resp = client.get("/api/commodities/kpi")
        assert resp.status_code == 200
        data = resp.json()
        assert "gas_ttf_latest" in data
        assert "co2_eua_latest" in data

    def test_commodities_max_points(self, client):
        resp = client.get("/api/commodities?start=2020-01-01&end=2026-03-14&max_points=100")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["gas_ttf"]) <= 100
