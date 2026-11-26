"""Geospatial utilities for distance math, checkpoint interpolation, ETAs, and corridor offsets."""

import math
from datetime import datetime, timedelta
from typing import Any

EARTH_RADIUS_MILES = 3958.7613
METERS_PER_MILE = 1609.344


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two lat/lon points in statute miles."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_MILES * c


def compute_cumulative_distances(coordinates: list[list[float]]) -> list[float]:
    """Return cumulative distance in miles along a list of [lon, lat] coordinates."""
    if not coordinates:
        return []
    distances = [0.0]
    for idx in range(1, len(coordinates)):
        lon1, lat1 = coordinates[idx - 1][0], coordinates[idx - 1][1]
        lon2, lat2 = coordinates[idx][0], coordinates[idx][1]
        seg = haversine_miles(lat1, lon1, lat2, lon2)
        distances.append(distances[-1] + seg)
    return distances


def build_vertex_times(
    coordinates: list[list[float]],
    cumulative_distances: list[float],
    total_duration_seconds: float,
    segments: list[dict[str, Any]] | None = None,
) -> list[float]:
    """Compute cumulative travel duration (seconds) at each vertex along the polyline.

    Uses ORS step durations (mapped via step `way_points`) when available so highway
    speed variations are respected, and scales cleanly to match `total_duration_seconds`.
    """
    n = len(coordinates)
    if n == 0:
        return []
    if n == 1 or total_duration_seconds <= 0:
        return [0.0] * n

    vertex_times: list[float | None] = [None] * n
    vertex_times[0] = 0.0

    used_steps = False
    if segments:
        running_t = 0.0
        for segment in segments:
            steps = segment.get("steps") or []
            for step in steps:
                wp = step.get("way_points")
                step_dur = float(step.get("duration") or 0.0)
                if isinstance(wp, list) and len(wp) == 2:
                    start_i, end_i = int(wp[0]), int(wp[1])
                    if 0 <= start_i <= end_i < n:
                        used_steps = True
                        if vertex_times[start_i] is None:
                            vertex_times[start_i] = running_t
                        seg_dist = max(
                            cumulative_distances[end_i] - cumulative_distances[start_i], 0.0
                        )
                        for idx in range(start_i + 1, end_i + 1):
                            if seg_dist > 1e-6:
                                frac = (
                                    cumulative_distances[idx] - cumulative_distances[start_i]
                                ) / seg_dist
                            else:
                                frac = (idx - start_i) / max(1, end_i - start_i)
                            vertex_times[idx] = running_t + step_dur * frac
                        running_t += step_dur

    if used_steps and vertex_times[-1] and vertex_times[-1] > 0:
        # Fill any unvisited vertices linearly and normalize to exact ORS summary duration
        last_known_i = 0
        for idx in range(1, n):
            if vertex_times[idx] is not None:
                gap = idx - last_known_i
                if gap > 1:
                    t0 = vertex_times[last_known_i] or 0.0
                    t1 = vertex_times[idx] or t0
                    d0 = cumulative_distances[last_known_i]
                    d_span = max(cumulative_distances[idx] - d0, 1e-6)
                    for k in range(last_known_i + 1, idx):
                        vertex_times[k] = t0 + (t1 - t0) * (
                            (cumulative_distances[k] - d0) / d_span
                        )
                last_known_i = idx

        scale = total_duration_seconds / max(vertex_times[-1] or 1.0, 1e-6)
        return [float((t or 0.0) * scale) for t in vertex_times]

    # Fallback: distance-proportional duration
    total_poly_dist = cumulative_distances[-1]
    if total_poly_dist <= 1e-6:
        return [total_duration_seconds * (i / max(1, n - 1)) for i in range(n)]
    return [total_duration_seconds * (d / total_poly_dist) for d in cumulative_distances]


def generate_route_checkpoints(
    coordinates: list[list[float]],
    total_distance_miles: float,
    total_duration_seconds: float,
    departure_time: datetime,
    interval_miles: int,
    segments: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Sample weather checkpoints every `interval_miles` along the route polyline.

    Always includes the origin (0.0 mi) and destination endpoint, computes Voronoi-style
    `segment_miles` summing to `total_distance_miles`, and derives ETA at each point.
    """
    if len(coordinates) < 2:
        raise ValueError("Route geometry must contain at least two coordinates.")

    cum_dists = compute_cumulative_distances(coordinates)
    poly_total = cum_dists[-1]
    if poly_total <= 1e-6:
        lon0, lat0 = coordinates[0][0], coordinates[0][1]
        lon1, lat1 = coordinates[-1][0], coordinates[-1][1]
        return [
            {
                "sequence_index": 0,
                "latitude": lat0,
                "longitude": lon0,
                "distance_from_origin_miles": 0.0,
                "segment_miles": round(total_distance_miles, 2),
                "estimated_arrival_time": departure_time,
            },
            {
                "sequence_index": 1,
                "latitude": lat1,
                "longitude": lon1,
                "distance_from_origin_miles": round(total_distance_miles, 2),
                "segment_miles": 0.0,
                "estimated_arrival_time": departure_time + timedelta(seconds=total_duration_seconds),
            },
        ]

    # Scale polyline geodesic length to match ORS road distance cleanly
    dist_scale = total_distance_miles / poly_total if total_distance_miles > 0 else 1.0
    scaled_dists = [d * dist_scale for d in cum_dists]
    effective_total = total_distance_miles if total_distance_miles > 0 else poly_total
    vertex_times = build_vertex_times(coordinates, cum_dists, total_duration_seconds, segments)

    target_miles: list[float] = [0.0]
    current = float(interval_miles)
    # Keep intermediate checkpoints at least 1.0 mile away from the final destination
    while current < effective_total - 1.0:
        target_miles.append(current)
        current += float(interval_miles)
    target_miles.append(effective_total)

    sampled: list[dict[str, Any]] = []
    v_idx = 0
    num_vertices = len(coordinates)

    for seq_idx, target_d in enumerate(target_miles):
        while v_idx < num_vertices - 2 and scaled_dists[v_idx + 1] < target_d:
            v_idx += 1

        d_start = scaled_dists[v_idx]
        d_end = scaled_dists[v_idx + 1]
        span = d_end - d_start
        frac = 0.0 if span <= 1e-9 else max(0.0, min(1.0, (target_d - d_start) / span))

        lon = coordinates[v_idx][0] + (coordinates[v_idx + 1][0] - coordinates[v_idx][0]) * frac
        lat = coordinates[v_idx][1] + (coordinates[v_idx + 1][1] - coordinates[v_idx][1]) * frac

        t_start = vertex_times[v_idx]
        t_end = vertex_times[v_idx + 1]
        elapsed_sec = t_start + (t_end - t_start) * frac
        eta = departure_time + timedelta(seconds=elapsed_sec)

        sampled.append(
            {
                "sequence_index": seq_idx,
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "distance_from_origin_miles": round(target_d, 2),
                "estimated_arrival_time": eta,
            }
        )

    # Assign Voronoi segment miles around each checkpoint so total equals effective_total
    for idx, cp in enumerate(sampled):
        d_curr = cp["distance_from_origin_miles"]
        left_bound = 0.0 if idx == 0 else (sampled[idx - 1]["distance_from_origin_miles"] + d_curr) / 2.0
        right_bound = (
            effective_total
            if idx == len(sampled) - 1
            else (d_curr + sampled[idx + 1]["distance_from_origin_miles"]) / 2.0
        )
        cp["segment_miles"] = round(max(0.0, right_bound - left_bound), 2)

    return sampled


def compute_lateral_waypoints(
    origin_lon: float,
    origin_lat: float,
    dest_lon: float,
    dest_lat: float,
    offset_ratio: float = 0.12,
) -> list[tuple[str, list[float]]]:
    """Generate two perpendicular midpoint bypass waypoints [lon, lat] for >100km routes."""
    mid_lat = (origin_lat + dest_lat) / 2.0
    mid_lon = (origin_lon + dest_lon) / 2.0
    cos_lat = max(0.25, math.cos(math.radians(mid_lat)))

    dx = (dest_lon - origin_lon) * cos_lat
    dy = dest_lat - origin_lat
    chord = math.hypot(dx, dy)
    if chord < 1e-4:
        return []

    # Unit normal vector rotated +90 deg and -90 deg
    nx = -dy / chord
    ny = dx / chord
    shift = chord * offset_ratio

    candidates = []
    for sign in (1.0, -1.0):
        wp_lat = max(-85.0, min(85.0, mid_lat + sign * ny * shift))
        wp_lon = max(-179.9, min(179.9, mid_lon + (sign * nx * shift) / cos_lat))
        direction = _describe_offset_direction(sign * ny, sign * nx)
        candidates.append((f"{direction} Corridor", [round(wp_lon, 5), round(wp_lat, 5)]))
    return candidates


def _describe_offset_direction(d_lat: float, d_lon: float) -> str:
    if abs(d_lat) >= abs(d_lon):
        return "Northern Bypass" if d_lat >= 0 else "Southern Bypass"
    return "Eastern Bypass" if d_lon >= 0 else "Western Bypass"


def sample_polyline_points(coordinates: list[list[float]], sample_count: int = 12) -> list[list[float]]:
    """Sample evenly spaced points along a coordinate polyline for similarity comparisons."""
    n = len(coordinates)
    if n <= sample_count:
        return coordinates
    return [coordinates[int(i * (n - 1) / (sample_count - 1))] for i in range(sample_count)]


def are_routes_duplicate(route_a: dict[str, Any], route_b: dict[str, Any]) -> bool:
    """Detect whether two routes share virtually the same corridor and metrics."""
    dist_a = max(route_a["distance_miles"], 0.1)
    dist_b = max(route_b["distance_miles"], 0.1)
    dur_a = max(route_a["duration_seconds"], 1)
    dur_b = max(route_b["duration_seconds"], 1)

    dist_diff_ratio = abs(dist_a - dist_b) / max(dist_a, dist_b)
    dur_diff_ratio = abs(dur_a - dur_b) / max(dur_a, dur_b)

    if dist_diff_ratio > 0.03 or dur_diff_ratio > 0.04:
        return False

    pts_a = sample_polyline_points(route_a["geometry"]["coordinates"], 12)
    pts_b = sample_polyline_points(route_b["geometry"]["coordinates"], 12)
    pair_count = min(len(pts_a), len(pts_b))
    if pair_count == 0:
        return True

    offsets = [
        haversine_miles(pts_a[i][1], pts_a[i][0], pts_b[i][1], pts_b[i][0])
        for i in range(pair_count)
    ]
    avg_offset = sum(offsets) / pair_count
    max_offset = max(offsets)
    # Tight similarity threshold scales slightly for very long cross-country corridors
    allowed_avg = max(1.0, min(8.0, dist_a * 0.01))
    return avg_offset <= allowed_avg and max_offset <= allowed_avg * 2.5
