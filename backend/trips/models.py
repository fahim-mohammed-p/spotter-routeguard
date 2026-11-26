"""Database models for trips, route options, and ETA weather checkpoints."""

import uuid

from django.db import models


class RiskLevel(models.TextChoices):
    LOW = "Low", "Low"
    MODERATE = "Moderate", "Moderate"
    HIGH = "High", "High"
    SEVERE = "Severe", "Severe"
    NO_TRAVEL = "No Travel", "No Travel"


class CheckpointInterval(models.IntegerChoices):
    MILES_10 = 10, "Every 10 miles"
    MILES_25 = 25, "Every 25 miles"
    MILES_50 = 50, "Every 50 miles"


class Trip(models.Model):
    """Represents a planned weather-aware truck journey."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    origin_query = models.CharField(max_length=255)
    origin_label = models.CharField(max_length=255, blank=True)
    origin_lat = models.FloatField()
    origin_lon = models.FloatField()

    destination_query = models.CharField(max_length=255)
    destination_label = models.CharField(max_length=255, blank=True)
    destination_lat = models.FloatField()
    destination_lon = models.FloatField()

    departure_time = models.DateTimeField()
    load_weight_lbs = models.PositiveIntegerField()
    checkpoint_interval_miles = models.PositiveSmallIntegerField(
        choices=CheckpointInterval.choices,
        default=CheckpointInterval.MILES_25,
    )
    routing_metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self) -> str:
        origin = self.origin_label or self.origin_query
        dest = self.destination_label or self.destination_query
        return f"{origin} -> {dest} ({self.load_weight_lbs:,} lb)"


class RouteOption(models.Model):
    """Represents one candidate HGV route option evaluated for a Trip."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="routes")
    rank = models.PositiveSmallIntegerField(default=1)
    name = models.CharField(max_length=120)
    strategy = models.CharField(max_length=60)
    is_recommended = models.BooleanField(default=False)
    recommendation_reason = models.TextField(blank=True)

    distance_miles = models.FloatField()
    duration_seconds = models.PositiveIntegerField()
    estimated_arrival_time = models.DateTimeField()
    geometry = models.JSONField(help_text="GeoJSON LineString geometry for the route.")

    low_miles = models.FloatField(default=0.0)
    moderate_miles = models.FloatField(default=0.0)
    high_miles = models.FloatField(default=0.0)
    severe_miles = models.FloatField(default=0.0)
    no_travel_miles = models.FloatField(default=0.0)

    average_risk_score = models.FloatField(default=0.0)
    overall_risk_level = models.CharField(
        max_length=20,
        choices=RiskLevel.choices,
        default=RiskLevel.LOW,
    )
    main_weather_concerns = models.JSONField(default=list, blank=True)
    safety_warnings = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["rank", "created_at"]
        indexes = [models.Index(fields=["trip", "rank"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.distance_miles:.1f} mi, {self.overall_risk_level})"


class WeatherCheckpoint(models.Model):
    """Represents a sampled weather & risk checkpoint along a RouteOption."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    route_option = models.ForeignKey(
        RouteOption, on_delete=models.CASCADE, related_name="checkpoints"
    )
    sequence_index = models.PositiveIntegerField()
    latitude = models.FloatField()
    longitude = models.FloatField()
    distance_from_origin_miles = models.FloatField()
    segment_miles = models.FloatField(default=0.0)

    estimated_arrival_time = models.DateTimeField()
    forecast_available = models.BooleanField(default=True)
    forecast_timestamp = models.DateTimeField(null=True, blank=True)

    temperature_f = models.FloatField(null=True, blank=True)
    precipitation_probability = models.FloatField(null=True, blank=True)
    rain_in_hr = models.FloatField(null=True, blank=True)
    snow_in_hr = models.FloatField(null=True, blank=True)
    wind_speed_mph = models.FloatField(null=True, blank=True)
    weather_code = models.IntegerField(null=True, blank=True)
    weather_condition = models.CharField(max_length=80, blank=True)

    risk_score = models.FloatField(default=0.0)
    risk_level = models.CharField(
        max_length=20,
        choices=RiskLevel.choices,
        default=RiskLevel.LOW,
    )
    risk_contributors = models.JSONField(default=list, blank=True)
    safety_recommendation = models.TextField(blank=True)
    hourly_forecast = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["sequence_index"]
        unique_together = [("route_option", "sequence_index")]

    def __str__(self) -> str:
        return (
            f"CP#{self.sequence_index} @ {self.distance_from_origin_miles:.1f} mi "
            f"[{self.risk_level}]"
        )
