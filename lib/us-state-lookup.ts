export type UsStateBox = {
  code: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  lat: number;
  lng: number;
};

/** Bounding boxes + centroids for IFTA *estimate* only — not official jurisdiction miles. */
export const US_STATE_BOXES: UsStateBox[] = [
  { code: "NY", name: "New York", minLat: 40.49, maxLat: 40.92, minLng: -74.05, maxLng: -73.7, lat: 40.73, lng: -73.94 },
  { code: "NY", name: "New York", minLat: 40.55, maxLat: 41.2, minLng: -73.75, maxLng: -71.85, lat: 40.8, lng: -73.1 },
  { code: "PA", name: "Pennsylvania", minLat: 39.87, maxLat: 40.15, minLng: -75.28, maxLng: -74.96, lat: 39.95, lng: -75.16 },
  { code: "AL", name: "Alabama", minLat: 30.22, maxLat: 35.01, minLng: -88.47, maxLng: -84.89, lat: 32.81, lng: -86.79 },
  { code: "AK", name: "Alaska", minLat: 51.21, maxLat: 71.54, minLng: -179.15, maxLng: -129.98, lat: 64.2, lng: -153.37 },
  { code: "AZ", name: "Arizona", minLat: 31.33, maxLat: 37.0, minLng: -114.82, maxLng: -109.05, lat: 34.05, lng: -111.09 },
  { code: "AR", name: "Arkansas", minLat: 33.0, maxLat: 36.5, minLng: -94.62, maxLng: -89.64, lat: 34.8, lng: -92.2 },
  { code: "CA", name: "California", minLat: 32.53, maxLat: 42.01, minLng: -124.41, maxLng: -114.13, lat: 36.78, lng: -119.42 },
  { code: "CO", name: "Colorado", minLat: 36.99, maxLat: 41.0, minLng: -109.06, maxLng: -102.04, lat: 39.06, lng: -105.31 },
  { code: "CT", name: "Connecticut", minLat: 40.98, maxLat: 42.05, minLng: -73.73, maxLng: -71.79, lat: 41.6, lng: -72.76 },
  { code: "DE", name: "Delaware", minLat: 38.45, maxLat: 39.84, minLng: -75.79, maxLng: -75.05, lat: 38.91, lng: -75.53 },
  { code: "DC", name: "District of Columbia", minLat: 38.79, maxLat: 38.995, minLng: -77.12, maxLng: -76.91, lat: 38.91, lng: -77.04 },
  { code: "FL", name: "Florida", minLat: 24.52, maxLat: 31.0, minLng: -87.63, maxLng: -80.03, lat: 27.66, lng: -81.52 },
  { code: "GA", name: "Georgia", minLat: 30.36, maxLat: 35.0, minLng: -85.61, maxLng: -80.84, lat: 32.17, lng: -82.9 },
  { code: "HI", name: "Hawaii", minLat: 18.91, maxLat: 22.24, minLng: -160.25, maxLng: -154.81, lat: 20.8, lng: -156.33 },
  { code: "ID", name: "Idaho", minLat: 41.99, maxLat: 49.0, minLng: -117.24, maxLng: -111.04, lat: 44.07, lng: -114.74 },
  { code: "IL", name: "Illinois", minLat: 36.97, maxLat: 42.51, minLng: -91.51, maxLng: -87.02, lat: 40.35, lng: -88.99 },
  { code: "IN", name: "Indiana", minLat: 37.77, maxLat: 41.76, minLng: -88.1, maxLng: -84.78, lat: 39.85, lng: -86.26 },
  { code: "IA", name: "Iowa", minLat: 40.38, maxLat: 43.5, minLng: -96.64, maxLng: -90.14, lat: 42.08, lng: -93.5 },
  { code: "KS", name: "Kansas", minLat: 36.99, maxLat: 40.0, minLng: -102.05, maxLng: -94.59, lat: 38.5, lng: -98.38 },
  { code: "KY", name: "Kentucky", minLat: 36.5, maxLat: 39.15, minLng: -89.57, maxLng: -81.96, lat: 37.67, lng: -84.67 },
  { code: "LA", name: "Louisiana", minLat: 28.93, maxLat: 33.02, minLng: -94.04, maxLng: -88.82, lat: 31.17, lng: -91.87 },
  { code: "ME", name: "Maine", minLat: 43.06, maxLat: 47.46, minLng: -71.08, maxLng: -66.95, lat: 45.25, lng: -69.45 },
  { code: "MD", name: "Maryland", minLat: 37.89, maxLat: 39.72, minLng: -79.49, maxLng: -75.05, lat: 39.05, lng: -76.64 },
  { code: "MA", name: "Massachusetts", minLat: 41.24, maxLat: 42.89, minLng: -73.51, maxLng: -69.93, lat: 42.26, lng: -71.8 },
  { code: "MI", name: "Michigan", minLat: 41.7, maxLat: 48.31, minLng: -90.42, maxLng: -82.12, lat: 44.31, lng: -85.6 },
  { code: "MN", name: "Minnesota", minLat: 43.5, maxLat: 49.38, minLng: -97.24, maxLng: -89.49, lat: 46.28, lng: -94.31 },
  { code: "MS", name: "Mississippi", minLat: 30.17, maxLat: 35.0, minLng: -91.66, maxLng: -88.1, lat: 32.74, lng: -89.68 },
  { code: "MO", name: "Missouri", minLat: 35.995, maxLat: 40.61, minLng: -95.77, maxLng: -89.1, lat: 38.36, lng: -92.46 },
  { code: "MT", name: "Montana", minLat: 44.36, maxLat: 49.0, minLng: -116.05, maxLng: -104.04, lat: 46.88, lng: -110.36 },
  { code: "NE", name: "Nebraska", minLat: 40.0, maxLat: 43.0, minLng: -104.05, maxLng: -95.31, lat: 41.49, lng: -99.9 },
  { code: "NV", name: "Nevada", minLat: 35.0, maxLat: 42.0, minLng: -120.01, maxLng: -114.04, lat: 38.31, lng: -117.06 },
  { code: "NH", name: "New Hampshire", minLat: 42.7, maxLat: 45.31, minLng: -72.56, maxLng: -70.61, lat: 43.45, lng: -71.57 },
  { code: "NJ", name: "New Jersey", minLat: 38.93, maxLat: 41.36, minLng: -75.56, maxLng: -73.89, lat: 40.06, lng: -74.41 },
  { code: "NM", name: "New Mexico", minLat: 31.33, maxLat: 37.0, minLng: -109.05, maxLng: -103.0, lat: 34.52, lng: -105.87 },
  { code: "NY", name: "New York", minLat: 40.5, maxLat: 45.02, minLng: -79.76, maxLng: -71.86, lat: 42.95, lng: -75.53 },
  { code: "NC", name: "North Carolina", minLat: 33.84, maxLat: 36.59, minLng: -84.32, maxLng: -75.46, lat: 35.56, lng: -79.39 },
  { code: "ND", name: "North Dakota", minLat: 45.94, maxLat: 49.0, minLng: -104.05, maxLng: -96.55, lat: 47.45, lng: -100.47 },
  { code: "OH", name: "Ohio", minLat: 38.4, maxLat: 41.98, minLng: -84.82, maxLng: -80.52, lat: 40.29, lng: -82.79 },
  { code: "OK", name: "Oklahoma", minLat: 33.62, maxLat: 37.0, minLng: -103.0, maxLng: -94.43, lat: 35.31, lng: -97.53 },
  { code: "OR", name: "Oregon", minLat: 41.99, maxLat: 46.29, minLng: -124.57, maxLng: -116.46, lat: 43.8, lng: -120.55 },
  { code: "PA", name: "Pennsylvania", minLat: 39.72, maxLat: 42.27, minLng: -80.52, maxLng: -74.69, lat: 40.88, lng: -77.8 },
  { code: "RI", name: "Rhode Island", minLat: 41.15, maxLat: 42.02, minLng: -71.86, maxLng: -71.12, lat: 41.68, lng: -71.51 },
  { code: "SC", name: "South Carolina", minLat: 32.05, maxLat: 35.22, minLng: -83.35, maxLng: -78.54, lat: 33.84, lng: -81.16 },
  { code: "SD", name: "South Dakota", minLat: 42.48, maxLat: 45.95, minLng: -104.06, maxLng: -96.44, lat: 44.3, lng: -99.44 },
  { code: "TN", name: "Tennessee", minLat: 34.98, maxLat: 36.68, minLng: -90.31, maxLng: -81.65, lat: 35.86, lng: -86.35 },
  { code: "TX", name: "Texas", minLat: 25.84, maxLat: 36.5, minLng: -106.65, maxLng: -93.51, lat: 31.05, lng: -100.0 },
  { code: "UT", name: "Utah", minLat: 36.99, maxLat: 42.0, minLng: -114.05, maxLng: -109.04, lat: 39.32, lng: -111.09 },
  { code: "VT", name: "Vermont", minLat: 42.73, maxLat: 45.02, minLng: -73.44, maxLng: -71.47, lat: 44.07, lng: -72.67 },
  { code: "VA", name: "Virginia", minLat: 36.54, maxLat: 39.47, minLng: -83.68, maxLng: -75.24, lat: 37.52, lng: -78.85 },
  { code: "WA", name: "Washington", minLat: 45.54, maxLat: 49.0, minLng: -124.76, maxLng: -116.92, lat: 47.4, lng: -121.49 },
  { code: "WV", name: "West Virginia", minLat: 37.2, maxLat: 40.64, minLng: -82.64, maxLng: -77.72, lat: 38.6, lng: -80.45 },
  { code: "WI", name: "Wisconsin", minLat: 42.49, maxLat: 47.08, minLng: -92.89, maxLng: -86.81, lat: 44.27, lng: -89.62 },
  { code: "WY", name: "Wyoming", minLat: 40.99, maxLat: 45.01, minLng: -111.06, maxLng: -104.05, lat: 43.08, lng: -107.29 },
];

function contains(box: UsStateBox, lat: number, lng: number): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

function boxArea(box: UsStateBox): number {
  return Math.max(0, box.maxLat - box.minLat) * Math.max(0, box.maxLng - box.minLng);
}

function distanceSq(box: UsStateBox, lat: number, lng: number): number {
  const dLat = box.lat - lat;
  const dLng = box.lng - lng;
  return dLat * dLat + dLng * dLng;
}

/** Missouri River, south → north. West is Nebraska, east is Iowa. Not a straight midpoint. */
const NE_IA_RIVER: Array<{ lat: number; lng: number }> = [
  { lat: 40.575, lng: -95.765 },
  { lat: 40.65, lng: -95.82 },
  { lat: 40.8, lng: -95.87 },
  { lat: 41.0, lng: -95.875 },
  { lat: 41.15, lng: -95.88 },
  { lat: 41.208, lng: -95.87 },
  { lat: 41.228, lng: -95.852 },
  { lat: 41.26, lng: -95.915 },
  { lat: 41.32, lng: -95.95 },
  { lat: 41.4, lng: -95.99 },
  { lat: 41.52, lng: -96.05 },
  { lat: 41.7, lng: -96.12 },
  { lat: 41.9, lng: -96.18 },
  { lat: 42.15, lng: -96.3 },
  { lat: 42.4, lng: -96.38 },
  { lat: 42.49, lng: -96.413 },
  { lat: 42.61, lng: -96.48 },
  { lat: 42.75, lng: -96.6 },
];

function borderLngAtLat(border: Array<{ lat: number; lng: number }>, lat: number): number | null {
  if (border.length < 2) return null;
  if (lat <= border[0].lat) return border[0].lng;
  const last = border[border.length - 1];
  if (lat >= last.lat) return last.lng;
  for (let i = 1; i < border.length; i += 1) {
    const a = border[i - 1];
    const b = border[i];
    if (lat >= a.lat && lat <= b.lat) {
      const span = b.lat - a.lat || 1;
      return a.lng + ((lat - a.lat) / span) * (b.lng - a.lng);
    }
  }
  return null;
}

/** 103rd meridian, 32nd parallel, then the Rio Grande. El Paso is Texas. */
function resolveTxNm(lat: number, lng: number): "TX" | "NM" {
  if (lat >= 32) return lng >= -103 ? "TX" : "NM";
  return lng <= -106.53 ? "NM" : "TX";
}

/**
 * Red River then the 36°30′ panhandle line, east → west.
 * South is Texas, north is Oklahoma. Amarillo is Texas.
 */
const TX_OK_BORDER: Array<{ lat: number; lng: number }> = [
  { lat: 33.64, lng: -94.5 },
  { lat: 33.85, lng: -95.0 },
  { lat: 33.78, lng: -96.0 },
  { lat: 33.74, lng: -97.15 },
  { lat: 34.05, lng: -98.0 },
  { lat: 34.15, lng: -98.5 },
  { lat: 34.45, lng: -99.2 },
  { lat: 34.57, lng: -100.0 },
  { lat: 36.5, lng: -100.0 },
  { lat: 36.5, lng: -103.0 },
];

function borderLatAtLng(border: Array<{ lat: number; lng: number }>, lng: number): number | null {
  if (border.length < 2) return null;
  const first = border[0];
  const last = border[border.length - 1];
  const minLng = Math.min(first.lng, last.lng);
  const maxLng = Math.max(first.lng, last.lng);
  if (lng <= minLng) return first.lng <= last.lng ? first.lat : last.lat;
  if (lng >= maxLng) return first.lng <= last.lng ? last.lat : first.lat;
  for (let i = 1; i < border.length; i += 1) {
    const a = border[i - 1];
    const b = border[i];
    const lo = Math.min(a.lng, b.lng);
    const hi = Math.max(a.lng, b.lng);
    if (lng >= lo && lng <= hi) {
      const span = b.lng - a.lng || 1;
      return a.lat + ((lng - a.lng) / span) * (b.lat - a.lat);
    }
  }
  return null;
}

function resolveTxOk(lat: number, lng: number): "TX" | "OK" {
  const river = borderLatAtLng(TX_OK_BORDER, lng);
  if (river == null) return lat >= 36.5 ? "OK" : "TX";
  return lat >= river ? "OK" : "TX";
}

function pickFromHits(hits: UsStateBox[], lat: number, lng: number): UsStateBox {
  return hits.reduce((winner, box) => {
    const areaDelta = boxArea(box) - boxArea(winner);
    if (Math.abs(areaDelta) > 1e-6) return areaDelta < 0 ? box : winner;
    return distanceSq(box, lat, lng) < distanceSq(winner, lat, lng) ? box : winner;
  });
}

export function usStateForPoint(lat: number, lng: number): { code: string; name: string } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const hits = US_STATE_BOXES.filter((box) => contains(box, lat, lng));
  if (hits.length === 0) return null;
  const codes = new Set(hits.map((box) => box.code));
  if (codes.has("NE") && codes.has("IA")) {
    const river = borderLngAtLat(NE_IA_RIVER, lat);
    if (river != null) {
      const code = lng < river ? "NE" : "IA";
      const named = hits.find((box) => box.code === code);
      if (named) return { code: named.code, name: named.name };
    }
  }
  if (codes.has("TX") && codes.has("NM")) {
    const code = resolveTxNm(lat, lng);
    const named = hits.find((box) => box.code === code);
    if (named) return { code: named.code, name: named.name };
  }
  if (codes.has("TX") && codes.has("OK")) {
    const code = resolveTxOk(lat, lng);
    const named = hits.find((box) => box.code === code);
    if (named) return { code: named.code, name: named.name };
  }
  const best = pickFromHits(hits, lat, lng);
  return { code: best.code, name: best.name };
}

export function usStateName(code: string): string {
  return US_STATE_BOXES.find((box) => box.code === code.toUpperCase())?.name ?? code.toUpperCase();
}
