import React from "react";

export function AmericanSemiSvg() {
  return (
    <svg
      viewBox="0 0 240 76"
      className="truck-rig-svg"
      role="img"
      aria-hidden="true"
    >
      {/* Aerodynamic draft streaks */}
      <line x1="6" y1="22" x2="22" y2="22" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <line x1="2" y1="31" x2="18" y2="31" stroke="#bfdbfe" strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
      <line x1="10" y1="40" x2="24" y2="40" stroke="#93c5fd" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />

      {/* 53-ft Dry Van Trailer */}
      <rect x="26" y="13" width="122" height="41" rx="3" fill="#ffffff" stroke="#1e3a8a" strokeWidth="1.6" />
      <rect x="26" y="13" width="122" height="7" rx="2" fill="#1e3a8a" />
      <rect x="34" y="25" width="76" height="4" rx="2" fill="#2563eb" opacity="0.88" />
      <rect x="34" y="32" width="54" height="3" rx="1.5" fill="#94a3b8" opacity="0.65" />
      <text
        x="34"
        y="46"
        fontSize="6.5"
        fontWeight="700"
        letterSpacing="0.8"
        fill="#1e3a8a"
        fontFamily="Inter, sans-serif"
      >
        SPOTTER ROUTEGUARD
      </text>

      {/* Trailer Undercarriage & Landing Gear */}
      <rect x="34" y="54" width="110" height="4" fill="#334155" rx="1" />
      <rect x="114" y="57" width="3" height="7" fill="#475569" />
      <rect x="111" y="63" width="9" height="2" fill="#334155" />

      {/* Fifth-Wheel Coupling & Tractor Chassis */}
      <rect x="146" y="48" width="24" height="6" rx="1" fill="#1e293b" />
      <rect x="148" y="53" width="74" height="5" rx="1.5" fill="#334155" />

      {/* Chrome Exhaust Stack */}
      <rect x="155" y="14" width="3.5" height="31" rx="1.5" fill="#64748b" />
      <path d="M155 14C155 11.5 157.5 10.5 160 10.5" stroke="#64748b" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      {/* US Class-8 Sleeper Cab */}
      <path
        d="M159 17H186C190 17 193.5 19.5 195.5 23.5L203 33L222 36C225 36.6 227 39 227 42V53H159V17Z"
        fill="#2563eb"
        stroke="#1e3a8a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Aero Roof Fairing Accent */}
      <path
        d="M161 17H185C188.5 17 191.5 19 193.5 22H161V17Z"
        fill="#1d4ed8"
      />
      {/* Windshield & Side Sleeper Window */}
      <path
        d="M187 22H194L201 32H187V22Z"
        fill="#dbeafe"
        stroke="#1e3a8a"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="167" y="23" width="14" height="8" rx="1.5" fill="#dbeafe" stroke="#1e3a8a" strokeWidth="1" />
      {/* Fuel Tank & Steps */}
      <rect x="172" y="50" width="22" height="7" rx="3" fill="#94a3b8" stroke="#475569" strokeWidth="1" />
      {/* Chrome Grille & Headlight */}
      <rect x="222" y="38" width="4" height="11" rx="1" fill="#cbd5e1" stroke="#475569" strokeWidth="0.8" />
      <rect x="223" y="49" width="4.5" height="3" rx="1" fill="#fef08a" />
      <rect x="220" y="52" width="9" height="4" rx="1.5" fill="#94a3b8" />

      {/* Trailer Tandem Wheels */}
      {[46, 63, 162, 179, 211].map((cx) => (
        <g key={cx} className="truck-wheel-group" style={{ transformOrigin: `${cx}px 60px` }}>
          <circle cx={cx} cy="60" r="8.2" fill="#0f172a" />
          <circle cx={cx} cy="60" r="4.5" fill="#e2e8f0" />
          <circle cx={cx} cy="60" r="1.8" fill="#475569" />
          <line x1={cx - 3.5} y1="60" x2={cx + 3.5} y2="60" stroke="#64748b" strokeWidth="0.9" />
          <line x1={cx} y1="56.5" x2={cx} y2="63.5" stroke="#64748b" strokeWidth="0.9" />
        </g>
      ))}
    </svg>
  );
}

export function TruckHighwayStage() {
  return (
    <div className="truck-highway-stage" aria-hidden="true">
      <div className="truck-rig-runner">
        <div className="truck-suspension">
          <AmericanSemiSvg />
        </div>
      </div>
      <div className="truck-road-surface">
        <div className="truck-road-shoulder" />
        <div className="truck-road-dashes" />
      </div>
    </div>
  );
}

export function TruckLoaderOverlay({ active, message, subtitle }) {
  if (!active) return null;

  return (
    <div
      className="truck-loader-backdrop"
      role="status"
      aria-live="polite"
      aria-label={message || "Loading Spotter RouteGuard"}
    >
      <div className="truck-loader-content">
        <TruckHighwayStage />

        <div className="mt-3">
          <div className="truck-loader-status">{message}</div>
          {subtitle && (
            <div className="truck-loader-subtitle">{subtitle}</div>
          )}
        </div>

        <div className="truck-progress-track">
          <div className="truck-progress-pulse" />
        </div>
      </div>
    </div>
  );
}
