/** Client-safe load map types. No env, db, or API keys. */

export type LoadMapPointKind = "pickup" | "delivery" | "relay" | "truck" | "trailer" | "track";

/** Existing map pin fills. Samsara trucks keep navy. Relay is a violet diamond, not the green or red teardrop. */
export const LOAD_MAP_MARKER_COLOR: Record<LoadMapPointKind, string> = {
  pickup: "#166534",
  delivery: "#be123c",
  relay: "#5b21b6",
  truck: "#0b1f3a",
  trailer: "#d97706",
  track: "#64748b",
};

export const SAMSARA_TRUCK_PIN_COLOR = LOAD_MAP_MARKER_COLOR.truck;

/** Small classic teardrop. The tip is the exact lat/lng — not a fat circle. */
export const LOAD_MAP_PIN_WIDTH = 22;
export const LOAD_MAP_PIN_HEIGHT = 32;
export const LOAD_MAP_PIN_SIZE = LOAD_MAP_PIN_HEIGHT;
export const LOAD_MAP_PIN_TIP_X = LOAD_MAP_PIN_WIDTH / 2;
export const LOAD_MAP_PIN_TIP_Y = LOAD_MAP_PIN_HEIGHT;
export const LOAD_MAP_PIN_HEAD_X = 11;
export const LOAD_MAP_PIN_HEAD_Y = 10;

/** Moving units: compact Samsara dart, anchored at the GPS point. */
export const LOAD_MAP_ARROW_SIZE = 14;
export const LOAD_MAP_ARROW_CX = 7;
export const LOAD_MAP_ARROW_CY = 7;
export const LOAD_MAP_DART_PATH = "M7 1.2 L12.6 12.6 L7 10.2 L1.4 12.6 Z";
export const LOAD_MAP_PARKED_SIZE = 10;
export const LOAD_MAP_PARKED_CX = 5;
export const LOAD_MAP_PARKED_CY = 5;

export function loadMapIconLayout(pinShape?: "circle" | "arrow" | "diamond"): {
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
} {
  if (pinShape === "arrow") {
    return {
      w: LOAD_MAP_ARROW_SIZE,
      h: LOAD_MAP_ARROW_SIZE,
      anchorX: LOAD_MAP_ARROW_CX,
      anchorY: LOAD_MAP_ARROW_CY,
    };
  }
  if (pinShape === "circle") {
    return {
      w: LOAD_MAP_PARKED_SIZE,
      h: LOAD_MAP_PARKED_SIZE,
      anchorX: LOAD_MAP_PARKED_CX,
      anchorY: LOAD_MAP_PARKED_CY,
    };
  }
  return {
    w: LOAD_MAP_PIN_WIDTH,
    h: LOAD_MAP_PIN_HEIGHT,
    anchorX: LOAD_MAP_PIN_TIP_X,
    anchorY: LOAD_MAP_PIN_TIP_Y,
  };
}

export type LoadMapLabelOrigin = { x: number; y: number };

export type LoadMapPoint = {
  id: string;
  kind: LoadMapPointKind;
  label: string;
  lat: number;
  lng: number;
  detail?: string;
  href?: string;
  pinColor?: string;
  markerText?: string;
  labelClassName?: string;
  labelOrigin?: LoadMapLabelOrigin;
  pinShape?: "circle" | "arrow" | "diamond";
  headingDeg?: number | null;
};

export type LoadTrackingEvent = {
  id: string;
  at: string;
  who: string;
  note: string;
  gps?: string;
  source: "check_call" | "samsara" | "orbcomm" | "status" | "sms";
};

export type LoadMapPathPoint = { lat: number; lng: number };

export function stopsRoutePoints(points: LoadMapPoint[]): LoadMapPoint[] {
  return points.filter(
    (point) =>
      point.kind === "pickup" || point.kind === "delivery" || point.kind === "relay" || point.kind === "truck",
  );
}

/**
 * Keep pickup/delivery order. Drop relay pins in before the first delivery
 * (P1, P2, R1, R2, D1, D2). A delivery that already sits between pickups stays put.
 */
export function orderLaneAnchors<T extends { kind: string }>(points: T[]): T[] {
  const stops = points.filter((point) => point.kind === "pickup" || point.kind === "delivery");
  const relays = points.filter((point) => point.kind === "relay");
  const ordered: T[] = [];
  let inserted = false;
  for (const stop of stops) {
    if (!inserted && stop.kind === "delivery") {
      ordered.push(...relays);
      inserted = true;
    }
    ordered.push(stop);
  }
  if (!inserted) ordered.push(...relays);
  return ordered;
}

export function loadMapPinFill(point: Pick<LoadMapPoint, "kind" | "pinColor">): string {
  const raw = String(point.pinColor || LOAD_MAP_MARKER_COLOR[point.kind] || "").trim();
  return /^#[0-9A-Fa-f]{3,8}$/.test(raw) ? raw : LOAD_MAP_MARKER_COLOR[point.kind];
}

export function loadMapPinSvg(point: Pick<LoadMapPoint, "kind" | "pinColor" | "pinShape" | "headingDeg">): string {
  const fill = loadMapPinFill(point);
  if (point.pinShape === "arrow") {
    const heading = Number(point.headingDeg);
    const deg = Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOAD_MAP_ARROW_SIZE}" height="${LOAD_MAP_ARROW_SIZE}" viewBox="0 0 14 14"><g transform="rotate(${deg.toFixed(0)} ${LOAD_MAP_ARROW_CX} ${LOAD_MAP_ARROW_CY})"><path d="${LOAD_MAP_DART_PATH}" fill="${fill}" stroke="#0f172a" stroke-width="1" stroke-linejoin="miter" stroke-linecap="miter"/></g></svg>`;
  }
  if (point.pinShape === "circle") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOAD_MAP_PARKED_SIZE}" height="${LOAD_MAP_PARKED_SIZE}" viewBox="0 0 10 10"><circle cx="${LOAD_MAP_PARKED_CX}" cy="${LOAD_MAP_PARKED_CY}" r="4" fill="${fill}" stroke="#ffffff" stroke-width="1"/></svg>`;
  }
  if (point.pinShape === "diamond" || point.kind === "relay") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOAD_MAP_PIN_WIDTH}" height="${LOAD_MAP_PIN_HEIGHT}" viewBox="0 0 ${LOAD_MAP_PIN_WIDTH} ${LOAD_MAP_PIN_HEIGHT}"><path d="M11 1.2 L20.4 13.2 L11 30.6 L1.6 13.2 Z" fill="${fill}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOAD_MAP_PIN_WIDTH}" height="${LOAD_MAP_PIN_HEIGHT}" viewBox="0 0 ${LOAD_MAP_PIN_WIDTH} ${LOAD_MAP_PIN_HEIGHT}"><path d="M11 1.4 C6.2 1.4 2.6 5.1 2.6 10 C2.6 17.4 11 30.6 11 30.6 C11 30.6 19.4 17.4 19.4 10 C19.4 5.1 15.8 1.4 11 1.4 Z" fill="${fill}" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/><circle cx="${LOAD_MAP_PIN_HEAD_X}" cy="${LOAD_MAP_PIN_HEAD_Y}" r="3" fill="#ffffff" fill-opacity="0.35"/></svg>`;
}

export function loadMapPinIconUrl(point: Pick<LoadMapPoint, "kind" | "pinColor" | "pinShape" | "headingDeg">): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(loadMapPinSvg(point))}`;
}

export function defaultLoadMapLabelOrigin(): LoadMapLabelOrigin {
  return { x: LOAD_MAP_PIN_HEAD_X, y: -2 };
}

export function pathThroughStops(points: LoadMapPoint[]): LoadMapPathPoint[] {
  return orderLaneAnchors(points).map((point) => ({ lat: point.lat, lng: point.lng }));
}

/** Pickup, relay, and delivery pins. These are the points a lane fit must cover. */
export function lanePinsForFit<T extends { kind: string }>(points: T[]): T[] {
  return points.filter((point) => point.kind === "pickup" || point.kind === "relay" || point.kind === "delivery");
}

export function latLngBounds(points: Array<{ lat: number; lng: number }>): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null {
  if (points.length === 0) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Same pad/floor projection the workbench sketch uses.
 * Extremes land on the padding inset so every coord stays inside the viewBox.
 */
export function laneSketchFrame(
  coords: Array<{ lat: number; lng: number }>,
  pad = 24,
  floor = 0.25,
): { x: (lng: number) => number; y: (lat: number) => number } {
  const lats = coords.map((point) => point.lat);
  const lngs = coords.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const rawLat = maxLat - minLat;
  const rawLng = maxLng - minLng;
  const dLat = Math.max(rawLat, floor);
  const dLng = Math.max(rawLng, floor);
  const lat0 = minLat - (dLat - rawLat) / 2;
  const lng0 = minLng - (dLng - rawLng) / 2;
  const inner = 100 - pad * 2;
  return {
    x: (lng: number) => ((lng - lng0) / dLng) * inner + pad,
    y: (lat: number) => (1 - (lat - lat0) / dLat) * inner + pad,
  };
}

export const WORKBENCH_MAP_FIT_PADDING = 56;
export const WORKBENCH_MAP_MIN_ZOOM = 2;
export const WORKBENCH_MAP_MAX_ZOOM = 10;
export const WORKBENCH_MAP_MIN_USABLE_PX = 64;

export function workbenchLaneMaxZoom(_points?: Array<{ lat: number; lng: number }>): number {
  return WORKBENCH_MAP_MAX_ZOOM;
}

function laneBounds(points: Array<{ lat: number; lng: number }>): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function laneSpanDeg(points: Array<{ lat: number; lng: number }>): number {
  if (points.length === 0) return 0;
  const { minLat, maxLat, minLng, maxLng } = laneBounds(points);
  return Math.max(maxLat - minLat, maxLng - minLng);
}

/** Keep requested inset unless it would leave no usable map. */
export function clampFitPadding(requested: number, paneWidth: number, paneHeight: number): number {
  const shortest = Math.min(paneWidth, paneHeight);
  if (!Number.isFinite(shortest) || shortest <= 0) return requested;
  const maxPad = Math.max(16, Math.floor((shortest - WORKBENCH_MAP_MIN_USABLE_PX) / 2));
  return Math.min(requested, maxPad);
}

export function workbenchCardMapFraming(
  points: Array<{ lat: number; lng: number }>,
  pane?: { width: number; height: number },
): {
  fitPoints: Array<{ lat: number; lng: number }>;
  padding: number;
  minZoom: number;
  maxZoom: number;
} {
  return {
    fitPoints: points,
    padding: pane
      ? clampFitPadding(WORKBENCH_MAP_FIT_PADDING, pane.width, pane.height)
      : WORKBENCH_MAP_FIT_PADDING,
    minZoom: WORKBENCH_MAP_MIN_ZOOM,
    maxZoom: WORKBENCH_MAP_MAX_ZOOM,
  };
}

export function workbenchPredictedZoom(
  points: Array<{ lat: number; lng: number }>,
  pane: { width: number; height: number },
): number {
  const framing = workbenchCardMapFraming(points, pane);
  const span = laneSpanDeg(framing.fitPoints);
  const usable = Math.max(Math.min(pane.width, pane.height) - framing.padding * 2, 1);
  const raw = Math.log2(usable / ((256 * Math.max(span, 1e-6)) / 360));
  return Math.min(framing.maxZoom, Math.max(framing.minZoom, Math.floor(raw)));
}

/** Leftover pixels on each side after the lane span is drawn at the predicted zoom. */
export function workbenchPredictedPinInsetPx(
  points: Array<{ lat: number; lng: number }>,
  pane: { width: number; height: number },
): number {
  const zoom = workbenchPredictedZoom(points, pane);
  const span = laneSpanDeg(workbenchCardMapFraming(points, pane).fitPoints);
  const occupied = (Math.max(span, 1e-6) * 256 * 2 ** zoom) / 360;
  return (Math.min(pane.width, pane.height) - occupied) / 2;
}

export function stopAddressLine(stop: {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string {
  const cityState = [stop.city?.trim(), stop.state?.trim()].filter(Boolean).join(", ");
  return [stop.street?.trim(), [cityState, stop.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
