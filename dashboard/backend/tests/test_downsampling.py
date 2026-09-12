import pytest
from app.downsampling import lttb_by_index, lttb_downsample


@pytest.mark.parametrize("max_points", [2, 10, 100])
def test_index_sampling_does_not_mutate_rows(max_points: int) -> None:
    data = [{"_idx": "original", "v": float(i)} for i in range(50)]
    original = [row.copy() for row in data]
    result = lttb_by_index(data, "v", max_points)
    assert data == original
    assert all(any(row is source for source in data) for row in result)


def test_missing_buckets_preserve_endpoints() -> None:
    data = [{"t": i, "v": None} for i in range(50)]
    assert lttb_by_index(data, "v", 10) == [data[0], data[-1]]


@pytest.mark.parametrize("size,limit", [(3, 3), (4, 3), (501, 500), (1000, 33)])
def test_bucket_boundaries(size: int, limit: int) -> None:
    data = [{"v": float(i % 7)} for i in range(size)]
    result = lttb_by_index(data, "v", limit)
    assert len(result) == limit
    assert result[0] is data[0]
    assert result[-1] is data[-1]
    positions = {id(row): i for i, row in enumerate(data)}
    indices = [positions[id(row)] for row in result]
    assert indices == sorted(set(indices))


class TestLTTB:
    def test_returns_all_if_under_max(self):
        data = [{"t": i, "v": float(i)} for i in range(50)]
        result = lttb_downsample(data, x_key="t", y_key="v", max_points=100)
        assert len(result) == 50

    def test_downsamples_to_max_points(self):
        data = [{"t": i, "v": float(i % 24)} for i in range(10000)]
        result = lttb_downsample(data, x_key="t", y_key="v", max_points=500)
        assert len(result) == 500

    def test_preserves_first_and_last(self):
        data = [{"t": i, "v": float(i * 2)} for i in range(5000)]
        result = lttb_downsample(data, x_key="t", y_key="v", max_points=100)
        assert result[0]["t"] == 0
        assert result[-1]["t"] == 4999

    def test_preserves_extremes_better_than_uniform(self):
        data = [{"t": i, "v": 1.0} for i in range(1000)]
        data[500]["v"] = 100.0
        result = lttb_downsample(data, x_key="t", y_key="v", max_points=50)
        values = [r["v"] for r in result]
        assert 100.0 in values

    def test_empty_input(self):
        assert lttb_downsample([], x_key="t", y_key="v", max_points=100) == []

    def test_multi_series_downsample(self):
        data = [{"t": i, "v1": float(i), "v2": float(i * 3)} for i in range(5000)]
        result = lttb_downsample(data, x_key="t", y_key="v1", max_points=100)
        assert "v2" in result[0]
