"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordLoadAudit, withRequestAuditActor } from "./audit";
import { fromInputDateTime, parseOptionalFloat, parseOptionalInt, requiredString } from "./format";
import {
  authenticateDispatcher,
  clearDispatcherSession,
  getPendingTwoFactorDispatcherId,
  requireCapability,
  requireLoadAssigner,
  requireLoadEditor,
  setDispatcherSession,
  setPendingTwoFactor,
} from "./dispatcher-session";
import {
  canAccessAccounting,
  canLogCheckCall,
  canSendSms,
} from "./settings-shared";
import { consumeRecoveryCode, isDispatcherTotpEnrolled, verifyDispatcherTotp } from "./dispatcher-totp";
import {
  assignLoadDispatcher,
  cloneLoad,
  getLoad,
  markInvoicePaid,
  setLoadDocsRequested,
  setLoadReadyToInvoice,
  setLoadWatched,
  updateLoadDetails,
} from "./queries";
import { createBill, markBillPaid, markSettlementPaid } from "./accounting";
import { createClaim, setExceptionState, setHandoffNote, writeAudit } from "./desk";
import { addRelay, deleteRelay, moveRelay, updateRelay } from "./relay-store";
import { addStop, deleteStop, moveStop } from "./stops";
import { createLoadFromTemplate, saveTemplateFromLoad } from "./templates";
import { isBillableStatus, type ActionResult } from "./types";

function refresh(): void {
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function dispatcherLoginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const totp = String(formData.get("totp") ?? "").trim();
    const recoveryCode = String(formData.get("recovery_code") ?? "").trim();
    if (totp || recoveryCode) {
      const pendingId = await getPendingTwoFactorDispatcherId();
      if (!pendingId) throw new Error("PIN step expired. Sign in again.");
      if (!isDispatcherTotpEnrolled(pendingId)) throw new Error("2-step is not on for this user.");
      if (totp) {
        if (!verifyDispatcherTotp(pendingId, totp)) {
          throw new Error("That authenticator code is not valid.");
        }
      } else {
        consumeRecoveryCode(pendingId, recoveryCode);
      }
      await setDispatcherSession(pendingId);
      refresh();
      redirect("/");
    }

    const dispatcherId = parseOptionalInt(formData.get("dispatcher_id"));
    const pin = String(formData.get("pin") ?? "").trim();
    if (!dispatcherId || !pin) throw new Error("Pick your name and enter your PIN.");
    const dispatcher = authenticateDispatcher(dispatcherId, pin);
    if (isDispatcherTotpEnrolled(dispatcher.id)) {
      await setPendingTwoFactor(dispatcher.id);
      return {
        ok: true,
        needsTotp: true,
        message: "Enter the 6-digit code from your authenticator app.",
      };
    }
    await setDispatcherSession(dispatcher.id);
    refresh();
    redirect("/");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function dispatcherLogoutAction(): Promise<void> {
  await clearDispatcherSession();
  refresh();
  redirect("/login");
}

export async function cloneLoadAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("load_id"));
    if (!id) throw new Error("Load is missing.");
    const cloned = cloneLoad(id);
    writeAudit("clone", "load", cloned, `from ${id}`);
    refresh();
    redirect(`/loads/${cloned}`);
  });
}

export async function saveTemplateAction(formData: FormData): Promise<void> {
  await requireLoadEditor();
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  const name = String(formData.get("name") ?? "").trim();
  saveTemplateFromLoad(id, name);
  refresh();
}

export async function createFromTemplateAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("template_id"));
    if (!id) throw new Error("Template is missing.");
    const loadId = createLoadFromTemplate(id);
    refresh();
    redirect(`/loads/${loadId}`);
  });
}

export async function watchLoadAction(formData: FormData): Promise<void> {
  await requireLoadEditor();
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  setLoadWatched(id, String(formData.get("watched") ?? "") === "1");
  refresh();
}

export async function saveLoadDetailsAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("load_id"));
    if (!id) throw new Error("Load is missing.");
    updateLoadDetails(id, {
      status_reason: String(formData.get("status_reason") ?? ""),
      cancel_reason: String(formData.get("cancel_reason") ?? ""),
      cover_by: String(formData.get("cover_by") ?? ""),
      equipment: String(formData.get("equipment") ?? ""),
      hazmat: String(formData.get("hazmat") ?? "") === "1",
      commodity_class: String(formData.get("commodity_class") ?? ""),
      seal_numbers: String(formData.get("seal_numbers") ?? ""),
      pallet_count: parseOptionalInt(formData.get("pallet_count")),
      case_count: parseOptionalInt(formData.get("case_count")),
      team: String(formData.get("team") ?? "") === "1",
      lumper_expected: parseOptionalFloat(formData.get("lumper_expected")),
      lumper_actual: parseOptionalFloat(formData.get("lumper_actual")),
      detention_started_at: String(formData.get("detention_started_at") ?? ""),
      detention_ended_at: String(formData.get("detention_ended_at") ?? ""),
      appointment_confirmation: String(formData.get("appointment_confirmation") ?? ""),
      unload_type: String(formData.get("unload_type") ?? ""),
    });
    refresh();
  });
}

function parseRelayForm(formData: FormData) {
  return {
    pickup: requiredString(formData.get("pickup"), "Relay pickup"),
    delivery: requiredString(formData.get("delivery"), "Relay delivery"),
    driver_id: parseOptionalInt(formData.get("driver_id")),
    truck_id: parseOptionalInt(formData.get("truck_id")),
    trailer_id: parseOptionalInt(formData.get("trailer_id")),
    oo_percent: parseOptionalFloat(formData.get("oo_percent")),
    oo_pay: parseOptionalFloat(formData.get("oo_pay")),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function addRelayAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    addRelay(loadId, parseRelayForm(formData));
    refresh();
  });
}

export async function updateRelayAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("relay_id"));
    if (!id) throw new Error("Relay is missing.");
    updateRelay(id, parseRelayForm(formData));
    refresh();
  });
}

export async function deleteRelayAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("relay_id"));
    if (!id) throw new Error("Relay is missing.");
    deleteRelay(id);
    refresh();
  });
}

export async function moveRelayAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("relay_id"));
    const direction = Number.parseInt(String(formData.get("direction") ?? "0"), 10);
    if (!id || (direction !== 1 && direction !== -1)) throw new Error("Relay is missing.");
    moveRelay(id, direction);
    refresh();
  });
}

export async function addStopAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const kind = String(formData.get("kind") ?? "stopoff");
    if (kind !== "pickup" && kind !== "delivery" && kind !== "stopoff") {
      throw new Error("Pick a stop type.");
    }
    const name = requiredString(formData.get("name"), "Stop name");
    const city = String(formData.get("city") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim();
    addStop(loadId, {
      kind,
      name,
      city,
      state,
      confirmation: String(formData.get("confirmation") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
    });
    recordLoadAudit({
      loadId,
      action: "stop",
      field: kind,
      newValue: [name, city, state].filter(Boolean).join(", "),
    });
    refresh();
  });
}

export async function moveStopAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("stop_id"));
    const direction = Number.parseInt(String(formData.get("direction") ?? "0"), 10);
    if (!id || (direction !== 1 && direction !== -1)) throw new Error("Stop is missing.");
    const { getDb } = await import("./db");
    const stop = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(id) as
      | { load_id: number; name: string; sequence: number }
      | undefined;
    moveStop(id, direction as -1 | 1);
    if (stop) {
      recordLoadAudit({
        loadId: stop.load_id,
        action: "stop",
        field: "sequence",
        oldValue: stop.sequence,
        newValue: `${stop.name} moved ${direction < 0 ? "up" : "down"}`,
      });
    }
    refresh();
  });
}

export async function deleteStopAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("stop_id"));
    if (!id) throw new Error("Stop is missing.");
    const { getDb } = await import("./db");
    const stop = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(id) as
      | { load_id: number; name: string; kind: string; city: string; state: string }
      | undefined;
    deleteStop(id);
    if (stop) {
      recordLoadAudit({
        loadId: stop.load_id,
        action: "stop",
        field: stop.kind,
        oldValue: [stop.name, stop.city, stop.state].filter(Boolean).join(", "),
        newValue: "",
      });
    }
    refresh();
  });
}

export async function exceptionAction(formData: FormData): Promise<void> {
  await requireLoadEditor();
  const key = String(formData.get("exception_key") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!key) throw new Error("Exception is missing.");
  if (status !== "ack" && status !== "snoozed" && status !== "resolved") {
    throw new Error("Pick an action.");
  }
  const until = status === "snoozed" ? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() : "";
  setExceptionState(key, status, String(formData.get("reason") ?? ""), until);
  refresh();
}

export async function saveHandoffAction(formData: FormData): Promise<void> {
  await requireLoadEditor();
  setHandoffNote(String(formData.get("handoff_note") ?? ""));
  refresh();
}

export async function createClaimAction(formData: FormData): Promise<void> {
  await requireLoadEditor();
  const loadId = parseOptionalInt(formData.get("load_id"));
  if (!loadId) throw new Error("Load is missing.");
  createClaim({
    loadId,
    claimNumber: requiredString(formData.get("claim_number"), "Claim number"),
    kind: String(formData.get("kind") ?? "osd"),
    notes: String(formData.get("notes") ?? ""),
  });
  refresh();
}

export async function createBillAction(formData: FormData): Promise<void> {
  await requireCapability(canAccessAccounting, "Bills are for Administrator and Accounting.");
  createBill({
    vendor: requiredString(formData.get("vendor"), "Vendor"),
    memo: String(formData.get("memo") ?? ""),
    amount: parseOptionalFloat(formData.get("amount")) ?? 0,
    loadId: parseOptionalInt(formData.get("load_id")),
  });
  refresh();
}

export async function payBillAction(formData: FormData): Promise<void> {
  await requireCapability(canAccessAccounting, "Bills are for Administrator and Accounting.");
  const id = parseOptionalInt(formData.get("bill_id"));
  if (!id) throw new Error("Bill is missing.");
  markBillPaid(id);
  refresh();
}

export async function paySettlementAction(formData: FormData): Promise<void> {
  await requireCapability(canAccessAccounting, "Driver pay is for Administrator and Accounting.");
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  markSettlementPaid(id);
  refresh();
}

export async function markReceivablePaidAction(formData: FormData): Promise<void> {
  await requireCapability(canAccessAccounting, "Invoices are for Administrator and Accounting.");
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  markInvoicePaid(id, true);
  refresh();
}

export async function logCheckCallFormAction(formData: FormData): Promise<void> {
  const result = await logCheckCallAction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function logCheckCallAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canLogCheckCall, "Check-calls are for Administrator and Standard.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      if (!getLoad(loadId)) throw new Error("Load not found.");
      const notes = requiredString(formData.get("notes"), "Check-call notes");
      const calledAtRaw = String(formData.get("called_at") ?? "").trim();
      const calledAt = calledAtRaw ? fromInputDateTime(calledAtRaw) : new Date().toISOString();
      recordLoadAudit({
        loadId,
        action: "check_call",
        field: "notes",
        oldValue: calledAt,
        newValue: notes,
      });
      refresh();
      return { ok: true, id: loadId, message: "Check call logged." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function requestDriverDocumentsAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      setLoadDocsRequested(loadId, true);
      refresh();
      return { ok: true, id: loadId, message: "Driver will see a request for BOL/POD/photos on this load." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function assignLoadDispatcherAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadAssigner();
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const dispatcherId = parseOptionalInt(formData.get("dispatcher_id"));
    assignLoadDispatcher(loadId, dispatcherId);
    refresh();
  });
}

export async function sendToAccountingAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "Send to Accounting is for Administrator and Accounting.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const load = getLoad(loadId);
      if (!load) throw new Error("Load not found.");
      setLoadReadyToInvoice(loadId, true);
      if (isBillableStatus(load.status) && load.rate != null) {
        const { sendLoadToQuickbooks } = await import("./integrations/quickbooks");
        try {
          await sendLoadToQuickbooks(loadId, { confirmResend: String(formData.get("confirm_resend") ?? "") === "1" });
          refresh();
          return { ok: true, id: loadId, message: "Sent to accounting (QuickBooks) and marked ready to invoice." };
        } catch (error) {
          const text = error instanceof Error ? error.message : "QuickBooks send failed.";
          if (/already sent/i.test(text)) {
            refresh();
            return { ok: true, id: loadId, message: "Already invoiced. Marked ready to invoice." };
          }
          refresh();
          return { ok: false, error: text };
        }
      }
      refresh();
      return {
        ok: true,
        id: loadId,
        message: "Marked ready to invoice. Send the QuickBooks invoice from Financials after the load is delivered with a rate.",
      };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function sendLoadSmsAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canSendSms, "SMS is for Administrator and Standard.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const load = getLoad(loadId);
      if (!load) throw new Error("Load not found.");
      if (!load.driver_id) throw new Error("Assign a driver first.");
      const phone = String(load.driver_phone ?? "").trim();
      if (!phone) throw new Error("The assigned driver needs a mobile number.");
      const kind = String(formData.get("kind") ?? "message");
      const { formatLoadSummary } = await import("./load-summary");
      const { sendTwilioSms } = await import("./integrations/twilio");
      const body =
        kind === "load_info"
          ? formatLoadSummary(load)
          : requiredString(formData.get("body"), "Message");
      await sendTwilioSms({ to: phone, body });
      recordLoadAudit({
        loadId,
        action: "sms",
        field: "to",
        oldValue: kind === "load_info" ? "load information" : "message",
        newValue: phone,
      });
      refresh();
      return {
        ok: true,
        id: loadId,
        message: kind === "load_info" ? `Load information texted to ${phone}.` : `Message texted to ${phone}.`,
      };
    } catch (error) {
      return fail(error);
    }
  });
}
