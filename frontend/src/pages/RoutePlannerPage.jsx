import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  MapPin,
  Route as RouteIcon,
  ShieldAlert,
} from "lucide-react";
import PlannerForm from "../components/PlannerForm";
import RouteComparisonCards from "../components/RouteComparisonCards";
import ForecastSlider from "../components/ForecastSlider";
import RouteMap from "../components/RouteMap";
import CheckpointPanel from "../components/CheckpointPanel";
import WeatherCharts from "../components/WeatherCharts";
import RiskBadge from "../components/RiskBadge";
import TruckPhoto from "../components/TruckPhoto";
import { useLoadingContext } from "../context/LoadingContext";
import { useRouteWorkspace } from "../hooks/useRouteWorkspace";
import { formatDateTime, formatDistance, formatDuration, formatWeight } from "../utils/formatters";

export default function RoutePlannerPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const loadingCtx = useLoadingContext();
  const workspace = useRouteWorkspace(tripId);

  const {
    trip,
    selectedRoute,
    selectedRouteId,
    activeCheckpoints,
    timelineCheckpoints,
    selectedCheckpointIndex,
    isLoading,
    error,
    sliderHour,
    isTimelineMode,
    isPlaying,
    showHeatmap,
    setSelectedCheckpointIndex,
    setShowHeatmap,
    submitPlan,
    handleSelectRoute,
    handleChangeHour,
    handleResetToEta,
    handleTogglePlay,
  } = workspace;

  const handlePlanSubmit = async (payload) => {
    const created = await (loadingCtx
      ? loadingCtx.runWithPlanningLoader(() => submitPlan(payload))
      : submitPlan(payload));
    if (created?.id) {
      navigate(`/planner/${created.id}`, { replace: true });
    }
  };

  const recommendedRoute =
    trip?.routes?.find((r) => r.is_recommended) || trip?.routes?.[0];
  const allNoTravel = trip?.travel_advisory_status === "no_travel_all_routes";

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <h1 className="h4 fw-bold mb-1">Weather-Aware Truck Route Planner</h1>
          <p className="text-secondary small mb-0">
            Compare up to 3 HGV routes with ETA-synchronized weather checkpoints, load-specific wind rules, and 0–48h corridor heatmaps.
          </p>
        </div>
        <div className="planner-truck-chip d-none d-md-block">
          <TruckPhoto
            src="/images/weather-haul.jpg"
            alt="US Class-8 semi-truck operating under corridor weather conditions"
            eager
          />
          <span className="planner-truck-chip-label">US Freight Watch</span>
        </div>
      </div>

      <PlannerForm onSubmit={handlePlanSubmit} isLoading={isLoading} />

      {error && (
        <div className="advisory-banner no-travel" role="alert">
          <AlertOctagon size={19} className="flex-shrink-0 mt-1" />
          <div>
            <div className="fw-semibold">Unable to Plan Route</div>
            <div className="small">{error}</div>
          </div>
        </div>
      )}

      {isLoading && !trip && !loadingCtx?.isPlanning && (
        <div className="sg-card p-4 text-center" aria-live="polite">
          <div className="sg-inline-pulse mx-auto mb-2" />
          <div className="fw-medium small text-secondary">
            Loading route details...
          </div>
        </div>
      )}

      {trip && (
        <>
          {allNoTravel ? (
            <div className="advisory-banner no-travel" role="alert">
              <ShieldAlert size={22} className="flex-shrink-0 mt-1" />
              <div>
                <div className="fw-bold">
                  NO TRAVEL ADVISORY — Dispatch Not Recommended
                </div>
                <div className="small mt-1">
                  Every evaluated route between{" "}
                  <strong>{trip.origin_label}</strong> and{" "}
                  <strong>{trip.destination_label}</strong> for a{" "}
                  <span className="mono">{formatWeight(trip.load_weight_lbs)}</span>{" "}
                  load crosses No Travel thresholds. Delay departure or stage freight until winds and precipitation subside.
                </div>
              </div>
            </div>
          ) : recommendedRoute ? (
            <div
              className={`advisory-banner ${
                recommendedRoute.overall_risk_level === "Low" ||
                recommendedRoute.overall_risk_level === "Moderate"
                  ? "safe"
                  : "caution"
              }`}
            >
              {recommendedRoute.overall_risk_level === "Low" ||
              recommendedRoute.overall_risk_level === "Moderate" ? (
                <CheckCircle2 size={20} className="flex-shrink-0 mt-1" />
              ) : (
                <AlertTriangle size={20} className="flex-shrink-0 mt-1" />
              )}
              <div className="flex-grow-1">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <span className="fw-bold">
                    Recommended: {recommendedRoute.name}
                  </span>
                  <RiskBadge
                    level={recommendedRoute.overall_risk_level}
                    score={recommendedRoute.average_risk_score}
                  />
                </div>
                <div className="small mt-1">
                  {recommendedRoute.recommendation_reason}
                </div>
              </div>
            </div>
          ) : null}

          {trip.routing_metadata?.notes?.length > 0 && (
            <div className="info-notice-bar">
              <Info size={16} className="flex-shrink-0 mt-1" />
              <div>{trip.routing_metadata.notes.join(" ")}</div>
            </div>
          )}

          {selectedRoute && (
            <div className="row g-3">
              <div className="col-6 col-md-4 col-xl-2">
                <div className="kpi-tile h-100">
                  <div className="kpi-label">Selected Route</div>
                  <div className="fw-semibold small" style={{ color: "var(--text-primary)" }}>
                    {selectedRoute.name}
                  </div>
                  <div className="mt-1">
                    <RiskBadge
                      level={selectedRoute.overall_risk_level}
                      score={selectedRoute.average_risk_score}
                    />
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <div className="kpi-tile h-100">
                  <div className="kpi-label">Distance</div>
                  <div className="kpi-value mono">
                    {formatDistance(selectedRoute.distance_miles)}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                    Interval: {trip.checkpoint_interval_miles} mi
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <div className="kpi-tile h-100">
                  <div className="kpi-label">Travel Time</div>
                  <div className="kpi-value mono">
                    {formatDuration(selectedRoute.duration_seconds)}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                    ETA: {formatDateTime(selectedRoute.estimated_arrival_time)}
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <div className="kpi-tile h-100">
                  <div className="kpi-label">Checkpoints</div>
                  <div className="kpi-value mono">
                    {selectedRoute.checkpoint_count}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                    Load: {formatWeight(trip.load_weight_lbs)}
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-8 col-xl-4">
                <div className="kpi-tile h-100">
                  <div className="kpi-label">Safety Warnings</div>
                  {selectedRoute.safety_warnings?.length > 0 ? (
                    <ul className="mb-0 ps-3 small" style={{ color: "var(--risk-high-text)" }}>
                      {selectedRoute.safety_warnings.slice(0, 2).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="small text-secondary">
                      No Severe or No Travel warnings detected along this corridor.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h2 className="h6 fw-semibold mb-0 d-flex align-items-center gap-2">
                <RouteIcon size={16} style={{ color: "var(--accent-primary)" }} />
                <span>Route Alternatives ({trip.routes?.length || 0})</span>
              </h2>
              <span className="text-muted small">
                Ranked by No Travel → Severe → High miles → Avg Risk → Time
              </span>
            </div>
            <RouteComparisonCards
              routes={trip.routes || []}
              selectedRouteId={selectedRouteId}
              onSelectRoute={handleSelectRoute}
            />
          </div>

          <div className="row g-3">
            <div className="col-12 col-xl-8 d-flex flex-column gap-3">
              <RouteMap
                trip={trip}
                routes={trip.routes || []}
                selectedRouteId={selectedRouteId}
                activeCheckpoints={activeCheckpoints}
                selectedCheckpointIndex={selectedCheckpointIndex}
                showHeatmap={showHeatmap}
                isTimelineMode={isTimelineMode}
                sliderHour={sliderHour}
                onToggleHeatmap={() => setShowHeatmap((v) => !v)}
                onSelectRoute={handleSelectRoute}
                onSelectCheckpoint={setSelectedCheckpointIndex}
              />

              <ForecastSlider
                departureTime={trip.departure_time}
                timelineCheckpoints={timelineCheckpoints}
                sliderHour={sliderHour}
                isTimelineMode={isTimelineMode}
                isPlaying={isPlaying}
                showHeatmap={showHeatmap}
                onToggleHeatmap={() => setShowHeatmap((v) => !v)}
                onChangeHour={handleChangeHour}
                onResetToEta={handleResetToEta}
                onTogglePlay={handleTogglePlay}
              />
            </div>

            <div className="col-12 col-xl-4">
              <CheckpointPanel
                checkpoints={activeCheckpoints}
                selectedCheckpointIndex={selectedCheckpointIndex}
                onSelectCheckpoint={setSelectedCheckpointIndex}
                isTimelineMode={isTimelineMode}
                sliderHour={sliderHour}
              />
            </div>
          </div>

          <div>
            <h2 className="h6 fw-semibold mb-2">
              Corridor Weather & Risk Analytics ({selectedRoute?.name})
            </h2>
            <WeatherCharts
              checkpoints={activeCheckpoints}
              route={selectedRoute}
            />
          </div>

          <div
            className="p-3 rounded small text-secondary d-flex align-items-start gap-2"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <MapPin size={15} className="flex-shrink-0 mt-1" style={{ color: "var(--accent-primary)" }} />
            <div>
              <strong style={{ color: "var(--text-primary)" }}>Decision-Support Notice: </strong>
              {trip.disclaimer}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
