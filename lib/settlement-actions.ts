"use server";

import { revalidatePath } from "next/cache";
import { withRequestAuditActor } from "./audit";
import { requireWriteRole } from "./dispatcher-session";
import { parseOptionalInt } from "./format";
import { approveReimbursement, rejectReimbursement } from "./reimbursements";
import {
  addStatementOneOff,
  deleteDeductionTemplate,
  deleteStatementOneOff,
  markSettlementRecordPaid,
  saveDeductionTemplate,
} from "./settlement-statement";
import type { ActionResult } from "./types";

function refresh(): void {
  revalidatePath("/accounting/settlements");
  revalidatePath("/accounting/deductions");
  revalidatePath("/accounting/reimbursements");
  revalidatePath("/driver/pay");
  revalidatePath("/driver/reimbursements");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function saveDeductionTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireWriteRole();
    const id = parseOptionalInt(formData.get("id"));
    const driverId = parseOptionalInt(formData.get("driver_id"));
    saveDeductionTemplate({
      id,
      name: formData.get("name"),
      amount: formData.get("amount"),
      basis: formData.get("basis"),
      appliesTo: formData.get("applies_to"),
      driverId,
      active: formData.get("active") === "on" || formData.get("active") === "1",
    });
    refresh();
    return { ok: true, message: "Deduction item saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDeductionTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireWriteRole();
    const id = parseOptionalInt(formData.get("id"));
    if (!id) throw new Error("Deduction item not found.");
    deleteDeductionTemplate(id);
    refresh();
    return { ok: true, message: "Deduction item removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function addStatementOneOffAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireWriteRole();
    const driverId = parseOptionalInt(formData.get("driver_id"));
    if (!driverId) throw new Error("Driver not found.");
    addStatementOneOff({
      driverId,
      weekStart: String(formData.get("week_start") ?? ""),
      name: formData.get("name"),
      amount: formData.get("amount"),
    });
    refresh();
    return { ok: true, message: "One-time deduction added." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteStatementOneOffAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireWriteRole();
    const id = parseOptionalInt(formData.get("id"));
    if (!id) throw new Error("Deduction not found.");
    deleteStatementOneOff(id);
    refresh();
    return { ok: true, message: "One-time deduction removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function markSettlementPaidAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireWriteRole();
    const driverId = parseOptionalInt(formData.get("driver_id"));
    if (!driverId) throw new Error("Driver not found.");
    return await withRequestAuditActor(() => {
      const result = markSettlementRecordPaid(driverId, String(formData.get("week_start") ?? ""));
      refresh();
      return {
        ok: true as const,
        message: result.reimbursements
          ? `Recorded paid. ${result.reimbursements} reimbursement${result.reimbursements === 1 ? "" : "s"} marked paid.`
          : "Recorded paid. No money was sent.",
      };
    });
  } catch (error) {
    return fail(error);
  }
}

export async function approveReimbursementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireWriteRole();
    const id = parseOptionalInt(formData.get("id"));
    if (!id) throw new Error("Reimbursement not found.");
    await withRequestAuditActor(() => {
      approveReimbursement(id);
    });
    refresh();
    return { ok: true, message: "Approved. It will show on that driver's settlement. Nothing was sent." };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectReimbursementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireWriteRole();
    const id = parseOptionalInt(formData.get("id"));
    if (!id) throw new Error("Reimbursement not found.");
    await withRequestAuditActor(() => {
      rejectReimbursement(id, formData.get("reason"));
    });
    refresh();
    return { ok: true, message: "Rejected. The driver sees the reason in the app. Nothing was sent." };
  } catch (error) {
    return fail(error);
  }
}
