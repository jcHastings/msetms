"use server";

import { revalidatePath } from "next/cache";
import { withRequestAuditActor } from "./audit";
import { requireLoadEditor } from "./dispatcher-session";
import { parseOptionalInt } from "./format";
import { redactStoredRateCon } from "./rate-con-redact";
import { getRateConRedaction, setRateConRedactionStatus } from "./rate-con-redact-store";

export type RedactionActionResult = { ok: true } | { ok: false; error: string };

function fail(error: unknown): RedactionActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Could not update the driver copy." };
}

export async function releaseRateConRedactionAction(formData: FormData): Promise<void> {
  const result = await releaseRateConRedaction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function releaseRateConRedaction(formData: FormData): Promise<RedactionActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const actor = await requireLoadEditor();
      const id = parseOptionalInt(formData.get("id"));
      if (!id) throw new Error("Driver copy is missing.");
      const row = setRateConRedactionStatus(id, "released", actor.name);
      revalidatePath(`/loads/${row.load_id}`);
      revalidatePath(`/driver/loads/${row.load_id}`);
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function keepRateConOfficeOnlyAction(formData: FormData): Promise<void> {
  const result = await keepRateConOfficeOnly(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function keepRateConOfficeOnly(formData: FormData): Promise<RedactionActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const id = parseOptionalInt(formData.get("id"));
      if (!id) throw new Error("Driver copy is missing.");
      const row = setRateConRedactionStatus(id, "office_only", "");
      revalidatePath(`/loads/${row.load_id}`);
      revalidatePath(`/driver/loads/${row.load_id}`);
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function rerunRateConRedactionAction(formData: FormData): Promise<void> {
  const result = await rerunRateConRedaction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function rerunRateConRedaction(formData: FormData): Promise<RedactionActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const id = parseOptionalInt(formData.get("id"));
      if (!id) throw new Error("Driver copy is missing.");
      const existing = getRateConRedaction(id);
      if (!existing) throw new Error("Driver copy is missing.");
      await redactStoredRateCon(existing.source_attachment_id);
      revalidatePath(`/loads/${existing.load_id}`);
      revalidatePath(`/driver/loads/${existing.load_id}`);
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });
}
