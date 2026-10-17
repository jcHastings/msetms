/** Pure rule for when the detention clock ends at a stop. No database. */

export type DetentionEndSource = "driver_empty" | "pod" | "reefer_off" | "gps_depart";

export const DETENTION_END_SOURCES: readonly DetentionEndSource[] = ["driver_empty", "pod", "reefer_off", "gps_depart"];

export const DETENTION_HOS_FLAG = "Driver may have stayed for HOS reset, check end time";

/** A POD or reefer-off this far before the GPS depart raises the HOS flag. */
export const DETENTION_HOS_GAP_MS = 60 * 60 * 1000;

export type DetentionEndInput = {
  arrivedAt?: string | null;
  /** Stop depart: GPS geofence or typed. */
  departedAt?: string | null;
  /** Driver tapped Empty / Unloaded in the driver app. */
  emptiedAt?: string | null;
  /** Signed POD time on file for the load. */
  podAt?: string | null;
  /** First Orbcomm reefer running -> off for this trailer while at the stop. */
  reeferOffAt?: string | null;
  /** Desk choice after the HOS flag. Ignored when that source has no time. */
  deskPick?: string | null;
};

export type DetentionEndCandidate = { source: DetentionEndSource; at: string };

export type DetentionEnd = {
  endAt: string;
  source: DetentionEndSource | "";
  label: string;
  hosFlag: boolean;
  needsDeskPick: boolean;
  deskPicked: boolean;
  candidates: DetentionEndCandidate[];
};

const LABELS: Record<DetentionEndSource, string> = {
  driver_empty: "driver tapped Empty",
  pod: "signed POD",
  reefer_off: "reefer off (Orbcomm)",
  gps_depart: "GPS depart",
};

export function isDetentionEndSource(value: string | null | undefined): value is DetentionEndSource {
  return (DETENTION_END_SOURCES as readonly string[]).includes(String(value ?? ""));
}

export function detentionEndSourceLabel(source: string | null | undefined): string {
  return isDetentionEndSource(source) ? LABELS[source] : "";
}

function ms(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? at : null;
}

function iso(at: number): string {
  return new Date(at).toISOString();
}

/**
 * 1. Driver tapped Empty / Unloaded: that time.
 * 2. No tap: earliest of signed POD, reefer off at the stop, GPS depart.
 *    A POD or reefer-off more than 1 hour before the GPS depart raises the HOS flag,
 *    and the desk picks which time ends detention.
 * Times before arrival or after depart are not at the stop and are ignored.
 */
export function resolveDetentionEnd(input: DetentionEndInput): DetentionEnd {
  const arrived = ms(input.arrivedAt);
  const departed = ms(input.departedAt);
  const atStop = (at: number | null): at is number =>
    at != null && (arrived == null || at >= arrived) && (departed == null || at <= departed);

  const emptied = ms(input.emptiedAt);
  if (atStop(emptied)) {
    return {
      endAt: iso(emptied),
      source: "driver_empty",
      label: LABELS.driver_empty,
      hosFlag: false,
      needsDeskPick: false,
      deskPicked: false,
      candidates: [{ source: "driver_empty", at: iso(emptied) }],
    };
  }

  const candidates: DetentionEndCandidate[] = [];
  const pod = ms(input.podAt);
  const reefer = ms(input.reeferOffAt);
  if (atStop(pod)) candidates.push({ source: "pod", at: iso(pod) });
  if (atStop(reefer)) candidates.push({ source: "reefer_off", at: iso(reefer) });
  if (departed != null && (arrived == null || departed >= arrived)) candidates.push({ source: "gps_depart", at: iso(departed) });
  candidates.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || order(a.source) - order(b.source));

  if (!candidates.length) {
    return { endAt: "", source: "", label: "", hosFlag: false, needsDeskPick: false, deskPicked: false, candidates };
  }

  const hosFlag =
    departed != null &&
    candidates.some((item) => item.source !== "gps_depart" && departed - Date.parse(item.at) > DETENTION_HOS_GAP_MS);
  const picked = hosFlag && isDetentionEndSource(input.deskPick)
    ? candidates.find((item) => item.source === input.deskPick) ?? null
    : null;
  const chosen = picked ?? candidates[0];
  return {
    endAt: chosen.at,
    source: chosen.source,
    label: LABELS[chosen.source],
    hosFlag,
    needsDeskPick: hosFlag && !picked,
    deskPicked: Boolean(picked),
    candidates,
  };
}

function order(source: DetentionEndSource): number {
  return DETENTION_END_SOURCES.indexOf(source);
}
