"""Largest Triangle Three Buckets (LTTB) downsampling for time-series data."""
from __future__ import annotations


def lttb_downsample(
    data: list[dict],
    x_key: str,
    y_key: str,
    max_points: int,
) -> list[dict]:
    n = len(data)
    if n <= max_points or max_points < 3:
        return data

    sampled = [data[0]]
    bucket_size = (n - 2) / (max_points - 2)

    a_index = 0

    for i in range(1, max_points - 1):
        bucket_start = int((i - 1) * bucket_size) + 1
        bucket_end = int(i * bucket_size) + 1
        bucket_end = min(bucket_end, n - 1)

        next_start = int(i * bucket_size) + 1
        next_end = int((i + 1) * bucket_size) + 1
        next_end = min(next_end, n)

        avg_x = sum(data[j][x_key] for j in range(next_start, next_end)) / (next_end - next_start)
        avg_y = sum(data[j][y_key] for j in range(next_start, next_end)) / (next_end - next_start)

        max_area = -1.0
        max_idx = bucket_start

        point_a_x = data[a_index][x_key]
        point_a_y = data[a_index][y_key]

        for j in range(bucket_start, bucket_end):
            area = abs(
                (point_a_x - avg_x) * (data[j][y_key] - point_a_y)
                - (point_a_x - data[j][x_key]) * (avg_y - point_a_y)
            )
            if area > max_area:
                max_area = area
                max_idx = j

        sampled.append(data[max_idx])
        a_index = max_idx

    sampled.append(data[-1])
    return sampled
