import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import DashboardPage from "./pages/DashboardPage";
import RoutePlannerPage from "./pages/RoutePlannerPage";
import SavedTripsPage from "./pages/SavedTripsPage";
import { useBackendHealth } from "./hooks/useBackendHealth";

export default function App() {
  const { health } = useBackendHealth();

  return (
    <BrowserRouter>
      <AppShell health={health}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/planner" element={<RoutePlannerPage />} />
          <Route path="/planner/:tripId" element={<RoutePlannerPage />} />
          <Route path="/trips" element={<SavedTripsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
