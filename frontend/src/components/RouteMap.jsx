import React, { useEffect, useMemo } from "react";
import L from "../utils/leafletSetup";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import { Flame } from "lucide-react";
import { ROUTE_LINE_COLORS, getRiskStyle } from "../utils/riskStyles";
import { formatDateTime } from "../utils/formatters";
import RiskBadge from "./RiskBadge";

function createEndpointIcon(label, bgColor) {
  return L.divIcon({
    className: "custom-endpoint-pin",
    html: `<div style="
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: ${bgColor};
      border: 2.5px solid #ffffff;
      color: #ffffff;
      font-weight: 700;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.28);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const ORIGIN_ICON = createEndpointIcon("O", "#2563eb");
const DEST_ICON = createEndpointIcon("D", "#059669");

function FitBoundsController({ trip, selectedRoute }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const coords = [];
    if (selectedRoute?.geometry?.coordinates?.length) {
      for (const [lon, lat] of selectedRoute.geometry.coordinates) {
        coords.push([lat, lon]);
      }
    } else if (trip) {
      coords.push([trip.origin_lat, trip.origin_lon]);
      coords.push([trip.destination_lat, trip.destination_lon]);
    }
    if (coords.length >= 2) {
      map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 12 });
    }
  }, [map, trip?.id, selectedRoute?.id]);

  return null;
}

function CorridorHeatmapLayer({ checkpoints, visible }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !visible || !checkpoints?.length || typeof L.heatLayer !== "function") {
      return undefined;
    }

    // Prevent leaflet.heat canvas IndexSizeError before layout dimensions settle
    const size = map.getSize();
    if (!size || size.x === 0 || size.y === 0) {
      return undefined;
    }

    const heatPoints = [];
    const forecasted = checkpoints.filter((cp) => cp.forecast_available);

    for (let i = 0; i < forecasted.length; i += 1) {
      const cp = forecasted[i];
      const intensity = Math.max(0.14, Math.min(1.0, (cp.risk_score || 0) / 100));
      heatPoints.push([cp.latitude, cp.longitude, intensity]);

      if (i < forecasted.length - 1) {
        const next = forecasted[i + 1];
        const nextIntensity = Math.max(
          0.14,
          Math.min(1.0, (next.risk_score || 0) / 100)
        );
        heatPoints.push([
          (cp.latitude + next.latitude) / 2,
          (cp.longitude + next.longitude) / 2,
          (intensity + nextIntensity) / 2,
        ]);
      }
    }

    if (heatPoints.length === 0) return undefined;

    const heatLayer = L.heatLayer(heatPoints, {
      radius: 26,
      blur: 18,
      maxZoom: 12,
      max: 1.0,
      minOpacity: 0.32,
      gradient: {
        0.2: "#10b981",
        0.42: "#eab308",
        0.65: "#f97316",
        0.85: "#ef4444",
        1.0: "#991b1b",
      },
    });

    heatLayer.addTo(map);
    return () => {
      if (map.hasLayer(heatLayer)) {
        map.removeLayer(heatLayer);
      }
    };
  }, [map, checkpoints, visible]);

  return null;
}

export default function RouteMap({
  trip,
  routes,
  selectedRouteId,
  activeCheckpoints,
  selectedCheckpointIndex,
  showHeatmap,
  isTimelineMode,
  sliderHour,
  onToggleHeatmap,
  onSelectRoute,
  onSelectCheckpoint,
}) {
  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) || routes[0],
    [routes, selectedRouteId]
  );

  // Render the selected polyline last so it sits cleanly above alternatives
  const orderedRoutes = useMemo(() => {
    const indexed = routes.map((r, i) => ({ route: r, colorIdx: i }));
    return indexed.sort((a, b) => {
      if (a.route.id === selectedRouteId) return 1;
      if (b.route.id === selectedRouteId) return -1;
      return 0;
    });
  }, [routes, selectedRouteId]);

  const center = trip
    ? [
        (trip.origin_lat + trip.destination_lat) / 2,
        (trip.origin_lon + trip.destination_lon) / 2,
      ]
    : [39.8283, -98.5795];

  return (
    <div className="sg-card">
      <div className="sg-card-header flex-wrap">
        <div className="d-flex align-items-center gap-2">
          <h3 className="sg-card-title">Corridor Map & Weather Heatmap</h3>
          {selectedRoute && (
            <span className="text-secondary small">
              · <strong style={{ color: "var(--text-primary)" }}>{selectedRoute.name}</strong>
            </span>
          )}
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          {onToggleHeatmap && (
            <button
              type="button"
              className={`btn-sg-ghost ${showHeatmap ? "active-toggle" : ""}`}
              onClick={onToggleHeatmap}
            >
              <Flame size={14} />
              <span>{showHeatmap ? "Heatmap On" : "Heatmap Off"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="sg-card-body p-2">
        <div className="route-map-shell">
          <MapContainer
            center={center}
            zoom={4}
            scrollWheelZoom
            zoomControl={false}
            style={{ width: "100%", height: "100%" }}
          >
            <ZoomControl position="topright" />

            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />

            <FitBoundsController trip={trip} selectedRoute={selectedRoute} />

            <CorridorHeatmapLayer
              checkpoints={activeCheckpoints}
              visible={showHeatmap}
            />

            {orderedRoutes.map(({ route, colorIdx }) => {
              const isSelected = route.id === selectedRouteId;
              const latLngs = (route.geometry?.coordinates || []).map(
                ([lon, lat]) => [lat, lon]
              );
              const color = ROUTE_LINE_COLORS[colorIdx % ROUTE_LINE_COLORS.length];

              return (
                <Polyline
                  key={route.id}
                  positions={latLngs}
                  pathOptions={{
                    color,
                    weight: isSelected ? 6 : 3.5,
                    opacity: isSelected ? 0.92 : 0.45,
                    dashArray: isSelected ? undefined : "7 7",
                  }}
                  eventHandlers={{
                    click: () => onSelectRoute(route.id),
                  }}
                />
              );
            })}

            {trip && (
              <>
                <Marker position={[trip.origin_lat, trip.origin_lon]} icon={ORIGIN_ICON}>
                  <Popup>
                    <div className="small">
                      <strong>Origin</strong>
                      <div>{trip.origin_label || trip.origin_query}</div>
                      <div className="mono text-secondary mt-1">
                        Departs: {formatDateTime(trip.departure_time)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
                <Marker
                  position={[trip.destination_lat, trip.destination_lon]}
                  icon={DEST_ICON}
                >
                  <Popup>
                    <div className="small">
                      <strong>Destination</strong>
                      <div>{trip.destination_label || trip.destination_query}</div>
                      {selectedRoute && (
                        <div className="mono text-secondary mt-1">
                          ETA: {formatDateTime(selectedRoute.estimated_arrival_time)}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </>
            )}

            {(activeCheckpoints || []).map((cp) => {
              const style = cp.forecast_available
                ? getRiskStyle(cp.risk_level)
                : { markerColor: "#94a3b8" };
              const isSelected = cp.sequence_index === selectedCheckpointIndex;

              return (
                <CircleMarker
                  key={`${selectedRouteId}-${cp.sequence_index}`}
                  center={[cp.latitude, cp.longitude]}
                  radius={isSelected ? 9 : 6.5}
                  pathOptions={{
                    color: isSelected ? "#0f172a" : "#ffffff",
                    weight: isSelected ? 2.5 : 2,
                    fillColor: style.markerColor,
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{
                    click: () => onSelectCheckpoint(cp.sequence_index),
                  }}
                >
                  <Popup minWidth={230}>
                    <div className="d-flex flex-column gap-1 small">
                      <div className="d-flex align-items-center justify-content-between gap-2">
                        <strong>
                          Checkpoint #{cp.sequence_index + 1} (
                          {cp.distance_from_origin_miles.toFixed(1)} mi)
                        </strong>
                        {cp.forecast_available && (
                          <RiskBadge
                            level={cp.risk_level}
                            score={cp.risk_score}
                          />
                        )}
                      </div>
                      <div className="mono text-secondary" style={{ fontSize: "0.74rem" }}>
                        {cp.latitude.toFixed(4)}, {cp.longitude.toFixed(4)}
                      </div>
                      <div className="mono" style={{ fontSize: "0.76rem" }}>
                        {isTimelineMode ? `Forecast +${sliderHour}h: ` : "ETA: "}
                        {formatDateTime(
                          isTimelineMode
                            ? cp.active_timestamp || cp.estimated_arrival_time
                            : cp.estimated_arrival_time
                        )}
                      </div>
                      {!cp.forecast_available ? (
                        <div className="text-warning-emphasis mt-1">
                          Forecast data unavailable for this timestamp.
                        </div>
                      ) : (
                        <>
                          <div className="mt-1">
                            <strong>{cp.weather_condition}</strong>
                          </div>
                          <div className="mono" style={{ fontSize: "0.78rem" }}>
                            Temp: {cp.temperature_f?.toFixed(0) ?? "--"}°F · Wind:{" "}
                            {cp.wind_speed_mph?.toFixed(1) ?? "--"} mph
                          </div>
                          <div className="mono" style={{ fontSize: "0.78rem" }}>
                            Rain: {cp.rain_in_hr?.toFixed(2) ?? "0.00"} in/hr · Snow:{" "}
                            {cp.snow_in_hr?.toFixed(2) ?? "0.00"} in/hr · Prob:{" "}
                            {cp.precipitation_probability?.toFixed(0) ?? 0}%
                          </div>
                          <div
                            className="mt-1 pt-1 border-top text-secondary"
                            style={{ fontSize: "0.75rem" }}
                          >
                            {cp.safety_recommendation}
                          </div>
                        </>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          <div className="map-legend-overlay">
            {[
              ["Low", "#10b981"],
              ["Moderate", "#eab308"],
              ["High", "#f97316"],
              ["Severe", "#ef4444"],
              ["No Travel", "#991b1b"],
            ].map(([label, hex]) => (
              <div key={label} className="d-flex align-items-center gap-1">
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    backgroundColor: hex,
                    display: "inline-block",
                  }}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
