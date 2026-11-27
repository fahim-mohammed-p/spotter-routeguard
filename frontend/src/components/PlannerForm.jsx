import React, { useState } from "react";
import {
  ArrowLeftRight,
  Calendar,
  Clock,
  MapPin,
  Navigation,
  Scale,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { getDefaultDepartureInputs } from "../utils/formatters";

const WEIGHT_PRESETS = [
  { label: "20k lb (Light)", value: 20000 },
  { label: "35k lb (>30k rule)", value: 35000 },
  { label: "45k lb (>40k rule)", value: 45000 },
];

const INTERVAL_OPTIONS = [10, 25, 50];

export default function PlannerForm({ onSubmit, isLoading, initialValues }) {
  const defaults = getDefaultDepartureInputs();

  const [origin, setOrigin] = useState(initialValues?.origin || "");
  const [destination, setDestination] = useState(
    initialValues?.destination || ""
  );
  const [departureDate, setDepartureDate] = useState(
    initialValues?.departureDate || defaults.date
  );
  const [departureTime, setDepartureTime] = useState(
    initialValues?.departureTime || defaults.time
  );
  const [loadWeight, setLoadWeight] = useState(
    initialValues?.loadWeight || "38000"
  );
  const [intervalMiles, setIntervalMiles] = useState(
    initialValues?.checkpointInterval || 25
  );
  const [errors, setErrors] = useState({});

  const validate = () => {
    const nextErrors = {};
    const origTrim = origin.trim();
    const destTrim = destination.trim();

    if (!origTrim) {
      nextErrors.origin = "Origin city, address, or coordinates are required.";
    }
    if (!destTrim) {
      nextErrors.destination =
        "Destination city, address, or coordinates are required.";
    }
    if (
      origTrim &&
      destTrim &&
      origTrim.toLowerCase().replace(/\s+/g, " ") ===
        destTrim.toLowerCase().replace(/\s+/g, " ")
    ) {
      nextErrors.destination = "Origin and destination cannot be identical.";
    }

    if (!departureDate || !departureTime) {
      nextErrors.departure = "Departure date and time are required.";
    } else {
      const combined = new Date(`${departureDate}T${departureTime}`);
      if (Number.isNaN(combined.getTime())) {
        nextErrors.departure = "Enter a valid departure date and time.";
      } else {
        const now = Date.now();
        if (combined.getTime() < now - 2 * 3600 * 1000) {
          nextErrors.departure =
            "Departure cannot be more than 2 hours in the past.";
        } else if (combined.getTime() > now + 14 * 86400 * 1000) {
          nextErrors.departure =
            "Departure must be within the next 14 days for forecast coverage.";
        }
      }
    }

    const parsedWeight = Number(loadWeight);
    if (
      !loadWeight ||
      Number.isNaN(parsedWeight) ||
      !Number.isInteger(parsedWeight)
    ) {
      nextErrors.loadWeight = "Enter a whole-number load weight in lbs.";
    } else if (parsedWeight < 1000 || parsedWeight > 160000) {
      nextErrors.loadWeight =
        "Load weight must be between 1,000 lb and 160,000 lb.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
    setErrors((prev) => ({ ...prev, origin: undefined, destination: undefined }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) return;
    if (!validate()) return;

    const isoDeparture = new Date(
      `${departureDate}T${departureTime}`
    ).toISOString();

    onSubmit({
      origin: origin.trim(),
      destination: destination.trim(),
      departure_time: isoDeparture,
      load_weight_lbs: Number(loadWeight),
      checkpoint_interval_miles: intervalMiles,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="sg-card">
      <div className="sg-card-header">
        <h2 className="sg-card-title">
          <Navigation size={17} style={{ color: "var(--accent-primary)" }} />
          <span>Route & Load Configuration</span>
        </h2>
        <span className="status-pill mono">HGV Profile</span>
      </div>

      <div className="sg-card-body">
        <div className="row g-3">
          <div className="col-12 col-md-5">
            <label htmlFor="origin-input" className="sg-label">
              <MapPin size={12} className="me-1" /> Origin
            </label>
            <input
              id="origin-input"
              type="text"
              className={`sg-input ${errors.origin ? "is-invalid" : ""}`}
              placeholder="e.g. Chicago, IL or 41.8781, -87.6298"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              disabled={isLoading}
            />
            {errors.origin && (
              <div className="sg-error-text">{errors.origin}</div>
            )}
          </div>

          <div className="col-12 col-md-2 d-flex align-items-end justify-content-center">
            <button
              type="button"
              className="btn-sg-ghost w-100 justify-content-center"
              onClick={handleSwap}
              disabled={isLoading}
              title="Swap origin and destination"
              style={{ height: "40px" }}
            >
              <ArrowLeftRight size={15} />
              <span className="d-md-none">Swap</span>
            </button>
          </div>

          <div className="col-12 col-md-5">
            <label htmlFor="destination-input" className="sg-label">
              <MapPin size={12} className="me-1" /> Destination
            </label>
            <input
              id="destination-input"
              type="text"
              className={`sg-input ${errors.destination ? "is-invalid" : ""}`}
              placeholder="e.g. Denver, CO or 39.7392, -104.9903"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={isLoading}
            />
            {errors.destination && (
              <div className="sg-error-text">{errors.destination}</div>
            )}
          </div>

          <div className="col-6 col-md-3">
            <label htmlFor="departure-date" className="sg-label">
              <Calendar size={12} className="me-1" /> Departure Date
            </label>
            <input
              id="departure-date"
              type="date"
              className={`sg-input mono ${errors.departure ? "is-invalid" : ""}`}
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="col-6 col-md-3">
            <label htmlFor="departure-time" className="sg-label">
              <Clock size={12} className="me-1" /> Departure Time
            </label>
            <input
              id="departure-time"
              type="time"
              className={`sg-input mono ${errors.departure ? "is-invalid" : ""}`}
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="col-12 col-md-3">
            <label htmlFor="load-weight" className="sg-label">
              <Scale size={12} className="me-1" /> Load Weight (lbs)
            </label>
            <input
              id="load-weight"
              type="number"
              min={1000}
              max={160000}
              step={500}
              className={`sg-input mono ${errors.loadWeight ? "is-invalid" : ""}`}
              placeholder="38000"
              value={loadWeight}
              onChange={(e) => setLoadWeight(e.target.value)}
              disabled={isLoading}
            />
            {errors.loadWeight && (
              <div className="sg-error-text">{errors.loadWeight}</div>
            )}
          </div>

          <div className="col-12 col-md-3">
            <span className="sg-label">
              <SlidersHorizontal size={12} className="me-1" /> Weather Sampling
            </span>
            <div className="interval-pills" role="group" aria-label="Checkpoint interval">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`interval-pill mono ${
                    intervalMiles === opt ? "active" : ""
                  }`}
                  onClick={() => setIntervalMiles(opt)}
                  disabled={isLoading}
                >
                  {opt} mi
                </button>
              ))}
            </div>
          </div>

          {errors.departure && (
            <div className="col-12">
              <div className="sg-error-text mt-0">{errors.departure}</div>
            </div>
          )}

          <div className="col-12 d-flex flex-wrap align-items-center justify-content-between gap-2 pt-1">
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="text-secondary small">Load Presets:</span>
              {WEIGHT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`weight-preset-btn mono ${
                    Number(loadWeight) === preset.value ? "active" : ""
                  }`}
                  onClick={() => setLoadWeight(String(preset.value))}
                  disabled={isLoading}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="btn-sg-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Truck size={15} className="truck-btn-pulse" aria-hidden="true" />
                  <span>Evaluating Routes & Weather...</span>
                </>
              ) : (
                <>
                  <Navigation size={15} />
                  <span>Plan Route</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
