"use client";

import { useEffect, useRef, useState } from "react";
import {
  clusterLoadMapPoints,
  clusterPinIconUrl,
  shouldClusterMapPoints,
} from "@/lib/map-cluster";
import {
  LOAD_MAP_PIN_SIZE,
  loadMapPinIconUrl,
  type LoadMapPathPoint,
  type LoadMapPoint,
} from "@/lib/load-map-shared";

type GoogleMap = {
  fitBounds: (bounds: { extend: (latLng: { lat: number; lng: number }) => void }) => void;
  getZoom?: () => number;
  setZoom?: (zoom: number) => void;
  setCenter?: (latLng: { lat: number; lng: number }) => void;
  addListener?: (event: string, handler: () => void) => void;
};

type GoogleMarker = {
  addListener: (event: string, handler: () => void) => void;
  setMap: (map: GoogleMap | null) => void;
};

type GoogleMaps = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
  Marker: new (opts: Record<string, unknown>) => GoogleMarker;
  Point: new (x: number, y: number) => unknown;
  Size: new (width: number, height: number) => unknown;
  Polyline: new (opts: Record<string, unknown>) => { setMap: (map: GoogleMap | null) => void };
  LatLngBounds: new () => { extend: (latLng: { lat: number; lng: number }) => void };
};

declare global {
  interface Window {
    google?: { maps: GoogleMaps };
    gm_authFailure?: () => void;
  }
}

const PIN_ANCHOR = LOAD_MAP_PIN_SIZE / 2;

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
  cluster,
  onSelect,
}: {
  apiKey: string;
  points: LoadMapPoint[];
  path?: LoadMapPathPoint[];
  className?: string;
  missingKeyMessage?: string;
  emptyMessage?: string;
  cluster?: boolean;
  onSelect?: (point: LoadMapPoint) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const route = path ?? [];
  const hasMap = points.length > 0 || route.length > 0;
  const [failed, setFailed] = useState(false);
  const clusterPins = shouldClusterMapPoints(points.length, cluster);

  useEffect(() => {
    const el = host.current;
    if (!el || !apiKey || !hasMap) return;
    let cancelled = false;
    const previousAuth = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (!cancelled) setFailed(true);
    };
    const markers: GoogleMarker[] = [];
    let line: { setMap: (map: GoogleMap | null) => void } | null = null;
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
          styles: [
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
          ],
        });
        const bounds = new maps.LatLngBounds();
        if (route.length >= 2) {
          line = new maps.Polyline({
            map,
            path: route,
            strokeColor: "#0b1f3a",
            strokeOpacity: 0.85,
            strokeWeight: 4,
          });
          for (const point of route) bounds.extend(point);
        }

        function clearMarkers() {
          for (const marker of markers) marker.setMap(null);
          markers.length = 0;
        }

        function drawPins() {
          clearMarkers();
          const zoom = map.getZoom?.() ?? 5;
          const items = clusterPins ? clusterLoadMapPoints(points, zoom) : points.map((point) => ({ type: "point" as const, point }));
          for (const item of items) {
            if (item.type === "cluster") {
              const position = { lat: item.lat, lng: item.lng };
              const marker = new maps.Marker({
                map,
                position,
                title: `${item.count} pins`,
                icon: {
                  url: clusterPinIconUrl(item.count),
                  size: new maps.Size(LOAD_MAP_PIN_SIZE, LOAD_MAP_PIN_SIZE),
                  scaledSize: new maps.Size(LOAD_MAP_PIN_SIZE, LOAD_MAP_PIN_SIZE),
                  anchor: new maps.Point(PIN_ANCHOR, PIN_ANCHOR),
                },
              });
              marker.addListener("click", () => {
                map.setZoom?.((map.getZoom?.() ?? zoom) + 2);
                map.setCenter?.(position);
              });
              markers.push(marker);
              bounds.extend(position);
              continue;
            }
            const point = item.point;
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
                    className: point.labelClassName,
                  }
                : undefined,
              icon: {
                url: loadMapPinIconUrl(point),
                size: new maps.Size(LOAD_MAP_PIN_SIZE, LOAD_MAP_PIN_SIZE),
                scaledSize: new maps.Size(LOAD_MAP_PIN_SIZE, LOAD_MAP_PIN_SIZE),
                anchor: new maps.Point(PIN_ANCHOR, PIN_ANCHOR),
                labelOrigin: point.labelOrigin
                  ? new maps.Point(point.labelOrigin.x, point.labelOrigin.y)
                  : new maps.Point(PIN_ANCHOR, -2),
              },
            });
            marker.addListener("click", () => {
              if (onSelect) {
                onSelect(point);
                return;
              }
              if (point.href) window.location.assign(point.href);
            });
            markers.push(marker);
            bounds.extend(position);
          }
        }

        drawPins();
        map.addListener?.("zoom_changed", drawPins);
        if (points.length + route.length > 1) map.fitBounds(bounds);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuth;
      for (const marker of markers) marker.setMap(null);
      line?.setMap(null);
    };
  }, [apiKey, hasMap, points, route, clusterPins, onSelect]);

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

  return <div ref={host} className={className ?? "h-80 w-full rounded-lg bg-slate-100"} data-load-map="" data-map-cluster={clusterPins ? "" : undefined} />;
}
