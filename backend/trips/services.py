"""Trip planning orchestration service coordinating routing, checkpoints, weather, and risk."""

from datetime import timedelta
from typing import Any

from django.db import transaction
from django.db.models import Prefetch

from risk_engine.services import RiskEngineService
from routing.geometry import generate_route_checkpoints
from routing.services import RoutingService
from trips.models import RouteOption, Trip, WeatherCheckpoint
from weather.services import WeatherService


class TripPlanningService:
    """Executes the end-to-end weather-aware route planning pipeline and persists results."""

    def __init__(
        self,
        routing_service: RoutingService | None = None,
        weather_service: WeatherService | None = None,
        risk_engine: RiskEngineService | None = None,
    ):
        self.routing_service = routing_service or RoutingService()
        self.weather_service = weather_service or WeatherService()
        self.risk_engine = risk_engine or RiskEngineService()

    def plan_trip(self, validated_data: dict[str, Any]) -> Trip:
        origin_query: str = validated_data["origin"]
        destination_query: str = validated_data["destination"]
        departure_time = validated_data["departure_time"]
        load_weight_lbs: int = int(validated_data["load_weight_lbs"])
        interval_miles: int = int(validated_data.get("checkpoint_interval_miles") or 25)

        routing_result = self.routing_service.plan_routes(origin_query, destination_query)
        origin = routing_result["origin"]
        destination = routing_result["destination"]
        candidate_routes = routing_result["routes"]

        for route in candidate_routes:
            route["estimated_arrival_time"] = departure_time + timedelta(
                seconds=route["duration_seconds"]
            )
            route["checkpoints"] = generate_route_checkpoints(
                coordinates=route["geometry"]["coordinates"],
                total_distance_miles=route["distance_miles"],
                total_duration_seconds=route["duration_seconds"],
                departure_time=departure_time,
                interval_miles=interval_miles,
                segments=route.get("segments"),
            )

        self.weather_service.enrich_routes_weather(candidate_routes, departure_time)
        ranked_routes = self.risk_engine.evaluate_and_rank_routes(
            candidate_routes, load_weight_lbs=load_weight_lbs
        )

        with transaction.atomic():
            trip = Trip.objects.create(
                origin_query=origin_query,
                origin_label=origin["label"],
                origin_lat=origin["lat"],
                origin_lon=origin["lon"],
                destination_query=destination_query,
                destination_label=destination["label"],
                destination_lat=destination["lat"],
                destination_lon=destination["lon"],
                departure_time=departure_time,
                load_weight_lbs=load_weight_lbs,
                checkpoint_interval_miles=interval_miles,
                routing_metadata=routing_result["metadata"],
            )

            checkpoint_objects: list[WeatherCheckpoint] = []
            for route_data in ranked_routes:
                route_obj = RouteOption.objects.create(
                    trip=trip,
                    rank=route_data["rank"],
                    name=route_data["name"],
                    strategy=route_data["strategy"],
                    is_recommended=route_data["is_recommended"],
                    recommendation_reason=route_data["recommendation_reason"],
                    distance_miles=route_data["distance_miles"],
                    duration_seconds=route_data["duration_seconds"],
                    estimated_arrival_time=route_data["estimated_arrival_time"],
                    geometry=route_data["geometry"],
                    low_miles=route_data["low_miles"],
                    moderate_miles=route_data["moderate_miles"],
                    high_miles=route_data["high_miles"],
                    severe_miles=route_data["severe_miles"],
                    no_travel_miles=route_data["no_travel_miles"],
                    average_risk_score=route_data["average_risk_score"],
                    overall_risk_level=route_data["overall_risk_level"],
                    main_weather_concerns=route_data["main_weather_concerns"],
                    safety_warnings=route_data["safety_warnings"],
                )

                for cp in route_data["checkpoints"]:
                    checkpoint_objects.append(
                        WeatherCheckpoint(
                            route_option=route_obj,
                            sequence_index=cp["sequence_index"],
                            latitude=cp["latitude"],
                            longitude=cp["longitude"],
                            distance_from_origin_miles=cp["distance_from_origin_miles"],
                            segment_miles=cp["segment_miles"],
                            estimated_arrival_time=cp["estimated_arrival_time"],
                            forecast_available=cp["forecast_available"],
                            forecast_timestamp=cp["forecast_timestamp"],
                            temperature_f=cp["temperature_f"],
                            precipitation_probability=cp["precipitation_probability"],
                            rain_in_hr=cp["rain_in_hr"],
                            snow_in_hr=cp["snow_in_hr"],
                            wind_speed_mph=cp["wind_speed_mph"],
                            weather_code=cp["weather_code"],
                            weather_condition=cp["weather_condition"],
                            risk_score=cp["risk_score"],
                            risk_level=cp["risk_level"],
                            risk_contributors=cp["risk_contributors"],
                            safety_recommendation=cp["safety_recommendation"],
                            hourly_forecast=cp["hourly_forecast"],
                        )
                    )

            if checkpoint_objects:
                WeatherCheckpoint.objects.bulk_create(checkpoint_objects)

        return Trip.objects.prefetch_related(
            Prefetch(
                "routes",
                queryset=RouteOption.objects.order_by("rank").prefetch_related(
                    Prefetch(
                        "checkpoints",
                        queryset=WeatherCheckpoint.objects.order_by("sequence_index"),
                    )
                ),
            )
        ).get(id=trip.id)
