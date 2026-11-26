import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bookmark, Compass, Trash2 } from "lucide-react";
import { deleteTrip, fetchTrips, normalizeApiError } from "../services/api";
import RiskBadge from "../components/RiskBadge";
import { formatDateTime, formatDistance, formatDuration, formatWeight } from "../utils/formatters";

export default function SavedTripsPage() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTrips();
      setTrips(res.trips || []);
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const handleDelete = async (tripId) => {
    try {
      await deleteTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (err) {
      setError(normalizeApiError(err));
    }
  };

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <h1 className="h4 fw-bold mb-1">Saved Trips</h1>
          <p className="text-secondary small mb-0">
            Reopen any evaluated truck trip to inspect routes, checkpoints, and 48-hour forecast timelines.
          </p>
        </div>
        <Link to="/planner" className="btn-sg-primary text-decoration-none">
          <Compass size={16} />
          <span>Plan New Route</span>
        </Link>
      </div>

      {error && (
        <div className="advisory-banner caution">
          <div className="small">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="sg-card p-5 text-center">
          <div className="spinner-border text-primary mb-2" role="status" />
          <div className="small text-secondary">Loading saved trips...</div>
        </div>
      ) : trips.length === 0 ? (
        <div className="sg-card p-5 text-center">
          <Bookmark size={28} className="mb-2" style={{ color: "var(--accent-primary)" }} />
          <h2 className="h5 fw-semibold">No Saved Trips</h2>
          <p className="text-secondary small mb-3">
            Planned trips are persisted in PostgreSQL automatically.
          </p>
          <Link to="/planner" className="btn-sg-primary text-decoration-none">
            <span>Create First Trip</span>
          </Link>
        </div>
      ) : (
        <div className="sg-card">
          <div className="table-responsive">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>Origin → Destination</th>
                  <th>Departure</th>
                  <th>Load & Interval</th>
                  <th>Routes</th>
                  <th>Top Option</th>
                  <th>Risk</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => {
                  const rec = t.recommended_route_summary;
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="fw-semibold">
                          {t.origin_label} → {t.destination_label}
                        </div>
                        <div className="text-muted mono" style={{ fontSize: "0.72rem" }}>
                          Created {formatDateTime(t.created_at)}
                        </div>
                      </td>
                      <td className="mono small">{formatDateTime(t.departure_time)}</td>
                      <td className="mono small">
                        {formatWeight(t.load_weight_lbs)} · {t.checkpoint_interval_miles} mi
                      </td>
                      <td className="mono">{t.route_count}</td>
                      <td className="small">
                        {rec ? (
                          <div>
                            <div>{rec.name}</div>
                            <div className="text-muted mono" style={{ fontSize: "0.73rem" }}>
                              {formatDistance(rec.distance_miles)} · {formatDuration(rec.duration_seconds)}
                            </div>
                          </div>
                        ) : (
                          "--"
                        )}
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
                        <div className="d-inline-flex gap-2">
                          <Link
                            to={`/planner/${t.id}`}
                            className="btn-sg-ghost text-decoration-none"
                          >
                            <span>Open</span>
                            <ArrowRight size={14} />
                          </Link>
                          <button
                            type="button"
                            className="btn-sg-ghost text-danger"
                            onClick={() => handleDelete(t.id)}
                            aria-label={`Delete trip ${t.origin_label} to ${t.destination_label}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
