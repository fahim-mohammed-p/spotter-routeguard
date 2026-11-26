"""Centralized exception types and DRF error formatting."""

import logging
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class AppServiceError(APIException):
    """Base application exception for clean structured JSON responses."""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "An unexpected application error occurred."
    default_code = "application_error"

    def __init__(
        self,
        detail: str | None = None,
        code: str | None = None,
        status_code: int | None = None,
        extra: dict[str, Any] | None = None,
    ):
        if status_code is not None:
            self.status_code = status_code
        self.error_code = code or self.default_code
        self.extra = extra or {}
        super().__init__(detail=detail or self.default_detail, code=self.error_code)


class ConfigurationError(AppServiceError):
    """Raised when required backend environment configuration (e.g. API key) is missing."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "External service configuration is incomplete."
    default_code = "configuration_error"


class ExternalAPIError(AppServiceError):
    """Raised when an upstream routing or weather provider returns an error or times out."""

    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "An external service failed to respond cleanly."
    default_code = "external_api_error"


class ExternalAPITimeoutError(ExternalAPIError):
    """Raised when an upstream routing or weather call exceeds the configured timeout."""

    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    default_detail = "The external service timed out. Please try again."
    default_code = "external_api_timeout"


class RoutePlanningError(AppServiceError):
    """Raised when route resolution or planning cannot proceed (e.g., invalid places)."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = "Unable to plan a valid truck route for the provided inputs."
    default_code = "route_planning_error"


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    """Normalize all DRF and service exceptions into a consistent JSON envelope."""
    if isinstance(exc, DjangoValidationError):
        exc = DRFValidationError(detail=exc.messages)

    response = exception_handler(exc, context)

    if response is None:
        logger.exception("Unhandled exception in API view", exc_info=exc)
        return Response(
            {
                "error": {
                    "code": "internal_server_error",
                    "message": "An unexpected internal server error occurred.",
                    "details": None,
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, AppServiceError):
        payload = {
            "error": {
                "code": exc.error_code,
                "message": str(exc.detail),
                "details": exc.extra or None,
            }
        }
        response.data = payload
        return response

    if isinstance(exc, Http404):
        response.data = {
            "error": {
                "code": "not_found",
                "message": "The requested resource was not found.",
                "details": None,
            }
        }
        return response

    if isinstance(exc, DRFValidationError):
        response.data = {
            "error": {
                "code": "validation_error",
                "message": "Request validation failed.",
                "details": response.data,
            }
        }
        return response

    detail = response.data.get("detail") if isinstance(response.data, dict) else None
    response.data = {
        "error": {
            "code": getattr(exc, "default_code", "api_error"),
            "message": str(detail or "Request could not be completed."),
            "details": response.data if detail is None else None,
        }
    }
    return response
