"use server";

import { revalidatePath } from "next/cache";
import { addCompanyDocument, retireCompanyDocument } from "./company-docs";
import { companyDocSlot } from "./company-docs-shared";
import { requireCapability } from "./dispatcher-session";
import { fileToBuffer } from "./files";
import { canEditFleet } from "./settings-shared";
import type { ActionResult } from "./types";

const MAX_BYTES = 20 * 1024 * 1024;

function refresh(): void {
  try {
    revalidatePath("/compliance/company-docs");
    revalidatePath("/compliance");
    revalidatePath("/desk");
  } catch {
    // Tests and scripts have no Next.js request cache.
  }
}

function positiveInt(value: FormDataEntryValue | null): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Office only (Administrator and Standard). Viewers and drivers cannot upload. */
export async function uploadCompanyDocAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const dispatcher = await requireCapability(canEditFleet, "Company docs are for Administrator and Standard.");
    const slot = companyDocSlot(String(formData.get("slot") ?? ""));
    if (!slot) throw new Error("Pick a company document slot.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
    if (file.size > MAX_BYTES) throw new Error("Files must be 20 MB or smaller.");
    const unitRaw = String(formData.get("unit") ?? "");
    const [unitType, unitIdRaw] = unitRaw.includes(":") ? unitRaw.split(":") : ["", ""];
    const doc = addCompanyDocument({
      slot: slot.value,
      originalName: file.name,
      buffer: await fileToBuffer(file),
      mimeType: file.type,
      expiresOn: String(formData.get("expires_on") ?? ""),
      unitType: unitType === "truck" || unitType === "trailer" ? unitType : "",
      unitId: positiveInt(unitIdRaw),
      replacesId: positiveInt(formData.get("replaces_id")),
      uploadedBy: dispatcher.name || dispatcher.email || "office",
    });
    refresh();
    return { ok: true, id: doc.id, message: `${slot.label} saved. Drivers get this file from Assist.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function retireCompanyDocAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const dispatcher = await requireCapability(canEditFleet, "Company docs are for Administrator and Standard.");
    const id = positiveInt(formData.get("id"));
    if (!id) throw new Error("That file is no longer current.");
    retireCompanyDocument(id, dispatcher.name || dispatcher.email || "office");
    refresh();
    return { ok: true, id, message: "Removed from the current set. It stays in history." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
