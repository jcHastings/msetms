/** City/state lane key + compare. Client-safe. Fleet history only — no market APIs. */

export const LANE_AVG_FLAT_BAND = 75;
export const LANE_AVG_PCT_BAND = 0.05;

export type LaneAverageSnapshot = {
  key: string;
  label: string;
  sampleSize: number;
  avgRate: number | null;
  avgPerMile: number | null;
};

export type LaneAvgBand = "below" | "at" | "above" | "none";

export type LaneAvgCompare = LaneAverageSnapshot & {
  band: LaneAvgBand;
  rate: number | null;
  perMile: number | null;
  delta: number | null;
};

const CITY_STATE = /([A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*)*),\s*([A-Za-z]{2})\b/g;
const CITY_STATE_TAIL = /([A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*)*)\s+([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/;

export function normalizeLaneCity(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function lanePointFromText(raw: string): { city: string; state: string } | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let last: RegExpExecArray | null = null;
  const re = new RegExp(CITY_STATE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) last = match;
  if (last) {
    return { city: last[1].trim(), state: last[2].trim().toUpperCase() };
  }
  const tail = text.match(CITY_STATE_TAIL);
  if (!tail) return null;
  return { city: tail[1].trim(), state: tail[2].trim().toUpperCase() };
}

export function laneKey(origin: string, destination: string): string {
  const from = lanePointFromText(origin);
  const to = lanePointFromText(destination);
  if (!from || !to) return "";
  return `${normalizeLaneCity(from.city)}|${from.state}→${normalizeLaneCity(to.city)}|${to.state}`;
}

export function formatLanePoint(raw: string): string {
  const point = lanePointFromText(raw);
  if (!point) return String(raw ?? "").trim();
  const city = point.city
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join(" ");
  return `${city}, ${point.state}`;
}

export function laneLabel(origin: string, destination: string): string {
  const from = formatLanePoint(origin);
  const to = formatLanePoint(destination);
  if (!from || !to) return "";
  return `${from} → ${to}`;
}

export function emptyLaneAverage(): LaneAverageSnapshot {
  return { key: "", label: "", sampleSize: 0, avgRate: null, avgPerMile: null };
}

export function emptyLaneCompare(): LaneAvgCompare {
  return {
    ...emptyLaneAverage(),
    band: "none",
    rate: null,
    perMile: null,
    delta: null,
  };
}

export function roundLaneMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function compareLaneAverage(
  rate: number | null | undefined,
  snapshot: LaneAverageSnapshot | null | undefined,
  miles?: number | null,
): LaneAvgCompare {
  const live = rate != null && Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : null;
  const liveMiles = miles != null && Number.isFinite(Number(miles)) && Number(miles) > 0 ? Number(miles) : null;
  const perMile = live != null && liveMiles != null ? roundLaneMoney(live / liveMiles) : null;
  if (!snapshot?.key) {
    return { ...emptyLaneCompare(), rate: live, perMile };
  }
  if (snapshot.sampleSize < 1 || snapshot.avgRate == null) {
    return {
      ...snapshot,
      band: "none",
      rate: live,
      perMile,
      delta: null,
    };
  }
  if (live == null) {
    return {
      ...snapshot,
      band: "none",
      rate: null,
      perMile,
      delta: null,
    };
  }
  const delta = roundLaneMoney(live - snapshot.avgRate);
  const pct = snapshot.avgRate > 0 ? Math.abs(delta) / snapshot.avgRate : 0;
  const at = Math.abs(delta) <= LANE_AVG_FLAT_BAND || pct <= LANE_AVG_PCT_BAND;
  return {
    ...snapshot,
    band: at ? "at" : delta < 0 ? "below" : "above",
    rate: live,
    perMile,
    delta,
  };
}

export function laneAvgHeadline(compare: LaneAvgCompare): string {
  if (compare.band === "below") return "Below your lane avg";
  if (compare.band === "above") return "Above your lane avg";
  if (compare.band === "at") return "At your lane avg";
  if (compare.key && compare.sampleSize < 1) return "No lane history yet";
  if (compare.sampleSize > 0 && compare.avgRate != null) return "Your lane avg";
  return "";
}

export function formatLanePerMile(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `$${value.toFixed(2)}/mi`;
}
