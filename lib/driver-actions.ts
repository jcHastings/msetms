"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withRequestAuditActor } from "./audit";
import { parseOptionalInt } from "./format";
import { authenticateDriver, updateDriverProgress } from "./queries";
import { clearDriverSession, requireDriver, setDriverSession } from "./driver-session";
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
  try {
    const driverId = parseOptionalInt(formData.get("driver_id"));
    const pin = String(formData.get("pin") ?? "").trim();
    if (!driverId || !pin) throw new Error("Pick your name and enter your PIN.");
    const driver = authenticateDriver(driverId, pin);
    await setDriverSession(driver.id);
    refresh();
    redirect("/driver");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function driverLogoutAction(): Promise<void> {
  await clearDriverSession();
  refresh();
  redirect("/driver/login");
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
    const kind = String(formData.get("kind") ?? "other");
    if (!ATTACHMENT_KINDS.some((item) => item.value === kind)) {
      throw new Error("Pick a document type.");
    }
    const { addAttachment, fileToBuffer } = await import("./files");
    const attachment = await addAttachment({
      loadId,
      kind: kind as AttachmentKind,
      originalName: file.name,
      buffer: await fileToBuffer(file),
      mimeType: file.type,
      uploadedBy: "driver",
    });
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
