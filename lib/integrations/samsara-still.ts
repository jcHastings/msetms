import { recordLoadAudit } from "../audit";
import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import { addAttachment } from "../files";
import { fromOfficeDateTime } from "../format";
import { getLoad, getTruck, listLoads } from "../queries";
import {
  classifySamsaraStillError,
  isSamsaraSignedMediaUrl,
  parseSamsaraStillFacing,
  resolveStillCapturedAt,
  SAMSARA_STILL_KIND,
  SAMSARA_STILL_MAX_BYTES,
  samsaraStillFailure,
  samsaraStillInput,
  samsaraVehicleIdForTruck,
  stillAuditValue,
  stillFileName,
  stillStopTimes,
  type SamsaraStillFacing,
  type SamsaraStillFailure,
  type SamsaraStillStopTime,
} from "../samsara-still-shared";
import { listStops } from "../stops";
import type { Attachment, LoadView } from "../types";

const SAMSARA_BASE = "https://api.samsara.com";
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_ATTEMPTS = 12;
const DEFAULT_POLL_MS = 1_200;

let pollAttempts = DEFAULT_POLL_ATTEMPTS;
let pollMs = DEFAULT_POLL_MS;

export function setSamsaraStillPollForTests(input: { attempts?: number; ms?: number } | null): void {
  pollAttempts = input?.attempts ?? DEFAULT_POLL_ATTEMPTS;
  pollMs = input?.ms ?? DEFAULT_POLL_MS;
}

export type SamsaraStillPanel = {
  tokenSet: boolean;
  vehicleId: string;
  canFetch: boolean;
  setupMessage: string;
  stopTimes: SamsaraStillStopTime[];
};

export type SamsaraStillSuccess = {
  ok: true;
  attachment: Attachment;
  facing: SamsaraStillFacing;
  vehicleId: string;
  capturedAt: string;
  retrievalId: string;
};

export type SamsaraStillResult = SamsaraStillSuccess | SamsaraStillFailure;

export function getSamsaraStillPanel(load: LoadView): SamsaraStillPanel {
  const tokenSet = isSamsaraTokenSet();
  const truck = load.truck_id ? getTruck(load.truck_id) : null;
  const vehicleId = samsaraVehicleIdForTruck(truck) || String(load.truck_samsara_id ?? "").trim();
  const stopTimes = stillStopTimes(listStops(load.id));
  if (!tokenSet) {
    return {
      tokenSet: false,
      vehicleId,
      canFetch: false,
      setupMessage: samsaraStillFailure("token_missing").message,
      stopTimes,
    };
  }
  if (!load.truck_id) {
    return {
      tokenSet: true,
      vehicleId,
      canFetch: false,
      setupMessage: "Assign a truck, then fetch the still.",
      stopTimes,
    };
  }
  if (!vehicleId) {
    return {
      tokenSet: true,
      vehicleId: "",
      canFetch: false,
      setupMessage: samsaraStillFailure("vehicle_unmapped").message,
      stopTimes,
    };
  }
  return { tokenSet: true, vehicleId, canFetch: true, setupMessage: "", stopTimes };
}

export function loadsForSamsaraStill(truckId: number): LoadView[] {
  return listLoads({ status: "all" }).filter(
    (load) => load.truck_id === truckId && load.status !== "cancelled",
  );
}

export async function fetchSamsaraStillForLoad(input: {
  loadId: number;
  timeChoice: string;
  customValue: string;
  facing: string;
}): Promise<SamsaraStillResult> {
  await loadRuntimeEnv();
  const load = getLoad(input.loadId);
  if (!load) return { ...samsaraStillFailure("request_failed"), message: "Load not found." };
  const panel = getSamsaraStillPanel(load);
  if (!panel.canFetch) {
    if (!panel.tokenSet) return samsaraStillFailure("token_missing");
    if (!panel.vehicleId) return samsaraStillFailure("vehicle_unmapped");
    return { ...samsaraStillFailure("request_failed"), message: panel.setupMessage };
  }
  const when = resolveStillCapturedAt({
    timeChoice: input.timeChoice,
    customValue: input.customValue,
    stopTimes: panel.stopTimes,
    nowIso: new Date().toISOString(),
    fromOfficeDateTime,
  });
  if (!when.ok) return { ...samsaraStillFailure("request_failed"), message: when.error };
  const facing = parseSamsaraStillFacing(input.facing);
  const retrieved = await retrieveSamsaraStill({
    vehicleId: panel.vehicleId,
    capturedAt: when.capturedAt,
    facing,
  });
  if (!retrieved.ok) return retrieved;
  const attachment = addAttachment({
    loadId: load.id,
    kind: SAMSARA_STILL_KIND,
    originalName: retrieved.fileName,
    buffer: retrieved.buffer,
    mimeType: retrieved.mimeType,
    uploadedBy: "samsara",
  });
  recordLoadAudit({
    loadId: load.id,
    action: "attachment",
    field: SAMSARA_STILL_KIND,
    newValue: stillAuditValue({
      facing,
      vehicleId: retrieved.vehicleId,
      capturedAt: retrieved.capturedAt,
      retrievalId: retrieved.retrievalId,
    }),
  });
  return {
    ok: true,
    attachment,
    facing,
    vehicleId: retrieved.vehicleId,
    capturedAt: retrieved.capturedAt,
    retrievalId: retrieved.retrievalId,
  };
}

type RetrievedStill = {
  ok: true;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  facing: SamsaraStillFacing;
  vehicleId: string;
  capturedAt: string;
  retrievalId: string;
};

export async function retrieveSamsaraStill(input: {
  vehicleId: string;
  capturedAt: string;
  facing: SamsaraStillFacing;
}): Promise<RetrievedStill | SamsaraStillFailure> {
  const token = getSamsaraApiToken();
  if (!token) return samsaraStillFailure("token_missing");
  const vehicleId = input.vehicleId.trim();
  if (!vehicleId) return samsaraStillFailure("vehicle_unmapped");
  const capturedAt = input.capturedAt;
  const created = await samsaraJson<{
    data?: { retrievalId?: string; quotaStatus?: string };
    message?: string;
  }>("/cameras/media/retrieval", {
    method: "POST",
    body: JSON.stringify({
      vehicleId,
      startTime: capturedAt,
      endTime: capturedAt,
      mediaType: "image",
      inputs: [samsaraStillInput(input.facing)],
    }),
  });
  if (!created.ok) return created.failure;
  const retrievalId = String(created.body.data?.retrievalId ?? "").trim();
  if (!retrievalId) return samsaraStillFailure("request_failed");

  const media = await pollRetrieval(retrievalId);
  if (!media.ok) return media;
  const image = await downloadStill(media.url);
  if (!image.ok) return image;
  return {
    ok: true,
    buffer: image.buffer,
    mimeType: image.mimeType,
    fileName: stillFileName({ facing: input.facing, vehicleId: media.vehicleId || vehicleId, capturedAt }),
    facing: input.facing,
    vehicleId: media.vehicleId || vehicleId,
    capturedAt,
    retrievalId,
  };
}

async function pollRetrieval(
  retrievalId: string,
): Promise<{ ok: true; url: string; vehicleId: string } | SamsaraStillFailure> {
  let lastStatus = "";
  let lastBody = "";
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const url = `/cameras/media/retrieval?retrievalId=${encodeURIComponent(retrievalId)}`;
    const polled = await samsaraJson<{
      data?: {
        media?: Array<{
          status?: string;
          urlInfo?: { url?: string };
          vehicleId?: string;
        }>;
      };
      message?: string;
    }>(url, { method: "GET" });
    if (!polled.ok) return polled.failure;
    const item = polled.body.data?.media?.[0];
    lastStatus = String(item?.status ?? "");
    lastBody = String(polled.body.message ?? "");
    if (lastStatus === "available") {
      const signed = String(item?.urlInfo?.url ?? "").trim();
      if (!signed) return samsaraStillFailure("no_media");
      return { ok: true, url: signed, vehicleId: String(item?.vehicleId ?? "") };
    }
    if (lastStatus === "pending" || !lastStatus) {
      if (attempt < pollAttempts - 1) await sleep(pollMs);
      continue;
    }
    return samsaraStillFailure(classifySamsaraStillError({ mediaStatus: lastStatus, bodyText: lastBody }));
  }
  if (lastStatus === "pending") return samsaraStillFailure("offline");
  return samsaraStillFailure(classifySamsaraStillError({ mediaStatus: lastStatus, bodyText: lastBody }));
}

const MAX_STILL_REDIRECTS = 3;

export async function downloadStill(
  url: string,
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | SamsaraStillFailure> {
  return downloadStillAt(url, 0);
}

async function downloadStillAt(
  url: string,
  hops: number,
): Promise<{ ok: true; buffer: Buffer; mimeType: string } | SamsaraStillFailure> {
  if (!isSamsaraSignedMediaUrl(url)) return samsaraStillFailure("host_rejected");
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hops >= MAX_STILL_REDIRECTS) return samsaraStillFailure("request_failed");
      let next: string;
      try {
        next = new URL(location, url).toString();
      } catch {
        return samsaraStillFailure("host_rejected");
      }
      if (!isSamsaraSignedMediaUrl(next)) return samsaraStillFailure("host_rejected");
      return downloadStillAt(next, hops + 1);
    }
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return samsaraStillFailure(classifySamsaraStillError({ status: response.status, bodyText }));
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > SAMSARA_STILL_MAX_BYTES) {
      return samsaraStillFailure("oversize");
    }
    const buffer = await readStillBody(response);
    if (buffer === "oversize") return samsaraStillFailure("oversize");
    if (!buffer.length) return samsaraStillFailure("no_media");
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    return { ok: true, buffer, mimeType };
  } catch (error) {
    if (error instanceof Error && /abort|timeout/i.test(error.message)) {
      return samsaraStillFailure("timeout");
    }
    return samsaraStillFailure("request_failed");
  }
}

async function readStillBody(response: Response): Promise<Buffer | "oversize"> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > SAMSARA_STILL_MAX_BYTES ? "oversize" : buffer;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > SAMSARA_STILL_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return "oversize";
    }
    chunks.push(Buffer.from(value));
  }
  return total ? Buffer.concat(chunks, total) : Buffer.alloc(0);
}

async function samsaraJson<T>(
  pathname: string,
  init: RequestInit,
): Promise<{ ok: true; body: T } | { ok: false; failure: SamsaraStillFailure }> {
  const token = getSamsaraApiToken();
  if (!token) return { ok: false, failure: samsaraStillFailure("token_missing") };
  try {
    const response = await fetch(`${SAMSARA_BASE}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        failure: samsaraStillFailure(classifySamsaraStillError({ status: response.status, bodyText })),
      };
    }
    return { ok: true, body: (bodyText ? JSON.parse(bodyText) : {}) as T };
  } catch (error) {
    if (error instanceof Error && /abort|timeout/i.test(error.message)) {
      return { ok: false, failure: samsaraStillFailure("timeout") };
    }
    return { ok: false, failure: samsaraStillFailure("request_failed") };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
