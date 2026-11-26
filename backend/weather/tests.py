"""Tests for Open-Meteo batch fetching, caching, ETA matching, and unavailable forecasts."""

from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import MagicMock, patch

import httpx
from django.core.cache import cache
from django.test import TestCase

from weather.services import OpenMeteoClient, WeatherService


class OpenMeteoTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch("weather.services.httpx.Client")
    def test_batched_fetch_and_cache_reuse(self, mock_httpx_client):
        departure = datetime(2026, 11, 25, 12, 0, tzinfo=dt_timezone.utc)
        hourly_times = [(departure + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(52)]
        mock_payload = [
            {
                "latitude": 41.88,
                "longitude": -87.63,
                "hourly": {
                    "time": hourly_times,
                    "temperature_2m": [34.0] * 52,
                    "precipitation_probability": [20] * 52,
                    "rain": [0.05] * 52,
                    "snowfall": [0.0] * 52,
                    "wind_speed_10m": [18.0] * 52,
                    "weather_code": [3] * 52,
                },
            },
            {
                "latitude": 40.71,
                "longitude": -74.01,
                "hourly": {
                    "time": hourly_times,
                    "temperature_2m": [28.0] * 52,
                    "precipitation_probability": [80] * 52,
                    "rain": [0.0] * 52,
                    "snowfall": [1.2] * 52,
                    "wind_speed_10m": [36.0] * 52,
                    "weather_code": [73] * 52,
                },
            },
        ]

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_payload
        mock_http = MagicMock()
        mock_http.get.return_value = mock_resp
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenMeteoClient()
        # First call fetches both points in 1 HTTP call
        res1 = client.fetch_forecasts_for_points([(41.88, -87.63), (40.71, -74.01)], forecast_days=5)
        self.assertEqual(mock_http.get.call_count, 1)
        self.assertIn((41.88, -87.63), res1)

        # Second call hits cache with 0 additional HTTP requests
        res2 = client.fetch_forecasts_for_points([(41.88, -87.63), (40.71, -74.01)], forecast_days=5)
        self.assertEqual(mock_http.get.call_count, 1)
        self.assertEqual(len(res2), 2)

    def test_eta_matching_and_missing_forecast_handling(self):
        departure = datetime(2026, 11, 25, 12, 0, tzinfo=dt_timezone.utc)
        mock_client = MagicMock(spec=OpenMeteoClient)
        mock_client.fetch_forecasts_for_points.return_value = {
            (41.88, -87.63): {
                departure: {
                    "timestamp": departure,
                    "temperature_f": 38.0,
                    "precipitation_probability": 10.0,
                    "rain_in_hr": 0.0,
                    "snow_in_hr": 0.0,
                    "wind_speed_mph": 15.0,
                    "weather_code": 1,
                    "weather_condition": "Mainly clear",
                },
                departure + timedelta(hours=3): {
                    "timestamp": departure + timedelta(hours=3),
                    "temperature_f": 29.0,
                    "precipitation_probability": 90.0,
                    "rain_in_hr": 0.0,
                    "snow_in_hr": 1.5,
                    "wind_speed_mph": 38.0,
                    "weather_code": 75,
                    "weather_condition": "Heavy snowfall",
                },
            }
        }

        routes = [
            {
                "checkpoints": [
                    {
                        "latitude": 41.88,
                        "longitude": -87.63,
                        "estimated_arrival_time": departure + timedelta(hours=3, minutes=10),
                    },
                    {
                        "latitude": 41.88,
                        "longitude": -87.63,
                        "estimated_arrival_time": departure + timedelta(days=20),
                    },
                ]
            }
        ]

        service = WeatherService(client=mock_client)
        service.enrich_routes_weather(routes, departure)

        cp_valid, cp_missing = routes[0]["checkpoints"]
        self.assertTrue(cp_valid["forecast_available"])
        self.assertEqual(cp_valid["wind_speed_mph"], 38.0)
        self.assertEqual(cp_valid["snow_in_hr"], 1.5)
        self.assertEqual(cp_valid["weather_condition"], "Heavy snowfall")

        # Missing ETA window must NOT fabricate values
        self.assertFalse(cp_missing["forecast_available"])
        self.assertIsNone(cp_missing["wind_speed_mph"])
        self.assertEqual(cp_missing["weather_condition"], "Forecast Unavailable")

        # 0-48h timeline should have 49 slots (0..48 inclusive) with real slots marked available
        self.assertEqual(len(cp_valid["raw_hourly_timeline"]), 49)
        self.assertTrue(cp_valid["raw_hourly_timeline"][0]["forecast_available"])
        self.assertFalse(cp_valid["raw_hourly_timeline"][1]["forecast_available"])

    @patch("weather.services.httpx.Client")
    def test_check_connection_success_uses_cache_unless_verified(self, mock_httpx_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"hourly": {"time": ["2026-11-26T12:00"], "temperature_2m": [42.0]}}
        mock_http = MagicMock()
        mock_http.get.return_value = mock_resp
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenMeteoClient()
        res1 = client.check_connection()
        self.assertTrue(res1["connected"])
        self.assertEqual(res1["status"], "connected")
        self.assertIsNone(res1["error"])
        self.assertEqual(mock_http.get.call_count, 1)

        res2 = client.check_connection()
        self.assertTrue(res2["connected"])
        self.assertEqual(mock_http.get.call_count, 1)

        res3 = client.check_connection(verify=True)
        self.assertTrue(res3["connected"])
        self.assertEqual(mock_http.get.call_count, 2)

    @patch("weather.services.httpx.Client")
    def test_check_connection_timeout_captures_exception_details(self, mock_httpx_client):
        mock_http = MagicMock()
        mock_http.get.side_effect = httpx.ReadTimeout("timed out reading forecast")
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenMeteoClient(timeout_seconds=15.0)
        res = client.check_connection(verify=True)
        self.assertFalse(res["connected"])
        self.assertEqual(res["status"], "unreachable")
        self.assertIn("ReadTimeout", res["error"])
        self.assertIn("timed out reading forecast", res["error"])

    @patch("weather.services.httpx.Client")
    def test_check_connection_failure_and_http_error_capture_details(self, mock_httpx_client):
        mock_http = MagicMock()
        mock_http.get.side_effect = httpx.ConnectError("TLS handshake failed")
        mock_httpx_client.return_value.__enter__.return_value = mock_http

        client = OpenMeteoClient()
        res_conn = client.check_connection(verify=True)
        self.assertFalse(res_conn["connected"])
        self.assertEqual(res_conn["status"], "unreachable")
        self.assertIn("ConnectError", res_conn["error"])

        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.json.return_value = {"reason": "Hourly API request limit exceeded."}
        mock_http.get.side_effect = None
        mock_http.get.return_value = mock_resp

        res_429 = client.check_connection(verify=True)
        self.assertFalse(res_429["connected"])
        self.assertEqual(res_429["status"], "rate_limited")
        self.assertIn("429", res_429["error"])
        self.assertIn("Hourly API request limit exceeded", res_429["error"])
