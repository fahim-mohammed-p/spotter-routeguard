export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "--";
  const totalMinutes = Math.round(Number(seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

export function formatDistance(miles) {
  if (miles == null || Number.isNaN(Number(miles))) return "--";
  return `${Number(miles).toFixed(1)} mi`;
}

export function formatWeight(lbs) {
  if (lbs == null || Number.isNaN(Number(lbs))) return "--";
  return `${Number(lbs).toLocaleString()} lb`;
}

export function formatDateTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getDefaultDepartureInputs() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  const hours = String(next.getHours()).padStart(2, "0");
  const mins = String(next.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${mins}`,
  };
}
