"""Open-Meteo hourly forecast client with coordinate deduplication, batching, and caching."""

import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache

from config.exceptions import ExternalAPIError, ExternalAPITimeoutError
from weather.codes import describe_weather_code

logger = logging.getLogger(__name__)

BATCH_SIZE = 40
MAX_FORECAST_DAYS = 16
SLIDER_WINDOW_HOURS = 48


def _parse_utc_hour(iso_str: str) -> datetime:
    """Parse Open-Meteo GMT/UTC timestamp like '2026-11-25T14:00' into aware UTC datetime."""
    dt = datetime.fromisoformat(iso_str)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=dt_timezone.utc)
    return dt.astimezone(dt_timezone.utc)


def _round_to_nearest_hour(dt: datetime) -> datetime:
    utc_dt = dt.astimezone(dt_timezone.utc)
    if utc_dt.minute >= 30:
        utc_dt = utc_dt + timedelta(hours=1)
    return utc_dt.replace(minute=0, second=0, microsecond=0)


DEFAULT_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "SpotterRouteGuard/1.0",
}


def _extract_open_meteo_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict) and payload.get("reason"):
            return str(payload["reason"])
    except ValueError:
        pass
    return (response.text or "").strip()[:200] or "No response body"


class OpenMeteoClient:
    """Client for Open-Meteo hourly forecast data in imperial truck-routing units."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        cache_ttl_seconds: int | None = None,
    ):
        self.base_url = (
            (base_url or settings.OPEN_METEO_BASE_URL)
            .strip()
            .rstrip("/")
            .removesuffix("/forecast")
        )
        self.timeout = float(
            timeout_seconds
            if timeout_seconds is not None
            else settings.EXTERNAL_API_TIMEOUT_SECONDS
        )
        self.cache_ttl = (
            cache_ttl_seconds
            if cache_ttl_seconds is not None
            else settings.WEATHER_CACHE_TTL_SECONDS
        )

    def check_connection(self, verify: bool = False) -> dict[str, Any]:
        """Verify Open-Meteo forecast endpoint availability."""
        cache_key = f"om:health:{self.base_url}"
        if not verify:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        probe_timeout = max(self.timeout, 10.0)
        url = f"{self.base_url}/forecast"
        try:
            with httpx.Client(
                timeout=probe_timeout,
                headers=DEFAULT_HEADERS,
                transport=httpx.HTTPTransport(retries=1),
            ) as client:
                response = client.get(
                    url,
                    params={
                        "latitude": "41.88",
                        "longitude": "-87.63",
                        "hourly": "temperature_2m",
                        "forecast_days": 1,
                    },
                )
        except httpx.TimeoutException as exc:
            err_msg = f"Open-Meteo health probe timed out after {probe_timeout:.0f}s ({type(exc).__name__}: {exc})."
            logger.warning(err_msg)
            result = {
                "connected": False,
                "status": "unreachable",
                "error": err_msg,
            }
            cache.set(cache_key, result, timeout=60)
            return result
        except httpx.RequestError as exc:
            err_msg = f"Open-Meteo connection failed ({type(exc).__name__}: {exc})."
            logger.warning(err_msg)
            result = {
                "connected": False,
                "status": "unreachable",
                "error": err_msg,
            }
            cache.set(cache_key, result, timeout=60)
            return result

        if response.status_code == 429:
            reason = _extract_open_meteo_error(response)
            err_msg = f"Open-Meteo returned HTTP 429 ({reason})."
            logger.warning(err_msg)
            result = {
                "connected": False,
                "status": "rate_limited",
                "error": err_msg,
            }
            cache.set(cache_key, result, timeout=60)
            return result

        if response.status_code >= 400:
            reason = _extract_open_meteo_error(response)
            err_msg = f"Open-Meteo returned HTTP {response.status_code}: {reason}"
            logger.warning(err_msg)
            result = {
                "connected": False,
                "status": "unreachable",
                "error": err_msg,
            }
            cache.set(cache_key, result, timeout=60)
            return result

        try:
            payload = response.json()
        except ValueError as exc:
            err_msg = f"Open-Meteo returned invalid JSON ({exc})."
            logger.warning(err_msg)
            result = {
                "connected": False,
                "status": "unreachable",
                "error": err_msg,
            }
            cache.set(cache_key, result, timeout=60)
            return result

        if not isinstance(payload, dict) or ("hourly" not in payload and "current" not in payload):
            err_msg = "Open-Meteo response missing expected forecast data."
            logger.warning("%s keys=%s", err_msg, list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__)
            result = {
                "connected": False,
                "status": "unreachable",
                "error": err_msg,
            }
            cache.set(cache_key, result, timeout=60)
            return result

        result = {
            "connected": True,
            "status": "connected",
            "error": None,
        }
        cache.set(cache_key, result, timeout=300)
        return result

    def fetch_forecasts_for_points(
        self,
        points: list[tuple[float, float]],
        forecast_days: int = 7,
    ) -> dict[tuple[float, float], dict[datetime, dict[str, Any]]]:
        """Fetch hourly forecast maps keyed by rounded (lat, lon) coordinate pairs.

        Deduplicates close points (~0.02 deg), leverages Django cache, and batches
        uncached points up to 40 per Open-Meteo request.
        """
        clamped_days = max(3, min(MAX_FORECAST_DAYS, int(forecast_days)))
        grid_keys: dict[tuple[float, float], tuple[float, float]] = {}
        for lat, lon in points:
            key = (round(lat, 2), round(lon, 2))
            grid_keys[key] = key

        results: dict[tuple[float, float], dict[datetime, dict[str, Any]]] = {}
        misses: list[tuple[float, float]] = []

        for key in grid_keys:
            cache_key = f"om:v1:{key[0]:.2f}:{key[1]:.2f}:{clamped_days}"
            cached = cache.get(cache_key)
            if cached is not None:
                results[key] = cached
            else:
                misses.append(key)

        if not misses:
            return results

        failed_chunks = 0
        total_chunks = (len(misses) + BATCH_SIZE - 1) // BATCH_SIZE
        last_exc: Exception | None = None

        for i in range(0, len(misses), BATCH_SIZE):
            chunk = misses[i : i + BATCH_SIZE]
            try:
                chunk_data = self._fetch_batch(chunk, clamped_days)
                for key, hourly_map in chunk_data.items():
                    results[key] = hourly_map
                    cache_key = f"om:v1:{key[0]:.2f}:{key[1]:.2f}:{clamped_days}"
                    cache.set(cache_key, hourly_map, timeout=self.cache_ttl)
            except ExternalAPIError as exc:
                failed_chunks += 1
                last_exc = exc
                logger.warning("Open-Meteo batch chunk %s/%s failed: %s", i // BATCH_SIZE + 1, total_chunks, exc)

        # If every batch failed and nothing was cached, bubble up clean external error
        if failed_chunks == total_chunks and not results and last_exc is not None:
            raise last_exc

        return results

    def _fetch_batch(
        self,
        coords: list[tuple[float, float]],
        forecast_days: int,
    ) -> dict[tuple[float, float], dict[datetime, dict[str, Any]]]:
        lat_param = ",".join(f"{lat:.2f}" for lat, _ in coords)
        lon_param = ",".join(f"{lon:.2f}" for _, lon in coords)

        params = {
            "latitude": lat_param,
            "longitude": lon_param,
            "hourly": "temperature_2m,precipitation_probability,rain,snowfall,wind_speed_10m,weather_code",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "UTC",
            "forecast_days": forecast_days,
        }

        url = f"{self.base_url}/forecast"
        try:
            with httpx.Client(
                timeout=self.timeout,
                headers=DEFAULT_HEADERS,
                transport=httpx.HTTPTransport(retries=1),
            ) as client:
                response = client.get(url, params=params)
        except httpx.TimeoutException as exc:
            logger.warning("Open-Meteo batch forecast timed out: %s", exc)
            raise ExternalAPITimeoutError(
                detail="Open-Meteo forecast service timed out. Please try again."
            ) from exc
        except httpx.RequestError as exc:
            logger.warning("Open-Meteo batch request error (%s): %s", type(exc).__name__, exc)
            raise ExternalAPIError(
                detail="Unable to reach Open-Meteo forecast service."
            ) from exc

        if response.status_code >= 400:
            reason = _extract_open_meteo_error(response)
            logger.warning("Open-Meteo batch HTTP %s: %s", response.status_code, reason)
            raise ExternalAPIError(
                detail=f"Open-Meteo returned HTTP {response.status_code}: {reason}",
                code="open_meteo_http_error",
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise ExternalAPIError(detail="Invalid JSON received from Open-Meteo.") from exc

        # Single coordinate returns a dict; multiple coordinates return a list of dicts
        items = payload if isinstance(payload, list) else [payload]
        parsed: dict[tuple[float, float], dict[datetime, dict[str, Any]]] = {}

        for idx, coord in enumerate(coords):
            if idx >= len(items) or not isinstance(items[idx], dict):
                continue
            hourly = items[idx].get("hourly") or {}
            parsed[coord] = self._parse_hourly_block(hourly)

        return parsed

    @staticmethod
    def _parse_hourly_block(hourly: dict[str, Any]) -> dict[datetime, dict[str, Any]]:
        times = hourly.get("time") or []
        temps = hourly.get("temperature_2m") or []
        probs = hourly.get("precipitation_probability") or []
        rains = hourly.get("rain") or []
        snows = hourly.get("snowfall") or []
        winds = hourly.get("wind_speed_10m") or []
        codes = hourly.get("weather_code") or []

        mapped: dict[datetime, dict[str, Any]] = {}
        for i, time_str in enumerate(times):
            try:
                ts = _parse_utc_hour(time_str)
            except ValueError:
                continue

            code_val = codes[i] if i < len(codes) else None
            mapped[ts] = {
                "timestamp": ts,
                "temperature_f": _safe_float(temps, i),
                "precipitation_probability": _safe_float(probs, i),
                "rain_in_hr": _safe_float(rains, i),
                "snow_in_hr": _safe_float(snows, i),
                "wind_speed_mph": _safe_float(winds, i),
                "weather_code": int(code_val) if code_val is not None else None,
                "weather_condition": describe_weather_code(code_val),
            }
        return mapped


def _safe_float(values: list[Any], idx: int) -> float | None:
    if idx >= len(values) or values[idx] is None:
        return None
    try:
        return float(values[idx])
    except (TypeError, ValueError):
        return None


class WeatherService:
    """Assigns ETA weather forecasts and 0-48h slider timelines to route checkpoints."""

    def __init__(self, client: OpenMeteoClient | None = None):
        self.client = client or OpenMeteoClient()

    def enrich_routes_weather(
        self,
        routes_with_checkpoints: list[dict[str, Any]],
        departure_time: datetime,
    ) -> None:
        """Fetch batched forecasts once for all routes and populate ETA + 0-48h windows."""
        all_points: list[tuple[float, float]] = []
        max_target_dt = departure_time + timedelta(hours=SLIDER_WINDOW_HOURS)

        for route in routes_with_checkpoints:
            for cp in route["checkpoints"]:
                all_points.append((cp["latitude"], cp["longitude"]))
                if cp["estimated_arrival_time"] > max_target_dt:
                    max_target_dt = cp["estimated_arrival_time"]

        if not all_points:
            return

        now_utc = datetime.now(dt_timezone.utc)
        days_needed = int((max_target_dt.astimezone(dt_timezone.utc) - now_utc).total_seconds() // 86400) + 2
        forecast_map = self.client.fetch_forecasts_for_points(all_points, forecast_days=days_needed)

        slider_base_hour = departure_time.astimezone(dt_timezone.utc).replace(
            minute=0, second=0, microsecond=0
        )

        for route in routes_with_checkpoints:
            for cp in route["checkpoints"]:
                grid_key = (round(cp["latitude"], 2), round(cp["longitude"], 2))
                hourly_map = forecast_map.get(grid_key) or {}
                eta_hour = _round_to_nearest_hour(cp["estimated_arrival_time"])
                eta_entry = hourly_map.get(eta_hour)

                if eta_entry and _has_core_metrics(eta_entry):
                    cp["forecast_available"] = True
                    cp["forecast_timestamp"] = eta_entry["timestamp"]
                    cp["temperature_f"] = eta_entry["temperature_f"]
                    cp["precipitation_probability"] = eta_entry["precipitation_probability"]
                    cp["rain_in_hr"] = eta_entry["rain_in_hr"]
                    cp["snow_in_hr"] = eta_entry["snow_in_hr"]
                    cp["wind_speed_mph"] = eta_entry["wind_speed_mph"]
                    cp["weather_code"] = eta_entry["weather_code"]
                    cp["weather_condition"] = eta_entry["weather_condition"]
                else:
                    cp["forecast_available"] = False
                    cp["forecast_timestamp"] = None
                    cp["temperature_f"] = None
                    cp["precipitation_probability"] = None
                    cp["rain_in_hr"] = None
                    cp["snow_in_hr"] = None
                    cp["wind_speed_mph"] = None
                    cp["weather_code"] = None
                    cp["weather_condition"] = "Forecast Unavailable"

                timeline: list[dict[str, Any]] = []
                for offset in range(SLIDER_WINDOW_HOURS + 1):
                    slot_dt = slider_base_hour + timedelta(hours=offset)
                    slot = hourly_map.get(slot_dt)
                    if slot and _has_core_metrics(slot):
                        timeline.append(
                            {
                                "offset_hour": offset,
                                "timestamp": slot_dt.isoformat(),
                                "forecast_available": True,
                                "temperature_f": slot["temperature_f"],
                                "precipitation_probability": slot["precipitation_probability"],
                                "rain_in_hr": slot["rain_in_hr"],
                                "snow_in_hr": slot["snow_in_hr"],
                                "wind_speed_mph": slot["wind_speed_mph"],
                                "weather_code": slot["weather_code"],
                                "weather_condition": slot["weather_condition"],
                            }
                        )
                    else:
                        timeline.append(
                            {
                                "offset_hour": offset,
                                "timestamp": slot_dt.isoformat(),
                                "forecast_available": False,
                            }
                        )
                cp["raw_hourly_timeline"] = timeline


def _has_core_metrics(entry: dict[str, Any]) -> bool:
    return any(
        entry.get(field) is not None
        for field in ("wind_speed_mph", "rain_in_hr", "snow_in_hr", "temperature_f")
    )
