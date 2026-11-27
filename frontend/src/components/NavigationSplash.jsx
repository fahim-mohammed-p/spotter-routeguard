import React from "react";
import { Navigation } from "lucide-react";

const SPLASH_STAGES = [
  "Loading Dashboard",
  "Initializing Navigation",
  "Preparing Workspace",
];

export default function NavigationSplash({
  phase = "visible",
  stageIndex = 0,
  statusText = "Initializing Navigation...",
}) {
  if (phase === "done") return null;

  const progressPct = stageIndex <= 0 ? 34 : stageIndex === 1 ? 68 : 100;

  return (
    <div
      className={`splash-overlay ${phase === "exiting" ? "is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Spotter RouteGuard: ${statusText}`}
    >
      <div className="splash-ambient-glow" aria-hidden="true" />

      <div className="splash-inner">
        <div className="splash-visual-wrap" aria-hidden="true">
          <svg
            viewBox="0 0 320 176"
            className="splash-map-svg"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="splashRouteGrad" x1="56" y1="126" x2="264" y2="50" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1d4ed8" />
                <stop offset="55%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <filter id="splashRouteGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Subtle light navigation grid & corridor streets */}
            <path d="M24 36H296M24 88H296M24 140H296" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 5" opacity="0.8" />
            <path d="M78 16V160M162 16V160M246 16V160" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 5" opacity="0.8" />
            <path
              d="M20 108C76 108 98 62 152 62C206 62 246 98 300 94"
              stroke="#dbeafe"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M114 20C122 66 132 114 146 158"
              stroke="#e2e8f0"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Soft outer corridor halo */}
            <path
              d="M56 126C114 126 128 96 162 84C198 71 212 50 264 50"
              stroke="rgba(37, 99, 235, 0.18)"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Main connecting blue navigation route */}
            <path
              id="splash-route-path"
              d="M56 126C114 126 128 96 162 84C198 71 212 50 264 50"
              stroke="url(#splashRouteGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#splashRouteGlow)"
              pathLength="100"
              className="splash-route-line"
            />

            {/* Smooth animated pulse dot moving along the route path */}
            <path
              d="M56 126C114 126 128 96 162 84C198 71 212 50 264 50"
              stroke="#93c5fd"
              strokeWidth="8"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="2 100"
              className="splash-route-tracer-halo"
            />
            <path
              d="M56 126C114 126 128 96 162 84C198 71 212 50 264 50"
              stroke="#ffffff"
              strokeWidth="4.2"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="1.5 100"
              className="splash-route-tracer"
            />

            {/* Origin Pin */}
            <g transform="translate(56, 126)">
              <circle r="14" className="splash-pin-pulse" />
              <circle r="9" fill="#ffffff" stroke="#2563eb" strokeWidth="2.5" />
              <circle r="3.6" fill="#2563eb" />
            </g>

            {/* Destination Pin */}
            <g transform="translate(264, 50)">
              <circle r="15" className="splash-pin-pulse delay" />
              <path
                d="M0 -22C-7.2 -22 -13 -16.2 -13 -9C-13 -0.5 0 9 0 9C0 9 13 -0.5 13 -9C13 -16.2 7.2 -22 0 -22Z"
                fill="#1e3a8a"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle cy="-9" r="4.2" fill="#eff6ff" />
            </g>
          </svg>
        </div>

        <div className="splash-brand-row">
          <div className="splash-logo-badge">
            <Navigation size={18} />
          </div>
          <h1 className="splash-brand-title">SPOTTER ROUTEGUARD</h1>
        </div>

        <p className="splash-tagline">HGV Weather Risk & Dispatch Intelligence</p>

        <div className="splash-status-label">{statusText}</div>

        <div className="splash-progress-track">
          <div
            className="splash-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="splash-stages" aria-label="Initialization steps">
          {SPLASH_STAGES.map((stageLabel, idx) => {
            const isComplete = idx < stageIndex || (stageIndex === 2 && phase === "exiting");
            const isActive = idx === stageIndex && phase !== "exiting";
            return (
              <React.Fragment key={stageLabel}>
                <span
                  className={`splash-stage-item ${
                    isComplete ? "done" : isActive ? "active" : ""
                  }`}
                >
                  {stageLabel}
                </span>
                {idx < SPLASH_STAGES.length - 1 && (
                  <span className="splash-stage-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
