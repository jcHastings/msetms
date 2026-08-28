/** Client-safe load map types. No env, db, or API keys. */

export type LoadMapPointKind = "pickup" | "delivery" | "truck" | "trailer" | "track";

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
  pinShape?: "circle" | "arrow";
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
  return points.filter((point) => point.kind === "pickup" || point.kind === "delivery" || point.kind === "truck");
}

export function pathThroughStops(points: LoadMapPoint[]): LoadMapPathPoint[] {
  return points
    .filter((point) => point.kind === "pickup" || point.kind === "delivery")
    .map((point) => ({ lat: point.lat, lng: point.lng }));
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
