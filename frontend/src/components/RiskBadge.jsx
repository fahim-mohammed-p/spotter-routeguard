import React from "react";
import { getRiskStyle } from "../utils/riskStyles";

export default function RiskBadge({ level, score, compact = false }) {
  const style = getRiskStyle(level);
  return (
    <span
      className="risk-badge"
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
      }}
    >
      <span
        className="risk-badge-dot"
        style={{ backgroundColor: style.color }}
      />
      <span>{level}</span>
      {!compact && score != null && (
        <span className="mono opacity-75">· {Number(score).toFixed(0)}</span>
      )}
    </span>
  );
}
