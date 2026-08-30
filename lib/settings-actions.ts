"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseOptionalFloat, parseOptionalInt, requiredString } from "./format";
import { requireSettingsEditor, requireSignedInDispatcher, requireUserAdmin } from "./dispatcher-session";
import {
  beginTotpEnrollment,
  cancelTotpEnrollment,
  confirmTotpEnrollment,
  resetDispatcherTotp,
} from "./dispatcher-totp";
import { createAlertRule, deleteAlertRule, markAllOfficeNotificationsRead, markOfficeNotificationRead } from "./alert-rules";
import {
  addDropdownOption,
  clearCompanyLogo,
  createDispatcherUser,
  defaultPermissionGroupForRole,
  deleteDispatcherUser,
  deleteDropdownOption,
  saveCompanyLogo,
  setDropdownOptionActive,
  updateAlertSettings,
  updateCompanyContact,
  updateDocumentDefaults,
  updateInsuranceSettings,
  updateLoadManagementSettings,
  updatePaySettings,
  updateRoutingNotes,
  updateDispatcherUser,
  updateTaxSettings,
  updateTwoFactorPolicy,
  updateUnitSettings,
  updateDocumentFont,
  updateWorkflowSettings,
  getWorkflowSettings,
  type DocumentType,
} from "./settings";
import {
  minutesFromAmount,
  type WorkflowCard,
  type WorkflowDurationUnit,
  type WorkflowLateKind,
  type WorkflowLateMode,
} from "./workflow-shared";
import { fileToBuffer } from "./files";
import type { ActionResult } from "./types";

function refresh(): void {
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function saveCompanyContactAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateCompanyContact({
      company_name: requiredString(formData.get("company_name"), "Company name"),
      dispatcher_name: requiredString(formData.get("dispatcher_name"), "Dispatcher name"),
      dispatcher_phone: String(formData.get("dispatcher_phone") ?? "").trim(),
      dispatcher_fax: String(formData.get("dispatcher_fax") ?? "").trim(),
      dispatcher_email: String(formData.get("dispatcher_email") ?? "").trim(),
      street: String(formData.get("street") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      state: String(formData.get("state") ?? "").trim(),
      zip: String(formData.get("zip") ?? "").trim(),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveInsuranceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateInsuranceSettings({
      insurance_provider: String(formData.get("insurance_provider") ?? ""),
      insurance_policy: String(formData.get("insurance_policy") ?? ""),
      insurance_coverage: String(formData.get("insurance_coverage") ?? ""),
      insurance_expires: String(formData.get("insurance_expires") ?? ""),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveUnitsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateUnitSettings({
      currency: String(formData.get("currency") ?? "USD"),
      weight_unit: String(formData.get("weight_unit") ?? "lb"),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveTaxAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateTaxSettings({
      tax_enabled: String(formData.get("tax_enabled") ?? "") === "1",
      tax_kind: String(formData.get("tax_kind") ?? "sales_tax"),
      tax_rate: parseOptionalFloat(formData.get("tax_rate")) ?? 0,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createAlertRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    const recipientIds = formData
      .getAll("recipient_ids")
      .map((value) => Number(value))
      .filter((id) => Number.isInteger(id) && id > 0);
    createAlertRule({
      name: requiredString(formData.get("name"), "Name of alert"),
      triggerKey: String(formData.get("trigger_key") ?? ""),
      recipientIds,
      message: String(formData.get("message") ?? ""),
    });
    refresh();
    return { ok: true, message: "Alert created." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAlertRuleAction(formData: FormData): Promise<void> {
  await requireSettingsEditor();
  const id = parseOptionalInt(formData.get("rule_id"));
  if (!id) throw new Error("Alert is missing.");
  deleteAlertRule(id);
  refresh();
}

export async function markOfficeNotificationReadAction(formData: FormData): Promise<void> {
  const dispatcher = await requireSignedInDispatcher();
  const id = parseOptionalInt(formData.get("notification_id"));
  if (id) markOfficeNotificationRead(id, dispatcher.id);
  refresh();
}

export async function markAllOfficeNotificationsReadAction(): Promise<void> {
  const dispatcher = await requireSignedInDispatcher();
  markAllOfficeNotificationsRead(dispatcher.id);
  refresh();
}

export async function saveAlertsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateAlertSettings({
      alert_driver_days: parseOptionalInt(formData.get("alert_driver_days")) ?? 30,
      alert_registration_days: parseOptionalInt(formData.get("alert_registration_days")) ?? 60,
      alert_dot_days: parseOptionalInt(formData.get("alert_dot_days")) ?? 30,
      alert_emails_enabled: String(formData.get("alert_emails_enabled") ?? "") === "1",
      alert_gps_quiet_hours: parseOptionalFloat(formData.get("alert_gps_quiet_hours")) ?? 2,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveRoutingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateRoutingNotes(String(formData.get("default_routing_notes") ?? ""));
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function savePayAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updatePaySettings({
      default_oo_percent: parseOptionalFloat(formData.get("default_oo_percent")) ?? 75,
      default_gross_margin_percent: parseOptionalFloat(formData.get("default_gross_margin_percent")) ?? 0,
      carrier_pay_method: String(formData.get("carrier_pay_method") ?? "ach"),
      carrier_pay_notes: String(formData.get("carrier_pay_notes") ?? ""),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveLoadManagementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateLoadManagementSettings({
      load_number_prefix: requiredString(formData.get("load_number_prefix"), "Prefix"),
      load_number_next: parseOptionalInt(formData.get("load_number_next")) ?? 1,
      show_sample_data: String(formData.get("show_sample_data") ?? "") === "1",
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveDocumentDefaultsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateDocumentDefaults({
      doc_type: String(formData.get("doc_type") ?? "") as DocumentType,
      header_text: String(formData.get("header_text") ?? ""),
      footer_text: String(formData.get("footer_text") ?? ""),
      terms_text: String(formData.get("terms_text") ?? ""),
      font_size: parseOptionalInt(formData.get("font_size")) ?? 10,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveDocumentFontAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    updateDocumentFont({
      family: String(formData.get("document_font_family") ?? "helvetica"),
      scale: parseOptionalInt(formData.get("document_font_scale")) ?? 100,
    });
    refresh();
    return { ok: true, message: "Font settings saved." };
  } catch (error) {
    return fail(error);
  }
}

function asDurationUnit(value: FormDataEntryValue | null, fallback: WorkflowDurationUnit): WorkflowDurationUnit {
  return String(value ?? fallback) === "hours" ? "hours" : "minutes";
}

export async function saveWorkflowAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    const card = String(formData.get("card") ?? "all") as WorkflowCard | "all";
    const current = getWorkflowSettings();
    const lateKind = String(formData.get("late_kind") ?? current.lateStopKind) as WorkflowLateKind;
    const lateMode = String(formData.get("late_mode") ?? current.lateStopMode) as WorkflowLateMode;
    const lateUnit = asDurationUnit(formData.get("late_unit"), current.lateStopUnit);
    const noActivityUnit = asDurationUnit(formData.get("no_activity_unit"), current.noActivityUnit);
    const next = { ...current };
    if (card === "user_assign" || card === "all") {
      next.autoAssignDispatcherOnCreate = String(formData.get("auto_assign_dispatcher") ?? "") === "1";
    }
    if (card === "blocks" || card === "all") {
      next.blockAssignExpiredDriver = String(formData.get("block_driver") ?? "") === "1";
      next.blockAssignExpiredTruck = String(formData.get("block_truck") ?? "") === "1";
      next.blockAssignExpiredTrailer = String(formData.get("block_trailer") ?? "") === "1";
    }
    if (card === "arrive_depart" || card === "all") {
      next.arrivePickupLoadStatus = String(formData.get("arrive_pu_load") ?? "");
      next.arrivePickupTruckStatus = String(formData.get("arrive_pu_truck") ?? "");
      next.departPickupLoadStatus = String(formData.get("depart_pu_load") ?? "");
      next.departPickupTruckStatus = String(formData.get("depart_pu_truck") ?? "");
      next.arriveDeliveryLoadStatus = String(formData.get("arrive_del_load") ?? "");
      next.arriveDeliveryTruckStatus = String(formData.get("arrive_del_truck") ?? "");
    }
    if (card === "driver_assign" || card === "all") {
      next.driverAssignLoadStatus = String(formData.get("driver_assign_load") ?? "");
      next.driverAssignTruckStatus = String(formData.get("driver_assign_truck") ?? "");
    }
    if (card === "late" || card === "all") {
      next.lateStopKind = lateKind === "pickup" || lateKind === "delivery" ? lateKind : "either";
      next.lateStopMode = lateMode === "same_day" ? "same_day" : "specified";
      next.lateStopUnit = lateUnit;
      next.lateStopMinutes = minutesFromAmount(parseOptionalInt(formData.get("late_minutes")) ?? 60, lateUnit);
      next.lateStopLoadStatus = String(formData.get("late_load") ?? "");
      next.lateStopOnlyStatuses = formData.getAll("late_only").map(String);
    }
    if (card === "documents" || card === "all") {
      next.invoiceSentLoadStatus = String(formData.get("invoice_sent_load") ?? "");
      next.invoiceSentTruckStatus = String(formData.get("invoice_sent_truck") ?? "");
      next.docsRequestedLoadStatus = String(formData.get("docs_requested_load") ?? "");
      next.docsRequestedTruckStatus = String(formData.get("docs_requested_truck") ?? "");
    }
    if (card === "no_activity" || card === "all") {
      next.noActivityUnit = noActivityUnit;
      next.noActivityMinutes = minutesFromAmount(parseOptionalInt(formData.get("no_activity_minutes")) ?? 0, noActivityUnit);
      next.noActivityLoadStatus = String(formData.get("no_activity_load") ?? "");
      next.noActivityOnlyStatuses = formData.getAll("no_activity_only").map(String);
    }
    updateWorkflowSettings(next);
    refresh();
    return { ok: true, message: "Workflow saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadLogoAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a logo image.");
    saveCompanyLogo({
      originalName: file.name,
      buffer: await fileToBuffer(file),
      mimeType: file.type,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function clearLogoAction(): Promise<void> {
  await requireSettingsEditor();
  clearCompanyLogo();
  refresh();
}

export async function addDropdownOptionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    addDropdownOption({
      kind: String(formData.get("kind") ?? ""),
      value: String(formData.get("value") ?? ""),
      label: requiredString(formData.get("label"), "Label"),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleDropdownOptionAction(formData: FormData): Promise<void> {
  await requireSettingsEditor();
  const id = parseOptionalInt(formData.get("option_id"));
  if (!id) throw new Error("List item is missing.");
  setDropdownOptionActive(id, String(formData.get("active") ?? "") === "1");
  refresh();
}

export async function deleteDropdownOptionAction(formData: FormData): Promise<void> {
  await requireSettingsEditor();
  const id = parseOptionalInt(formData.get("option_id"));
  if (!id) throw new Error("List item is missing.");
  deleteDropdownOption(id);
  refresh();
}

export async function createDispatcherUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireUserAdmin();
    const role = String(formData.get("role") ?? "dispatcher");
    const id = createDispatcherUser({
      name: requiredString(formData.get("name"), "Name"),
      password: requiredString(formData.get("password"), "Password"),
      role,
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      permission_group:
        String(formData.get("permission_group") ?? "").trim() || defaultPermissionGroupForRole(role),
      active: String(formData.get("active") ?? "") === "1",
    });
    refresh();
    redirect(`/users/${id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function startTotpEnrollmentAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  try {
    const dispatcher = await requireSignedInDispatcher();
    beginTotpEnrollment(dispatcher.id);
    refresh();
    return { ok: true, message: "Scan the QR code, then confirm a 6-digit code." };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelTotpEnrollmentAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  try {
    const dispatcher = await requireSignedInDispatcher();
    cancelTotpEnrollment(dispatcher.id);
    refresh();
    return { ok: true, message: "2-step setup cancelled." };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmTotpEnrollmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const dispatcher = await requireSignedInDispatcher();
    const code = String(formData.get("totp") ?? "").trim();
    if (!code) throw new Error("Enter the 6-digit authenticator code.");
    const recoveryCodes = confirmTotpEnrollment(dispatcher.id, code);
    refresh();
    return {
      ok: true,
      recoveryCodes,
      message: "2-step is on. Save these recovery codes now — they are shown once.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function saveTwoFactorPolicyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireUserAdmin();
    updateTwoFactorPolicy(String(formData.get("require_dispatcher_2fa") ?? "") === "1");
    refresh();
    return { ok: true, message: "2-step policy saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function resetDispatcherTotpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireUserAdmin();
    const id = parseOptionalInt(formData.get("user_id"));
    if (!id) throw new Error("User is missing.");
    resetDispatcherTotp(id, admin.name);
    refresh();
    return { ok: true, message: "2-step was reset. They sign in with their password and email code." };
  } catch (error) {
    return fail(error);
  }
}

export async function updateDispatcherUserAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireUserAdmin();
    const role = String(formData.get("role") ?? "dispatcher");
    updateDispatcherUser(id, {
      name: requiredString(formData.get("name"), "Name"),
      password: String(formData.get("password") ?? ""),
      role,
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      permission_group:
        String(formData.get("permission_group") ?? "").trim() || defaultPermissionGroupForRole(role),
      active: String(formData.get("active") ?? "") === "1",
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDispatcherUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireUserAdmin();
    const id = parseOptionalInt(formData.get("user_id"));
    if (!id) throw new Error("User is missing.");
    deleteDispatcherUser(id, admin.id);
    refresh();
    redirect("/users");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}
