"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseOptionalFloat, parseOptionalInt, requiredString } from "./format";
import { requireSettingsEditor, requireUserAdmin } from "./dispatcher-session";
import {
  addDropdownOption,
  clearCompanyLogo,
  createDispatcherUser,
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
  updateUnitSettings,
  type DocumentType,
} from "./settings";
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

export async function clearLogoAction(): Promise<ActionResult> {
  try {
    await requireSettingsEditor();
    clearCompanyLogo();
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
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
    const id = createDispatcherUser({
      name: requiredString(formData.get("name"), "Name"),
      pin: requiredString(formData.get("pin"), "PIN"),
      role: String(formData.get("role") ?? "dispatcher"),
      email: String(formData.get("email") ?? ""),
      permission_group: String(formData.get("permission_group") ?? "all"),
      active: String(formData.get("active") ?? "") === "1",
    });
    refresh();
    redirect(`/settings/users/${id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
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
    updateDispatcherUser(id, {
      name: requiredString(formData.get("name"), "Name"),
      pin: String(formData.get("pin") ?? ""),
      role: String(formData.get("role") ?? "dispatcher"),
      email: String(formData.get("email") ?? ""),
      permission_group: String(formData.get("permission_group") ?? "all"),
      active: String(formData.get("active") ?? "") === "1",
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}
