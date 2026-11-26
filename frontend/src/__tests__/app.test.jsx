import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PlannerForm from "../components/PlannerForm";
import RouteComparisonCards from "../components/RouteComparisonCards";
import ForecastSlider from "../components/ForecastSlider";
import AppShell from "../layouts/AppShell";
import DashboardPage from "../pages/DashboardPage";
import * as api from "../services/api";

describe("PlannerForm validation and submission", () => {
  it("shows validation error when origin and destination are identical", async () => {
    const onSubmit = vi.fn();
    render(<PlannerForm onSubmit={onSubmit} isLoading={false} />);

    fireEvent.change(screen.getByLabelText(/origin/i), {
      target: { value: "Chicago, IL" },
    });
    fireEvent.change(screen.getByLabelText(/destination/i), {
      target: { value: "chicago, il" },
    });
    fireEvent.click(screen.getByRole("button", { name: /plan route/i }));

    expect(
      await screen.findByText(/origin and destination cannot be identical/i)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects out-of-range load weights and accepts valid inputs", async () => {
    const onSubmit = vi.fn();
    render(<PlannerForm onSubmit={onSubmit} isLoading={false} />);

    fireEvent.change(screen.getByLabelText(/origin/i), {
      target: { value: "Chicago, IL" },
    });
    fireEvent.change(screen.getByLabelText(/destination/i), {
      target: { value: "Detroit, MI" },
    });
    fireEvent.change(screen.getByLabelText(/load weight/i), {
      target: { value: "250000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /plan route/i }));

    expect(
      await screen.findByText(/between 1,000 lb and 160,000 lb/i)
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/load weight/i), {
      target: { value: "42000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /10 mi/i }));
    fireEvent.click(screen.getByRole("button", { name: /plan route/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      origin: "Chicago, IL",
      destination: "Detroit, MI",
      load_weight_lbs: 42000,
      checkpoint_interval_miles: 10,
    });
  });
});

describe("RouteComparisonCards selection", () => {
  it("renders routes and switches selection when clicked", () => {
    const onSelect = vi.fn();
    const routes = [
      {
        id: "r1",
        rank: 1,
        name: "Primary HGV Corridor",
        is_recommended: true,
        recommendation_reason: "Lowest overall risk.",
        distance_miles: 280.5,
        duration_seconds: 15000,
        estimated_arrival_time: "2026-11-26T16:00:00Z",
        low_miles: 250,
        moderate_miles: 30.5,
        high_miles: 0,
        severe_miles: 0,
        no_travel_miles: 0,
        average_risk_score: 18.2,
        overall_risk_level: "Moderate",
        main_weather_concerns: ["Wind 26 mph"],
        checkpoint_count: 12,
      },
      {
        id: "r2",
        rank: 2,
        name: "Northern Bypass Corridor",
        is_recommended: false,
        recommendation_reason: "Has 25 Severe miles.",
        distance_miles: 305.0,
        duration_seconds: 16800,
        estimated_arrival_time: "2026-11-26T17:00:00Z",
        low_miles: 280,
        moderate_miles: 0,
        high_miles: 0,
        severe_miles: 25,
        no_travel_miles: 0,
        average_risk_score: 36.0,
        overall_risk_level: "Severe",
        main_weather_concerns: ["Wind 48 mph"],
        checkpoint_count: 13,
      },
    ];

    render(
      <RouteComparisonCards
        routes={routes}
        selectedRouteId="r1"
        onSelectRoute={onSelect}
      />
    );

    expect(screen.getByText(/Primary HGV Corridor/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended Route/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Northern Bypass Corridor/i));
    expect(onSelect).toHaveBeenCalledWith("r2");
  });
});

describe("ForecastSlider state updates", () => {
  it("updates slider hour cleanly and handles unavailable hours honestly", () => {
    const onChangeHour = vi.fn();
    const hourlyForecast = Array.from({ length: 49 }, (_, h) => ({
      offset_hour: h,
      timestamp: `2026-11-25T${String(h % 24).padStart(2, "0")}:00:00Z`,
      forecast_available: h < 24,
      risk_level: h < 24 ? "Moderate" : undefined,
    }));

    render(
      <ForecastSlider
        departureTime="2026-11-25T12:00:00Z"
        timelineCheckpoints={[{ hourly_forecast: hourlyForecast }]}
        sliderHour={30}
        isTimelineMode={true}
        isPlaying={false}
        showHeatmap={true}
        onToggleHeatmap={vi.fn()}
        onChangeHour={onChangeHour}
        onResetToEta={vi.fn()}
        onTogglePlay={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Forecast unavailable at \+30h/i)
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("slider", { name: /0 to 48 hour forecast slider/i }),
      { target: { value: "12" } }
    );
    expect(onChangeHour).toHaveBeenCalledWith(12);
  });
});

describe("DashboardPage API integration", () => {
  it("renders clean empty state when no trips exist", async () => {
    vi.spyOn(api, "fetchTrips").mockResolvedValueOnce({
      stats: {
        total_trips: 0,
        total_routes: 0,
        recommended_routes: 0,
        risk_distribution: {},
      },
      trips: [],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/No Routes Planned Yet/i)
    ).toBeInTheDocument();
  });
});

describe("AppShell system health indicators", () => {
  it("displays Connected when ORS key is valid and Key Needed when missing", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AppShell
          health={{
            status: "ok",
            database: { connected: true },
            services: {
              openrouteservice_configured: true,
              openrouteservice_connected: true,
              openrouteservice_status: "connected",
              open_meteo_connected: true,
              open_meteo_status: "connected",
            },
          }}
        >
          <div />
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getAllByText("Connected").length).toBeGreaterThanOrEqual(3);

    rerender(
      <MemoryRouter>
        <AppShell
          health={{
            status: "ok",
            database: { connected: true },
            services: {
              openrouteservice_configured: false,
              openrouteservice_connected: false,
              openrouteservice_status: "key_needed",
              open_meteo_connected: true,
              open_meteo_status: "connected",
            },
          }}
        >
          <div />
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getByText("Key Needed")).toBeInTheDocument();
  });
});

describe("API base URL resolution and endpoint paths", () => {
  it("normalizes bare backend origins to include /api without duplicating /api", () => {
    expect(api.resolveApiBaseUrl(undefined)).toBe("/api");
    expect(api.resolveApiBaseUrl("")).toBe("/api");
    expect(api.resolveApiBaseUrl("https://spotter-routeguard.onrender.com")).toBe(
      "https://spotter-routeguard.onrender.com/api"
    );
    expect(api.resolveApiBaseUrl("https://spotter-routeguard.onrender.com/")).toBe(
      "https://spotter-routeguard.onrender.com/api"
    );
    expect(api.resolveApiBaseUrl("https://spotter-routeguard.onrender.com/api")).toBe(
      "https://spotter-routeguard.onrender.com/api"
    );
    expect(api.resolveApiBaseUrl("https://spotter-routeguard.onrender.com/api/")).toBe(
      "https://spotter-routeguard.onrender.com/api"
    );
  });

  it("calls expected backend endpoint paths relative to /api baseURL", async () => {
    const getSpy = vi.spyOn(api.apiClient, "get").mockResolvedValue({ data: {} });
    const postSpy = vi.spyOn(api.apiClient, "post").mockResolvedValue({ data: {} });
    const deleteSpy = vi.spyOn(api.apiClient, "delete").mockResolvedValue({});

    await api.fetchHealth();
    expect(getSpy).toHaveBeenCalledWith("/health/", { timeout: 10000 });

    await api.fetchTrips();
    expect(getSpy).toHaveBeenCalledWith("/trips/");

    await api.planRoute({ origin: "A", destination: "B" });
    expect(postSpy).toHaveBeenCalledWith("/routes/plan/", { origin: "A", destination: "B" });

    await api.fetchTripDetail("trip-123");
    expect(getSpy).toHaveBeenCalledWith("/routes/trip-123/");

    await api.fetchRouteWeatherTimeline("trip-123", "route-456");
    expect(getSpy).toHaveBeenCalledWith("/routes/trip-123/weather/", {
      params: { route_id: "route-456" },
    });

    await api.deleteTrip("trip-123");
    expect(deleteSpy).toHaveBeenCalledWith("/routes/trip-123/");

    getSpy.mockRestore();
    postSpy.mockRestore();
    deleteSpy.mockRestore();
  });
});
