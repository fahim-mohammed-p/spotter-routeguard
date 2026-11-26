"""Serializers for trip planning requests and route/checkpoint responses."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from trips.models import CheckpointInterval, RiskLevel, RouteOption, Trip, WeatherCheckpoint


class RoutePlanRequestSerializer(serializers.Serializer):
    """Validates user inputs for planning a weather-aware truck journey."""

    origin = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
        error_messages={"blank": "Origin address or city is required."},
    )
    destination = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
        error_messages={"blank": "Destination address or city is required."},
    )
    departure_time = serializers.DateTimeField(
        error_messages={"invalid": "Departure time must be a valid ISO-8601 date/time."}
    )
    load_weight_lbs = serializers.IntegerField(
        min_value=1000,
        max_value=160000,
        error_messages={
            "min_value": "Load weight must be at least 1,000 lbs.",
            "max_value": "Load weight cannot exceed 160,000 lbs.",
        },
    )
    checkpoint_interval_miles = serializers.ChoiceField(
        choices=[choice.value for choice in CheckpointInterval],
        default=CheckpointInterval.MILES_25.value,
        required=False,
    )

    def validate_departure_time(self, value):
        if timezone.is_naive(value):
            value = timezone.make_aware(value, timezone.utc)
        now = timezone.now()
        if value < now - timedelta(hours=2):
            raise serializers.ValidationError(
                "Departure time cannot be more than 2 hours in the past."
            )
        if value > now + timedelta(days=14):
            raise serializers.ValidationError(
                "Departure time cannot be more than 14 days in the future."
            )
        return value

    def validate(self, attrs):
        origin_norm = " ".join(attrs["origin"].lower().split())
        dest_norm = " ".join(attrs["destination"].lower().split())
        if origin_norm == dest_norm:
            raise serializers.ValidationError(
                {"destination": "Origin and destination cannot be identical."}
            )
        return attrs


class WeatherCheckpointSerializer(serializers.ModelSerializer):
    """Serializes an individual route weather checkpoint."""

    class Meta:
        model = WeatherCheckpoint
        fields = [
            "id",
            "sequence_index",
            "latitude",
            "longitude",
            "distance_from_origin_miles",
            "segment_miles",
            "estimated_arrival_time",
            "forecast_available",
            "forecast_timestamp",
            "temperature_f",
            "precipitation_probability",
            "rain_in_hr",
            "snow_in_hr",
            "wind_speed_mph",
            "weather_code",
            "weather_condition",
            "risk_score",
            "risk_level",
            "risk_contributors",
            "safety_recommendation",
        ]


class RouteOptionSerializer(serializers.ModelSerializer):
    """Serializes a candidate route option with summary metrics and checkpoints."""

    checkpoints = WeatherCheckpointSerializer(many=True, read_only=True)
    checkpoint_count = serializers.SerializerMethodField()

    class Meta:
        model = RouteOption
        fields = [
            "id",
            "rank",
            "name",
            "strategy",
            "is_recommended",
            "recommendation_reason",
            "distance_miles",
            "duration_seconds",
            "estimated_arrival_time",
            "geometry",
            "low_miles",
            "moderate_miles",
            "high_miles",
            "severe_miles",
            "no_travel_miles",
            "average_risk_score",
            "overall_risk_level",
            "main_weather_concerns",
            "safety_warnings",
            "checkpoint_count",
            "checkpoints",
        ]

    def get_checkpoint_count(self, obj: RouteOption) -> int:
        if hasattr(obj, "_prefetched_objects_cache") and "checkpoints" in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache["checkpoints"])
        return obj.checkpoints.count()


class TripDetailSerializer(serializers.ModelSerializer):
    """Serializes a planned Trip along with all evaluated RouteOptions."""

    routes = RouteOptionSerializer(many=True, read_only=True)
    recommended_route_id = serializers.SerializerMethodField()
    travel_advisory_status = serializers.SerializerMethodField()
    disclaimer = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id",
            "origin_query",
            "origin_label",
            "origin_lat",
            "origin_lon",
            "destination_query",
            "destination_label",
            "destination_lat",
            "destination_lon",
            "departure_time",
            "load_weight_lbs",
            "checkpoint_interval_miles",
            "routing_metadata",
            "recommended_route_id",
            "travel_advisory_status",
            "disclaimer",
            "created_at",
            "routes",
        ]

    def get_recommended_route_id(self, obj: Trip):
        rec = next((r for r in obj.routes.all() if r.is_recommended), None)
        return str(rec.id) if rec else None

    def get_travel_advisory_status(self, obj: Trip) -> str:
        routes = list(obj.routes.all())
        if not routes:
            return "unknown"
        if all(r.no_travel_miles > 0 for r in routes):
            return "no_travel_all_routes"
        top = routes[0]
        if top.overall_risk_level in (RiskLevel.HIGH, RiskLevel.SEVERE, RiskLevel.NO_TRAVEL):
            return "elevated_caution"
        return "clear"

    def get_disclaimer(self, _obj: Trip) -> str:
        return (
            "Weather risk scores and route recommendations are decision-support estimates "
            "derived from third-party forecast and routing data and do not guarantee road safety."
        )


class TripSummarySerializer(serializers.ModelSerializer):
    """Compact serializer for listing recent planned trips."""

    recommended_route_summary = serializers.SerializerMethodField()
    route_count = serializers.SerializerMethodField()
    all_routes_no_travel = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id",
            "origin_label",
            "destination_label",
            "departure_time",
            "load_weight_lbs",
            "checkpoint_interval_miles",
            "created_at",
            "route_count",
            "all_routes_no_travel",
            "recommended_route_summary",
        ]

    def get_route_count(self, obj: Trip) -> int:
        return len(list(obj.routes.all()))

    def get_all_routes_no_travel(self, obj: Trip) -> bool:
        routes = list(obj.routes.all())
        return bool(routes) and all(r.no_travel_miles > 0 for r in routes)

    def get_recommended_route_summary(self, obj: Trip):
        routes = list(obj.routes.all())
        rec = next((r for r in routes if r.is_recommended), None) or (routes[0] if routes else None)
        if not rec:
            return None
        return {
            "id": str(rec.id),
            "name": rec.name,
            "is_recommended": rec.is_recommended,
            "distance_miles": rec.distance_miles,
            "duration_seconds": rec.duration_seconds,
            "overall_risk_level": rec.overall_risk_level,
            "average_risk_score": rec.average_risk_score,
            "severe_miles": rec.severe_miles,
            "no_travel_miles": rec.no_travel_miles,
        }
