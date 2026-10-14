/** Deadhead suggestion types. No database. Deadhead is never official until confirmed. */

export const DEADHEAD_GAP_MS = 3 * 24 * 60 * 60 * 1000;
export const DEADHEAD_DISTANCE_MI = 600;

export type DeadheadWarningCode = "gap" | "distance" | "between" | "gps";

export type DeadheadSuggestion = {
  driverName: string;
  place: string;
  from: string;
  to: string;
  miles: number | null;
  states: Array<{ state: string; name: string; miles: number }>;
  polyline: string;
  source: "google" | "";
  basis: "previous_delivery" | "gps";
  warnings: DeadheadWarningCode[];
  notes: string[];
};

export function parseDeadheadSuggestion(raw: string | null | undefined): DeadheadSuggestion | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<DeadheadSuggestion>;
    const place = String(value.place ?? "").trim();
    if (!place) return null;
    const warnings = Array.isArray(value.warnings)
      ? value.warnings.filter((item): item is DeadheadWarningCode =>
          item === "gap" || item === "distance" || item === "between" || item === "gps",
        )
      : [];
    return {
      driverName: String(value.driverName ?? "").trim() || "the driver",
      place,
      from: String(value.from ?? place),
      to: String(value.to ?? ""),
      miles: typeof value.miles === "number" && Number.isFinite(value.miles) ? value.miles : null,
      states: Array.isArray(value.states) ? value.states : [],
      polyline: String(value.polyline ?? ""),
      source: value.source === "google" ? "google" : "",
      basis: value.basis === "gps" ? "gps" : "previous_delivery",
      warnings,
      notes: Array.isArray(value.notes) ? value.notes.map((note) => String(note)) : [],
    };
  } catch {
    return null;
  }
}

export function emptyMilesPending(load: {
  empty_confirmed?: number | boolean | null;
  empty_miles?: number | null;
  empty_source?: string | null;
  empty_suggestion?: string | null;
}): boolean {
  if (Number(load.empty_confirmed) === 1) return false;
  if (parseDeadheadSuggestion(load.empty_suggestion)) return true;
  return load.empty_source === "google" && load.empty_miles != null && Number(load.empty_miles) > 0;
}

export function deadheadPromptText(driverName: string, place: string): string {
  const driver = driverName.trim() || "the driver";
  return `Did ${driver} start here? ${place}`;
}
