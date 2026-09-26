import { SAMSARA_ID_MISSING_MESSAGE, SAMSARA_TOKEN_MISSING_MESSAGE } from "./fleet-import-shared";
import { formatDateTime } from "./format";

/** Maintenance scope for GET /defects/stream. */
export const SAMSARA_DVIR_SCOPE = "Read Defects";

/**
 * GET /defects/stream requires startTime and reads history by updatedAtTime.
 * Floor is the start of the public stream examples (2020-01-01), not a rolling cutoff.
 */
export const DVIR_STREAM_PATH = "/defects/stream";
export const DVIR_STREAM_START = "2020-01-01T00:00:00.000Z";
export const DVIR_STREAM_PAGE_LIMIT = 200;
export const DVIR_STREAM_MAX_PAGES = 3;

export const DVIR_ADVISORY = "Advisory. Does not put the unit out of service.";

export type DvirSafetyStatus = "safe" | "unsafe" | "";

export type OpenDvirDefect = {
  id: string;
  dvirId: string;
  vehicleId: string;
  createdAtTime: string;
  updatedAtTime: string;
  safetyStatus: DvirSafetyStatus;
  comment: string;
};

export type OpenDvirSoftReason =
  | "token_missing"
  | "token_rejected"
  | "scopes_insufficient"
  | "vehicle_unmapped"
  | "rate_limited"
  | "timeout"
  | "request_failed";

export type OpenDvirCard =
  | {
      ok: true;
      defects: OpenDvirDefect[];
      truncated: boolean;
      historySince: string;
    }
  | {
      ok: false;
      reason: OpenDvirSoftReason;
      message: string;
    };

export const DVIR_SOFT_MESSAGES: Record<OpenDvirSoftReason, string> = {
  token_missing: `${SAMSARA_TOKEN_MISSING_MESSAGE} Token needs ${SAMSARA_DVIR_SCOPE}.`,
  token_rejected: "Samsara rejected the API token (HTTP 401). Unit status is unchanged.",
  scopes_insufficient: `Samsara token is missing ${SAMSARA_DVIR_SCOPE}.`,
  vehicle_unmapped: SAMSARA_ID_MISSING_MESSAGE,
  rate_limited: "Samsara rate-limited the request. Try again in a minute.",
  timeout: "Samsara request timed out. Unit status is unchanged.",
  request_failed: "Open DVIR defects did not load. Unit status is unchanged.",
};

export function dvirSoftFail(reason: OpenDvirSoftReason): OpenDvirCard {
  return { ok: false, reason, message: DVIR_SOFT_MESSAGES[reason] };
}

export function openDvirStreamParams(now: Date): {
  startTime: string;
  endTime: string;
  isResolved: "false";
  limit: string;
} {
  return {
    startTime: DVIR_STREAM_START,
    endTime: now.toISOString(),
    isResolved: "false",
    limit: String(DVIR_STREAM_PAGE_LIMIT),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safetyStatus(value: unknown): DvirSafetyStatus {
  if (value === "safe" || value === "unsafe") return value;
  return "";
}

/** Keep unresolved vehicle defects. Drop resolved rows, trailer-only rows, and rows with no id. */
export function parseOpenDvirDefects(items: unknown[]): OpenDvirDefect[] {
  const defects: OpenDvirDefect[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.isResolved !== false) continue;
    const id = text(row.id);
    if (!id) continue;
    const vehicle = row.vehicle;
    const vehicleId =
      vehicle && typeof vehicle === "object" ? text((vehicle as { id?: unknown }).id) : "";
    if (!vehicleId) continue;
    defects.push({
      id,
      dvirId: text(row.dvirId),
      vehicleId,
      createdAtTime: text(row.createdAtTime),
      updatedAtTime: text(row.updatedAtTime),
      safetyStatus: safetyStatus(row.defectSafetyStatus),
      comment: text(row.comment),
    });
  }
  return defects;
}

export function openDvirDefectsForVehicle(defects: OpenDvirDefect[], vehicleId: string): OpenDvirDefect[] {
  const id = vehicleId.trim();
  if (!id) return [];
  return defects
    .filter((defect) => defect.vehicleId === id)
    .sort((a, b) => {
      const unsafe = Number(b.safetyStatus === "unsafe") - Number(a.safetyStatus === "unsafe");
      if (unsafe) return unsafe;
      const aTime = a.createdAtTime || a.updatedAtTime;
      const bTime = b.createdAtTime || b.updatedAtTime;
      if (aTime !== bTime) return aTime < bTime ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function dvirSafetyLabel(status: DvirSafetyStatus): string {
  if (status === "unsafe") return "Unsafe";
  if (status === "safe") return "Safe";
  return "No safety class";
}

function shownTime(iso: string): string {
  if (!iso) return "";
  const formatted = formatDateTime(iso);
  if (!formatted || formatted === formatDateTime("")) return "";
  return formatted;
}

export function openDvirTimeLabel(defect: OpenDvirDefect): string {
  const created = shownTime(defect.createdAtTime);
  if (created) return `Created ${created}`;
  const updated = shownTime(defect.updatedAtTime);
  if (updated) return `Updated ${updated}`;
  return "Time not on defect";
}

export type OpenDvirDefectLine = {
  id: string;
  time: string;
  safety: string;
  status: "Open";
  dvirId: string;
  comment: string;
};

export function openDvirDefectLine(defect: OpenDvirDefect): OpenDvirDefectLine {
  return {
    id: defect.id,
    time: openDvirTimeLabel(defect),
    safety: dvirSafetyLabel(defect.safetyStatus),
    status: "Open",
    dvirId: defect.dvirId,
    comment: defect.comment,
  };
}
