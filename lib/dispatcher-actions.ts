"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordLoadAudit, withRequestAuditActor } from "./audit";
import { parseOptionalFloat, parseOptionalInt, requiredString } from "./format";
import { authenticateDispatcher, clearDispatcherSession, setDispatcherSession } from "./dispatcher-session";
import {
  cloneLoad,
  markInvoicePaid,
  setLoadWatched,
  updateLoadDetails,
} from "./queries";
import { createBill, markBillPaid, markSettlementPaid } from "./accounting";
import { createClaim, setExceptionState, setHandoffNote, writeAudit } from "./desk";
import { addStop, deleteStop, moveStop } from "./stops";
import { createLoadFromTemplate, saveTemplateFromLoad } from "./templates";
import type { ActionResult } from "./types";

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
    const dispatcherId = parseOptionalInt(formData.get("dispatcher_id"));
    const pin = String(formData.get("pin") ?? "").trim();
    if (!dispatcherId || !pin) throw new Error("Pick your name and enter your PIN.");
    const dispatcher = authenticateDispatcher(dispatcherId, pin);
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
    const id = parseOptionalInt(formData.get("load_id"));
    if (!id) throw new Error("Load is missing.");
    const cloned = cloneLoad(id);
    writeAudit("clone", "load", cloned, `from ${id}`);
    refresh();
    redirect(`/loads/${cloned}`);
  });
}

export async function saveTemplateAction(formData: FormData): Promise<void> {
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  const name = String(formData.get("name") ?? "").trim();
  saveTemplateFromLoad(id, name);
  refresh();
}

export async function createFromTemplateAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
    const id = parseOptionalInt(formData.get("template_id"));
    if (!id) throw new Error("Template is missing.");
    const loadId = createLoadFromTemplate(id);
    refresh();
    redirect(`/loads/${loadId}`);
  });
}

export async function watchLoadAction(formData: FormData): Promise<void> {
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  setLoadWatched(id, String(formData.get("watched") ?? "") === "1");
  refresh();
}

export async function saveLoadDetailsAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
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

export async function addStopAction(formData: FormData): Promise<void> {
  await withRequestAuditActor(async () => {
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
  setHandoffNote(String(formData.get("handoff_note") ?? ""));
  refresh();
}

export async function createClaimAction(formData: FormData): Promise<void> {
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
  createBill({
    vendor: requiredString(formData.get("vendor"), "Vendor"),
    memo: String(formData.get("memo") ?? ""),
    amount: parseOptionalFloat(formData.get("amount")) ?? 0,
    loadId: parseOptionalInt(formData.get("load_id")),
  });
  refresh();
}

export async function payBillAction(formData: FormData): Promise<void> {
  const id = parseOptionalInt(formData.get("bill_id"));
  if (!id) throw new Error("Bill is missing.");
  markBillPaid(id);
  refresh();
}

export async function paySettlementAction(formData: FormData): Promise<void> {
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  markSettlementPaid(id);
  refresh();
}

export async function markReceivablePaidAction(formData: FormData): Promise<void> {
  const id = parseOptionalInt(formData.get("load_id"));
  if (!id) throw new Error("Load is missing.");
  markInvoicePaid(id, true);
  refresh();
}
