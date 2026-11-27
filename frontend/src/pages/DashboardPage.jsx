import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Compass, Layers, Route, ShieldCheck, Truck } from "lucide-react";
import { fetchTrips, normalizeApiError } from "../services/api";
import RiskBadge from "../components/RiskBadge";
import TruckPhoto from "../components/TruckPhoto";
import { formatDateTime, formatDistance, formatDuration, formatWeight } from "../utils/formatters";
import { getRiskStyle } from "../utils/riskStyles";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchTrips()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = data?.stats;
  const trips = data?.trips || [];

  const riskChartData = stats
    ? Object.entries(stats.risk_distribution || {}).map(([level, count]) => ({
        level,
        count,
        color: getRiskStyle(level).color,
      }))
    : [];

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <h1 className="h4 fw-bold mb-1">Operations Overview</h1>
          <p className="text-secondary small mb-0">
            Live dispatch metrics derived from persisted trips and evaluated HGV corridors.
          </p>
        </div>
        <Link to="/planner" className="btn-sg-primary text-decoration-none">
          <Compass size={16} />
          <span>Plan New Route</span>
        </Link>
      </div>

      <div className="sg-card freight-banner-card">
        <div className="freight-banner-content">
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="badge text-bg-primary bg-opacity-10 text-primary border border-primary-subtle fw-semibold">
              US Freight Corridor Intelligence
            </span>
          </div>
          <div className="fw-semibold" style={{ fontSize: "0.95rem" }}>
            Weather-Aware HGV Dispatch Across American Interstate Lanes
          </div>
          <div className="text-secondary small mt-1">
            Monitor load-adjusted wind exposure, precipitation hazards, and alternate corridors before dispatch.
          </div>
        </div>
        <div className="freight-banner-media d-none d-md-block">
          <TruckPhoto
            src="/images/interstate-corridor.jpg"
            alt="American freight semi-trucks hauling trailers along a US interstate highway"
            eager
          />
        </div>
      </div>

      {error && (
        <div className="advisory-banner caution">
          <div className="small">
            <strong>Backend unavailable:</strong> {error}
          </div>
        </div>
      )}

      {loading ? (
        <div className="sg-card p-4 text-center" aria-live="polite">
          <div className="sg-inline-pulse mx-auto mb-2" />
          <div className="fw-medium small text-secondary">
            Loading dispatch metrics...
          </div>
        </div>
      ) : trips.length === 0 ? (
        <div className="sg-card p-5 text-center">
          <div
            className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle"
            style={{
              width: 56,
              height: 56,
              background: "var(--accent-primary-subtle)",
              color: "var(--accent-primary)",
            }}
          >
            <Truck size={26} />
          </div>
          <h2 className="h5 fw-semibold">No Routes Planned Yet</h2>
          <p className="text-secondary small mx-auto" style={{ maxWidth: 460 }}>
            Plan your first weather-aware truck route to compare up to 3 HGV corridors, inspect ETA checkpoint risks, and explore the 0–48 hour corridor heatmap.
          </p>
          <Link to="/planner" className="btn-sg-primary text-decoration-none mt-2">
            <Compass size={16} />
            <span>Plan First Route</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="row g-3">
            <div className="col-12 col-sm-4">
              <div className="kpi-tile h-100">
                <div className="kpi-label d-flex align-items-center gap-1">
                  <Truck size={13} style={{ color: "var(--accent-primary)" }} /> Total Trips Planned
                </div>
                <div className="kpi-value mono">{stats?.total_trips ?? 0}</div>
              </div>
            </div>
            <div className="col-12 col-sm-4">
              <div className="kpi-tile h-100">
                <div className="kpi-label d-flex align-items-center gap-1">
                  <Layers size={13} style={{ color: "var(--accent-primary)" }} /> Route Options Generated
                </div>
                <div className="kpi-value mono">{stats?.total_routes ?? 0}</div>
              </div>
            </div>
            <div className="col-12 col-sm-4">
              <div className="kpi-tile h-100">
                <div className="kpi-label d-flex align-items-center gap-1">
                  <ShieldCheck size={13} style={{ color: "var(--risk-low)" }} /> Recommended Safe Corridors
                </div>
                <div className="kpi-value mono">
                  {stats?.recommended_routes ?? 0}
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-12 col-lg-5">
              <div className="sg-card h-100">
                <div className="sg-card-header">
                  <h3 className="sg-card-title">Evaluated Route Risk Distribution</h3>
                </div>
                <div className="sg-card-body" style={{ height: 270 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riskChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="level" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          color: "#0f172a",
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {riskChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-7">
              <div className="sg-card h-100">
                <div className="sg-card-header">
                  <h3 className="sg-card-title">
                    <Route size={16} style={{ color: "var(--accent-primary)" }} /> Recent Planning Activity
                  </h3>
                  <Link
                    to="/trips"
                    className="small text-decoration-none fw-medium"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    View all
                  </Link>
                </div>
                <div className="table-responsive">
                  <table className="sg-table">
                    <thead>
                      <tr>
                        <th>Corridor</th>
                        <th>Load</th>
                        <th>Recommended / Best</th>
                        <th>Risk</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {trips.slice(0, 6).map((t) => {
                        const rec = t.recommended_route_summary;
                        return (
                          <tr key={t.id}>
                            <td>
                              <div className="fw-semibold">
                                {t.origin_label} → {t.destination_label}
                              </div>
                              <div className="text-muted mono" style={{ fontSize: "0.73rem" }}>
                                {formatDateTime(t.departure_time)} · {t.checkpoint_interval_miles}m steps
                              </div>
                            </td>
                            <td className="mono">{formatWeight(t.load_weight_lbs)}</td>
                            <td className="mono small">
                              {rec
                                ? `${formatDistance(rec.distance_miles)} · ${formatDuration(rec.duration_seconds)}`
                                : "--"}
                            </td>
                            <td>
                              {rec && (
                                <RiskBadge
                                  level={rec.overall_risk_level}
                                  score={rec.average_risk_score}
                                />
                              )}
                            </td>
                            <td className="text-end">
                              <Link
                                to={`/planner/${t.id}`}
                                className="btn-sg-ghost text-decoration-none"
                              >
                                <span>Inspect</span>
                                <ArrowRight size={14} />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
