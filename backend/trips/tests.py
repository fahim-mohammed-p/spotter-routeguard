"""End-to-end backend tests for models, validation, persistence, and API endpoints."""

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from trips.models import RiskLevel, Trip


class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("trips.views.OpenMeteoClient.check_connection")
    @patch("trips.views.OpenRouteServiceClient.check_connection")
    def test_health_endpoint_returns_database_and_service_status(self, mock_ors, mock_om):
        mock_ors.return_value = {
            "configured": True,
            "connected": True,
            "status": "connected",
            "error": None,
        }
        mock_om.return_value = {
            "connected": True,
            "status": "connected",
            "error": None,
        }

        response = self.client.get(reverse("api-health"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertTrue(response.data["database"]["connected"])
        self.assertIn(response.data["database"]["engine"], ("postgresql", "sqlite"))
        self.assertTrue(response.data["services"]["openrouteservice_configured"])
        self.assertTrue(response.data["services"]["openrouteservice_connected"])
        self.assertEqual(response.data["services"]["openrouteservice_status"], "connected")
        self.assertEqual(response.data["services"]["open_meteo_status"], "connected")

    @patch("trips.views.OpenMeteoClient.check_connection")
    @patch("trips.views.OpenRouteServiceClient.check_connection")
    def test_health_endpoint_reports_key_needed_when_missing(self, mock_ors, mock_om):
        mock_ors.return_value = {
            "configured": False,
            "connected": False,
            "status": "key_needed",
            "error": "ORS_API_KEY is not configured in backend/.env.",
        }
        mock_om.return_value = {"connected": True, "status": "connected", "error": None}

        response = self.client.get(reverse("api-health"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["services"]["openrouteservice_configured"])
        self.assertFalse(response.data["services"]["openrouteservice_connected"])
        self.assertEqual(response.data["services"]["openrouteservice_status"], "key_needed")


class TripValidationAndEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def test_route_plan_rejects_identical_origin_and_destination(self):
        response = self.client.post(
            reverse("route-plan"),
            {
                "origin": "Chicago, IL",
                "destination": "chicago,  il",
                "departure_time": (timezone.now() + timedelta(hours=1)).isoformat(),
                "load_weight_lbs": 35000,
                "checkpoint_interval_miles": 25,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_route_plan_rejects_invalid_load_weight_and_interval(self):
        response = self.client.post(
            reverse("route-plan"),
            {
                "origin": "Chicago, IL",
                "destination": "Detroit, MI",
                "departure_time": (timezone.now() + timedelta(hours=1)).isoformat(),
                "load_weight_lbs": 250000,
                "checkpoint_interval_miles": 15,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    @patch("trips.services.WeatherService.enrich_routes_weather")
    @patch("trips.services.RoutingService.plan_routes")
    def test_full_route_plan_persistence_and_retrieval_endpoints(
        self, mock_plan_routes, mock_enrich_weather
    ):
        departure = (timezone.now() + timedelta(hours=2)).replace(minute=0, second=0, microsecond=0)

        mock_plan_routes.return_value = {
            "origin": {"label": "Chicago, IL", "lat": 41.8781, "lon": -87.6298},
            "destination": {"label": "Indianapolis, IN", "lat": 39.7684, "lon": -86.1581},
            "routes": [
                {
                    "name": "Primary HGV Corridor",
                    "strategy": "recommended",
                    "distance_miles": 182.0,
                    "duration_seconds": 10800,
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-87.6298, 41.8781], [-86.9, 40.8], [-86.1581, 39.7684]],
                    },
                    "segments": [],
                },
                {
                    "name": "Western Bypass Corridor",
                    "strategy": "corridor_bypass",
                    "distance_miles": 204.0,
                    "duration_seconds": 12200,
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-87.6298, 41.8781], [-87.4, 40.5], [-86.1581, 39.7684]],
                    },
                    "segments": [],
                },
            ],
            "metadata": {
                "requested_alternatives": 3,
                "returned_alternatives": 2,
                "straight_line_miles": 165.0,
                "notes": ["Evaluated distinct bypass corridor."],
            },
        }

        def fake_enrich(routes, dep_time):
            for idx, route in enumerate(routes):
                for cp in route["checkpoints"]:
                    # Make Primary hit 48 mph wind (No Travel for 42,000 lb!), Western stay calm
                    wind = 48.0 if idx == 0 and cp["sequence_index"] == 1 else 14.0
                    cp["forecast_available"] = True
                    cp["forecast_timestamp"] = cp["estimated_arrival_time"]
                    cp["temperature_f"] = 36.0
                    cp["precipitation_probability"] = 30.0
                    cp["rain_in_hr"] = 0.02
                    cp["snow_in_hr"] = 0.0
                    cp["wind_speed_mph"] = wind
                    cp["weather_code"] = 2
                    cp["weather_condition"] = "Partly cloudy"
                    cp["raw_hourly_timeline"] = [
                        {
                            "offset_hour": h,
                            "timestamp": (dep_time + timedelta(hours=h)).isoformat(),
                            "forecast_available": True,
                            "temperature_f": 36.0,
                            "precipitation_probability": 30.0,
                            "rain_in_hr": 0.02,
                            "snow_in_hr": 0.0,
                            "wind_speed_mph": wind if h == 1 else 14.0,
                            "weather_code": 2,
                            "weather_condition": "Partly cloudy",
                        }
                        for h in range(49)
                    ]

        mock_enrich_weather.side_effect = fake_enrich

        plan_resp = self.client.post(
            reverse("route-plan"),
            {
                "origin": "Chicago, IL",
                "destination": "Indianapolis, IN",
                "departure_time": departure.isoformat(),
                "load_weight_lbs": 42000,
                "checkpoint_interval_miles": 50,
            },
            format="json",
        )
        self.assertEqual(plan_resp.status_code, status.HTTP_201_CREATED)
        trip_id = plan_resp.data["id"]

        # Western Bypass should beat Primary because Primary has No Travel (48 mph + >30k lb)
        self.assertEqual(len(plan_resp.data["routes"]), 2)
        recommended = plan_resp.data["routes"][0]
        self.assertEqual(recommended["name"], "Western Bypass Corridor")
        self.assertTrue(recommended["is_recommended"])
        self.assertEqual(plan_resp.data["routes"][1]["overall_risk_level"], RiskLevel.NO_TRAVEL)

        # Verify GET /api/trips/
        list_resp = self.client.get(reverse("trip-list"))
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(list_resp.data["stats"]["total_trips"], 1)
        self.assertEqual(list_resp.data["stats"]["total_routes"], 2)

        # Verify GET /api/routes/<trip_id>/
        detail_resp = self.client.get(reverse("route-detail", args=[trip_id]))
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_resp.data["id"], trip_id)

        # Verify GET /api/routes/<trip_id>/checkpoints/
        cp_resp = self.client.get(reverse("route-checkpoints", args=[trip_id]))
        self.assertEqual(cp_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(cp_resp.data["routes"]), 2)

        # Verify GET /api/routes/<trip_id>/weather/
        weather_resp = self.client.get(reverse("route-weather-timeline", args=[trip_id]))
        self.assertEqual(weather_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(weather_resp.data["window_hours"], 48)
        self.assertEqual(
            len(weather_resp.data["routes"][0]["checkpoints"][0]["hourly_forecast"]), 49
        )

        # Verify DELETE /api/routes/<trip_id>/
        del_resp = self.client.delete(reverse("route-detail", args=[trip_id]))
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Trip.objects.count(), 0)

    def test_api_prefix_routes_are_mounted_under_api(self):
        self.assertEqual(reverse("api-health"), "/api/health/")
        self.assertEqual(reverse("trip-list"), "/api/trips/")
        self.assertEqual(reverse("route-plan"), "/api/routes/plan/")

        trips_resp = self.client.get("/api/trips/")
        self.assertEqual(trips_resp.status_code, status.HTTP_200_OK)
        self.assertIn("stats", trips_resp.data)
        self.assertIn("trips", trips_resp.data)

        unprefixed = self.client.get("/trips/")
        self.assertEqual(unprefixed.status_code, status.HTTP_404_NOT_FOUND)
