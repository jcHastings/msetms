/**
 * Rate-con appointment clocks. A time printed with a zone ("14:00 CDT") is that
 * zone's wall clock, not office time. Pure helpers, no database.
 */
import { toInputDateTime } from "./format";
import { instantMs } from "./wall-time";

const FIXED_OFFSETS: Record<string, string> = {
  EST: "-05:00",
  EDT: "-04:00",
  CST: "-06:00",
  CDT: "-05:00",
  MST: "-07:00",
  MDT: "-06:00",
  PST: "-08:00",
  PDT: "-07:00",
};

const GENERIC_ZONES: Record<string, string> = {
  ET: "America/New_York",
  EASTERN: "America/New_York",
  CT: "America/Chicago",
  CENTRAL: "America/Chicago",
  MT: "America/Denver",
  MOUNTAIN: "America/Denver",
  PT: "America/Los_Angeles",
  PACIFIC: "America/Los_Angeles",
};

const ZONE_WORD = "(EST|EDT|CST|CDT|MST|MDT|PST|PDT|ET|CT|MT|PT|EASTERN|CENTRAL|MOUNTAIN|PACIFIC)";

/** Normalize a printed zone label to an offset or IANA zone. Unknown labels return "". */
export function rateConZone(label: string | null | undefined): string {
  const key = String(label ?? "").trim().toUpperCase().replace(/\s+TIME$/, "");
  return FIXED_OFFSETS[key] ?? GENERIC_ZONES[key] ?? "";
}

function instantFor(wall: string, zone: string): number | null {
  if (!zone) return null;
  if (/^[+-]\d{2}:\d{2}$/.test(zone)) {
    const ms = Date.parse(`${wall}:00${zone}`);
    return Number.isNaN(ms) ? null : ms;
  }
  return instantMs(wall, zone);
}

function clockPatterns(hour: number, minute: number): RegExp[] {
  const mm = String(minute).padStart(2, "0");
  const h24 = String(hour).padStart(2, "0");
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const meridiem = hour < 12 ? "a\\.?m\\.?" : "p\\.?m\\.?";
  return [
    new RegExp(`(?:^|[^\\d:])0?${Number(h24)}:${mm}(?!\\s*(?:a\\.?m|p\\.?m))\\s*(?:hrs?\\s*)?\\(?${ZONE_WORD}\\b`, "gi"),
    new RegExp(`(?:^|[^\\d:])${h12}:${mm}\\s*${meridiem}\\s*\\(?${ZONE_WORD}\\b`, "gi"),
  ];
}

/** Find the zone printed next to this clock time in the document. One zone only; mixed hits return "". */
export function zoneNearClock(rawText: string, wall: string): string {
  const match = String(wall ?? "").match(/T(\d{2}):(\d{2})/);
  if (!match || !rawText) return "";
  const found = new Set<string>();
  for (const pattern of clockPatterns(Number(match[1]), Number(match[2]))) {
    for (const hit of rawText.matchAll(pattern)) {
      const zone = rateConZone(hit[1]);
      if (zone) found.add(zone);
    }
  }
  return found.size === 1 ? [...found][0] : "";
}

/**
 * Turn a rate-con window into the office datetime-local value the load form saves.
 * `2026-10-14T14:00 CDT`, `2026-10-14T14:00-05:00`, or a naive clock with the zone
 * printed beside it in the document all become the same instant.
 * A naive clock with no printed zone keeps the old office-time behavior.
 */
export function rateConWindowToOfficeInput(value: string | null | undefined, rawText = ""): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?\s*(.*)$/);
  if (!match) return null;
  const wall = match[1];
  const tail = match[2].trim().replace(/^\(|\)$/g, "");
  let ms: number | null = null;
  if (/^Z$/i.test(tail)) ms = Date.parse(`${wall}:00Z`);
  else if (/^[+-]\d{2}:?\d{2}$/.test(tail)) {
    const offset = tail.includes(":") ? tail : `${tail.slice(0, 3)}:${tail.slice(3)}`;
    ms = instantFor(wall, offset);
  } else if (tail) ms = instantFor(wall, rateConZone(tail));
  if (ms == null && !tail) ms = instantFor(wall, zoneNearClock(rawText, wall));
  if (ms == null || Number.isNaN(ms)) return wall;
  return toInputDateTime(new Date(ms).toISOString());
}
