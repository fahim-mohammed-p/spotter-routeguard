import React from "react";
import { AlertTriangle, Award, CheckCircle2, Clock, Route } from "lucide-react";
import RiskBadge from "./RiskBadge";
import { formatDateTime, formatDistance, formatDuration } from "../utils/formatters";
import { ROUTE_LINE_COLORS } from "../utils/riskStyles";

export default function RouteComparisonCards({
  routes,
  selectedRouteId,
  onSelectRoute,
}) {
  if (!routes || routes.length === 0) return null;

  return (
    <div className="row g-3">
      {routes.map((route, idx) => {
        const isSelected = route.id === selectedRouteId;
        const lineColor = ROUTE_LINE_COLORS[idx % ROUTE_LINE_COLORS.length];
        const totalEvaluatedMiles =
          route.low_miles +
            route.moderate_miles +
            route.high_miles +
            route.severe_miles +
            route.no_travel_miles ||
          route.distance_miles ||
          1;

        const pct = (val) => `${Math.max(0, (val / totalEvaluatedMiles) * 100)}%`;

        return (
          <div key={route.id} className="col-12 col-lg-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelectRoute(route.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectRoute(route.id);
                }
              }}
              className={`route-option-card ${isSelected ? "selected" : ""} ${
                route.is_recommended ? "recommended" : ""
              }`}
            >
              <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      backgroundColor: lineColor,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div className="fw-semibold small" style={{ color: "var(--text-primary)" }}>
                      #{route.rank} · {route.name}
                    </div>
                    <div className="text-muted" style={{ fontSize: "0.74rem" }}>
                      {route.checkpoint_count} checkpoints
                    </div>
                  </div>
                </div>
                <RiskBadge
                  level={route.overall_risk_level}
                  score={route.average_risk_score}
                />
              </div>

              <div className="mb-2">
                {route.is_recommended ? (
                  <span
                    className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill fw-semibold"
                    style={{
                      background: "var(--risk-low-bg)",
                      color: "var(--risk-low-text)",
                      border: "1px solid var(--risk-low-border)",
                      fontSize: "0.72rem",
                    }}
                  >
                    <Award size={12} /> Recommended Route
                  </span>
                ) : route.no_travel_miles > 0 ? (
                  <span
                    className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill fw-semibold"
                    style={{
                      background: "var(--risk-no-travel-bg)",
                      color: "var(--risk-no-travel-text)",
                      border: "1px solid var(--risk-no-travel-border)",
                      fontSize: "0.72rem",
                    }}
                  >
                    <AlertTriangle size={12} /> No Travel Segments
                  </span>
                ) : (
                  <span
                    className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill fw-medium"
                    style={{
                      background: "var(--bg-subtle)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "0.72rem",
                    }}
                  >
                    <Route size={12} /> Alternative Option
                  </span>
                )}
              </div>

              <div className="row g-2 my-1">
                <div className="col-4">
                  <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                    Distance
                  </div>
                  <div className="mono fw-semibold small">
                    {formatDistance(route.distance_miles)}
                  </div>
                </div>
                <div className="col-4">
                  <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                    Duration
                  </div>
                  <div className="mono fw-semibold small">
                    {formatDuration(route.duration_seconds)}
                  </div>
                </div>
                <div className="col-4">
                  <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                    Dest ETA
                  </div>
                  <div className="mono fw-semibold" style={{ fontSize: "0.75rem" }}>
                    <Clock size={11} className="me-1" style={{ color: "var(--accent-primary)" }} />
                    {formatDateTime(route.estimated_arrival_time)}
                  </div>
                </div>
              </div>

              <div className="mt-2 mb-2">
                <div className="risk-bar-track" title="Risk mile distribution">
                  <div style={{ width: pct(route.low_miles), background: "#10b981" }} />
                  <div style={{ width: pct(route.moderate_miles), background: "#eab308" }} />
                  <div style={{ width: pct(route.high_miles), background: "#f97316" }} />
                  <div style={{ width: pct(route.severe_miles), background: "#ef4444" }} />
                  <div style={{ width: pct(route.no_travel_miles), background: "#991b1b" }} />
                </div>
                <div
                  className="d-flex justify-content-between mt-1 mono text-muted"
                  style={{ fontSize: "0.72rem" }}
                >
                  <span>NoTravel: {route.no_travel_miles.toFixed(1)}m</span>
                  <span>Severe: {route.severe_miles.toFixed(1)}m</span>
                  <span>High: {route.high_miles.toFixed(1)}m</span>
                </div>
              </div>

              <div
                className="mt-auto pt-2 border-top"
                style={{
                  borderColor: "var(--border-subtle) !important",
                  fontSize: "0.78rem",
                  color: "var(--text-secondary)",
                }}
              >
                <div className="fw-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  {route.main_weather_concerns?.[0] || "Low weather impact"}
                </div>
                <div style={{ fontSize: "0.73rem" }}>
                  {route.recommendation_reason}
                </div>
                {isSelected && (
                  <div
                    className="mt-2 small fw-semibold d-flex align-items-center gap-1"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    <CheckCircle2 size={14} /> Active on Map & Analytics
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
