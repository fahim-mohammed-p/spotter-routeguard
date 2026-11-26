import { useCallback, useEffect, useState } from "react";
import { fetchHealth } from "../services/api";

export function useBackendHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch {
      setHealth({
        status: "unreachable",
        database: { connected: false },
        services: {
          openrouteservice_configured: false,
          openrouteservice_connected: false,
          openrouteservice_status: "unreachable",
          open_meteo_connected: false,
          open_meteo_status: "unreachable",
        },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handleFocus = () => {
      refresh();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  return { health, loading, refresh };
}
