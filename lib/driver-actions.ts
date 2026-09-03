"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withRequestAuditActor } from "./audit";
import { parseOptionalInt } from "./format";
import { publicLoginFailureDetail, recordLoginAttemptFromRequest } from "./login-audit";
import { authenticateDriver, updateDriverProgress } from "./queries";
import { clearDriverSession, requireDriver, setDriverSession } from "./driver-session";
import { isDriverUploadKind } from "./driver-docs";
import { progressForStopEvent } from "./driver-stops";
import { getStop, listStops, stampStopTime } from "./stops";
import { ATTACHMENT_KINDS, isDriverProgress, type ActionResult, type AttachmentKind } from "./types";

function refresh(): void {
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function driverLoginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const driverId = parseOptionalInt(formData.get("driver_id"));
  try {
    const pin = String(formData.get("pin") ?? "").trim();
    if (!driverId || !pin) throw new Error("Pick your name and enter your PIN.");
    const driver = authenticateDriver(driverId, pin);
    await recordLoginAttemptFromRequest({
      kind: "driver",
      outcome: "success",
      step: "pin",
      userId: driver.id,
    });
    await setDriverSession(driver.id);
    refresh();
    redirect("/driver");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    await recordLoginAttemptFromRequest({
      kind: "driver",
      outcome: "failure",
      step: "pin",
      userId: driverId,
      detail: publicLoginFailureDetail(error),
    });
    return fail(error);
  }
}

export async function driverLogoutAction(): Promise<void> {
  await clearDriverSession();
  refresh();
  redirect("/driver/login");
}

export async function driverStopCheckAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const driver = await requireDriver();
      const loadId = parseOptionalInt(formData.get("load_id"));
      const stopId = parseOptionalInt(formData.get("stop_id"));
      const kind = String(formData.get("kind") ?? "");
      if (!loadId || !stopId) throw new Error("Stop is missing.");
      if (kind !== "arrive" && kind !== "depart") throw new Error("Pick Check In or Check Out.");
      const { getLoad, updateDriverProgress } = await import("./queries");
      const { driverAssignedToLoad } = await import("./relay-store");
      const load = getLoad(loadId);
      if (!load || !driverAssignedToLoad(load.id, driver.id, load.driver_id)) {
        throw new Error("This load is not on your dispatch.");
      }
      const stop = getStop(stopId);
      if (!stop || stop.load_id !== loadId) throw new Error("Stop is missing.");
      const stops = listStops(loadId);
      const pickup = stops.find((item) => item.kind === "pickup");
      if (stop.kind === "delivery" && kind === "arrive" && pickup && !pickup.departed_at.trim()) {
        throw new Error("Check out of pickup first.");
      }
      if (kind === "depart" && !stop.arrived_at.trim()) {
        throw new Error("Check in first.");
      }
      stampStopTime(stopId, kind === "arrive" ? "arrived_at" : "departed_at", new Date().toISOString());
      const { applyWorkflowAfterGeofence } = await import("./workflow");
      applyWorkflowAfterGeofence(loadId);
      updateDriverProgress(loadId, driver.id, progressForStopEvent(kind, stop.kind));
      refresh();
      return { ok: true, id: loadId };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function driverProgressAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const driver = await requireDriver();
      const loadId = parseOptionalInt(formData.get("load_id"));
      const progress = String(formData.get("progress") ?? "");
      if (!loadId) throw new Error("Load is missing.");
      if (!isDriverProgress(progress)) throw new Error("Pick a status.");
      updateDriverProgress(loadId, driver.id, progress);
      if (progress === "delivered") {
        const { maybeAutoInvoiceLoad } = await import("./auto-invoice");
        await maybeAutoInvoiceLoad(loadId);
      }
      refresh();
      return { ok: true, id: loadId };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function driverUploadAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
  try {
    const driver = await requireDriver();
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const { getLoad } = await import("./queries");
    const load = getLoad(loadId);
    const { driverAssignedToLoad } = await import("./relay-store");
    if (!load || !driverAssignedToLoad(load.id, driver.id, load.driver_id)) {
      throw new Error("This load is not on your dispatch.");
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Choose a photo or PDF.");
    }
    const kindRaw = String(formData.get("kind") ?? "").trim();
    if (!isDriverUploadKind(kindRaw) || !ATTACHMENT_KINDS.some((item) => item.value === kindRaw)) {
      throw new Error("Pick a document type.");
    }
    const kind = kindRaw;
    const { addAttachment, fileToBuffer } = await import("./files");
    const attachment = await addAttachment({
      loadId,
      kind: kind as AttachmentKind,
      originalName: file.name,
      buffer: await fileToBuffer(file),
      mimeType: file.type,
      uploadedBy: "driver",
    });
    if (kind === "pod") {
      const { maybeAutoInvoiceLoad } = await import("./auto-invoice");
      await maybeAutoInvoiceLoad(loadId);
    }
    if (kind === "fuel_receipt") {
      const { addFuelReceipt } = await import("./fuel-receipts");
      addFuelReceipt({
        loadId,
        driverId: driver.id,
        attachmentId: attachment.id,
        gallons: Number.parseFloat(String(formData.get("gallons") ?? "")) || null,
        state: String(formData.get("state") ?? "").trim(),
        station: String(formData.get("station") ?? "").trim(),
      });
    }
    refresh();
    return { ok: true, id: loadId };
  } catch (error) {
    return fail(error);
  }
  });
}

export async function driverClassifyAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const driver = await requireDriver();
      const attachmentId = parseOptionalInt(formData.get("attachment_id"));
      if (!attachmentId) throw new Error("File is missing.");
      const kind = String(formData.get("kind") ?? "");
      if (!isDriverUploadKind(kind)) {
        throw new Error("Pick a document type.");
      }
      const { getAttachment, updateAttachmentKind } = await import("./files");
      const file = getAttachment(attachmentId);
      if (!file) throw new Error("File is missing.");
      const { getLoad } = await import("./queries");
      const load = getLoad(file.load_id);
      const { driverAssignedToLoad } = await import("./relay-store");
      if (!load || !driverAssignedToLoad(load.id, driver.id, load.driver_id)) {
        throw new Error("This load is not on your dispatch.");
      }
      updateAttachmentKind(attachmentId, kind);
      if (kind === "pod") {
        const { maybeAutoInvoiceLoad } = await import("./auto-invoice");
        await maybeAutoInvoiceLoad(load.id);
      }
      if (kind === "fuel_receipt") {
        const { addFuelReceipt, listFuelReceipts } = await import("./fuel-receipts");
        const already = listFuelReceipts(load.id).some((row) => row.attachment_id === attachmentId);
        if (!already) {
          addFuelReceipt({
            loadId: load.id,
            driverId: driver.id,
            attachmentId,
          });
        }
      }
      refresh();
      return { ok: true, id: load.id };
    } catch (error) {
      return fail(error);
    }
  });
}
