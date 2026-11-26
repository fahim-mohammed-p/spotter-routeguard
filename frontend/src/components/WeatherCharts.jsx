import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { getRiskStyle } from "../utils/riskStyles";

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  color: "#0f172a",
  fontSize: "0.8rem",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
};

export default function WeatherCharts({ checkpoints, route }) {
  if (!checkpoints || checkpoints.length === 0) return null;

  const chartData = checkpoints.map((cp) => ({
    mile: Number(cp.distance_from_origin_miles.toFixed(1)),
    wind: cp.forecast_available ? cp.wind_speed_mph : null,
    rain: cp.forecast_available ? cp.rain_in_hr : null,
    snow: cp.forecast_available ? cp.snow_in_hr : null,
    precipProb: cp.forecast_available ? cp.precipitation_probability : null,
    temp: cp.forecast_available ? cp.temperature_f : null,
    riskScore: cp.forecast_available ? cp.risk_score : null,
    riskLevel: cp.risk_level,
  }));

  const exposureData = route
    ? [
        { name: "Low", miles: route.low_miles, color: "#10b981" },
        { name: "Moderate", miles: route.moderate_miles, color: "#eab308" },
        { name: "High", miles: route.high_miles, color: "#f97316" },
        { name: "Severe", miles: route.severe_miles, color: "#ef4444" },
        { name: "No Travel", miles: route.no_travel_miles, color: "#991b1b" },
      ]
    : [];

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-6">
        <div className="sg-card h-100">
          <div className="sg-card-header">
            <h3 className="sg-card-title">
              <BarChart3 size={16} style={{ color: "var(--accent-primary)" }} />
              <span>Wind Speed Profile & Thresholds (mph)</span>
            </h3>
          </div>
          <div className="sg-card-body" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="windFillLight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="mile"
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `${v}m`}
                />
                <YAxis stroke="#64748b" fontSize={11} domain={[0, "dataMax + 10"]} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`${value ?? "--"} mph`, "Wind"]}
                  labelFormatter={(mile) => `Mile ${mile}`}
                />
                <ReferenceLine y={25} stroke="#eab308" strokeDasharray="4 4" />
                <ReferenceLine y={35} stroke="#f97316" strokeDasharray="4 4" />
                <ReferenceLine y={45} stroke="#ef4444" strokeDasharray="4 4" />
                <ReferenceLine y={55} stroke="#991b1b" strokeDasharray="2 2" />
                <Area
                  type="monotone"
                  dataKey="wind"
                  stroke="#2563eb"
                  strokeWidth={2.2}
                  fill="url(#windFillLight)"
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="col-12 col-xl-6">
        <div className="sg-card h-100">
          <div className="sg-card-header">
            <h3 className="sg-card-title">
              <BarChart3 size={16} style={{ color: "var(--accent-primary)" }} />
              <span>Rain / Snowfall (in/hr) & Probability</span>
            </h3>
          </div>
          <div className="sg-card-body" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="mile"
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `${v}m`}
                />
                <YAxis yAxisId="left" stroke="#64748b" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={11} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(mile) => `Mile ${mile}`} />
                <Bar yAxisId="left" dataKey="rain" name="Rain (in/hr)" fill="#2563eb" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="left" dataKey="snow" name="Snow (in/hr)" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="precipProb"
                  name="Precip Prob (%)"
                  stroke="#eab308"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="col-12 col-xl-6">
        <div className="sg-card h-100">
          <div className="sg-card-header">
            <h3 className="sg-card-title">
              <BarChart3 size={16} style={{ color: "var(--accent-primary)" }} />
              <span>Temperature (°F) & Risk Score Profile</span>
            </h3>
          </div>
          <div className="sg-card-body" style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="mile"
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `${v}m`}
                />
                <YAxis yAxisId="temp" stroke="#d97706" fontSize={11} />
                <YAxis yAxisId="risk" orientation="right" stroke="#dc2626" fontSize={11} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(mile) => `Mile ${mile}`} />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp"
                  name="Temp (°F)"
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                <Bar yAxisId="risk" dataKey="riskScore" name="Risk Score (0-100)" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={getRiskStyle(entry.riskLevel).color}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="col-12 col-xl-6">
        <div className="sg-card h-100">
          <div className="sg-card-header">
            <h3 className="sg-card-title">
              <BarChart3 size={16} style={{ color: "var(--accent-primary)" }} />
              <span>Corridor Mileage by Risk Classification</span>
            </h3>
          </div>
          <div className="sg-card-body" style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={exposureData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(val) => [`${Number(val).toFixed(1)} mi`, "Exposure"]}
                />
                <Bar dataKey="miles" radius={[4, 4, 0, 0]}>
                  {exposureData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
