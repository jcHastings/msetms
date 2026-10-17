/**
 * Compare instants as UTC epoch milliseconds.
 * ITS appointment clocks are stored with no offset (`2026-08-21T08:00:00`).
 * That export is US Central — the documented ITS zone, same as the office zone
 * on driver messages. A stop with a state uses that state's zone instead.
 * GPS clocks are instants: a missing offset is UTC, not a wall time.
 */

export const ITS_TIME_ZONE = "America/Chicago";

const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

const STATE_TIME_ZONES: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
};

export function timeZoneForStop(state?: string | null, city?: string | null): string {
  const code = String(state ?? "").trim().toUpperCase();
  const cityName = String(city ?? "").trim().toLowerCase();
  if (code === "TX" && cityName === "el paso") return "America/Denver";
  return STATE_TIME_ZONES[code] ?? ITS_TIME_ZONE;
}

function zoneOffsetMs(instantMs: number, timeZone: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instantMs));
  } catch {
    return null;
  }
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "NaN");
  const year = num("year");
  const month = num("month");
  const day = num("day");
  let hour = num("hour");
  const minute = num("minute");
  const second = num("second");
  if (![year, month, day, hour, minute, second].every((value) => Number.isFinite(value))) return null;
  if (hour === 24) hour = 0;
  return Date.UTC(year, month - 1, day, hour, minute, second) - instantMs;
}

function wallClockToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number | null {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = zoneOffsetMs(utcGuess, timeZone);
  if (offset1 == null) return null;
  const offset2 = zoneOffsetMs(utcGuess - offset1, timeZone);
  if (offset2 == null) return null;
  return utcGuess - offset2;
}

/** Zoned strings stay absolute. Naive strings are a wall clock in `timeZone`. */
export function instantMs(value: string | null | undefined, timeZone = ITS_TIME_ZONE): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (HAS_ZONE.test(raw)) {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/);
  if (!match) {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  return wallClockToUtcMs(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
    timeZone,
  );
}

/** Samsara and stored breadcrumb times. No offset means UTC, never an ITS wall clock. */
export function gpsInstantMs(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (HAS_ZONE.test(raw)) return instantMs(raw);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/);
  if (!match) return instantMs(raw);
  return instantMs(`${match[1]}T${match[2]}Z`);
}
