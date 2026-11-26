"""Comprehensive boundary tests for Spotter risk thresholds, load rules, and route ranking."""

from django.test import TestCase

from risk_engine.services import RiskEngineService, evaluate_weather_point
from trips.models import RiskLevel


class RiskThresholdAndLoadRuleTests(TestCase):
    def test_wind_thresholds_exact_boundaries(self):
        cases = [
            (0.0, RiskLevel.LOW),
            (24.9, RiskLevel.LOW),
            (25.0, RiskLevel.MODERATE),
            (34.9, RiskLevel.MODERATE),
            (35.0, RiskLevel.HIGH),
            (44.9, RiskLevel.HIGH),
            (45.0, RiskLevel.SEVERE),
            (54.9, RiskLevel.SEVERE),
            (55.0, RiskLevel.NO_TRAVEL),
        ]
        for wind, expected in cases:
            res = evaluate_weather_point(wind, 0.0, 0.0, 60.0, 0.0, load_weight_lbs=20000)
            self.assertEqual(res["risk_level"], expected, f"Failed for wind={wind}")

    def test_rain_thresholds_exact_boundaries(self):
        cases = [
            (0.09, RiskLevel.LOW),
            (0.10, RiskLevel.MODERATE),
            (0.25, RiskLevel.MODERATE),
            (0.26, RiskLevel.HIGH),
            (0.50, RiskLevel.HIGH),
            (0.51, RiskLevel.SEVERE),
            (1.00, RiskLevel.SEVERE),
            (1.01, RiskLevel.NO_TRAVEL),
        ]
        for rain, expected in cases:
            res = evaluate_weather_point(10.0, rain, 0.0, 55.0, 80.0, load_weight_lbs=25000)
            self.assertEqual(res["risk_level"], expected, f"Failed for rain={rain}")

    def test_snow_thresholds_exact_boundaries(self):
        cases = [
            (0.49, RiskLevel.LOW),
            (0.50, RiskLevel.MODERATE),
            (1.00, RiskLevel.MODERATE),
            (1.01, RiskLevel.HIGH),
            (2.00, RiskLevel.HIGH),
            (2.01, RiskLevel.SEVERE),
            (3.00, RiskLevel.SEVERE),
            (3.01, RiskLevel.NO_TRAVEL),
        ]
        for snow, expected in cases:
            res = evaluate_weather_point(10.0, 0.0, snow, 28.0, 80.0, load_weight_lbs=25000)
            self.assertEqual(res["risk_level"], expected, f"Failed for snow={snow}")

    def test_load_specific_wind_escalations(self):
        # >=55 mph is No Travel regardless of load
        res_light = evaluate_weather_point(55.0, 0.0, 0.0, 55.0, 0.0, load_weight_lbs=10000)
        self.assertEqual(res_light["risk_level"], RiskLevel.NO_TRAVEL)

        # 45-54 mph + <= 30,000 lb stays Severe; > 30,000 lb escalates to No Travel
        res_30k = evaluate_weather_point(48.0, 0.0, 0.0, 55.0, 0.0, load_weight_lbs=30000)
        self.assertEqual(res_30k["risk_level"], RiskLevel.SEVERE)
        res_30k_plus = evaluate_weather_point(48.0, 0.0, 0.0, 55.0, 0.0, load_weight_lbs=30001)
        self.assertEqual(res_30k_plus["risk_level"], RiskLevel.NO_TRAVEL)

        # 35-44 mph + <= 40,000 lb stays High; > 40,000 lb escalates to Severe
        res_40k = evaluate_weather_point(38.0, 0.0, 0.0, 55.0, 0.0, load_weight_lbs=40000)
        self.assertEqual(res_40k["risk_level"], RiskLevel.HIGH)
        res_40k_plus = evaluate_weather_point(38.0, 0.0, 0.0, 55.0, 0.0, load_weight_lbs=40001)
        self.assertEqual(res_40k_plus["risk_level"], RiskLevel.SEVERE)


class RouteRecommendationRankingTests(TestCase):
    def _cp(self, wind=10.0, rain=0.0, snow=0.0, miles=25.0):
        return {
            "segment_miles": miles,
            "forecast_available": True,
            "wind_speed_mph": wind,
            "rain_in_hr": rain,
            "snow_in_hr": snow,
            "temperature_f": 55.0,
            "precipitation_probability": 10.0,
            "raw_hourly_timeline": [],
        }

    def test_recommendation_priority_order(self):
        # Route A: faster, but 25 Severe miles
        route_a = {
            "name": "Fast Severe",
            "duration_seconds": 7200,
            "checkpoints": [self._cp(wind=48.0, miles=25.0), self._cp(wind=10.0, miles=75.0)],
        }
        # Route B: slightly slower, 0 Severe miles, 50 High miles
        route_b = {
            "name": "Moderate High",
            "duration_seconds": 9000,
            "checkpoints": [self._cp(wind=38.0, miles=50.0), self._cp(wind=10.0, miles=50.0)],
        }
        # Route C: slower still, 0 Severe miles, 25 High miles -> wins!
        route_c = {
            "name": "Safest Corridor",
            "duration_seconds": 9600,
            "checkpoints": [self._cp(wind=38.0, miles=25.0), self._cp(wind=10.0, miles=75.0)],
        }

        ranked = RiskEngineService().evaluate_and_rank_routes(
            [route_a, route_b, route_c], load_weight_lbs=25000
        )
        self.assertEqual([r["name"] for r in ranked], ["Safest Corridor", "Moderate High", "Fast Severe"])
        self.assertTrue(ranked[0]["is_recommended"])
        self.assertFalse(ranked[1]["is_recommended"])

    def test_all_no_travel_routes_never_marked_recommended_safe(self):
        route_1 = {
            "name": "Corridor 1",
            "duration_seconds": 7200,
            "checkpoints": [self._cp(wind=60.0, miles=25.0)],
        }
        route_2 = {
            "name": "Corridor 2",
            "duration_seconds": 7800,
            "checkpoints": [self._cp(wind=62.0, miles=50.0)],
        }
        ranked = RiskEngineService().evaluate_and_rank_routes(
            [route_1, route_2], load_weight_lbs=25000
        )
        self.assertFalse(any(r["is_recommended"] for r in ranked))
        self.assertIn("NO TRAVEL ADVISORY", ranked[0]["recommendation_reason"])
