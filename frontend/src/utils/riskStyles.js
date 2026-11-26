export const RISK_LEVELS = ["Low", "Moderate", "High", "Severe", "No Travel"];

export const RISK_CONFIG = {
  Low: {
    color: "#10b981",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    text: "#047857",
    markerColor: "#10b981",
    label: "Low Risk",
  },
  Moderate: {
    color: "#eab308",
    bg: "#fefce8",
    border: "#fde047",
    text: "#a16207",
    markerColor: "#eab308",
    label: "Moderate Risk",
  },
  High: {
    color: "#f97316",
    bg: "#fff7ed",
    border: "#fdba74",
    text: "#c2410c",
    markerColor: "#f97316",
    label: "High Risk",
  },
  Severe: {
    color: "#ef4444",
    bg: "#fef2f2",
    border: "#fecaca",
    text: "#dc2626",
    markerColor: "#ef4444",
    label: "Severe Risk",
  },
  "No Travel": {
    color: "#991b1b",
    bg: "#fee2e2",
    border: "#f87171",
    text: "#7f1d1d",
    markerColor: "#991b1b",
    label: "No Travel",
  },
};

export function getRiskStyle(level) {
  return RISK_CONFIG[level] || RISK_CONFIG.Low;
}

export const ROUTE_LINE_COLORS = ["#2563eb", "#7c3aed", "#0d9488"];
