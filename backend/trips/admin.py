"""Django admin registrations for trips models."""

from django.contrib import admin

from trips.models import RouteOption, Trip, WeatherCheckpoint


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "origin_label",
        "destination_label",
        "departure_time",
        "load_weight_lbs",
        "checkpoint_interval_miles",
        "created_at",
    )
    search_fields = ("origin_query", "destination_query", "origin_label", "destination_label")


@admin.register(RouteOption)
class RouteOptionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "trip",
        "rank",
        "name",
        "distance_miles",
        "overall_risk_level",
        "average_risk_score",
        "is_recommended",
    )
    list_filter = ("overall_risk_level", "is_recommended")


@admin.register(WeatherCheckpoint)
class WeatherCheckpointAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "route_option",
        "sequence_index",
        "distance_from_origin_miles",
        "estimated_arrival_time",
        "risk_level",
        "risk_score",
        "forecast_available",
    )
    list_filter = ("risk_level", "forecast_available")
