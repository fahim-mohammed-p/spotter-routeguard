import React from "react";
import { CloudRain, CloudSnow, Compass, MapPin, ShieldAlert, Thermometer, Wind } from "lucide-react";
import RiskBadge from "./RiskBadge";
import { formatDateTime } from "../utils/formatters";

export default function CheckpointPanel({
  checkpoints,
  selectedCheckpointIndex,
  onSelectCheckpoint,
  isTimelineMode,
  sliderHour,
}) {
  const selected =
    checkpoints.find((cp) => cp.sequence_index === selectedCheckpointIndex) ||
    checkpoints[0];

  return (
    <div className="d-flex flex-column gap-3 h-100">
      <div className="sg-card">
        <div className="sg-card-header">
          <h3 className="sg-card-title">
            <Compass size={16} style={{ color: "var(--accent-primary)" }} />
            <span>
              Checkpoint #{selected ? selected.sequence_index + 1 : "--"} Inspector
            </span>
          </h3>
          {selected && (
            <RiskBadge
              level={selected.risk_level}
              score={selected.forecast_available ? selected.risk_score : null}
            />
          )}
        </div>

        <div className="sg-card-body">
          {!selected ? (
            <div className="text-secondary small">
              Select a checkpoint marker on the map or table below to inspect forecast metrics.
            </div>
          ) : (
            <>
              <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                <div>
                  <div className="text-secondary small d-flex align-items-center gap-1">
                    <MapPin size={13} style={{ color: "var(--accent-primary)" }} />
                    <span className="mono">
                      {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
                    </span>
                  </div>
                  <div className="fw-semibold mt-1" style={{ color: "var(--text-primary)" }}>
                    Mile {selected.distance_from_origin_miles.toFixed(1)} ·{" "}
                    {selected.weather_condition || "Unknown"}
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                    {isTimelineMode ? `Forecast (+${sliderHour}h)` : "Truck ETA"}
                  </div>
                  <div className="mono small fw-semibold">
                    {formatDateTime(
                      isTimelineMode
                        ? selected.active_timestamp || selected.estimated_arrival_time
                        : selected.estimated_arrival_time
                    )}
                  </div>
                </div>
              </div>

              {!selected.forecast_available ? (
                <div className="advisory-banner caution small">
                  <ShieldAlert size={16} className="flex-shrink-0 mt-1" />
                  <div>
                    Forecast data is unavailable for this checkpoint and timestamp.
                    No simulated weather metrics were generated.
                  </div>
                </div>
              ) : (
                <>
                  <div className="row g-2 mb-3">
                    <div className="col-6 col-sm-3 col-lg-6">
                      <div className="kpi-tile p-2 shadow-none" style={{ background: "var(--bg-canvas)" }}>
                        <div className="kpi-label d-flex align-items-center gap-1">
                          <Wind size={12} /> Wind
                        </div>
                        <div className="kpi-value mono fs-6">
                          {selected.wind_speed_mph?.toFixed(1) ?? "--"} mph
                        </div>
                      </div>
                    </div>
                    <div className="col-6 col-sm-3 col-lg-6">
                      <div className="kpi-tile p-2 shadow-none" style={{ background: "var(--bg-canvas)" }}>
                        <div className="kpi-label d-flex align-items-center gap-1">
                          <Thermometer size={12} /> Temp
                        </div>
                        <div className="kpi-value mono fs-6">
                          {selected.temperature_f?.toFixed(0) ?? "--"}°F
                        </div>
                      </div>
                    </div>
                    <div className="col-6 col-sm-3 col-lg-6">
                      <div className="kpi-tile p-2 shadow-none" style={{ background: "var(--bg-canvas)" }}>
                        <div className="kpi-label d-flex align-items-center gap-1">
                          <CloudRain size={12} /> Rain
                        </div>
                        <div className="kpi-value mono fs-6">
                          {selected.rain_in_hr?.toFixed(2) ?? "0.00"} in/hr
                        </div>
                      </div>
                    </div>
                    <div className="col-6 col-sm-3 col-lg-6">
                      <div className="kpi-tile p-2 shadow-none" style={{ background: "var(--bg-canvas)" }}>
                        <div className="kpi-label d-flex align-items-center gap-1">
                          <CloudSnow size={12} /> Snow / Prob
                        </div>
                        <div className="kpi-value mono fs-6">
                          {selected.snow_in_hr?.toFixed(2) ?? "0.00"} in ·{" "}
                          {selected.precipitation_probability?.toFixed(0) ?? 0}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-2">
                    <div className="sg-label mb-1">Risk Contributors</div>
                    <div className="d-flex flex-wrap gap-1">
                      {(selected.risk_contributors || []).map((item, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 rounded small"
                          style={{
                            background: "var(--bg-subtle)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-primary)",
                            fontSize: "0.75rem",
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div
                    className="p-2 rounded small"
                    style={{
                      background: "var(--bg-canvas)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <strong style={{ color: "var(--text-primary)" }}>Guidance: </strong>
                    {selected.safety_recommendation}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="sg-card flex-grow-1">
        <div className="sg-card-header">
          <h3 className="sg-card-title">Corridor Checkpoints ({checkpoints.length})</h3>
        </div>
        <div className="checkpoint-table-wrap">
          <table className="sg-table">
            <thead>
              <tr>
                <th>Mile</th>
                <th>{isTimelineMode ? "Hour" : "ETA"}</th>
                <th>Wind</th>
                <th>Precip</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((cp) => (
                <tr
                  key={cp.id || cp.sequence_index}
                  className={
                    cp.sequence_index === selected?.sequence_index
                      ? "active-row"
                      : ""
                  }
                  onClick={() => onSelectCheckpoint(cp.sequence_index)}
                >
                  <td className="mono fw-semibold">
                    {cp.distance_from_origin_miles.toFixed(0)} mi
                  </td>
                  <td className="mono text-secondary" style={{ fontSize: "0.75rem" }}>
                    {isTimelineMode
                      ? `+${sliderHour}h`
                      : formatDateTime(cp.estimated_arrival_time)}
                  </td>
                  <td className="mono">
                    {cp.forecast_available && cp.wind_speed_mph != null
                      ? `${cp.wind_speed_mph.toFixed(0)} mph`
                      : "N/A"}
                  </td>
                  <td className="mono">
                    {!cp.forecast_available
                      ? "N/A"
                      : cp.snow_in_hr > 0
                      ? `${cp.snow_in_hr.toFixed(2)} in snow`
                      : `${(cp.rain_in_hr || 0).toFixed(2)} in`}
                  </td>
                  <td>
                    {cp.forecast_available ? (
                      <RiskBadge level={cp.risk_level} compact />
                    ) : (
                      <span className="text-muted small">Unavail</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
