"use client";

import { useEffect, useRef, useState } from "react";
import type { LoadMapPathPoint, LoadMapPoint } from "@/lib/load-map-shared";

type GoogleMaps = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
    fitBounds: (bounds: { extend: (latLng: { lat: number; lng: number }) => void }) => void;
  };
  Marker: new (opts: Record<string, unknown>) => {
    addListener: (event: string, handler: () => void) => void;
  };
  Polyline: new (opts: Record<string, unknown>) => unknown;
  LatLngBounds: new () => { extend: (latLng: { lat: number; lng: number }) => void };
  SymbolPath: { CIRCLE: unknown };
};

declare global {
  interface Window {
    google?: { maps: GoogleMaps };
    gm_authFailure?: () => void;
  }
}

const MARKER_COLOR: Record<LoadMapPoint["kind"], string> = {
  pickup: "#166534",
  delivery: "#be123c",
  truck: "#0b1f3a",
  trailer: "#d97706",
  track: "#64748b",
};

function loadMapsScript(apiKey: string): Promise<GoogleMaps> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  const existing = document.querySelector<HTMLScriptElement>("script[data-ms-maps='js']");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error("Maps JavaScript API did not load."));
      });
      existing.addEventListener("error", () => reject(new Error("Maps JavaScript API did not load.")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.msMaps = "js";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Maps JavaScript API did not load."));
    };
    script.onerror = () => reject(new Error("Maps JavaScript API did not load."));
    document.head.appendChild(script);
  });
}

export function LoadMapCanvas({
  apiKey,
  points,
  path,
  className,
  missingKeyMessage,
  emptyMessage,
}: {
  apiKey: string;
  points: LoadMapPoint[];
  path?: LoadMapPathPoint[];
  className?: string;
  missingKeyMessage?: string;
  emptyMessage?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const route = path ?? [];
  const hasMap = points.length > 0 || route.length > 0;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !apiKey || !hasMap) return;
    let cancelled = false;
    const previousAuth = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (!cancelled) setFailed(true);
    };
    void loadMapsScript(apiKey)
      .then((maps) => {
        if (cancelled || !host.current) return;
        const start = points[0] ?? route[0];
        const map = new maps.Map(host.current, {
          center: { lat: start.lat, lng: start.lng },
          zoom: points.length + route.length === 1 ? 8 : 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        const bounds = new maps.LatLngBounds();
        if (route.length >= 2) {
          new maps.Polyline({
            map,
            path: route,
            strokeColor: "#0b1f3a",
            strokeOpacity: 0.85,
            strokeWeight: 4,
          });
          for (const point of route) bounds.extend(point);
        }
        for (const point of points) {
          const position = { lat: point.lat, lng: point.lng };
          const marker = new maps.Marker({
            map,
            position,
            title: [point.label, point.detail].filter(Boolean).join(" — "),
            label: point.markerText
              ? {
                  text: point.markerText,
                  color: "#0f172a",
                  fontSize: "11px",
                  fontWeight: "700",
                }
              : undefined,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: point.kind === "track" ? 4 : 8,
              fillColor: point.pinColor || MARKER_COLOR[point.kind],
              fillOpacity: 0.95,
              strokeColor: "#ffffff",
              strokeWeight: 1,
            },
          });
          if (point.href) {
            const href = point.href;
            marker.addListener("click", () => {
              window.location.assign(href);
            });
          }
          bounds.extend(position);
        }
        if (points.length + route.length > 1) map.fitBounds(bounds);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuth;
    };
  }, [apiKey, hasMap, points, route]);

  if (!apiKey || failed) {
    return (
      <p className="px-4 py-8 text-sm text-slate-600" data-map-off="">
        {missingKeyMessage ?? "Map is off."}
      </p>
    );
  }
  if (!hasMap) {
    return (
      <p className="px-4 py-8 text-sm text-slate-600">
        {emptyMessage ?? "No GPS pins."}
      </p>
    );
  }

  return <div ref={host} className={className ?? "h-80 w-full rounded-lg bg-slate-100"} data-load-map="" />;
}
