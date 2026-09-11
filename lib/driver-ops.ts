import { isDriverUploadKind } from "./driver-docs";
import { progressForStopEvent, type DriverStopActionKind } from "./driver-stops";
import { addAttachment, fileToBuffer, isPdfOrImage } from "./files";
import { getLoad, updateDriverProgress } from "./queries";
import { driverAssignedToLoad } from "./relay-store";
import { getStop, listStops, stampStopTime } from "./stops";
import {
  ATTACHMENT_KINDS,
  isDriverProgress,
  type Attachment,
  type AttachmentKind,
  type DriverProgress,
  type DriverWithTruck,
  type LoadView,
} from "./types";
import { applyWorkflowAfterGeofence } from "./workflow";

export type DriverOpsKind = "not_found" | "forbidden" | "conflict" | "validation";

export class DriverOpsError extends Error {
  readonly kind: DriverOpsKind;

  constructor(kind: DriverOpsKind, message: string) {
    super(message);
    this.name = "DriverOpsError";
    this.kind = kind;
  }
}

export function isStopCheckKind(value: string): value is DriverStopActionKind {
  return value === "arrive" || value === "depart";
}

export function requireAssignedLoad(
  loadId: number,
  driverId: number,
  options: { allowCancelled?: boolean } = {},
): LoadView {
  const load = getLoad(loadId);
  if (!load) throw new DriverOpsError("not_found", "Load not found.");
  if (!driverAssignedToLoad(load.id, driverId, load.driver_id)) {
    throw new DriverOpsError("forbidden", "This load is not on your dispatch.");
  }
  if (load.status === "cancelled" && !options.allowCancelled) {
    throw new DriverOpsError("conflict", "This load was cancelled.");
  }
  return load;
}

export function performDriverStopCheck(input: {
  driver: DriverWithTruck;
  loadId: number;
  stopId: number;
  kind: string;
}): { loadId: number } {
  if (!isStopCheckKind(input.kind)) {
    throw new DriverOpsError("conflict", "Pick Check In or Check Out.");
  }
  requireAssignedLoad(input.loadId, input.driver.id);
  const stop = getStop(input.stopId);
  if (!stop || stop.load_id !== input.loadId) {
    throw new DriverOpsError("not_found", "Stop is missing.");
  }
  const stops = listStops(input.loadId);
  const pickup = stops.find((item) => item.kind === "pickup");
  if (input.kind === "arrive" && stop.kind === "delivery" && pickup && !pickup.departed_at.trim()) {
    throw new DriverOpsError("conflict", "Check out of pickup first.");
  }
  if (input.kind === "depart" && !stop.arrived_at.trim()) {
    throw new DriverOpsError("conflict", "Check in first.");
  }
  stampStopTime(input.stopId, input.kind === "arrive" ? "arrived_at" : "departed_at", new Date().toISOString());
  applyWorkflowAfterGeofence(input.loadId);
  updateDriverProgress(input.loadId, input.driver.id, progressForStopEvent(input.kind, stop.kind));
  return { loadId: input.loadId };
}

export async function performDriverProgress(input: {
  driver: DriverWithTruck;
  loadId: number;
  progress: string;
}): Promise<{ loadId: number }> {
  if (!isDriverProgress(input.progress)) {
    throw new DriverOpsError("conflict", "Pick a status.");
  }
  requireAssignedLoad(input.loadId, input.driver.id);
  updateDriverProgress(input.loadId, input.driver.id, input.progress);
  if (input.progress === "delivered") {
    const { maybeAutoInvoiceLoad } = await import("./auto-invoice");
    await maybeAutoInvoiceLoad(input.loadId);
  }
  return { loadId: input.loadId };
}

export async function performDriverUpload(input: {
  driver: DriverWithTruck;
  loadId: number;
  kind: string;
  file: File;
  fuel?: { gallons?: number | null; state?: string; station?: string };
}): Promise<{ loadId: number; attachment: Attachment }> {
  requireAssignedLoad(input.loadId, input.driver.id);
  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new DriverOpsError("conflict", "Choose a photo or PDF.");
  }
  if (!isPdfOrImage(input.file)) {
    throw new DriverOpsError("conflict", "Choose a photo or PDF.");
  }
  const kindRaw = String(input.kind ?? "").trim();
  if (!isDriverUploadKind(kindRaw) || !ATTACHMENT_KINDS.some((item) => item.value === kindRaw)) {
    throw new DriverOpsError("conflict", "Pick a document type.");
  }
  const kind = kindRaw as AttachmentKind;
  const attachment = addAttachment({
    loadId: input.loadId,
    kind,
    originalName: input.file.name,
    buffer: await fileToBuffer(input.file),
    mimeType: input.file.type,
    uploadedBy: "driver",
  });
  if (kind === "pod") {
    const { maybeAutoInvoiceLoad } = await import("./auto-invoice");
    await maybeAutoInvoiceLoad(input.loadId);
  }
  if (kind === "fuel_receipt") {
    const { addFuelReceipt } = await import("./fuel-receipts");
    addFuelReceipt({
      loadId: input.loadId,
      driverId: input.driver.id,
      attachmentId: attachment.id,
      gallons: input.fuel?.gallons ?? null,
      state: input.fuel?.state ?? "",
      station: input.fuel?.station ?? "",
    });
  }
  return { loadId: input.loadId, attachment };
}

export function assertDriverProgress(value: string): DriverProgress {
  if (!isDriverProgress(value)) {
    throw new DriverOpsError("conflict", "Pick a status.");
  }
  return value;
}
