import React from "react";
import { Clock, Flame, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { formatDateTime } from "../utils/formatters";
import { getRiskStyle } from "../utils/riskStyles";

const RISK_RANK = {
  Low: 0,
  Moderate: 1,
  High: 2,
  Severe: 3,
  "No Travel": 4,
};

export default function ForecastSlider({
  departureTime,
  timelineCheckpoints,
  sliderHour,
  isTimelineMode,
  isPlaying,
  showHeatmap,
  onToggleHeatmap,
  onChangeHour,
  onResetToEta,
  onTogglePlay,
}) {
  const hourlySummaries = Array.from({ length: 49 }, (_, hour) => {
    let worstLevel = "Low";
    let availableCount = 0;

    if (timelineCheckpoints?.length) {
      for (const cp of timelineCheckpoints) {
        const slot = cp.hourly_forecast?.[hour];
        if (slot?.forecast_available) {
          availableCount += 1;
          if ((RISK_RANK[slot.risk_level] || 0) > (RISK_RANK[worstLevel] || 0)) {
            worstLevel = slot.risk_level;
          }
        }
      }
    }

    const baseDate = departureTime ? new Date(departureTime) : null;
    const slotTime =
      baseDate && !Number.isNaN(baseDate.getTime())
        ? new Date(baseDate.getTime() + hour * 3600 * 1000).toISOString()
        : null;

    return {
      hour,
      worstLevel,
      availableCount,
      slotTime,
    };
  });

  const activeSummary = hourlySummaries[sliderHour] || hourlySummaries[0];
  const totalCheckpoints = timelineCheckpoints?.length || 0;

  return (
    <div className="sg-card">
      <div className="sg-card-header flex-wrap">
        <div className="d-flex align-items-center gap-2">
          <Clock size={17} style={{ color: "var(--accent-primary)" }} />
          <h3 className="sg-card-title">0–48 Hour Forecast Timeline</h3>
          <span
            className="status-pill mono"
            style={{
              background: isTimelineMode
                ? "var(--accent-primary-subtle)"
                : "var(--risk-low-bg)",
              borderColor: isTimelineMode
                ? "var(--accent-primary-border)"
                : "var(--risk-low-border)",
              color: isTimelineMode
                ? "var(--accent-primary)"
                : "var(--risk-low-text)",
            }}
          >
            {isTimelineMode
              ? `Forecast Slice: +${sliderHour}h`
              : "Mode: Truck Arrival (ETA)"}
          </span>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <button
            type="button"
            className={`btn-sg-ghost ${showHeatmap ? "active-toggle" : ""}`}
            onClick={onToggleHeatmap}
          >
            <Flame size={14} />
            <span>{showHeatmap ? "Heatmap On" : "Heatmap Off"}</span>
          </button>

          {isTimelineMode && (
            <button
              type="button"
              className="btn-sg-ghost"
              onClick={onResetToEta}
              title="Return map and checkpoints to truck arrival ETAs"
            >
              <RotateCcw size={14} />
              <span>Reset to Truck ETA</span>
            </button>
          )}
        </div>
      </div>

      <div className="sg-card-body pt-3 pb-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn-sg-ghost"
              onClick={onTogglePlay}
              disabled={!totalCheckpoints}
              aria-label={isPlaying ? "Pause forecast playback" : "Play forecast playback"}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              <span>{isPlaying ? "Pause" : "Play 48h"}</span>
            </button>
            <button
              type="button"
              className="btn-sg-ghost"
              onClick={() => onChangeHour(Math.max(0, sliderHour - 1))}
              disabled={sliderHour <= 0}
              aria-label="Previous hour"
            >
              <SkipBack size={14} />
            </button>
            <button
              type="button"
              className="btn-sg-ghost"
              onClick={() => onChangeHour(Math.min(48, sliderHour + 1))}
              disabled={sliderHour >= 48}
              aria-label="Next hour"
            >
              <SkipForward size={14} />
            </button>
          </div>

          <div className="text-end">
            <div className="mono fw-semibold small" style={{ color: "var(--text-primary)" }}>
              {isTimelineMode
                ? `T + ${sliderHour}h · ${formatDateTime(activeSummary?.slotTime)}`
                : "Viewing each checkpoint at its Truck ETA (slide to explore 0–48h)"}
            </div>
            <div className="text-secondary" style={{ fontSize: "0.75rem" }}>
              {totalCheckpoints > 0
                ? activeSummary?.availableCount > 0
                  ? `Real forecast available for ${activeSummary.availableCount}/${totalCheckpoints} checkpoints at +${sliderHour}h`
                  : `Forecast unavailable at +${sliderHour}h for this corridor`
                : "Select a route to inspect hourly forecasts"}
            </div>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={48}
          step={1}
          value={sliderHour}
          onChange={(e) => onChangeHour(Number(e.target.value))}
          className="forecast-slider-range"
          aria-label="0 to 48 hour forecast slider"
        />

        <div className="timeline-strip" aria-label="48-hour corridor risk strip">
          {hourlySummaries.map((item) => {
            const color =
              item.availableCount === 0
                ? "#e2e8f0"
                : getRiskStyle(item.worstLevel).color;
            return (
              <div
                key={item.hour}
                role="button"
                tabIndex={0}
                title={`+${item.hour}h: ${
                  item.availableCount > 0
                    ? `Peak corridor risk ${item.worstLevel}`
                    : "Forecast unavailable"
                }`}
                onClick={() => onChangeHour(item.hour)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onChangeHour(item.hour);
                }}
                className={`timeline-tick ${
                  isTimelineMode && sliderHour === item.hour ? "active" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>

        <div
          className="d-flex justify-content-between text-muted mono mt-1"
          style={{ fontSize: "0.7rem" }}
        >
          <span>Departure (0h)</span>
          <span>+12h</span>
          <span>+24h</span>
          <span>+36h</span>
          <span>+48h</span>
        </div>
      </div>
    </div>
  );
}
