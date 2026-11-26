"""API views for health checks, trip retrieval, and route planning."""

import logging

from django.conf import settings
from django.db import DatabaseError, connection
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from routing.services import OpenRouteServiceClient
from trips.models import RiskLevel, RouteOption, Trip, WeatherCheckpoint
from trips.serializers import (
    RoutePlanRequestSerializer,
    TripDetailSerializer,
    TripSummarySerializer,
    WeatherCheckpointSerializer,
)
from trips.services import TripPlanningService
from weather.services import OpenMeteoClient

logger = logging.getLogger(__name__)


@api_view(["GET"])
def health_check(request: Request) -> Response:
    """Verify API availability, PostgreSQL connectivity, and external service readiness."""
    db_ok = True
    db_error = None
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
    except DatabaseError as exc:
        db_ok = False
        db_error = str(exc)
        logger.error("Health check database failure: %s", exc)

    verify = request.query_params.get("verify") == "1"
    ors_health = OpenRouteServiceClient().check_connection(verify=verify)
    om_health = OpenMeteoClient().check_connection(verify=verify)
    http_status = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE

    return Response(
        {
            "status": "ok" if db_ok else "degraded",
            "timestamp": timezone.now().isoformat(),
            "database": {
                "connected": db_ok,
                "engine": connection.vendor,
                "error": db_error,
            },
            "services": {
                "openrouteservice_configured": ors_health["configured"],
                "openrouteservice_connected": ors_health["connected"],
                "openrouteservice_status": ors_health["status"],
                "openrouteservice_error": ors_health["error"],
                "open_meteo_connected": om_health["connected"],
                "open_meteo_status": om_health["status"],
                "open_meteo_error": om_health["error"],
                "open_meteo_base_url": settings.OPEN_METEO_BASE_URL,
            },
        },
        status=http_status,
    )


class RoutePlanView(APIView):
    """Plan a weather-aware truck route across up to 3 route alternatives."""

    def post(self, request: Request) -> Response:
        serializer = RoutePlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = TripPlanningService()
        trip = service.plan_trip(serializer.validated_data)
        response_serializer = TripDetailSerializer(trip)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class TripListView(APIView):
    """List recently planned trips along with real database-derived aggregate metrics."""

    def get(self, request: Request) -> Response:
        all_trips = Trip.objects.prefetch_related(
            Prefetch("routes", queryset=RouteOption.objects.order_by("rank"))
        ).all()

        total_trips = all_trips.count()
        total_routes = 0
        recommended_count = 0
        risk_distribution = {level.value: 0 for level in RiskLevel}

        recent_trips = list(all_trips[:25])
        for route in RouteOption.objects.only("overall_risk_level", "is_recommended"):
            total_routes += 1
            if route.is_recommended:
                recommended_count += 1
            if route.overall_risk_level in risk_distribution:
                risk_distribution[route.overall_risk_level] += 1

        serializer = TripSummarySerializer(recent_trips, many=True)
        return Response(
            {
                "stats": {
                    "total_trips": total_trips,
                    "total_routes": total_routes,
                    "recommended_routes": recommended_count,
                    "risk_distribution": risk_distribution,
                },
                "trips": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class TripDetailView(APIView):
    """Retrieve or delete a planned trip and its evaluated routes."""

    def get(self, request: Request, trip_id) -> Response:
        trip = get_object_or_404(
            Trip.objects.prefetch_related(
                Prefetch(
                    "routes",
                    queryset=RouteOption.objects.order_by("rank").prefetch_related(
                        Prefetch(
                            "checkpoints",
                            queryset=WeatherCheckpoint.objects.order_by("sequence_index"),
                        )
                    ),
                )
            ),
            id=trip_id,
        )
        serializer = TripDetailSerializer(trip)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request: Request, trip_id) -> Response:
        trip = get_object_or_404(Trip, id=trip_id)
        trip.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RouteCheckpointsView(APIView):
    """Retrieve checkpoints for a trip, optionally filtered by route_id."""

    def get(self, request: Request, trip_id) -> Response:
        trip = get_object_or_404(
            Trip.objects.prefetch_related(
                Prefetch(
                    "routes",
                    queryset=RouteOption.objects.order_by("rank").prefetch_related(
                        Prefetch(
                            "checkpoints",
                            queryset=WeatherCheckpoint.objects.order_by("sequence_index"),
                        )
                    ),
                )
            ),
            id=trip_id,
        )
        route_id = request.query_params.get("route_id")
        routes = list(trip.routes.all())
        if route_id:
            routes = [r for r in routes if str(r.id) == route_id]

        payload = [
            {
                "route_id": str(route.id),
                "route_name": route.name,
                "checkpoints": WeatherCheckpointSerializer(route.checkpoints.all(), many=True).data,
            }
            for route in routes
        ]
        return Response({"trip_id": str(trip.id), "routes": payload}, status=status.HTTP_200_OK)


class RouteWeatherTimelineView(APIView):
    """Retrieve 0-48 hour corridor forecast timeline across checkpoints for heatmap/slider."""

    def get(self, request: Request, trip_id) -> Response:
        trip = get_object_or_404(
            Trip.objects.prefetch_related(
                Prefetch(
                    "routes",
                    queryset=RouteOption.objects.order_by("rank").prefetch_related(
                        Prefetch(
                            "checkpoints",
                            queryset=WeatherCheckpoint.objects.order_by("sequence_index"),
                        )
                    ),
                )
            ),
            id=trip_id,
        )
        route_id = request.query_params.get("route_id")
        routes = list(trip.routes.all())
        if route_id:
            routes = [r for r in routes if str(r.id) == route_id]

        timeline_routes = []
        for route in routes:
            checkpoints_data = [
                {
                    "checkpoint_id": str(cp.id),
                    "sequence_index": cp.sequence_index,
                    "latitude": cp.latitude,
                    "longitude": cp.longitude,
                    "distance_from_origin_miles": cp.distance_from_origin_miles,
                    "estimated_arrival_time": cp.estimated_arrival_time.isoformat(),
                    "hourly_forecast": cp.hourly_forecast,
                }
                for cp in route.checkpoints.all()
            ]
            timeline_routes.append(
                {
                    "route_id": str(route.id),
                    "route_name": route.name,
                    "checkpoints": checkpoints_data,
                }
            )

        return Response(
            {
                "trip_id": str(trip.id),
                "departure_time": trip.departure_time.isoformat(),
                "window_hours": 48,
                "routes": timeline_routes,
            },
            status=status.HTTP_200_OK,
        )
