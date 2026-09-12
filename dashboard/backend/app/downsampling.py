"""Largest Triangle Three Buckets (LTTB) downsampling for time-series data."""
from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def lttb_by_index(data: list[dict], y_key: str, max_points: int) -> list[dict]:
    """Sample original records using their positions as the x-axis."""
    if len(data) <= max_points or max_points < 3:
        return data
    x = np.arange(len(data), dtype=np.float64)
    y = np.asarray([row[y_key] for row in data], dtype=np.float64)
    return [data[i] for i in lttb_indices(x, y, max_points)]


def lttb_downsample(
    data: list[dict],
    x_key: str,
    y_key: str,
    max_points: int,
) -> list[dict]:
    if len(data) <= max_points or max_points < 3:
        return data
    x = np.asarray([row[x_key] for row in data], dtype=np.float64)
    y = np.asarray([row[y_key] for row in data], dtype=np.float64)
    return [data[i] for i in lttb_indices(x, y, max_points)]


def lttb_indices(
    x: NDArray[np.float64], y: NDArray[np.float64], max_points: int,
) -> NDArray[np.intp]:
    """Select positions without modifying inputs; skip missing interior values.

    Buckets depend on the previous selection. Area calculations within each
    bucket are vectorized. First and last positions are always kept.
    """
    n = len(x)
    if len(y) != n:
        raise ValueError("x and y must have the same length")
    if n <= max_points or max_points < 3:
        return np.arange(n)
    sampled = [0]
    bucket_size = (n - 2) / (max_points - 2)
    boundaries = (np.arange(max_points - 1) * bucket_size).astype(np.intp) + 1
    next_starts = boundaries[1:]
    next_lengths = np.diff(np.append(next_starts, n))
    finite = np.isfinite(y)
    counts = np.add.reduceat(finite.astype(np.intp), next_starts)
    avg_xs = np.add.reduceat(x, next_starts) / next_lengths
    avg_ys = np.divide(
        np.add.reduceat(np.where(finite, y, 0.0), next_starts), counts,
        out=np.zeros(len(counts)), where=counts > 0,
    )
    a_index = 0
    for i, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:])):
        ref_y = y[a_index] if finite[a_index] else 0.0
        avg_y = avg_ys[i] if counts[i] else ref_y
        areas = np.abs(
            (x[a_index] - avg_xs[i]) * (y[start:end] - ref_y)
            - (x[a_index] - x[start:end]) * (avg_y - ref_y)
        )
        areas[~finite[start:end]] = -1.0
        selected = int(np.argmax(areas))
        if areas[selected] < 0:
            continue
        a_index = int(start + selected)
        sampled.append(a_index)
    sampled.append(n - 1)
    return np.asarray(sampled, dtype=np.intp)
