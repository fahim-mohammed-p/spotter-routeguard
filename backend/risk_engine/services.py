"""Explainable weather + load risk scoring and Spotter route recommendation engine."""

from typing import Any

from risk_engine.constants import (
    HEAVY_LOAD_HIGH_WIND_THRESHOLD_LBS,
    MEDIUM_LOAD_SEVERE_WIND_THRESHOLD_LBS,
    RAIN_BANDS,
    RECOMMENDATIONS_BY_LEVEL,
    RISK_RANK,
    SNOW_BANDS,
    TIER_SCORE_RANGES,
    WIND_BANDS,
)
from trips.models import RiskLevel


def _classify_band(
    value: float | None,
    bands: list[tuple[float, float, str, bool]],
) -> tuple[str, float]:
    if value is None or value <= 0.0:
        return RiskLevel.LOW, 0.0

    for idx, (low_bound, high_bound, level, inclusive_upper) in enumerate(bands):
        is_last = idx == len(bands) - 1
        if is_last:
            tier_min, tier_max = TIER_SCORE_RANGES[level]
            span = max(high_bound - low_bound, 1e-6)
            ratio = min(1.0, max(0.0, (value - low_bound) / span))
            return level, round(tier_min + (tier_max - tier_min) * ratio, 1)

        in_band = value <= high_bound if inclusive_upper else value < high_bound
        if in_band:
            tier_min, tier_max = TIER_SCORE_RANGES[level]
            span = max(high_bound - low_bound, 1e-6)
            ratio = min(1.0, max(0.0, (value - low_bound) / span))
            return level, round(tier_min + (tier_max - tier_min) * ratio, 1)

    return RiskLevel.NO_TRAVEL, 100.0


def evaluate_weather_point(
    wind_mph: float | None,
    rain_in_hr: float | None,
    snow_in_hr: float | None,
    temperature_f: float | None,
    precipitation_probability: float | None,
    load_weight_lbs: int,
    forecast_available: bool = True,
) -> dict[str, Any]:
    """Evaluate checkpoint weather + truck load weight using exact assessment rules."""
    if not forecast_available:
        return {
            "risk_level": RiskLevel.LOW,
            "risk_score": 0.0,
            "risk_contributors": ["Forecast unavailable for this arrival window"],
            "safety_recommendation": (
                "Forecast data is unavailable beyond provider horizon; check updated bulletins closer to departure."
            ),
        }

    wind = max(0.0, float(wind_mph or 0.0))
    rain = max(0.0, float(rain_in_hr or 0.0))
    snow = max(0.0, float(snow_in_hr or 0.0))

    wind_level, wind_score = _classify_band(wind, WIND_BANDS)
    rain_level, rain_score = _classify_band(rain, RAIN_BANDS)
    snow_level, snow_score = _classify_band(snow, SNOW_BANDS)

    contributors: list[str] = []
    if wind_level != RiskLevel.LOW:
        contributors.append(f"Wind {wind:.1f} mph ({wind_level})")
    if rain_level != RiskLevel.LOW:
        contributors.append(f"Rain {rain:.2f} in/hr ({rain_level})")
    if snow_level != RiskLevel.LOW:
        contributors.append(f"Snow {snow:.2f} in/hr ({snow_level})")

    # Apply exact load-specific wind escalation rules
    effective_wind_level = wind_level
    load_escalated = False

    if wind >= 55.0:
        effective_wind_level = RiskLevel.NO_TRAVEL
    elif 45.0 <= wind < 55.0 and load_weight_lbs > MEDIUM_LOAD_SEVERE_WIND_THRESHOLD_LBS:
        effective_wind_level = RiskLevel.NO_TRAVEL
        load_escalated = True
        contributors.append(
            f"Load rule escalation: {wind:.1f} mph wind with {load_weight_lbs:,} lb (>30,000 lb) -> No Travel"
        )
    elif 35.0 <= wind < 45.0 and load_weight_lbs > HEAVY_LOAD_HIGH_WIND_THRESHOLD_LBS:
        effective_wind_level = RiskLevel.SEVERE
        load_escalated = True
        contributors.append(
            f"Load rule escalation: {wind:.1f} mph wind with {load_weight_lbs:,} lb (>40,000 lb) -> Severe"
        )

    final_level = max(
        [effective_wind_level, rain_level, snow_level],
        key=lambda lvl: RISK_RANK[lvl],
    )

    tier_min, tier_max = TIER_SCORE_RANGES[final_level]
    base_score = max(wind_score, rain_score, snow_score)
    if load_escalated or base_score < tier_min:
        base_score = max(base_score, tier_min + (tier_max - tier_min) * 0.35)

    compound_bonus = 0.0
    elevated_factors = sum(
        1 for lvl in (effective_wind_level, rain_level, snow_level) if RISK_RANK[lvl] >= 1
    )
    if elevated_factors >= 2:
        compound_bonus += 4.0
        contributors.append("Multiple simultaneous weather hazards")

    if temperature_f is not None and temperature_f <= 32.0 and (rain >= 0.02 or snow >= 0.1):
        compound_bonus += 4.0
        contributors.append(f"Freezing temperature ({temperature_f:.0f}°F) with active precipitation")
    elif temperature_f is not None and (temperature_f <= 10.0 or temperature_f >= 100.0):
        compound_bonus += 3.0
        contributors.append(f"Extreme temperature ({temperature_f:.0f}°F)")

    if precipitation_probability is not None and precipitation_probability >= 75.0 and final_level == RiskLevel.LOW:
        compound_bonus += 3.0
        contributors.append(f"High precipitation probability ({precipitation_probability:.0f}%)")

    final_score = round(min(100.0, max(tier_min, base_score + compound_bonus)), 1)
    # Keep Low-classified checkpoints strictly within Low score band unless escalated
    if final_level == RiskLevel.LOW:
        final_score = min(final_score, TIER_SCORE_RANGES[RiskLevel.LOW][1])

    if not contributors:
        contributors.append("Favorable wind and precipitation conditions")

    return {
        "risk_level": final_level,
        "risk_score": final_score,
        "risk_contributors": contributors,
        "safety_recommendation": RECOMMENDATIONS_BY_LEVEL[final_level],
    }


class RiskEngineService:
    """Scores route checkpoints, 0-48h timelines, aggregates route miles, and ranks options."""

    def evaluate_and_rank_routes(
        self,
        routes: list[dict[str, Any]],
        load_weight_lbs: int,
    ) -> list[dict[str, Any]]:
        """Score every checkpoint & hourly timeline, summarize route risk, and rank routes."""
        for route in routes:
            self._score_route(route, load_weight_lbs)

        # Sort using exact assessment priority order:
        # 1. Fewest No Travel miles
        # 2. Fewest Severe miles
        # 3. Fewest High-risk miles
        # 4. Lowest average risk score
        # 5. Shortest travel time
        sorted_routes = sorted(
            routes,
            key=lambda r: (
                round(r["no_travel_miles"], 2),
                round(r["severe_miles"], 2),
                round(r["high_miles"], 2),
                round(r["average_risk_score"], 2),
                r["duration_seconds"],
            ),
        )

        all_have_no_travel = all(r["no_travel_miles"] > 0 for r in sorted_routes)

        for idx, route in enumerate(sorted_routes):
            route["rank"] = idx + 1
            if all_have_no_travel:
                route["is_recommended"] = False
                if idx == 0:
                    route["recommendation_reason"] = (
                        f"NO TRAVEL ADVISORY: Every available route crosses No Travel conditions "
                        f"for a {load_weight_lbs:,} lb load. This corridor has the lowest hazard exposure "
                        f"({route['no_travel_miles']:.1f} No Travel mi, {route['severe_miles']:.1f} Severe mi), "
                        f"but dispatch is strongly discouraged until weather improves."
                    )
                else:
                    route["recommendation_reason"] = (
                        f"Not recommended — crosses {route['no_travel_miles']:.1f} No Travel mi and "
                        f"{route['severe_miles']:.1f} Severe mi."
                    )
            else:
                if idx == 0:
                    route["is_recommended"] = True
                    route["recommendation_reason"] = self._build_winner_reason(
                        route, sorted_routes[1:]
                    )
                else:
                    route["is_recommended"] = False
                    route["recommendation_reason"] = self._build_runner_up_reason(
                        route, sorted_routes[0]
                    )

        return sorted_routes

    def _score_route(self, route: dict[str, Any], load_weight_lbs: int) -> None:
        miles_by_level = {
            RiskLevel.LOW: 0.0,
            RiskLevel.MODERATE: 0.0,
            RiskLevel.HIGH: 0.0,
            RiskLevel.SEVERE: 0.0,
            RiskLevel.NO_TRAVEL: 0.0,
        }
        weighted_score_sum = 0.0
        available_miles_sum = 0.0
        unavailable_count = 0
        concern_counts: dict[str, int] = {}
        worst_level = RiskLevel.LOW

        for cp in route["checkpoints"]:
            eval_res = evaluate_weather_point(
                wind_mph=cp.get("wind_speed_mph"),
                rain_in_hr=cp.get("rain_in_hr"),
                snow_in_hr=cp.get("snow_in_hr"),
                temperature_f=cp.get("temperature_f"),
                precipitation_probability=cp.get("precipitation_probability"),
                load_weight_lbs=load_weight_lbs,
                forecast_available=bool(cp.get("forecast_available", False)),
            )
            cp["risk_level"] = eval_res["risk_level"]
            cp["risk_score"] = eval_res["risk_score"]
            cp["risk_contributors"] = eval_res["risk_contributors"]
            cp["safety_recommendation"] = eval_res["safety_recommendation"]

            seg_miles = float(cp.get("segment_miles") or 0.0)

            if cp.get("forecast_available"):
                miles_by_level[eval_res["risk_level"]] += seg_miles
                weighted_score_sum += eval_res["risk_score"] * max(seg_miles, 0.1)
                available_miles_sum += max(seg_miles, 0.1)
                if RISK_RANK[eval_res["risk_level"]] > RISK_RANK[worst_level]:
                    worst_level = eval_res["risk_level"]
                if RISK_RANK[eval_res["risk_level"]] >= RISK_RANK[RiskLevel.MODERATE]:
                    for c in eval_res["risk_contributors"]:
                        concern_counts[c] = concern_counts.get(c, 0) + 1
            else:
                unavailable_count += 1

            scored_timeline = []
            for slot in cp.get("raw_hourly_timeline") or []:
                if not slot.get("forecast_available"):
                    scored_timeline.append(slot)
                    continue
                slot_eval = evaluate_weather_point(
                    wind_mph=slot.get("wind_speed_mph"),
                    rain_in_hr=slot.get("rain_in_hr"),
                    snow_in_hr=slot.get("snow_in_hr"),
                    temperature_f=slot.get("temperature_f"),
                    precipitation_probability=slot.get("precipitation_probability"),
                    load_weight_lbs=load_weight_lbs,
                    forecast_available=True,
                )
                scored_timeline.append(
                    {
                        **slot,
                        "risk_score": slot_eval["risk_score"],
                        "risk_level": slot_eval["risk_level"],
                    }
                )
            cp["hourly_forecast"] = scored_timeline

        route["low_miles"] = round(miles_by_level[RiskLevel.LOW], 1)
        route["moderate_miles"] = round(miles_by_level[RiskLevel.MODERATE], 1)
        route["high_miles"] = round(miles_by_level[RiskLevel.HIGH], 1)
        route["severe_miles"] = round(miles_by_level[RiskLevel.SEVERE], 1)
        route["no_travel_miles"] = round(miles_by_level[RiskLevel.NO_TRAVEL], 1)
        route["average_risk_score"] = (
            round(weighted_score_sum / available_miles_sum, 1) if available_miles_sum > 0 else 0.0
        )
        route["overall_risk_level"] = worst_level

        top_concerns = [
            label
            for label, _ in sorted(concern_counts.items(), key=lambda item: -item[1])[:4]
        ]
        if not top_concerns:
            top_concerns = ["Clear to low-impact conditions forecast along corridor"]
        route["main_weather_concerns"] = top_concerns

        warnings: list[str] = []
        if route["no_travel_miles"] > 0:
            warnings.append(
                f"NO TRAVEL: {route['no_travel_miles']:.1f} route miles exceed safe wind or precipitation thresholds for this load."
            )
        if route["severe_miles"] > 0:
            warnings.append(
                f"Severe weather risk across {route['severe_miles']:.1f} miles; delay or staging recommended."
            )
        if route["high_miles"] > 0:
            warnings.append(
                f"High weather risk across {route['high_miles']:.1f} miles; reduce speed and watch crosswinds."
            )
        if unavailable_count > 0:
            warnings.append(
                f"Forecast data unavailable for {unavailable_count} checkpoint(s) outside the 16-day forecast horizon."
            )
        route["safety_warnings"] = warnings

    @staticmethod
    def _build_winner_reason(winner: dict[str, Any], others: list[dict[str, Any]]) -> str:
        hrs, rem = divmod(winner["duration_seconds"] // 60, 60)
        duration_str = f"{hrs}h {rem:02d}m"
        base = (
            f"Recommended: {winner['no_travel_miles']:.1f} No Travel mi, "
            f"{winner['severe_miles']:.1f} Severe mi, {winner['high_miles']:.1f} High-risk mi, "
            f"avg risk {winner['average_risk_score']:.1f}/100, ETA duration {duration_str}."
        )
        if not others:
            return base
        return base + " Ranked #1 by safety priority (No Travel -> Severe -> High -> Avg Risk -> Time)."

    @staticmethod
    def _build_runner_up_reason(route: dict[str, Any], winner: dict[str, Any]) -> str:
        if route["no_travel_miles"] > winner["no_travel_miles"]:
            return f"Ranked lower due to {route['no_travel_miles']:.1f} No Travel miles vs {winner['no_travel_miles']:.1f} on recommended route."
        if route["severe_miles"] > winner["severe_miles"]:
            return f"Ranked lower due to {route['severe_miles']:.1f} Severe miles vs {winner['severe_miles']:.1f} on recommended route."
        if route["high_miles"] > winner["high_miles"]:
            return f"Ranked lower due to {route['high_miles']:.1f} High-risk miles vs {winner['high_miles']:.1f} on recommended route."
        if route["average_risk_score"] > winner["average_risk_score"]:
            return f"Higher average risk score ({route['average_risk_score']:.1f} vs {winner['average_risk_score']:.1f})."
        return "Longer estimated travel duration than the recommended route."
