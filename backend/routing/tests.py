"""Tests for ORS routing client, alternative corridor generation, deduplication, and checkpoints."""

from datetime import datetime, timezone as dt_timezone
from unittest.mock import MagicMock, patch

import httpx
from django.core.cache import cache
from django.test import TestCase

from config.exceptions import (
    ConfigurationError,
    ExternalAPIError,
    ExternalAPITimeoutError,
    RoutePlanningError,
)
from routing.geometry import (
    are_routes_duplicate,
    generate_route_checkpoints,
    haversine_miles,
)
from routing.services import OpenRouteServiceClient, RoutingService


class GeometryAndCheckpointTests(TestCase):
    def test_checkpoint_intervals_10_25_50_and_segment_sum(self):
        # Straight line roughly ~100 miles along ~latitude 41.8
        coords = [[-88.0, 41.8], [-87.0, 41.8], [-86.05, 41.8]]
        total_miles = haversine_miles(41.8, -88.0, 41.8, -86.05)
        departure = datetime(2026, 11, 25, 12, 0, tzinfo=dt_timezone.utc)

        for interval in (10, 25, 50):
            checkpoints = generate_route_checkpoints(
                coordinates=coords,
                total_distance_miles=round(total_miles, 2),
                total_duration_seconds=5400,
                departure_time=departure,
                interval_miles=interval,
            )
            self.assertEqual(checkpoints[0]["distance_from_origin_miles"], 0.0)
            self.assertEqual(checkpoints[0]["estimated_arrival_time"], departure)
            self.assertAlmostEqual(
                checkpoints[-1]["distance_from_origin_miles"],
                round(total_miles, 2),
                places=1,
            )
            self.assertEqual(
                checkpoints[-1]["estimated_arrival_time"],
                departure.replace(hour=13, minute=30),
            )
            # Check intermediate interval spacing
            if len(checkpoints) > 2:
                self.assertEqual(checkpoints[1]["distance_from_origin_miles"], float(interval))
            # Voronoi segment_miles must sum cleanly to route total distance
            self.assertAlmostEqual(
                sum(cp["segment_miles"] for cp in checkpoints),
                round(total_miles, 2),
                places=1,
            )

    def test_step_based_eta_respects_slower_urban_vs_faster_highway_segments(self):
        coords = [[-88.0, 41.0], [-87.5, 41.0], [-87.0, 41.0]]
        departure = datetime(2026, 11, 25, 8, 0, tzinfo=dt_timezone.utc)
        # First half takes 3000s (slow), second half takes 600s (fast)
        segments = [
            {
                "steps": [
                    {"way_points": [0, 1], "duration": 3000.0},
                    {"way_points": [1, 2], "duration": 600.0},
                ]
            }
        ]
        total_dist = round(haversine_miles(41.0, -88.0, 41.0, -87.0), 2)
        checkpoints = generate_route_checkpoints(
            coordinates=coords,
            total_distance_miles=total_dist,
            total_duration_seconds=3600,
            departure_time=departure,
            interval_miles=25,
            segments=segments,
        )
        mid_cp = checkpoints[1]
        # Midpoint ETA should reflect > 1800s elapsed because first half is slower
        elapsed = (mid_cp["estimated_arrival_time"] - departure).total_seconds()
        self.assertGreater(elapsed, 2400)

    def test_route_deduplication_catches_near_identical_geometries(self):
        route_a = {
            "distance_miles": 200.0,
            "duration_seconds": 10800,
            "geometry": {"type": "LineString", "coordinates": [[-88.0, 41.8], [-87.0, 41.8], [-86.0, 41.8]]},
        }
        route_b = {
            "distance_miles": 201.0,
            "duration_seconds": 10850,
            "geometry": {"type": "LineString", "coordinates": [[-88.0, 41.8], [-87.0, 41.805], [-86.0, 41.8]]},
        }
        route_c = {
            "distance_miles": 225.0,
            "duration_seconds": 12400,
            "geometry": {"type": "LineString", "coordinates": [[-88.0, 41.8], [-87.0, 42.3], [-86.0, 41.8]]},
        }
        self.assertTrue(are_routes_duplicate(route_a, route_b))
        self.assertFalse(are_routes_duplicate(route_a, route_c))


class RoutingServiceTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_missing_ors_key_raises_configuration_error(self):
        client = OpenRouteServiceClient(api_key="")
        with self.assertRaises(ConfigurationError):
            client.geocode("Chicago, IL")

    @patch("routing.services.httpx.Client")
    def test_timeout_raises_external_timeout_error(self, mock_httpx_client):
        mock_instance = MagicMock()
        mock_instance.request.side_effect = httpx.TimeoutException("Timed out")
        mock_httpx_client.return_value.__enter__.return_value = mock_instance

        client = OpenRouteServiceClient(api_key="fake-key")
        with self.assertRaises(ExternalAPITimeoutError):
            client.geocode("Chicago, IL")

    def test_long_distance_generates_deduplicated_corridor_alternatives(self):
        mock_client = MagicMock(spec=OpenRouteServiceClient)
        mock_client.geocode.side_effect = [
            {"label": "Chicago, IL", "lat": 41.8781, "lon": -87.6298},
            {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903},
        ]
        # Primary, Shortest (duplicate of primary), Northern Bypass, Southern Bypass
        primary = {
            "geometry": {"type": "LineString", "coordinates": [[-87.62, 41.87], [-96.0, 41.2], [-104.99, 39.73]]},
            "distance_miles": 1005.0,
            "duration_seconds": 52000,
            "segments": [],
        }
        shortest_dup = {
            "geometry": {"type": "LineString", "coordinates": [[-87.62, 41.87], [-96.0, 41.2], [-104.99, 39.73]]},
            "distance_miles": 1006.0,
            "duration_seconds": 52100,
            "segments": [],
        }
        north_bypass = {
            "geometry": {"type": "LineString", "coordinates": [[-87.62, 41.87], [-96.0, 42.9], [-104.99, 39.73]]},
            "distance_miles": 1085.0,
            "duration_seconds": 56500,
            "segments": [],
        }
        south_bypass = {
            "geometry": {"type": "LineString", "coordinates": [[-87.62, 41.87], [-96.0, 39.1], [-104.99, 39.73]]},
            "distance_miles": 1110.0,
            "duration_seconds": 58000,
            "segments": [],
        }
        mock_client.fetch_directions.side_effect = [
            [primary],
            [shortest_dup],
            [north_bypass],
            [south_bypass],
        ]

        service = RoutingService(client=mock_client)
        result = service.plan_routes("Chicago, IL", "Denver, CO")

        self.assertEqual(len(result["routes"]), 3)
        names = [r["name"] for r in result["routes"]]
        self.assertEqual(names[0], "Primary HGV Corridor")
        self.assertIn("Northern Bypass Corridor", names)
        self.assertIn("Southern Bypass Corridor", names)

    def test_identical_geocoded_endpoints_rejected(self):
        mock_client = MagicMock(spec=OpenRouteServiceClient)
        mock_client.geocode.side_effect = [
            {"label": "Chicago, IL", "lat": 41.8781, "lon": -87.6298},
            {"label": "Downtown Chicago, IL", "lat": 41.8790, "lon": -87.6300},
        ]
        service = RoutingService(client=mock_client)
        with self.assertRaises(RoutePlanningError):
            service.plan_routes("Chicago", "Downtown Chicago")

    @patch("routing.services.httpx.Client")
    def test_unroutable_ors_code_2009_raises_route_planning_error(self, mock_httpx_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.json.return_value = {
            "error": {"code": 2009, "message": "Route could not be found between locations."}
        }
        mock_http = MagicMock()
        mock_http.request.return_value = mock_resp
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenRouteServiceClient(api_key="fake-key")
        with self.assertRaises(RoutePlanningError):
            client.fetch_directions([[-87.6, 41.8], [-86.1, 39.7]])

    def test_check_connection_without_key_returns_key_needed(self):
        client = OpenRouteServiceClient(api_key="")
        res = client.check_connection()
        self.assertFalse(res["configured"])
        self.assertFalse(res["connected"])
        self.assertEqual(res["status"], "key_needed")

    @patch("routing.services.dotenv_values")
    @patch("routing.services.Path.exists", return_value=True)
    def test_debug_dotenv_fallback_reads_saved_key_when_settings_empty(self, _mock_exists, mock_dv):
        mock_dv.return_value = {"ORS_API_KEY": "  \"saved-later-key\"  "}
        with self.settings(DEBUG=True, ORS_API_KEY=""):
            client = OpenRouteServiceClient()
            self.assertEqual(client.api_key, "saved-later-key")

    @patch("routing.services.httpx.Client")
    def test_geocode_uses_heigit_pelias_v1_search_and_authorization_header(self, mock_httpx_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "features": [
                {
                    "geometry": {"coordinates": [-87.6298, 41.8781]},
                    "properties": {"label": "Chicago, IL, USA"},
                }
            ]
        }
        mock_http = MagicMock()
        mock_http.request.return_value = mock_resp
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenRouteServiceClient(api_key="fake-key")
        res = client.geocode("Chicago, IL")
        self.assertEqual(res["label"], "Chicago, IL, USA")
        args, kwargs = mock_http.request.call_args
        self.assertEqual(args[0], "GET")
        self.assertEqual(args[1], "https://api.heigit.org/pelias/v1/search")
        self.assertEqual(kwargs["headers"]["Authorization"], "fake-key")

    @patch("routing.services.httpx.Client")
    def test_directions_uses_heigit_openrouteservice_v2_driving_hgv_geojson(self, mock_httpx_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "features": [
                {
                    "geometry": {"coordinates": [[-87.6298, 41.8781], [-86.1581, 39.7684]]},
                    "properties": {"summary": {"distance": 292000.0, "duration": 10800.0}, "segments": []},
                }
            ]
        }
        mock_http = MagicMock()
        mock_http.request.return_value = mock_resp
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenRouteServiceClient(api_key="fake-key")
        routes = client.fetch_directions([[-87.6298, 41.8781], [-86.1581, 39.7684]])
        self.assertEqual(len(routes), 1)
        args, kwargs = mock_http.request.call_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(
            args[1],
            "https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson",
        )
        self.assertEqual(kwargs["headers"]["Authorization"], "fake-key")

    @patch("routing.services.httpx.Client")
    def test_http_410_gone_raises_clear_external_api_error(self, mock_httpx_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 410
        mock_http = MagicMock()
        mock_http.request.return_value = mock_resp
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenRouteServiceClient(api_key="fake-key")
        with self.assertRaises(ExternalAPIError) as ctx:
            client.geocode("Chicago, IL")
        self.assertEqual(ctx.exception.error_code, "ors_endpoint_deprecated")

    @patch("routing.services.httpx.Client")
    def test_check_connection_verifies_both_pelias_and_ors_endpoints(self, mock_httpx_client):
        ok_geo = MagicMock(status_code=200)
        fail_dir = MagicMock(status_code=410)
        mock_http = MagicMock()
        mock_http.get.return_value = ok_geo
        mock_http.post.return_value = fail_dir
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenRouteServiceClient(api_key="fake-key")
        res = client.check_connection(verify=True)
        self.assertTrue(res["configured"])
        self.assertFalse(res["connected"])
        self.assertEqual(res["status"], "unreachable")
        self.assertIn("410", res["error"])
