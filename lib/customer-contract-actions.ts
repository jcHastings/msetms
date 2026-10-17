"use server";

import { revalidatePath } from "next/cache";
import { requireLoadEditor } from "./dispatcher-session";
import { fileToBuffer } from "./files";
import {
  CONTRACT_SOURCES,
  isRequirementTrigger,
  parseOptionalNumber,
  type RequirementTrigger,
} from "./customer-contract-shared";
import {
  addCustomerContract,
  deleteCustomerContract,
  deleteCustomerRequirement,
  saveCustomerDetentionTerms,
  saveCustomerRequirement,
  setRequirementReminder,
} from "./customer-contracts";
import type { ActionResult } from "./types";

const MAX_BYTES = 15 * 1024 * 1024;

function refresh(customerId?: number): void {
  try {
    if (customerId) revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/desk");
    revalidatePath("/loads");
  } catch {
    // Scripts have no Next.js cache.
  }
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function uploadCustomerContractAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireLoadEditor();
    const customerId = positiveInt(formData.get("customer_id"));
    if (!customerId) throw new Error("Customer is missing.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF.");
    if (file.size > MAX_BYTES) throw new Error("PDFs must be 15 MB or smaller.");
    const name = file.name || "contract.pdf";
    if (file.type && file.type !== "application/pdf" && !name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Upload a PDF.");
    }
    if (!name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") throw new Error("Upload a PDF.");
    const source = String(formData.get("source") ?? "");
    if (!CONTRACT_SOURCES.some((item) => item.value === source)) throw new Error("Pick a contract source.");
    const saved = addCustomerContract({
      customerId,
      originalName: name,
      buffer: await fileToBuffer(file),
      mimeType: file.type || "application/pdf",
      signedOn: String(formData.get("signed_on") ?? ""),
      source,
    });
    refresh(customerId);
    return { ok: true, id: saved.id, message: "Contract saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCustomerContractAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireLoadEditor();
    const customerId = positiveInt(formData.get("customer_id"));
    const id = positiveInt(formData.get("id"));
    if (!customerId || !id) throw new Error("Contract is missing.");
    deleteCustomerContract(id);
    refresh(customerId);
    return { ok: true, message: "Contract removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function saveCustomerDetentionTermsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireLoadEditor();
    const customerId = positiveInt(formData.get("customer_id"));
    if (!customerId) throw new Error("Customer is missing.");
    const rate = optionalNumber(formData.get("rate_per_hour"), "Rate per hour");
    const freeHours = optionalNumber(formData.get("free_hours"), "Free hours");
    const increment = optionalNumber(formData.get("billing_increment_minutes"), "Billing increment");
    const capDay = optionalNumber(formData.get("cap_per_day"), "Cap per day");
    const capStop = optionalNumber(formData.get("cap_per_stop"), "Cap per stop");
    const notice = optionalNumber(formData.get("notice_lead_minutes"), "Notice lead");
    if (rate != null && rate <= 0) throw new Error("Rate per hour has to be greater than zero.");
    if (freeHours != null && freeHours < 0) throw new Error("Free hours cannot be negative.");
    if (increment != null && increment <= 0) throw new Error("Billing increment has to be greater than zero.");
    if (capDay != null && capDay <= 0) throw new Error("Cap per day has to be greater than zero.");
    if (capStop != null && capStop <= 0) throw new Error("Cap per stop has to be greater than zero.");
    if (notice != null && notice < 0) throw new Error("Notice lead cannot be negative.");
    saveCustomerDetentionTerms(customerId, {
      ratePerHour: rate,
      freeHours,
      billingIncrementMinutes: increment == null ? null : Math.round(increment),
      capPerDay: capDay,
      capPerStop: capStop,
      noticeLeadMinutes: notice == null ? null : Math.round(notice),
      conditions: String(formData.get("conditions") ?? ""),
    });
    refresh(customerId);
    return { ok: true, message: "Detention terms saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function saveCustomerRequirementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireLoadEditor();
    const customerId = positiveInt(formData.get("customer_id"));
    if (!customerId) throw new Error("Customer is missing.");
    const trigger = String(formData.get("trigger") ?? "");
    if (!isRequirementTrigger(trigger)) throw new Error("Pick a trigger.");
    const deadlineRaw = String(formData.get("deadline_hours") ?? "").trim();
    const deadline = optionalNumber(formData.get("deadline_hours"), "Deadline hours");
    if (deadlineRaw && deadline == null) throw new Error("Deadline hours is not a number.");
    saveCustomerRequirement(customerId, {
      id: positiveInt(formData.get("id")),
      trigger: trigger as RequirementTrigger,
      deadlineHours: deadline,
      timeOfDay: String(formData.get("time_of_day") ?? ""),
      requirement: String(formData.get("requirement") ?? ""),
      quotedClause: String(formData.get("quoted_clause") ?? ""),
      page: String(formData.get("page") ?? ""),
    });
    refresh(customerId);
    return { ok: true, message: "Requirement saved. It flags the load and the desk. Nothing is sent." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCustomerRequirementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireLoadEditor();
    const customerId = positiveInt(formData.get("customer_id"));
    const id = positiveInt(formData.get("id"));
    if (!customerId || !id) throw new Error("Requirement is missing.");
    deleteCustomerRequirement(customerId, id);
    refresh(customerId);
    return { ok: true, message: "Requirement removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function setRequirementReminderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireLoadEditor();
    const loadId = positiveInt(formData.get("load_id"));
    const requirementId = positiveInt(formData.get("requirement_id"));
    const op = String(formData.get("op") ?? "");
    if (!loadId || !requirementId) throw new Error("Reminder is missing.");
    if (op !== "done" && op !== "snooze" && op !== "reopen") throw new Error("Pick Done or Snooze.");
    setRequirementReminder({ loadId, requirementId, op });
    refresh();
    try {
      revalidatePath(`/loads/${loadId}`);
    } catch {
      // ignore
    }
    return { ok: true, message: op === "done" ? "Marked done." : op === "snooze" ? "Snoozed 4 hours." : "Reopened." };
  } catch (error) {
    return fail(error);
  }
}

function positiveInt(value: FormDataEntryValue | null): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalNumber(value: FormDataEntryValue | null, label: string): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = parseOptionalNumber(raw);
  if (number == null) throw new Error(`${label} is not a number.`);
  return number;
}
