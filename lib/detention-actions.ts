"use server";

import { revalidatePath } from "next/cache";
import { currentAuditActor, withRequestAuditActor } from "./audit";
import {
  addDetentionLine,
  buildDetentionDraft,
  setDetentionEndPick,
  saveDetentionSettings,
  sendDetentionRequest,
  setDetentionStatus,
} from "./detention-store";
import { dismissDetentionNotice, sendDetentionNotice } from "./detention-notice-store";
import type { DetentionDraftView } from "./detention-request";
import { sendMail } from "./integrations/mail";
import { requireLoadEditor } from "./dispatcher-session";
import { parseOptionalFloat, parseOptionalInt } from "./format";
import type { ActionResult } from "./types";

export type DetentionActionResult = { ok: true; warning?: string; requestId?: number } | { ok: false; error: string };

function fail(error: unknown): DetentionActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Could not update detention." };
}

function refresh(loadId: number) {
  revalidatePath(`/loads/${loadId}`);
  revalidatePath("/");
  revalidatePath("/desk");
}

export async function loadDetentionDraftAction(
  loadId: number,
  stopId: number,
): Promise<{ ok: true; draft: DetentionDraftView } | { ok: false; error: string }> {
  try {
    await requireLoadEditor();
    const draft = await buildDetentionDraft(loadId, stopId);
    return { ok: true, draft };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update detention." };
  }
}

export async function sendDetentionRequestAction(formData: FormData): Promise<DetentionActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      const stopId = parseOptionalInt(formData.get("stop_id"));
      if (!loadId || !stopId) throw new Error("Load or stop is missing.");
      const attachmentIds = formData
        .getAll("attachment_id")
        .map((value) => Number(value))
        .filter((id) => Number.isFinite(id) && id > 0);
      const actor = currentAuditActor().name;
      const sent = await sendDetentionRequest({
        loadId,
        stopId,
        to: String(formData.get("to") ?? ""),
        cc: String(formData.get("cc") ?? ""),
        subject: String(formData.get("subject") ?? ""),
        body: String(formData.get("body") ?? ""),
        attachmentIds,
        actor,
        send: sendMail,
      });
      refresh(loadId);
      return { ok: true, requestId: sent.id };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function setDetentionStatusAction(formData: FormData): Promise<DetentionActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const requestId = parseOptionalInt(formData.get("request_id"));
      const loadId = parseOptionalInt(formData.get("load_id"));
      const status = String(formData.get("status") ?? "");
      if (!requestId || !loadId) throw new Error("Detention request is missing.");
      if (status !== "approved" && status !== "denied" && status !== "paid") {
        throw new Error("Pick approved, denied, or paid.");
      }
      const rateText = String(formData.get("rate") ?? "").trim();
      const amountText = String(formData.get("amount") ?? "").trim();
      const rate = rateText ? parseOptionalFloat(rateText) : undefined;
      const amount = amountText ? parseOptionalFloat(amountText) : undefined;
      if (status === "approved" && rateText && (rate == null || rate <= 0)) {
        throw new Error("Enter the detention rate from the rate confirmation.");
      }
      if (status === "approved" && amountText && (amount == null || amount <= 0)) {
        throw new Error("Enter the detention amount.");
      }
      setDetentionStatus({
        requestId,
        status,
        actor: currentAuditActor().name,
        rate,
        amount,
        note: String(formData.get("note") ?? ""),
      });
      refresh(loadId);
      return { ok: true, requestId };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function addDetentionLineAction(formData: FormData): Promise<DetentionActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const requestId = parseOptionalInt(formData.get("request_id"));
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!requestId || !loadId) throw new Error("Detention request is missing.");
      const added = addDetentionLine({ requestId, actor: currentAuditActor().name });
      refresh(loadId);
      return { ok: true, requestId, warning: added.warning };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function saveDetentionSettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { requireSettingsEditor } = await import("./dispatcher-session");
    await requireSettingsEditor();
    saveDetentionSettings({
      replyTo: String(formData.get("detention_reply_to") ?? ""),
      pickupsEnabled: String(formData.get("detention_pickups") ?? "") === "1",
    });
    revalidatePath("/settings/loads");
    return { ok: true, message: "Detention settings saved." };
  } catch (error) {
    return fail(error);
  }
}

export type DetentionNoticeActionResult = { ok: true; message: string } | { ok: false; error: string } | null;

/** Desk taps Approve (send the notice) or Dismiss. Never runs on its own. */
export async function detentionNoticeAction(
  _prev: DetentionNoticeActionResult,
  formData: FormData,
): Promise<DetentionNoticeActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      const stopId = parseOptionalInt(formData.get("stop_id"));
      const decision = String(formData.get("decision") ?? "");
      if (!loadId || !stopId) throw new Error("Load or stop is missing.");
      const actor = currentAuditActor().name;
      if (decision === "approve") {
        const row = await sendDetentionNotice({ loadId, stopId, actor, send: sendMail });
        refresh(loadId);
        return { ok: true, message: `Notice sent to ${row.toEmail}.` };
      }
      if (decision === "dismiss") {
        dismissDetentionNotice({ loadId, stopId, actor });
        refresh(loadId);
        return { ok: true, message: "Dismissed. Nothing was sent." };
      }
      throw new Error("Pick Approve or Dismiss.");
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not update the notice." };
    }
  });
}

export async function setDetentionEndPickAction(formData: FormData): Promise<DetentionActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      const stopId = parseOptionalInt(formData.get("stop_id"));
      if (!loadId || !stopId) throw new Error("Load or stop is missing.");
      setDetentionEndPick({ loadId, stopId, source: String(formData.get("source") ?? "") });
      refresh(loadId);
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });
}

