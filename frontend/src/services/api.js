import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "/api";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
  headers: {
    "Content-Type": "application/json",
  },
});

export function normalizeApiError(error) {
  if (!error) {
    return "An unknown error occurred.";
  }

  const responseData = error.response?.data;
  if (responseData?.error) {
    const { message, details } = responseData.error;
    if (details && typeof details === "object") {
      const flatDetails = Object.entries(details)
        .map(([field, msgs]) => {
          const text = Array.isArray(msgs) ? msgs.join(", ") : String(msgs);
          return `${field}: ${text}`;
        })
        .join(" | ");
      if (flatDetails) {
        return `${message} (${flatDetails})`;
      }
    }
    return message || "Request failed.";
  }

  if (error.code === "ECONNABORTED") {
    return "Request timed out while contacting the routing/weather backend.";
  }

  if (!error.response) {
    return "Cannot reach the Spotter routing backend. Verify the Django server is running.";
  }

  return error.message || "Unexpected API error.";
}

export async function fetchHealth() {
  const { data } = await apiClient.get("/health/", { timeout: 10000 });
  return data;
}

export async function planRoute(payload) {
  const { data } = await apiClient.post("/routes/plan/", payload);
  return data;
}

export async function fetchTrips() {
  const { data } = await apiClient.get("/trips/");
  return data;
}

export async function fetchTripDetail(tripId) {
  const { data } = await apiClient.get(`/routes/${tripId}/`);
  return data;
}

export async function fetchRouteWeatherTimeline(tripId, routeId = null) {
  const params = routeId ? { route_id: routeId } : undefined;
  const { data } = await apiClient.get(`/routes/${tripId}/weather/`, { params });
  return data;
}

export async function deleteTrip(tripId) {
  await apiClient.delete(`/routes/${tripId}/`);
}
