import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Bookmark,
  Compass,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";

export default function AppShell({ health, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const dbConnected = health?.database?.connected;
  const orsStatus =
    health?.services?.openrouteservice_status ||
    (health?.services?.openrouteservice_connected
      ? "connected"
      : health?.services?.openrouteservice_configured
      ? "connected"
      : "key_needed");

  const orsBadge = {
    connected: { label: "Connected", color: "#047857" },
    rate_limited: { label: "Rate Limited", color: "#b45309" },
    invalid_key: { label: "Invalid Key", color: "#dc2626" },
    unreachable: { label: "Unreachable", color: "#b45309" },
    key_needed: { label: "Key Needed", color: "#b45309" },
  }[orsStatus] || { label: "Key Needed", color: "#b45309" };

  const omConnected = health?.services?.open_meteo_connected;
  const omStatus = health?.services?.open_meteo_status;
  const omBadge =
    omStatus === "connected" || omConnected === true
      ? { label: "Connected", color: "#047857" }
      : omStatus === "unreachable" || health?.status === "unreachable"
      ? { label: "Offline", color: "#dc2626" }
      : { label: "Checking...", color: "#1d4ed8" };

  return (
    <div className="app-shell">
      {mobileOpen && (
        <div
          className="sidebar-backdrop d-lg-none"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`app-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="d-flex align-items-center justify-content-between">
          <NavLink
            to="/planner"
            className="brand-lockup flex-grow-1"
            onClick={() => setMobileOpen(false)}
          >
            <div className="brand-icon">
              <Truck size={19} />
            </div>
            <div>
              <div className="brand-title">Spotter RouteGuard</div>
              <div className="brand-subtitle">Weather-Aware Freight</div>
            </div>
          </NavLink>
          <button
            type="button"
            className="btn-sg-ghost d-lg-none mb-3"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <div className="nav-section-label">Dispatch</div>
        <nav className="d-flex flex-column">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `sidebar-nav-link ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileOpen(false)}
          >
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/planner"
            className={({ isActive }) =>
              `sidebar-nav-link ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileOpen(false)}
          >
            <Compass size={17} />
            <span>Route Planner</span>
          </NavLink>
          <NavLink
            to="/trips"
            className={({ isActive }) =>
              `sidebar-nav-link ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileOpen(false)}
          >
            <Bookmark size={17} />
            <span>Saved Trips</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="nav-section-label px-0 mb-1">System Health</div>
          <div className="d-flex flex-column gap-2 small">
            <div className="d-flex align-items-center justify-content-between">
              <span className="text-secondary">Database</span>
              <span
                className="mono fw-semibold"
                style={{
                  color: dbConnected ? "#047857" : "#dc2626",
                  fontSize: "0.74rem",
                }}
              >
                {dbConnected ? "Connected" : "Offline"}
              </span>
            </div>
            <div
              className="d-flex align-items-center justify-content-between"
              title={health?.services?.openrouteservice_error || undefined}
            >
              <span className="text-secondary">ORS Routing</span>
              <span
                className="mono fw-semibold"
                style={{
                  color: orsBadge.color,
                  fontSize: "0.74rem",
                }}
              >
                {orsBadge.label}
              </span>
            </div>
            <div className="d-flex align-items-center justify-content-between">
              <span className="text-secondary">Open-Meteo</span>
              <span
                className="mono fw-semibold"
                style={{ color: omBadge.color, fontSize: "0.74rem" }}
              >
                {omBadge.label}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main-wrap">
        <header className="app-topbar">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn-sg-ghost d-lg-none"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <div className="d-flex align-items-center gap-2">
              <ShieldCheck size={17} style={{ color: "var(--accent-primary)" }} />
              <span className="fw-semibold small" style={{ color: "var(--text-primary)" }}>
                HGV Weather Risk & Dispatch Intelligence
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span
              className="status-pill mono d-none d-sm-inline-flex"
              style={{
                color: dbConnected ? "#047857" : "#b45309",
                borderColor: dbConnected ? "#a7f3d0" : "#fde68a",
                background: dbConnected ? "#ecfdf5" : "#fffbeb",
              }}
            >
              <Activity size={13} />
              {health?.status === "ok"
                ? "API Online"
                : health?.status === "unreachable"
                ? "Backend Unreachable"
                : "Config Check"}
            </span>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
