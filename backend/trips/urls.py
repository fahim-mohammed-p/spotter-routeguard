"""URL routes for the trips API."""

from django.urls import path

from trips.views import (
    RouteCheckpointsView,
    RoutePlanView,
    RouteWeatherTimelineView,
    TripDetailView,
    TripListView,
    health_check,
)

urlpatterns = [
    path("health/", health_check, name="api-health"),
    path("trips/", TripListView.as_view(), name="trip-list"),
    path("routes/plan/", RoutePlanView.as_view(), name="route-plan"),
    path("routes/<uuid:trip_id>/", TripDetailView.as_view(), name="route-detail"),
    path(
        "routes/<uuid:trip_id>/checkpoints/",
        RouteCheckpointsView.as_view(),
        name="route-checkpoints",
    ),
    path(
        "routes/<uuid:trip_id>/weather/",
        RouteWeatherTimelineView.as_view(),
        name="route-weather-timeline",
    ),
]
