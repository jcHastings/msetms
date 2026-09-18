import { SAMSARA_ID_MISSING_MESSAGE, SAMSARA_TOKEN_MISSING_MESSAGE } from "./fleet-import-shared";

/** Load document kind for a Samsara camera still. Shows on Load documents like POD. */
export const SAMSARA_STILL_KIND = "samsara_still" as const;

export const SAMSARA_STILL_SCOPES = "Write Media Retrieval + Read Media Retrieval" as const;

export type SamsaraStillFacing = "road" | "driver";

export type SamsaraStillFailureReason =
  | "token_missing"
  | "scopes_insufficient"
  | "vehicle_unmapped"
  | "offline"
  | "quota"
  | "no_media"
  | "timeout"
  | "request_failed";

export type SamsaraStillFailure = {
  ok: false;
  reason: SamsaraStillFailureReason;
  message: string;
  setupBlocker: boolean;
};

export type SamsaraStillStopTime = {
  key: string;
  label: string;
  iso: string;
};

export const SAMSARA_STILL_MESSAGES: Record<SamsaraStillFailureReason, string> = {
  token_missing: `${SAMSARA_TOKEN_MISSING_MESSAGE} Token needs ${SAMSARA_STILL_SCOPES}.`,
  scopes_insufficient: `Samsara rejected the token. Add ${SAMSARA_STILL_SCOPES}, then try again.`,
  vehicle_unmapped: SAMSARA_ID_MISSING_MESSAGE,
  offline: "Camera is offline or the still is still uploading. Try again when the truck is on.",
  quota: "Monthly Samsara media quota is used up. Try again next month.",
  no_media: "No still at that time.",
  timeout: "Samsara is still preparing the still. Try again in a minute.",
  request_failed: "Samsara still request failed. The load is unchanged.",
};

const SETUP_REASONS = new Set<SamsaraStillFailureReason>(["token_missing", "scopes_insufficient"]);

export function samsaraStillFailure(reason: SamsaraStillFailureReason): SamsaraStillFailure {
  return {
    ok: false,
    reason,
    message: SAMSARA_STILL_MESSAGES[reason],
    setupBlocker: SETUP_REASONS.has(reason),
  };
}

export function parseSamsaraStillFacing(value: string | null | undefined): SamsaraStillFacing {
  return value === "driver" ? "driver" : "road";
}

export function samsaraStillInput(facing: SamsaraStillFacing): "dashcamRoadFacing" | "dashcamDriverFacing" {
  return facing === "driver" ? "dashcamDriverFacing" : "dashcamRoadFacing";
}

export function samsaraVehicleIdForTruck(truck: { samsara_vehicle_id?: string | null } | null | undefined): string {
  return String(truck?.samsara_vehicle_id ?? "").trim();
}

export function classifySamsaraStillError(input: {
  status?: number;
  bodyText?: string;
  mediaStatus?: string;
}): SamsaraStillFailureReason {
  const text = String(input.bodyText ?? "").toLowerCase();
  const media = String(input.mediaStatus ?? "").toLowerCase();
  if (input.status === 401 || input.status === 403) return "scopes_insufficient";
  if (/quota|monthly media|usage limit/.test(text)) return "quota";
  if (/offline/.test(text) || media === "failed") return "offline";
  if (media === "unavailable" || media === "invalid") return "no_media";
  if (/no media|not found|no footage|no image|object not found/.test(text) || input.status === 404) {
    return "no_media";
  }
  if (input.status === 429) return "request_failed";
  return "request_failed";
}

export function stillFileName(input: {
  facing: SamsaraStillFacing;
  vehicleId: string;
  capturedAt: string;
}): string {
  const stamp = input.capturedAt.replace(/[:.]/g, "-");
  const vehicle = input.vehicleId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 32) || "vehicle";
  return `samsara-${input.facing}-${vehicle}-${stamp}.jpg`;
}

export function stillAuditValue(input: {
  facing: SamsaraStillFacing;
  vehicleId: string;
  capturedAt: string;
  retrievalId: string;
}): string {
  return `source=samsara;facing=${input.facing};vehicle=${input.vehicleId};time=${input.capturedAt};retrieval=${input.retrievalId}`;
}

export function stillStopTimes(
  stops: Array<{ id: number; kind: string; name: string; arrived_at: string; departed_at: string }>,
): SamsaraStillStopTime[] {
  const out: SamsaraStillStopTime[] = [];
  for (const stop of stops) {
    const place = stop.name.trim() || (stop.kind === "delivery" ? "Delivery" : "Pickup");
    if (stop.arrived_at.trim()) {
      out.push({
        key: `arrive:${stop.id}`,
        label: `Arrive · ${place}`,
        iso: stop.arrived_at.trim(),
      });
    }
    if (stop.departed_at.trim()) {
      out.push({
        key: `depart:${stop.id}`,
        label: `Depart · ${place}`,
        iso: stop.departed_at.trim(),
      });
    }
  }
  return out;
}

export function resolveStillCapturedAt(input: {
  timeChoice: string;
  customValue: string;
  stopTimes: SamsaraStillStopTime[];
  nowIso: string;
  fromOfficeDateTime: (value: string) => string;
}): { ok: true; capturedAt: string } | { ok: false; error: string } {
  const choice = input.timeChoice.trim() || "now";
  if (choice === "now") return { ok: true, capturedAt: input.nowIso };
  if (choice === "custom") {
    try {
      return { ok: true, capturedAt: input.fromOfficeDateTime(input.customValue) };
    } catch {
      return { ok: false, error: "Enter a date and time." };
    }
  }
  const match = input.stopTimes.find((item) => item.key === choice);
  if (!match) return { ok: false, error: "Pick a time for the still." };
  return { ok: true, capturedAt: match.iso };
}
