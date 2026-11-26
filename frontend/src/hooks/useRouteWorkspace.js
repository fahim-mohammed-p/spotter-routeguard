import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchRouteWeatherTimeline,
  fetchTripDetail,
  normalizeApiError,
  planRoute,
} from "../services/api";

export function useRouteWorkspace(initialTripId = null) {
  const [trip, setTrip] = useState(null);
  const [weatherTimeline, setWeatherTimeline] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedCheckpointIndex, setSelectedCheckpointIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [sliderHour, setSliderHour] = useState(0);
  const [isTimelineMode, setIsTimelineMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const loadTimeline = useCallback(async (tripId) => {
    try {
      const timeline = await fetchRouteWeatherTimeline(tripId);
      setWeatherTimeline(timeline);
    } catch {
      // Non-fatal: ETA checkpoints still render even if timeline lookup fails
      setWeatherTimeline(null);
    }
  }, []);

  const hydrateTrip = useCallback(
    async (tripData) => {
      setTrip(tripData);
      const firstRoute =
        tripData.routes?.find((r) => r.is_recommended) || tripData.routes?.[0];
      setSelectedRouteId(firstRoute?.id || null);
      setSelectedCheckpointIndex(0);
      setSliderHour(0);
      setIsTimelineMode(false);
      setIsPlaying(false);
      await loadTimeline(tripData.id);
    },
    [loadTimeline]
  );

  useEffect(() => {
    if (!initialTripId) return;
    let active = true;
    setIsLoading(true);
    setError(null);

    fetchTripDetail(initialTripId)
      .then((data) => {
        if (active) return hydrateTrip(data);
        return null;
      })
      .catch((err) => {
        if (active) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialTripId, hydrateTrip]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => {
      setSliderHour((prev) => {
        if (prev >= 48) {
          setIsPlaying(false);
          return 48;
        }
        return prev + 1;
      });
    }, 550);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const submitPlan = useCallback(
    async (payload) => {
      setIsLoading(true);
      setError(null);
      try {
        const createdTrip = await planRoute(payload);
        await hydrateTrip(createdTrip);
        return createdTrip;
      } catch (err) {
        setError(normalizeApiError(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [hydrateTrip]
  );

  const selectedRoute = useMemo(() => {
    if (!trip?.routes?.length) return null;
    return trip.routes.find((r) => r.id === selectedRouteId) || trip.routes[0];
  }, [trip, selectedRouteId]);

  const timelineRoute = useMemo(() => {
    if (!weatherTimeline?.routes?.length || !selectedRoute) return null;
    return (
      weatherTimeline.routes.find((r) => r.route_id === selectedRoute.id) || null
    );
  }, [weatherTimeline, selectedRoute]);

  const activeCheckpoints = useMemo(() => {
    const baseCheckpoints = selectedRoute?.checkpoints || [];
    if (!isTimelineMode || !timelineRoute?.checkpoints?.length) {
      return baseCheckpoints;
    }

    const timelineMap = new Map(
      timelineRoute.checkpoints.map((cp) => [cp.sequence_index, cp])
    );

    return baseCheckpoints.map((cp) => {
      const tlCp = timelineMap.get(cp.sequence_index);
      const slot = tlCp?.hourly_forecast?.[sliderHour];
      if (!slot) {
        return {
          ...cp,
          forecast_available: false,
          weather_condition: "Forecast Unavailable",
          risk_contributors: ["No hourly data for this slider window"],
        };
      }
      if (!slot.forecast_available) {
        return {
          ...cp,
          forecast_available: false,
          active_timestamp: slot.timestamp,
          temperature_f: null,
          precipitation_probability: null,
          rain_in_hr: null,
          snow_in_hr: null,
          wind_speed_mph: null,
          weather_condition: "Forecast Unavailable",
          risk_score: 0,
          risk_level: "Low",
          risk_contributors: [`Forecast unavailable at +${sliderHour}h`],
        };
      }

      return {
        ...cp,
        active_timestamp: slot.timestamp,
        forecast_available: true,
        temperature_f: slot.temperature_f,
        precipitation_probability: slot.precipitation_probability,
        rain_in_hr: slot.rain_in_hr,
        snow_in_hr: slot.snow_in_hr,
        wind_speed_mph: slot.wind_speed_mph,
        weather_code: slot.weather_code,
        weather_condition: slot.weather_condition,
        risk_score: slot.risk_score,
        risk_level: slot.risk_level,
      };
    });
  }, [selectedRoute, timelineRoute, isTimelineMode, sliderHour]);

  const handleSelectRoute = (routeId) => {
    setSelectedRouteId(routeId);
    setSelectedCheckpointIndex(0);
  };

  const handleChangeHour = (hour) => {
    setSliderHour(hour);
    setIsTimelineMode(true);
  };

  const handleResetToEta = () => {
    setIsPlaying(false);
    setIsTimelineMode(false);
    setSliderHour(0);
  };

  const handleTogglePlay = () => {
    if (!isTimelineMode) {
      setIsTimelineMode(true);
    }
    setIsPlaying((prev) => !prev);
  };

  return {
    trip,
    selectedRoute,
    selectedRouteId,
    activeCheckpoints,
    timelineCheckpoints: timelineRoute?.checkpoints || [],
    selectedCheckpointIndex,
    isLoading,
    error,
    sliderHour,
    isTimelineMode,
    isPlaying,
    showHeatmap,
    setError,
    setSelectedCheckpointIndex,
    setShowHeatmap,
    submitPlan,
    handleSelectRoute,
    handleChangeHour,
    handleResetToEta,
    handleTogglePlay,
  };
}
