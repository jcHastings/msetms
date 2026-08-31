"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordLoadAudit, withRequestAuditActor } from "./audit";
import { publicLoginFailureDetail, recordLoginAttemptFromRequest } from "./login-audit";
import {
  fromInputDateTime,
  isAppointmentSchedule,
  parseOptionalFloat,
  parseOptionalInt,
  requiredString,
} from "./format";
import { assertNyBoroughState } from "./places-shared";
import {
  authenticateDispatcher,
  clearDispatcherSession,
  getDispatcher,
  getPendingTwoFactorDispatcherId,
  isTwoFactorRequired,
  readTrustedDeviceCookie,
  requireCapability,
  requireLoadAssigner,
  requireLoadEditor,
  setDispatcherSession,
  setPendingTwoFactor,
  writeTrustedDeviceCookie,
} from "./dispatcher-session";
import { findTrustedDevice, isRememberDeviceRequested, rememberTrustedDevice } from "./dispatcher-device";
import {
  canAccessAccounting,
  canEmailInvoice,
  canLogCheckCall,
  canSendSms,
} from "./settings-shared";
import {
  composeSignInCodeEmail,
  issueEmailOtp,
  maskEmail,
  verifyEmailOtp,
} from "./dispatcher-email-otp";
import { isUsableEmail } from "./mail-shared";
import {
  assignLoadDispatcher,
  cloneLoad,
  getLoad,
  markInvoicePaid,
  setLoadDocsRequested,
  setLoadWatched,
  updateLoadDetails,
} from "./queries";
import {
  applyWorkflowAfterGeofence,
  applyWorkflowOnDocumentAction,
  maybeAssignCreatingDispatcher,
} from "./workflow";
import { closeDriverPayPeriod, createBill, markBillPaid, markSettlementPaid } from "./accounting";
import { markPayItemPaid } from "./pay-items";
import { createClaim, setExceptionState, setHandoffNote, writeAudit } from "./desk";
import { refreshRelayLegMilesQuiet } from "./relay-routing";
import { addRelay, deleteRelay, getRelay, moveRelay, updateRelay } from "./relay-store";
import { refreshLoadRoute, refreshLoadRouteQuiet, saveManualRouteMiles } from "./routing";
import {
  addStop,
  deleteStop,
  getStop,
  listStops,
  moveStop,
  reorderStops,
  setStopDelivered,
  stopIsDelivered,
  updateStop,
  type LoadStopKind,
} from "./stops";
import { createLoadFromTemplate, saveTemplateFromLoad } from "./templates";
import type { ActionResult } from "./types";

function refresh(): void {
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

async function sendSignInCode(
  dispatcherId: number,
  resend = false,
  rememberDevice = false,
): Promise<ActionResult> {
  const issued = issueEmailOtp(dispatcherId, { resend });
  const mail = composeSignInCodeEmail({ code: issued.code });
  const { sendMail } = await import("./integrations/mail");
  await sendMail({ to: issued.email, subject: mail.subject, text: mail.text });
  await setPendingTwoFactor(dispatcherId);
  return {
    ok: true,
    needsEmailCode: true,
    rememberDevice,
    maskedEmail: maskEmail(issued.email),
    message: `We sent a sign-in code to ${maskEmail(issued.email)}.`,
  };
}

async function finishOfficeLogin(dispatcherId: number, remember: boolean): Promise<void> {
  if (remember) {
    const cookie = rememberTrustedDevice(dispatcherId, await readTrustedDeviceCookie());
    await writeTrustedDeviceCookie(cookie);
  }
  await setDispatcherSession(dispatcherId);
}

export async function dispatcherLoginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const emailCode = String(formData.get("email_code") ?? "").trim();
  const resend = String(formData.get("resend") ?? "") === "1";
  const remember = isRememberDeviceRequested(formData);
  const dispatcherId = parseOptionalInt(formData.get("dispatcher_id"));
  try {
    if (emailCode || resend) {
      const pendingId = await getPendingTwoFactorDispatcherId();
      if (!pendingId) throw new Error("Password step expired. Sign in again.");
      if (resend) return await sendSignInCode(pendingId, true, remember);
      verifyEmailOtp(pendingId, emailCode);
      await recordLoginAttemptFromRequest({
        kind: "office",
        outcome: "success",
        step: "email_code",
        userId: pendingId,
      });
      await finishOfficeLogin(pendingId, remember);
      refresh();
      redirect(getDispatcher(pendingId)?.must_change_password ? "/login/change-password" : "/");
    }

    const password = String(formData.get("password") ?? "");
    if (!dispatcherId || !password) throw new Error("Pick your name and enter your password.");
    const dispatcher = authenticateDispatcher(dispatcherId, password);
    const afterPassword = () => {
      return dispatcher.must_change_password ? "/login/change-password" : "/";
    };
    const trusted = Boolean(findTrustedDevice(await readTrustedDeviceCookie(), dispatcher.id));
    const skipEmailCode = !isTwoFactorRequired() || !isUsableEmail(dispatcher.email) || trusted;
    if (skipEmailCode) {
      await recordLoginAttemptFromRequest({
        kind: "office",
        outcome: "success",
        step: "password",
        userId: dispatcher.id,
      });
      await finishOfficeLogin(dispatcher.id, remember || trusted);
      refresh();
      redirect(afterPassword());
    }
    return await sendSignInCode(dispatcher.id, false, remember);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const pendingId = emailCode || resend ? await getPendingTwoFactorDispatcherId() : null;
    await recordLoginAttemptFromRequest({
      kind: "office",
      outcome: "failure",
      step: emailCode || resend ? "email_code" : "password",
      userId: pendingId ?? dispatcherId,
      detail: publicLoginFailureDetail(error),
    });
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
    const actor = await requireLoadEditor();
    const id = parseOptionalInt(formData.get("load_id"));
    if (!id) throw new Error("Load is missing.");
    const cloned = cloneLoad(id);
    maybeAssignCreatingDispatcher(cloned, actor.id);
    writeAudit("clone", "load", cloned, `from ${id}`);
    refresh();
    redirect(`/loads/${cloned}`);
  });
}

export async function setMasterLoadAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const id = parseOptionalInt(formData.get("load_id"));
      if (!id) throw new Error("Load is missing.");
      const enabled = formData.get("is_master") === "1";
      const { setLoadIsMaster } = await import("./master-load");
      setLoadIsMaster(id, enabled);
      writeAudit("update", "master_load", id, enabled ? "multiple customers" : "regular load");
      refresh();
      return { ok: true, message: enabled ? "This load is a master." : "This load is a regular load." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function addMasterChildAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const parentId = parseOptionalInt(formData.get("parent_load_id"));
      const customerId = parseOptionalInt(formData.get("customer_id"));
      if (!parentId) throw new Error("Load is missing.");
      if (!customerId) throw new Error("Pick a customer.");
      const stopIds = formData
        .getAll("stop_ids")
        .map((value) => Number.parseInt(String(value), 10))
        .filter((id) => Number.isFinite(id) && id > 0);
      const rate = parseOptionalFloat(formData.get("rate"));
      const { createMasterChild } = await import("./master-load");
      const child = createMasterChild({
        parentId,
        customerId,
        stopIds,
        rate,
        copyFinancials: formData.get("copy_financials") === "1",
      });
      writeAudit("update", "master_load", parentId, child.load_number);
      refresh();
      return { ok: true, id: child.id, message: `${child.load_number} added for ${child.customer_name}.` };
    } catch (error) {
      return fail(error);
    }
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
    const actor = await requireLoadEditor();
    const id = parseOptionalInt(formData.get("template_id"));
    if (!id) throw new Error("Template is missing.");
    const loadId = createLoadFromTemplate(id);
    maybeAssignCreatingDispatcher(loadId, actor.id);
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
  const handoff = String(formData.get("handoff") ?? formData.get("delivery") ?? "").trim();
  const pickup = String(formData.get("pickup") ?? "").trim();
  return {
    pickup: pickup || undefined,
    delivery: requiredString(handoff, "Relay point"),
    from_driver_id: parseOptionalInt(formData.get("from_driver_id") ?? formData.get("driver_a_id")),
    driver_id: parseOptionalInt(formData.get("driver_id") ?? formData.get("driver_b_id")),
    truck_id: parseOptionalInt(formData.get("truck_id")),
    trailer_id: parseOptionalInt(formData.get("trailer_id")),
    oo_percent: parseOptionalFloat(formData.get("oo_percent")),
    oo_pay: parseOptionalFloat(formData.get("oo_pay")),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function addRelayAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      addRelay(loadId, parseRelayForm(formData));
      await refreshRelayLegMilesQuiet(loadId);
      refresh();
      return { ok: true, id: loadId };
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      return fail(error);
    }
  });
}

export async function updateRelayAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const id = parseOptionalInt(formData.get("relay_id"));
      if (!id) throw new Error("Relay is missing.");
      updateRelay(id, parseRelayForm(formData));
      const relay = getRelay(id);
      if (relay) await refreshRelayLegMilesQuiet(relay.load_id);
      refresh();
      return { ok: true, id };
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      return fail(error);
    }
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

function parseStopKind(value: FormDataEntryValue | null): LoadStopKind {
  const kind = String(value ?? "pickup");
  if (kind !== "pickup" && kind !== "delivery") throw new Error("Stop type is Pickup or Delivery.");
  return kind;
}

function parseStopKindFromForm(formData: FormData): LoadStopKind {
  const values = formData.getAll("kind").map((value) => String(value));
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] === "delivery" || values[index] === "pickup") return values[index] as LoadStopKind;
  }
  return parseStopKind(formData.get("kind"));
}

function parseStopInput(formData: FormData) {
  const windowStart = String(formData.get("window_start") ?? "").trim();
  const windowEnd = String(formData.get("window_end") ?? "").trim();
  const scheduleType = String(formData.get("schedule_type") ?? "").trim();
  const appt = isAppointmentSchedule(scheduleType);
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  if (!parseOptionalInt(formData.get("location_id"))) {
    assertNyBoroughState(city, state);
  }
  return {
    kind: parseStopKindFromForm(formData),
    name: requiredString(formData.get("name"), "Stop name"),
    street: String(formData.get("street") ?? "").trim(),
    city,
    state,
    zip: String(formData.get("zip") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    window_start: windowStart ? fromInputDateTime(windowStart) : "",
    window_end: appt || !windowEnd ? "" : fromInputDateTime(windowEnd),
    confirmation: String(formData.get("confirmation") ?? "").trim(),
    cargo: String(formData.get("cargo") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    instructions: String(formData.get("instructions") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    location_id: parseOptionalInt(formData.get("location_id")),
    arrived_at: String(formData.get("arrived_at") ?? "").trim()
      ? fromInputDateTime(String(formData.get("arrived_at")))
      : "",
    departed_at: String(formData.get("departed_at") ?? "").trim()
      ? fromInputDateTime(String(formData.get("departed_at")))
      : "",
    schedule_type: scheduleType,
  };
}

export async function addStopAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const input = parseStopInput(formData);
    addStop(loadId, input);
    recordLoadAudit({
      loadId,
      action: "stop",
      field: input.kind,
      newValue: [input.name, input.city, input.state].filter(Boolean).join(", "),
    });
    await refreshLoadRouteQuiet(loadId);
    refresh();
  });
}

export async function updateStopAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("stop_id"));
    if (!id) throw new Error("Stop is missing.");
    const input = parseStopInput(formData);
    updateStop(id, input);
    const { getDb } = await import("./db");
    const stop = getDb().prepare("SELECT load_id FROM load_stops WHERE id = ?").get(id) as
      | { load_id: number }
      | undefined;
    if (stop) {
      if (input.arrived_at || input.departed_at) applyWorkflowAfterGeofence(stop.load_id);
      await refreshLoadRouteQuiet(stop.load_id);
    }
    refresh();
  });
}

export async function markStopDeliveredAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const id = parseOptionalInt(formData.get("stop_id"));
    if (!id) throw new Error("Stop is missing.");
    const delivered = String(formData.get("delivered") ?? "") === "1";
    const stop = getStop(id);
    if (!stop) throw new Error("Stop not found.");
    setStopDelivered(id, delivered);
    recordLoadAudit({
      loadId: stop.load_id,
      action: "stop",
      field: "delivered",
      oldValue: stopIsDelivered(stop) ? "1" : "0",
      newValue: delivered ? "1" : "0",
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
      await refreshLoadRouteQuiet(stop.load_id);
    }
    refresh();
  });
}

export async function reorderStopsAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    await requireLoadEditor();
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const orderedIds = String(formData.get("stop_ids") ?? "")
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((id) => Number.isFinite(id) && id > 0);
    reorderStops(loadId, orderedIds);
    recordLoadAudit({
      loadId,
      action: "stop",
      field: "sequence",
      newValue: orderedIds.join(","),
    });
    await refreshLoadRouteQuiet(loadId);
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
      await refreshLoadRouteQuiet(stop.load_id);
    }
    refresh();
  });
}

export async function refreshRouteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const result = await refreshLoadRoute(loadId);
      const { refreshEmptyMilesAround } = await import("./empty-miles");
      await refreshEmptyMilesAround(loadId);
      refresh();
      if (!result.ok) return { ok: false, error: result.message };
      return { ok: true, id: loadId, message: result.message };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function saveManualRouteMilesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      saveManualRouteMiles(loadId, parseOptionalFloat(formData.get("route_miles")));
      refresh();
      return { ok: true, id: loadId, message: "Route miles saved." };
    } catch (error) {
      return fail(error);
    }
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
  const payItemId = parseOptionalInt(formData.get("pay_item_id"));
  if (payItemId) {
    markPayItemPaid(payItemId);
    refresh();
    return;
  }
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  markSettlementPaid(id);
  refresh();
}

export async function closeDriverPayPeriodAction(formData: FormData): Promise<void> {
  await requireCapability(canAccessAccounting, "Driver pay is for Administrator and Accounting.");
  closeDriverPayPeriod(String(formData.get("from") ?? ""), String(formData.get("to") ?? ""));
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
      applyWorkflowOnDocumentAction(loadId, "docs_requested");
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

export async function requestPodAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      setLoadDocsRequested(loadId, true);
      applyWorkflowOnDocumentAction(loadId, "docs_requested");
      refresh();
      return { ok: true, id: loadId, message: "POD requested from the driver." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function sendToAccountingAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const { sendLoadToAccounting } = await import("./accounting-desk");
      const load = sendLoadToAccounting(loadId);
      revalidatePath(`/loads/${load.id}`);
      revalidatePath("/board");
      revalidatePath("/search");
      revalidatePath("/accounting/invoices");
      revalidatePath("/");
      return {
        ok: true,
        id: load.id,
        message: `Load has been Sent to Accounting Management`,
      };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function returnLoadToOperationsAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "Accounting can send a load back to Load Management.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const { returnLoadToOperations } = await import("./accounting-desk");
      const load = returnLoadToOperations(loadId);
      refresh();
      return { ok: true, id: load.id, message: "Sent back to Load Management." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function archiveAccountingLoadAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "Archiving is for Administrator and Accounting.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const { archiveAccountingLoad } = await import("./accounting-desk");
      const load = archiveAccountingLoad(loadId);
      refresh();
      return { ok: true, id: load.id, message: "Archived." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function unarchiveAccountingLoadAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "Unarchive is for Administrator and Accounting.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const { unarchiveAccountingLoad } = await import("./accounting-desk");
      const load = unarchiveAccountingLoad(loadId);
      refresh();
      return { ok: true, id: load.id, message: "Back in Accounting." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function payAllOpenBillsAction(): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "Bills are for Administrator and Accounting.");
      const { listBills, markBillPaid } = await import("./accounting");
      const { listLoadsOnAccountingDesk } = await import("./accounting-desk");
      const accountingIds = new Set(listLoadsOnAccountingDesk("accounting").map((load) => load.id));
      let count = 0;
      for (const bill of listBills()) {
        if (bill.status !== "open") continue;
        if (bill.load_id && !accountingIds.has(bill.load_id)) continue;
        markBillPaid(bill.id);
        count += 1;
      }
      refresh();
      return { ok: true, message: count ? `Paid ${count} bills.` : "No open bills." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function saveQboItemMapAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "QuickBooks maps are for Administrator and Accounting.");
      const category = String(formData.get("category") ?? "").trim();
      const qboItemId = String(formData.get("qbo_item_id") ?? "").trim();
      if (!category) throw new Error("Pick a pay item.");
      const { listQboItems } = await import("./integrations/quickbooks");
      const { upsertQboItemMap } = await import("./accounting-desk");
      const named = (await listQboItems()).find((row) => row.id === qboItemId)?.name ?? "";
      upsertQboItemMap(category, qboItemId, named);
      refresh();
      return { ok: true, message: "Pay item mapped." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function saveQboVendorMapAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "QuickBooks maps are for Administrator and Accounting.");
      const payee = String(formData.get("payee") ?? "").trim();
      const qboVendorId = String(formData.get("qbo_vendor_id") ?? "").trim();
      if (!payee) throw new Error("Pick a vendor.");
      const { listQboVendors } = await import("./integrations/quickbooks");
      const { upsertQboVendorMap } = await import("./accounting-desk");
      const named = (await listQboVendors()).find((row) => row.id === qboVendorId)?.name ?? "";
      upsertQboVendorMap(payee, qboVendorId, named);
      refresh();
      return { ok: true, message: "Vendor mapped." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function sendBillToQuickbooksAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "Sending bills is for Administrator and Accounting.");
      const billId = parseOptionalInt(formData.get("bill_id"));
      if (!billId) throw new Error("Bill is missing.");
      const { sendBillToQuickbooks } = await import("./integrations/quickbooks");
      await sendBillToQuickbooks(billId);
      refresh();
      return { ok: true, id: billId };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function saveQboCustomerMapAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canAccessAccounting, "QuickBooks maps are for Administrator and Accounting.");
      const customerId = parseOptionalInt(formData.get("customer_id"));
      const qboCustomerId = String(formData.get("qbo_customer_id") ?? "").trim();
      if (!customerId) throw new Error("Pick a customer.");
      const { markCustomerQboMapped } = await import("./queries");
      if (!qboCustomerId) throw new Error("Pick a QuickBooks customer.");
      markCustomerQboMapped(customerId, qboCustomerId);
      refresh();
      return { ok: true, message: "Customer mapped." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function sendLoadMailAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const kind = String(formData.get("kind") ?? "");
      const load = getLoad(loadId);
      if (!load) throw new Error("Load not found.");
      const { customerMailBlockReason, driverMailBlockReason, sendCustomerUpdateMail, sendDriverLoadMail } =
        await import("./load-mail");
      const { MAIL_MISSING } = await import("./mail-shared");
      const { mailConfigured } = await import("./integrations/mail");
      if (kind === "driver_load") {
        const blocked = driverMailBlockReason(load);
        if (blocked) throw new Error(blocked);
      } else if (kind === "customer_update") {
        const blocked = customerMailBlockReason(load);
        if (blocked) throw new Error(blocked);
      } else {
        throw new Error("Pick Email driver load or Email customer update.");
      }
      if (!mailConfigured()) throw new Error(MAIL_MISSING);
      await requireCapability(canSendSms, "Email send is for Administrator and Standard.");
      const { parseDriverMessageLocale } = await import("./load-summary");
      const locale = parseDriverMessageLocale(formData.get("locale"));
      const sent =
        kind === "driver_load"
          ? await sendDriverLoadMail(loadId, undefined, { locale })
          : await sendCustomerUpdateMail(loadId);
      recordLoadAudit({
        loadId,
        action: "email",
        field: kind,
        newValue: sent.to,
      });
      refresh();
      return {
        ok: true,
        id: loadId,
        message:
          kind === "driver_load"
            ? `Load information emailed to ${sent.to}.`
            : `Tracking update emailed to ${sent.to}.`,
      };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function sendCustomerInvoiceMailAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const load = getLoad(loadId);
      if (!load) throw new Error("Load not found.");
      const { customerMailBlockReason, sendCustomerInvoiceMail } = await import("./load-mail");
      const { MAIL_MISSING } = await import("./mail-shared");
      const { mailConfigured } = await import("./integrations/mail");
      const blocked = customerMailBlockReason(load);
      if (blocked) throw new Error(blocked);
      if (!mailConfigured()) throw new Error(MAIL_MISSING);
      await requireCapability(canEmailInvoice, "Invoice email is for dispatch and accounting.");
      const extraIds = formData
        .getAll("extra_id")
        .map((value) => parseOptionalInt(value))
        .filter((id): id is number => id != null);
      const sent = await sendCustomerInvoiceMail(loadId, undefined, { extraIds });
      recordLoadAudit({
        loadId,
        action: "email",
        field: "customer_invoice",
        newValue: sent.to,
      });
      refresh();
      return {
        ok: true,
        id: loadId,
        message: `Invoice emailed to ${sent.to} from ar@msloads.com.`,
      };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function sendLoadSmsAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const { sendTwilioSms, twilioConfigured } = await import("./integrations/twilio");
      const { SMS_MISSING_KEYS } = await import("./sms-shared");
      if (!twilioConfigured()) throw new Error(SMS_MISSING_KEYS);
      await requireCapability(canSendSms, "SMS is for Administrator and Standard.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const load = getLoad(loadId);
      if (!load) throw new Error("Load not found.");
      if (!load.driver_id) throw new Error("Assign a driver first.");
      const phone = String(load.driver_phone ?? "").trim();
      if (!phone) throw new Error("The assigned driver needs a mobile number.");
      const kind = String(formData.get("kind") ?? "message");
      const { formatDriverDispatchText, parseDriverMessageLocale } = await import("./load-summary");
      const { formatRelayLane } = await import("./relays");
      const { relayForDriver } = await import("./relay-store");
      const yours = load.driver_id ? relayForDriver(load.id, load.driver_id) : null;
      const locale = parseDriverMessageLocale(formData.get("locale"));
      const summaryInput = {
        ...load,
        stops: listStops(load.id),
        your_leg: yours ? formatRelayLane(yours.pickup, yours.delivery) : "",
      };
      const body =
        kind === "load_info"
          ? formatDriverDispatchText(summaryInput, { locale })
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

export async function sendLoadWhatsAppAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const { sendWhatsAppMessage, twilioWhatsAppConfigured } = await import("./integrations/whatsapp");
      const { WHATSAPP_MISSING } = await import("./whatsapp-shared");
      if (!twilioWhatsAppConfigured()) throw new Error(WHATSAPP_MISSING);
      await requireCapability(canSendSms, "WhatsApp is for Administrator and Standard.");
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const load = getLoad(loadId);
      if (!load) throw new Error("Load not found.");
      if (!load.driver_id) throw new Error("Assign a driver first.");
      const phone = String(load.driver_phone ?? "").trim();
      if (!phone) throw new Error("The assigned driver needs a mobile number.");
      const kind = String(formData.get("kind") ?? "message");
      const { formatDriverDispatchText, parseDriverMessageLocale } = await import("./load-summary");
      const { formatRelayLane } = await import("./relays");
      const { relayForDriver } = await import("./relay-store");
      const yours = load.driver_id ? relayForDriver(load.id, load.driver_id) : null;
      const locale = parseDriverMessageLocale(formData.get("locale"));
      const body =
        kind === "load_info"
          ? formatDriverDispatchText(
              {
                ...load,
                stops: listStops(load.id),
                your_leg: yours ? formatRelayLane(yours.pickup, yours.delivery) : "",
              },
              { locale },
            )
          : requiredString(formData.get("body"), "Message");
      await sendWhatsAppMessage({ to: phone, body });
      recordLoadAudit({
        loadId,
        action: "whatsapp",
        field: "to",
        oldValue: kind === "load_info" ? "load information" : "message",
        newValue: phone,
      });
      refresh();
      return {
        ok: true,
        id: loadId,
        message: kind === "load_info" ? `Load sent on WhatsApp to ${phone}.` : `WhatsApp sent to ${phone}.`,
      };
    } catch (error) {
      return fail(error);
    }
  });
}

async function throwIfFailed(result: ActionResult): Promise<void> {
  if (!result.ok) throw new Error(result.error);
}

export async function returnLoadToOperationsFormAction(formData: FormData): Promise<void> {
  await throwIfFailed(await returnLoadToOperationsAction(formData));
}

export async function archiveAccountingLoadFormAction(formData: FormData): Promise<void> {
  await throwIfFailed(await archiveAccountingLoadAction(formData));
}

export async function unarchiveAccountingLoadFormAction(formData: FormData): Promise<void> {
  await throwIfFailed(await unarchiveAccountingLoadAction(formData));
}

export async function payAllOpenBillsFormAction(): Promise<void> {
  await throwIfFailed(await payAllOpenBillsAction());
}

export async function saveQboItemMapFormAction(formData: FormData): Promise<void> {
  await throwIfFailed(await saveQboItemMapAction(formData));
}

export async function saveQboVendorMapFormAction(formData: FormData): Promise<void> {
  await throwIfFailed(await saveQboVendorMapAction(formData));
}

export async function saveQboCustomerMapFormAction(formData: FormData): Promise<void> {
  await throwIfFailed(await saveQboCustomerMapAction(formData));
}

export async function sendBillToQuickbooksFormAction(formData: FormData): Promise<void> {
  await throwIfFailed(await sendBillToQuickbooksAction(formData));
}
