import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

import App from "../App";
import AppShell from "../layouts/AppShell";
import DashboardPage from "../pages/DashboardPage";
import RoutePlannerPage from "../pages/RoutePlannerPage";
import SavedTripsPage from "../pages/SavedTripsPage";
import TruckPhoto from "../components/TruckPhoto";
import PlannerForm from "../components/PlannerForm";
import { LoadingProvider } from "../context/LoadingContext";
import * as api from "../services/api";

vi.mock("../components/RouteMap", () => ({
  default: function MockRouteMap() {
    return <div data-testid="mock-route-map">Mock RouteMap</div>;
  },
}));

vi.mock("../components/WeatherCharts", () => ({
  default: function MockWeatherCharts() {
    return <div data-testid="mock-weather-charts">Mock WeatherCharts</div>;
  },
}));

vi.mock("recharts", () => {
  const MockBox = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: MockBox,
    BarChart: MockBox,
    Bar: MockBox,
    XAxis: MockBox,
    YAxis: MockBox,
    Tooltip: MockBox,
    CartesianGrid: MockBox,
    Cell: MockBox,
  };
});

const SAMPLE_HEALTH = {
  status: "ok",
  database: { connected: true },
  services: {
    openrouteservice_configured: true,
    openrouteservice_connected: true,
    openrouteservice_status: "connected",
    open_meteo_connected: true,
    open_meteo_status: "connected",
  },
};

const SAMPLE_TRIP = {
  id: 42,
  origin_label: "Chicago, IL",
  destination_label: "Indianapolis, IN",
  departure_time: "2026-11-27T14:00:00Z",
  load_weight_lbs: 38000,
  checkpoint_interval_miles: 25,
  overall_risk_level: "Low",
  average_risk_score: 18,
  recommended_route_id: 101,
  recommended_route_summary: {
    id: 101,
    name: "I-65 South",
    distance_miles: 182.4,
    duration_seconds: 10800,
    overall_risk_level: "Low",
    average_risk_score: 18,
  },
  routing_metadata: { notes: [] },
  created_at: "2026-11-26T12:00:00Z",
  routes: [
    {
      id: 101,
      name: "I-65 South",
      rank: 1,
      route_index: 0,
      is_recommended: true,
      distance_miles: 182.4,
      duration_seconds: 10800,
      estimated_arrival_time: "2026-11-27T17:00:00Z",
      overall_risk_level: "Low",
      average_risk_score: 18,
      peak_risk_score: 24,
      low_miles: 182.4,
      moderate_miles: 0,
      high_miles: 0,
      severe_miles: 0,
      no_travel_miles: 0,
      checkpoint_count: 8,
      safety_warnings: [],
      main_weather_concerns: ["Low weather impact"],
      recommendation_reason: "Lowest crosswind exposure and dry pavement across I-65.",
      geometry_geojson: {
        type: "LineString",
        coordinates: [
          [-87.6298, 41.8781],
          [-86.1581, 39.7684],
        ],
      },
      checkpoints: [],
    },
  ],
};

const SAMPLE_TRIPS_RESPONSE = {
  trips: [SAMPLE_TRIP],
  stats: {
    total_trips: 1,
    total_routes: 1,
    recommended_routes: 1,
    risk_distribution: { Low: 1 },
  },
};

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" onClick={() => navigate(-1)}>
        Go Back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Go Forward
      </button>
    </div>
  );
}

function renderFullShell({
  initialEntries = ["/"],
  enableInitialSplash = false,
  isAppReady = true,
  splashMinMs = 80,
  splashSlideMs = 40,
  minPlanningMs = 120,
} = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LoadingProvider
        enableInitialSplash={enableInitialSplash}
        isAppReady={isAppReady}
        splashMinMs={splashMinMs}
        splashSlideMs={splashSlideMs}
        minPlanningMs={minPlanningMs}
      >
        <HistoryControls />
        <AppShell health={SAMPLE_HEALTH}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/planner" element={<RoutePlannerPage />} />
            <Route path="/planner/:tripId" element={<RoutePlannerPage />} />
            <Route path="/trips" element={<SavedTripsPage />} />
          </Routes>
        </AppShell>
      </LoadingProvider>
    </MemoryRouter>
  );
}

describe("Spotter RouteGuard Navigation Splash, Trucking Visuals & Plan Route Loader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "fetchHealth").mockResolvedValue(SAMPLE_HEALTH);
    vi.spyOn(api, "fetchTrips").mockResolvedValue(SAMPLE_TRIPS_RESPONSE);
    vi.spyOn(api, "fetchTripDetail").mockResolvedValue(SAMPLE_TRIP);
    vi.spyOn(api, "planRoute").mockResolvedValue(SAMPLE_TRIP);
    vi.spyOn(api, "fetchRouteWeatherTimeline").mockResolvedValue({
      checkpoints: [],
      routes: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the navigation splash on initial website entry, starts data fetching immediately, slides away to reveal Dashboard, and does not replay", async () => {
    vi.useFakeTimers();

    const { container } = render(<App />);

    // Initial API calls start immediately without waiting for splash
    expect(api.fetchHealth).toHaveBeenCalledTimes(1);
    expect(api.fetchTrips).toHaveBeenCalledTimes(1);

    // Splash branding, navigation visual, stages, and progress track render cleanly
    const splash = screen.getByRole("status", {
      name: /Spotter RouteGuard: Initializing Navigation/i,
    });
    expect(splash).toBeInTheDocument();
    expect(splash).toHaveClass("splash-overlay");
    expect(splash).not.toHaveClass("is-exiting");
    expect(splash).toHaveTextContent(/SPOTTER ROUTEGUARD/i);
    expect(splash).toHaveTextContent(/HGV Weather Risk & Dispatch Intelligence/i);
    expect(splash).toHaveTextContent(/Loading Dashboard/i);
    expect(splash).toHaveTextContent(/Initializing Navigation/i);
    expect(splash).toHaveTextContent(/Preparing Workspace/i);
    expect(splash.querySelector(".splash-map-svg")).toBeInTheDocument();
    expect(splash.querySelector(".splash-progress-track")).toBeInTheDocument();
    expect(container.querySelector(".truck-highway-stage")).toBeNull();

    // Dashboard renders already in place beneath the splash
    expect(screen.getByText(/Operations Overview/i)).toBeInTheDocument();

    // Flush microtasks + advance through stage milestones to slide-away exit (~3.2s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1150);
    });
    expect(splash.querySelector(".splash-stage-item.active")).toHaveTextContent(
      /Initializing Navigation/i
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2150);
    });
    expect(splash).toHaveClass("is-exiting");

    // Finish horizontal slide transition (600ms) -> splash unmounts, revealing dashboard cleanly
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(
      screen.queryByRole("status", { name: /Initializing Navigation/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Chicago, IL/i)).toBeInTheDocument();

    // Navigating via sidebar afterward does NOT replay initial splash or show truck loader
    fireEvent.click(screen.getByRole("link", { name: /^Route Planner$/i }));
    expect(
      screen.queryByRole("status", { name: /Initializing Navigation/i })
    ).not.toBeInTheDocument();
    expect(container.querySelector(".truck-loader-backdrop")).toBeNull();
    expect(
      screen.getByText(/Weather-Aware Truck Route Planner/i)
    ).toBeInTheDocument();
  });

  it("keeps initial splash open while slow initialization is pending and handles initialization failures gracefully", async () => {
    vi.useFakeTimers();

    // Slow health initialization (5s) -> splash stays visible past 3.2s until ready
    let resolveHealth;
    vi.spyOn(api, "fetchHealth").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHealth = resolve;
        })
    );

    const { unmount } = render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3400);
    });
    const slowSplash = screen.getByRole("status", {
      name: /Spotter RouteGuard: Initializing Navigation/i,
    });
    expect(slowSplash).not.toHaveClass("is-exiting");

    await act(async () => {
      resolveHealth(SAMPLE_HEALTH);
    });
    expect(slowSplash).toHaveClass("is-exiting");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(
      screen.queryByRole("status", { name: /Initializing Navigation/i })
    ).not.toBeInTheDocument();

    unmount();

    // Initialization error -> never traps user on splash screen
    vi.spyOn(api, "fetchHealth").mockRejectedValueOnce(new Error("Network down"));
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3400);
    });
    expect(
      screen.getByRole("status", { name: /Initializing Navigation/i })
    ).toHaveClass("is-exiting");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(
      screen.queryByRole("status", { name: /Initializing Navigation/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Backend Unreachable/i)).toBeInTheDocument();
  });

  it("switches sidebar routes and browser Back/Forward cleanly without showing any truck animation", async () => {
    const { container } = renderFullShell({ initialEntries: ["/"] });

    await waitFor(() => {
      expect(screen.getByText(/Operations Overview/i)).toBeInTheDocument();
      expect(screen.getByText(/Chicago, IL/i)).toBeInTheDocument();
    });
    expect(container.querySelector(".truck-loader-backdrop")).toBeNull();
    expect(container.querySelector(".truck-highway-stage")).toBeNull();
    expect(container.querySelector(".spinner-border")).toBeNull();

    // Sidebar -> Route Planner
    fireEvent.click(screen.getByRole("link", { name: /^Route Planner$/i }));
    expect(
      screen.getByText(/Weather-Aware Truck Route Planner/i)
    ).toBeInTheDocument();
    expect(container.querySelector(".truck-loader-backdrop")).toBeNull();
    expect(container.querySelector(".truck-highway-stage")).toBeNull();

    // Sidebar -> Saved Trips
    fireEvent.click(screen.getByRole("link", { name: /^Saved Trips$/i }));
    expect(container.querySelector(".truck-loader-backdrop")).toBeNull();
    expect(container.querySelector(".truck-highway-stage")).toBeNull();
    await waitFor(() => {
      expect(screen.getByText(/Chicago, IL → Indianapolis, IN/i)).toBeInTheDocument();
    });

    // Browser Back -> Route Planner (no truck loader)
    fireEvent.click(screen.getByRole("button", { name: /Go Back/i }));
    expect(
      screen.getByText(/Weather-Aware Truck Route Planner/i)
    ).toBeInTheDocument();
    expect(container.querySelector(".truck-loader-backdrop")).toBeNull();
    expect(container.querySelector(".truck-highway-stage")).toBeNull();

    // Browser Forward -> Saved Trips (no truck loader)
    fireEvent.click(screen.getByRole("button", { name: /Go Forward/i }));
    await waitFor(() => {
      expect(screen.getByText(/Chicago, IL → Indianapolis, IN/i)).toBeInTheDocument();
    });
    expect(container.querySelector(".truck-loader-backdrop")).toBeNull();
    expect(container.querySelector(".truck-highway-stage")).toBeNull();
  });

  it("shows strategic US truck photography across pages and renders TruckPhoto fallback cleanly", async () => {
    render(
      <TruckPhoto
        src="/images/interstate-corridor.jpg"
        alt="American semi-truck on interstate"
        eager
      />
    );

    const img = screen.getByAltText("American semi-truck on interstate");
    expect(img).toHaveAttribute("src", "/images/interstate-corridor.jpg");
    fireEvent.error(img);
    expect(screen.queryByAltText("American semi-truck on interstate")).toBeNull();
    expect(
      screen.getByRole("img", { name: "American semi-truck on interstate" })
    ).toHaveClass("truck-photo-fallback");

    render(
      <MemoryRouter initialEntries={["/planner"]}>
        <RoutePlannerPage />
      </MemoryRouter>
    );
    expect(
      screen.getByAltText(/US Class-8 semi-truck operating/i)
    ).toHaveAttribute("src", "/images/weather-haul.jpg");

    render(
      <MemoryRouter initialEntries={["/trips"]}>
        <SavedTripsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Chicago, IL → Indianapolis, IN/i)).toBeInTheDocument();
    });
    expect(
      screen.getByAltText(/American Freightliner semi-truck hauling dry van/i)
    ).toHaveAttribute("src", "/images/freightliner-highway.jpg");
  });

  it("shows the compact cardless truck-and-road loader with cycling messages ONLY during Plan Route submission", async () => {
    vi.useFakeTimers();

    renderFullShell({
      initialEntries: ["/planner"],
      minPlanningMs: 1800,
    });

    fireEvent.change(screen.getByLabelText(/Origin/i), {
      target: { value: "Chicago, IL" },
    });
    fireEvent.change(screen.getByLabelText(/Destination/i), {
      target: { value: "Indianapolis, IN" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /Plan Route/i }).closest("form"));

    // API starts immediately with zero artificial pre-delay
    expect(api.planRoute).toHaveBeenCalledTimes(1);

    // Compact blurred truck-and-road overlay (no outer card/decorations) is active
    const overlay = screen.getByRole("status", {
      name: /Analyzing available freight corridors/i,
    });
    expect(overlay).toHaveClass("truck-loader-backdrop");
    expect(overlay.querySelector(".truck-loader-card")).toBeNull();
    expect(overlay.querySelector(".truck-horizon-glow")).toBeNull();
    expect(overlay.querySelector(".truck-highway-stage")).toBeInTheDocument();
    expect(overlay.querySelector(".truck-road-dashes")).toBeInTheDocument();
    expect(overlay.querySelector(".truck-progress-track")).toBeInTheDocument();

    // Contextual messages cycle cleanly during calculation
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(
      screen.getByText(/Checking weather checkpoints.../i)
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(
      screen.getByText(/Evaluating HGV risk conditions.../i)
    ).toBeInTheDocument();

    // Finish planning window -> overlay closes cleanly and reveals route results
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(
      screen.queryByRole("status", { name: /Analyzing available freight corridors/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Recommended: I-65 South/i)
    ).toBeInTheDocument();
  });

  it("clears the truck loader cleanly and restores form usability when Plan Route fails", async () => {
    vi.spyOn(api, "planRoute").mockRejectedValueOnce(new Error("Corridor API timeout"));
    vi.spyOn(api, "normalizeApiError").mockReturnValue("Corridor API timeout");

    renderFullShell({
      initialEntries: ["/planner"],
      minPlanningMs: 60,
    });

    fireEvent.change(screen.getByLabelText(/Origin/i), {
      target: { value: "Dallas, TX" },
    });
    fireEvent.change(screen.getByLabelText(/Destination/i), {
      target: { value: "Houston, TX" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /Plan Route/i }).closest("form"));

    await waitFor(() => {
      expect(screen.getByText(/Unable to Plan Route/i)).toBeInTheDocument();
      expect(screen.getByText(/Corridor API timeout/i)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("status", { name: /Analyzing available freight corridors/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Plan Route/i })
    ).not.toBeDisabled();

    // PlannerForm inline button state uses truck pulse icon rather than spinner-border
    const { container } = render(<PlannerForm onSubmit={vi.fn()} isLoading />);
    expect(container.querySelector(".truck-btn-pulse")).toBeInTheDocument();
    expect(container.querySelector(".spinner-border")).toBeNull();
  });
});
