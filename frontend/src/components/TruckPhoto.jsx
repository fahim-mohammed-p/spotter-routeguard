import React, { useState } from "react";
import { Truck } from "lucide-react";

export default function TruckPhoto({
  src,
  alt,
  className = "",
  style = {},
  eager = false,
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`truck-photo-fallback ${className}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <Truck size={20} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
