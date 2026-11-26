import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const tileLayerProps = [];

vi.mock("leaflet.heat", () => ({}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: (props) => {
    tileLayerProps.push(props);
    return <div data-testid="tile-layer" data-url={props.url} />;
  },
  ZoomControl: () => <div data-testid="zoom-control" />,
  Polyline: ({ pathOptions }) => (
    <div data-testid="route-polyline" data-color={pathOptions?.color} />
  ),
  Marker: ({ children }) => <div data-testid="endpoint-marker">{children}</div>,
  CircleMarker: ({ children }) => <div data-testid="checkpoint-marker">{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => null,
}));

import RouteMap from "../components/RouteMap";

describe("RouteMap tile configuration", () => {
  it("uses standard OpenStreetMap tiles with proper attribution and renders route overlays", () => {
    tileLayerProps.length = 0;

    render(
      <RouteMap
        trip={{
          id: "t1",
          origin_lat: 41.88,
          origin_lon: -87.63,
          origin_label: "Chicago, IL",
          destination_lat: 39.77,
          destination_lon: -86.16,
          destination_label: "Indianapolis, IN",
          departure_time: "2026-11-26T12:00:00Z",
        }}
        routes={[
          {
            id: "r1",
            name: "Primary HGV Corridor",
            estimated_arrival_time: "2026-11-26T16:00:00Z",
            geometry: {
              type: "LineString",
              coordinates: [
                [-87.63, 41.88],
                [-86.16, 39.77],
              ],
            },
          },
        ]}
        selectedRouteId="r1"
        activeCheckpoints={[
          {
            sequence_index: 0,
            latitude: 41.88,
            longitude: -87.63,
            distance_from_origin_miles: 0,
            estimated_arrival_time: "2026-11-26T12:00:00Z",
            forecast_available: true,
            risk_level: "Low",
            risk_score: 10,
            wind_speed_mph: 12,
            temperature_f: 45,
            rain_in_hr: 0,
            snow_in_hr: 0,
            precipitation_probability: 10,
            weather_condition: "Clear sky",
            safety_recommendation: "Normal HGV operation.",
          },
        ]}
        selectedCheckpointIndex={0}
        showHeatmap
        isTimelineMode={false}
        sliderHour={0}
        onToggleHeatmap={vi.fn()}
        onSelectRoute={vi.fn()}
        onSelectCheckpoint={vi.fn()}
      />
    );

    expect(tileLayerProps).toHaveLength(1);
    expect(tileLayerProps[0].url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(tileLayerProps[0].attribution).toContain("OpenStreetMap");
    expect(screen.getAllByTestId("route-polyline")).toHaveLength(1);
    expect(screen.getAllByTestId("endpoint-marker")).toHaveLength(2);
    expect(screen.getAllByTestId("checkpoint-marker")).toHaveLength(1);
  });
});
