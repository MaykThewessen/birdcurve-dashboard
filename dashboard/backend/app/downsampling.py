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

        point_a_x = data[a_index][x_key]
        point_a_y = data[a_index][y_key]
        # Reference y for the area calc; a_index may itself be a None-y row at i=1.
        ref_y = point_a_y if point_a_y is not None else 0.0

        avg_x = sum(data[j][x_key] for j in range(next_start, next_end)) / (next_end - next_start)
        valid_ys = [data[j][y_key] for j in range(next_start, next_end) if data[j][y_key] is not None]
        avg_y = sum(valid_ys) / len(valid_ys) if valid_ys else ref_y

        max_area = -1.0
        max_idx = -1

        for j in range(bucket_start, bucket_end):
            y_j = data[j][y_key]
            if y_j is None:
                continue
            area = abs(
                (point_a_x - avg_x) * (y_j - ref_y)
                - (point_a_x - data[j][x_key]) * (avg_y - ref_y)
            )
            if area > max_area:
                max_area = area
                max_idx = j

        # All-None bucket: emit nothing rather than picking a missing point as representative.
        if max_idx == -1:
            continue

        sampled.append(data[max_idx])
        a_index = max_idx

    sampled.append(data[-1])
    return sampled
