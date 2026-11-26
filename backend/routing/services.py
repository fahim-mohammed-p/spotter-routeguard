"""OpenRouteService v2 integration for geocoding and driving-hgv route generation."""

import hashlib
import logging
import re
from pathlib import Path
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache
from dotenv import dotenv_values

from config.exceptions import (
    ConfigurationError,
    ExternalAPIError,
    ExternalAPITimeoutError,
    RoutePlanningError,
)
from routing.geometry import (
    METERS_PER_MILE,
    are_routes_duplicate,
    compute_lateral_waypoints,
    haversine_miles,
)

logger = logging.getLogger(__name__)

ORS_NATIVE_ALT_MAX_STRAIGHT_MILES = 55.0  # Safe margin under public ORS 100 km road limit
COORD_PATTERN = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


class OpenRouteServiceClient:
    """Client for OpenRouteService geocoding and heavy-goods-vehicle routing."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        geocode_base_url: str | None = None,
        timeout_seconds: float | None = None,
    ):
        if api_key is not None:
            raw_key = api_key
        else:
            raw_key = settings.ORS_API_KEY or self._read_debug_dotenv_key()
        self.api_key = raw_key.strip().strip('"').strip("'")
        self.base_url = (
            (base_url or settings.ORS_BASE_URL)
            .strip()
            .rstrip("/")
            .removesuffix("/v2")
        )
        self.geocode_base_url = (
            (
                geocode_base_url
                or getattr(settings, "ORS_GEOCODE_BASE_URL", "https://api.heigit.org/pelias/v1")
            )
            .strip()
            .rstrip("/")
        )
        self.timeout = timeout_seconds or settings.EXTERNAL_API_TIMEOUT_SECONDS

    @staticmethod
    def _read_debug_dotenv_key() -> str:
        # Allows saving backend/.env in local dev to take effect without restarting runserver.
        if not getattr(settings, "DEBUG", False):
            return ""
        env_path = Path(settings.BASE_DIR) / ".env"
        if not env_path.exists():
            return ""
        return str(dotenv_values(env_path).get("ORS_API_KEY") or "")

    def check_connection(self, verify: bool = False) -> dict[str, Any]:
        """Verify ORS routing and Pelias geocoding endpoints without exposing the API key."""
        if not self.api_key:
            return {
                "configured": False,
                "connected": False,
                "status": "key_needed",
                "error": "ORS_API_KEY is not configured in backend/.env.",
            }

        sig_input = f"{self.api_key}|{self.base_url}|{self.geocode_base_url}"
        key_sig = hashlib.sha256(sig_input.encode()).hexdigest()[:12]
        cache_key = f"ors:health:{key_sig}"
        if not verify:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        geocode_url = f"{self.geocode_base_url}/search"
        directions_url = f"{self.base_url}/v2/directions/driving-hgv/geojson"
        probe_timeout = min(self.timeout, 6.0)

        try:
            with httpx.Client(timeout=probe_timeout) as client:
                geo_resp = client.get(
                    geocode_url,
                    params={"text": "Chicago, IL", "size": 1},
                    headers={
                        "Accept": "application/json",
                        "Authorization": self.api_key,
                    },
                )
                dir_resp = client.post(
                    directions_url,
                    json={
                        "coordinates": [[-87.6298, 41.8781], [-87.6240, 41.8820]],
                        "instructions": False,
                    },
                    headers={
                        "Accept": "application/json, application/geo+json",
                        "Content-Type": "application/json; charset=utf-8",
                        "Authorization": self.api_key,
                    },
                )
        except httpx.TimeoutException:
            result = {
                "configured": True,
                "connected": False,
                "status": "unreachable",
                "error": "HeiGIT ORS/Pelias health probe timed out.",
            }
            cache.set(cache_key, result, timeout=60)
            return result
        except httpx.RequestError:
            result = {
                "configured": True,
                "connected": False,
                "status": "unreachable",
                "error": "Unable to reach HeiGIT OpenRouteService/Pelias API.",
            }
            cache.set(cache_key, result, timeout=60)
            return result

        for service_name, resp in (("Pelias geocoding", geo_resp), ("ORS driving-hgv", dir_resp)):
            if resp.status_code in (401, 403):
                result = {
                    "configured": True,
                    "connected": False,
                    "status": "invalid_key",
                    "error": f"{service_name} rejected ORS_API_KEY (HTTP {resp.status_code}).",
                }
                cache.set(cache_key, result, timeout=120)
                return result

            if resp.status_code == 429:
                result = {
                    "configured": True,
                    "connected": True,
                    "status": "rate_limited",
                    "error": f"{service_name} rate limit reached.",
                }
                cache.set(cache_key, result, timeout=60)
                return result

            if resp.status_code >= 400:
                result = {
                    "configured": True,
                    "connected": False,
                    "status": "unreachable",
                    "error": f"{service_name} returned HTTP {resp.status_code}.",
                }
                cache.set(cache_key, result, timeout=60)
                return result

        result = {
            "configured": True,
            "connected": True,
            "status": "connected",
            "error": None,
        }
        cache.set(cache_key, result, timeout=300)
        return result

    def _require_api_key(self) -> None:
        if not self.api_key:
            raise ConfigurationError(
                detail=(
                    "OpenRouteService API key (ORS_API_KEY) is missing in backend/.env. "
                    "Add a valid key to enable geocoding and HGV routing."
                ),
                code="missing_ors_api_key",
            )

    def _request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        self._require_api_key()
        headers = kwargs.pop("headers", {})
        headers.setdefault("Accept", "application/json, application/geo+json")
        headers.setdefault("Authorization", self.api_key)

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.request(method, url, headers=headers, **kwargs)
        except httpx.TimeoutException as exc:
            logger.warning("ORS/Pelias request timed out for %s: %s", url, exc)
            raise ExternalAPITimeoutError(
                detail="OpenRouteService timed out while computing routes. Please try again."
            ) from exc
        except httpx.RequestError as exc:
            logger.error("ORS/Pelias network error for %s: %s", url, exc)
            raise ExternalAPIError(
                detail="Unable to reach HeiGIT OpenRouteService routing servers."
            ) from exc

        if response.status_code in (401, 403):
            raise ConfigurationError(
                detail="OpenRouteService rejected ORS_API_KEY. Please verify your credentials.",
                code="invalid_ors_api_key",
            )
        if response.status_code == 410:
            raise ExternalAPIError(
                detail="Configured routing/geocoding endpoint returned HTTP 410 Gone. Update ORS_BASE_URL to https://api.heigit.org/openrouteservice.",
                code="ors_endpoint_deprecated",
            )
        if response.status_code == 429:
            raise ExternalAPIError(
                detail="OpenRouteService rate limit exceeded. Please wait briefly and retry.",
                code="ors_rate_limited",
                status_code=429,
            )

        if response.status_code >= 400:
            error_code, error_msg = self._extract_error_details(response)
            logger.warning("ORS/Pelias error (%s, code=%s) on %s: %s", response.status_code, error_code, url, error_msg)
            if error_code in (2009, 2010):
                raise RoutePlanningError(
                    detail=f"No drivable heavy-truck route found: {error_msg}",
                    code="unroutable_locations",
                )
            raise ExternalAPIError(
                detail=f"Routing provider returned HTTP {response.status_code}: {error_msg}",
                code="ors_http_error",
                extra={"status_code": response.status_code, "provider_message": error_msg},
            )

        try:
            return response.json()
        except ValueError as exc:
            raise ExternalAPIError(detail="Received invalid JSON from OpenRouteService.") from exc

    @staticmethod
    def _extract_error_details(response: httpx.Response) -> tuple[int | None, str]:
        try:
            payload = response.json()
            err = payload.get("error")
            if isinstance(err, dict):
                code = err.get("code")
                return (int(code) if code is not None else None), str(err.get("message") or err)
            if err:
                return None, str(err)
            return None, str(payload)
        except ValueError:
            return None, response.text[:250] or "Unknown error"

    def geocode(self, query: str) -> dict[str, Any]:
        """Resolve a free-text place or 'lat, lon' string into {label, lat, lon}."""
        cleaned = " ".join(query.strip().split())
        if not cleaned:
            raise RoutePlanningError("Location query cannot be empty.")

        coord_match = COORD_PATTERN.match(cleaned)
        if coord_match:
            lat = float(coord_match.group(1))
            lon = float(coord_match.group(2))
            if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                return {
                    "label": f"{lat:.4f}, {lon:.4f}",
                    "lat": lat,
                    "lon": lon,
                }
            raise RoutePlanningError(f"Coordinates out of valid range: '{query}'.")

        cache_key = f"ors:geocode:{hashlib.sha256(cleaned.lower().encode()).hexdigest()[:24]}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        data = self._request(
            "GET",
            f"{self.geocode_base_url}/search",
            params={"text": cleaned, "size": 1},
        )
        features = data.get("features") or []
        if not features:
            raise RoutePlanningError(
                detail=f"Could not find coordinates for '{query}'. Try adding a city and state/country.",
                code="location_not_found",
            )

        feature = features[0]
        coords = feature.get("geometry", {}).get("coordinates") or []
        if len(coords) < 2:
            raise RoutePlanningError(f"Geocoder returned invalid coordinates for '{query}'.")

        props = feature.get("properties") or {}
        resolved = {
            "label": props.get("label") or props.get("name") or cleaned,
            "lon": float(coords[0]),
            "lat": float(coords[1]),
        }
        cache.set(cache_key, resolved, timeout=3600)
        return resolved

    def fetch_directions(
        self,
        coordinates: list[list[float]],
        preference: str = "recommended",
        alternative_routes: dict[str, Any] | None = None,
        radiuses: list[int] | None = None,
        options: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Query ORS driving-hgv GeoJSON directions and normalize returned features."""
        body: dict[str, Any] = {
            "coordinates": coordinates,
            "preference": preference,
            "instructions": True,
        }
        if alternative_routes:
            body["alternative_routes"] = alternative_routes
        if radiuses:
            body["radiuses"] = radiuses
        if options:
            body["options"] = options

        payload = self._request(
            "POST",
            f"{self.base_url}/v2/directions/driving-hgv/geojson",
            json=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        features = payload.get("features") or []
        parsed: list[dict[str, Any]] = []
        for feature in features:
            geometry = feature.get("geometry") or {}
            coords = geometry.get("coordinates") or []
            props = feature.get("properties") or {}
            summary = props.get("summary") or {}
            dist_meters = float(summary.get("distance") or 0.0)
            dur_seconds = float(summary.get("duration") or 0.0)
            if len(coords) < 2 or dist_meters <= 0 or dur_seconds <= 0:
                continue
            parsed.append(
                {
                    "geometry": {"type": "LineString", "coordinates": coords},
                    "distance_miles": round(dist_meters / METERS_PER_MILE, 2),
                    "duration_seconds": int(round(dur_seconds)),
                    "segments": props.get("segments") or [],
                }
            )
        return parsed


class RoutingService:
    """High-level HGV route generation orchestrator returning up to 3 distinct alternatives."""

    def __init__(self, client: OpenRouteServiceClient | None = None):
        self.client = client or OpenRouteServiceClient()

    def plan_routes(self, origin_query: str, destination_query: str) -> dict[str, Any]:
        """Geocode endpoints and generate up to 3 distinct HGV route alternatives."""
        origin = self.client.geocode(origin_query)
        destination = self.client.geocode(destination_query)

        straight_miles = haversine_miles(
            origin["lat"], origin["lon"], destination["lat"], destination["lon"]
        )
        if straight_miles < 0.5:
            raise RoutePlanningError(
                detail="Origin and destination resolve to the same area (< 0.5 miles apart).",
                code="identical_endpoints",
            )

        origin_coord = [origin["lon"], origin["lat"]]
        dest_coord = [destination["lon"], destination["lat"]]

        candidates: list[dict[str, Any]] = []
        notes: list[str] = []

        if straight_miles <= ORS_NATIVE_ALT_MAX_STRAIGHT_MILES:
            try:
                native_routes = self.client.fetch_directions(
                    [origin_coord, dest_coord],
                    preference="recommended",
                    alternative_routes={
                        "target_count": 3,
                        "weight_factor": 1.6,
                        "share_factor": 0.7,
                    },
                )
                for idx, r in enumerate(native_routes):
                    label = (
                        "Primary HGV Corridor"
                        if idx == 0
                        else f"Alternative Corridor {idx}"
                    )
                    strategy = "recommended" if idx == 0 else "alternative_ors"
                    self._add_if_distinct(candidates, {**r, "name": label, "strategy": strategy})
            except ExternalAPIError as exc:
                # If road distance exceeded ORS 100km limit or alternative_routes rejected, fall through
                logger.info("Native alternative_routes unavailable (%s); falling back.", exc)

        if not candidates:
            primary_list = self.client.fetch_directions(
                [origin_coord, dest_coord],
                preference="recommended",
            )
            if not primary_list:
                raise RoutePlanningError(
                    "Routing provider could not find a drivable heavy-truck route between these locations."
                )
            self._add_if_distinct(
                candidates,
                {**primary_list[0], "name": "Primary HGV Corridor", "strategy": "recommended"},
            )

        primary_route = candidates[0]

        if len(candidates) < 3:
            try:
                shortest_list = self.client.fetch_directions(
                    [origin_coord, dest_coord],
                    preference="shortest",
                )
                if shortest_list:
                    self._add_if_distinct(
                        candidates,
                        {
                            **shortest_list[0],
                            "name": "Direct / Shortest Corridor",
                            "strategy": "shortest",
                        },
                        max_distance_ratio=1.65,
                        primary=primary_route,
                    )
            except ExternalAPIError as exc:
                logger.info("Shortest preference query failed cleanly: %s", exc)

        if len(candidates) < 3:
            if straight_miles > ORS_NATIVE_ALT_MAX_STRAIGHT_MILES:
                notes.append(
                    "Long-distance journey exceeds public ORS 100 km native alternative limit; "
                    "distinct lateral waypoint corridors were evaluated."
                )
            for offset_ratio in (0.12, 0.2):
                if len(candidates) >= 3:
                    break
                waypoints = compute_lateral_waypoints(
                    origin["lon"],
                    origin["lat"],
                    destination["lon"],
                    destination["lat"],
                    offset_ratio=offset_ratio,
                )
                for corridor_name, wp in waypoints:
                    if len(candidates) >= 3:
                        break
                    try:
                        bypass_routes = self.client.fetch_directions(
                            [origin_coord, wp, dest_coord],
                            preference="recommended",
                            radiuses=[-1, -1, -1],
                        )
                        if bypass_routes:
                            self._add_if_distinct(
                                candidates,
                                {
                                    **bypass_routes[0],
                                    "name": corridor_name,
                                    "strategy": "corridor_bypass",
                                },
                                max_distance_ratio=1.75,
                                primary=primary_route,
                            )
                    except ExternalAPIError as exc:
                        logger.info("Bypass corridor %s failed to snap/route: %s", corridor_name, exc)

        if len(candidates) < 3:
            notes.append(
                f"Generated {len(candidates)} genuinely distinct HGV route option(s); "
                "duplicate or excessive-detour paths were excluded."
            )

        return {
            "origin": origin,
            "destination": destination,
            "routes": candidates[:3],
            "metadata": {
                "requested_alternatives": 3,
                "returned_alternatives": len(candidates[:3]),
                "straight_line_miles": round(straight_miles, 2),
                "notes": notes,
            },
        }

    @staticmethod
    def _add_if_distinct(
        accepted: list[dict[str, Any]],
        candidate: dict[str, Any],
        max_distance_ratio: float | None = None,
        primary: dict[str, Any] | None = None,
    ) -> bool:
        if primary and max_distance_ratio:
            if candidate["distance_miles"] > primary["distance_miles"] * max_distance_ratio:
                return False
        for existing in accepted:
            if are_routes_duplicate(existing, candidate):
                return False
        accepted.append(candidate)
        return True
