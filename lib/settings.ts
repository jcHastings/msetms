import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "./db";
import { isGooglePlacesConfigured } from "./env";
import { sanitizeName } from "./files";
import { printablePaperworkCopy } from "./paperwork-copy";
import {
  CURRENCIES,
  DISPATCHER_ROLES,
  DROPDOWN_KINDS,
  DOCUMENT_TYPES,
  PAY_METHODS,
  PERMISSION_GROUPS,
  canDeleteDispatcherUser,
  defaultPermissionGroupForRole,
  isAdminRole,
  type ComplianceWindows,
  type DispatcherUser,
  type DocumentType,
  type DropdownKind,
} from "./settings-shared";
import { setDispatcherPassword } from "./dispatcher-password";
import { dispatcherPasswordError } from "./dispatcher-password-shared";
import {
  BOL_TERMS,
  CUSTOMER_CONFIRMATION_TERMS,
  DRIVER_CONFIRMATION_TERMS,
  shouldReplaceStoredTerms,
} from "./document-copy";
import { DOCUMENT_FONTS, type DocumentFontFamily } from "./document-tags";
import { DEFAULT_INVOICE_EMAIL_BODY } from "./invoice-email-shared";
import { LOAD_STATUSES, type CompanyProfile } from "./types";
import { parseWorkflowSettings, type WorkflowSettings } from "./workflow-shared";

export * from "./settings-shared";

export type CompanySettings = CompanyProfile & {
  insurance_provider: string;
  insurance_policy: string;
  insurance_coverage: string;
  insurance_expires: string;
  logo_stored_name: string;
  logo_original_name: string;
  logo_mime_type: string;
  currency: string;
  weight_unit: "lb" | "kg";
  tax_enabled: number;
  tax_kind: "sales_tax" | "gst";
  tax_rate: number;
  alert_driver_days: number;
  alert_registration_days: number;
  alert_dot_days: number;
  alert_emails_enabled: number;
  alert_gps_quiet_hours: number;
  default_routing_notes: string;
  default_oo_percent: number;
  default_gross_margin_percent: number;
  carrier_pay_method: string;
  carrier_pay_notes: string;
  load_number_prefix: string;
  load_number_next: number;
  show_sample_data: number;
  require_dispatcher_2fa: number;
};

export type DropdownOption = {
  id: number;
  kind: DropdownKind;
  value: string;
  label: string;
  sort_order: number;
  active: number;
};

export type DocumentDefaults = {
  doc_type: DocumentType;
  header_text: string;
  footer_text: string;
  terms_text: string;
  font_size: number;
};

export const HASTINGS_OFFICE = {
  street: "600 E 39th St",
  city: "Hastings",
  state: "NE",
  zip: "68901",
} as const;

/** Hastings office when Settings street and city are both blank. Never overwrites a saved address. */
export function withOfficeAddress<T extends { street: string; city: string; state: string; zip: string }>(
  profile: T,
): T {
  if (profile.street.trim() || profile.city.trim()) return profile;
  return {
    ...profile,
    street: HASTINGS_OFFICE.street,
    city: HASTINGS_OFFICE.city,
    state: profile.state.trim() || HASTINGS_OFFICE.state,
    zip: profile.zip.trim() || HASTINGS_OFFICE.zip,
  };
}

const SETTINGS_DEFAULTS: CompanySettings = {
  company_name: "M&S Loads",
  dispatcher_name: "MS Test",
  dispatcher_phone: "402-302-0097",
  dispatcher_fax: "",
  dispatcher_email: "ana@msloads.com",
  street: "",
  city: "",
  state: "",
  zip: "",
  insurance_provider: "",
  insurance_policy: "",
  insurance_coverage: "",
  insurance_expires: "",
  logo_stored_name: "",
  logo_original_name: "",
  logo_mime_type: "",
  currency: "USD",
  weight_unit: "lb",
  tax_enabled: 0,
  tax_kind: "sales_tax",
  tax_rate: 0,
  alert_driver_days: 30,
  alert_registration_days: 60,
  alert_dot_days: 30,
  alert_emails_enabled: 0,
  alert_gps_quiet_hours: 2,
  default_routing_notes: "",
  default_oo_percent: 75,
  default_gross_margin_percent: 18,
  carrier_pay_method: "ach",
  carrier_pay_notes: "",
  load_number_prefix: "MSE",
  load_number_next: 1001,
  show_sample_data: 1,
  require_dispatcher_2fa: 1,
};

const SETTINGS_COLUMNS = [
  "company_name",
  "dispatcher_name",
  "dispatcher_phone",
  "dispatcher_fax",
  "dispatcher_email",
  "street",
  "city",
  "state",
  "zip",
  "insurance_provider",
  "insurance_policy",
  "insurance_coverage",
  "insurance_expires",
  "logo_stored_name",
  "logo_original_name",
  "logo_mime_type",
  "currency",
  "weight_unit",
  "tax_enabled",
  "tax_kind",
  "tax_rate",
  "alert_driver_days",
  "alert_registration_days",
  "alert_dot_days",
  "alert_emails_enabled",
  "alert_gps_quiet_hours",
  "default_routing_notes",
  "default_oo_percent",
  "default_gross_margin_percent",
  "carrier_pay_method",
  "carrier_pay_notes",
  "load_number_prefix",
  "load_number_next",
  "show_sample_data",
  "require_dispatcher_2fa",
] as const;

export function getInvoiceEmailBody(): string {
  const row = getDb()
    .prepare("SELECT invoice_email_body FROM company_profile WHERE id = 1")
    .get() as { invoice_email_body?: string } | undefined;
  const text = String(row?.invoice_email_body ?? "").trim();
  return text || DEFAULT_INVOICE_EMAIL_BODY;
}

export function updateInvoiceEmailBody(text: string): string {
  const next = String(text ?? "").trim() || DEFAULT_INVOICE_EMAIL_BODY;
  getDb().prepare("UPDATE company_profile SET invoice_email_body = ? WHERE id = 1").run(next);
  return next;
}

export function getCompanySettings(): CompanySettings {
  const row = getDb()
    .prepare(`SELECT ${SETTINGS_COLUMNS.join(", ")} FROM company_profile WHERE id = 1`)
    .get() as Partial<CompanySettings> | undefined;
  return normalizeSettings(row);
}

function normalizeSettings(row?: Partial<CompanySettings> | null): CompanySettings {
  const merged = withOfficeAddress({ ...SETTINGS_DEFAULTS, ...(row ?? {}) });
  return {
    ...merged,
    currency: CURRENCIES.includes(merged.currency as (typeof CURRENCIES)[number]) ? merged.currency : "USD",
    weight_unit: merged.weight_unit === "kg" ? "kg" : "lb",
    tax_kind: merged.tax_kind === "gst" ? "gst" : "sales_tax",
    tax_enabled: Number(merged.tax_enabled) ? 1 : 0,
    alert_emails_enabled: Number(merged.alert_emails_enabled) ? 1 : 0,
    show_sample_data: Number(merged.show_sample_data) ? 1 : 0,
    require_dispatcher_2fa: Number(merged.require_dispatcher_2fa) ? 1 : 0,
    tax_rate: Number(merged.tax_rate) || 0,
    alert_driver_days: Number(merged.alert_driver_days) || 30,
    alert_registration_days: Number(merged.alert_registration_days) || 60,
    alert_dot_days: Number(merged.alert_dot_days) || 30,
    alert_gps_quiet_hours: Number(merged.alert_gps_quiet_hours) || 2,
    default_oo_percent: Number(merged.default_oo_percent) || 75,
    default_gross_margin_percent: Number(merged.default_gross_margin_percent) || 0,
    load_number_next: Number(merged.load_number_next) || 1001,
    load_number_prefix: String(merged.load_number_prefix || "MSE").trim() || "MSE",
  };
}

function patchSettings(patch: Partial<CompanySettings>): CompanySettings {
  const current = getCompanySettings();
  const next = normalizeSettings({ ...current, ...patch });
  getDb()
    .prepare(
      `UPDATE company_profile SET
         company_name = ?, dispatcher_name = ?, dispatcher_phone = ?, dispatcher_fax = ?, dispatcher_email = ?,
         street = ?, city = ?, state = ?, zip = ?,
         insurance_provider = ?, insurance_policy = ?, insurance_coverage = ?, insurance_expires = ?,
         logo_stored_name = ?, logo_original_name = ?, logo_mime_type = ?,
         currency = ?, weight_unit = ?, tax_enabled = ?, tax_kind = ?, tax_rate = ?,
         alert_driver_days = ?, alert_registration_days = ?, alert_dot_days = ?, alert_emails_enabled = ?,
         alert_gps_quiet_hours = ?,
         default_routing_notes = ?, default_oo_percent = ?, default_gross_margin_percent = ?,
         carrier_pay_method = ?, carrier_pay_notes = ?,
         load_number_prefix = ?, load_number_next = ?, show_sample_data = ?,
         require_dispatcher_2fa = ?
       WHERE id = 1`,
    )
    .run(
      next.company_name,
      next.dispatcher_name,
      next.dispatcher_phone,
      next.dispatcher_fax,
      next.dispatcher_email,
      next.street,
      next.city,
      next.state,
      next.zip,
      next.insurance_provider,
      next.insurance_policy,
      next.insurance_coverage,
      next.insurance_expires,
      next.logo_stored_name,
      next.logo_original_name,
      next.logo_mime_type,
      next.currency,
      next.weight_unit,
      next.tax_enabled,
      next.tax_kind,
      next.tax_rate,
      next.alert_driver_days,
      next.alert_registration_days,
      next.alert_dot_days,
      next.alert_emails_enabled,
      next.alert_gps_quiet_hours,
      next.default_routing_notes,
      next.default_oo_percent,
      next.default_gross_margin_percent,
      next.carrier_pay_method,
      next.carrier_pay_notes,
      next.load_number_prefix,
      next.load_number_next,
      next.show_sample_data,
      next.require_dispatcher_2fa,
    );
  return next;
}

export function updateCompanyContact(input: CompanyProfile): CompanySettings {
  return patchSettings({
    company_name: input.company_name.trim() || SETTINGS_DEFAULTS.company_name,
    dispatcher_name: input.dispatcher_name.trim() || SETTINGS_DEFAULTS.dispatcher_name,
    dispatcher_phone: input.dispatcher_phone.trim(),
    dispatcher_fax: input.dispatcher_fax.trim(),
    dispatcher_email: input.dispatcher_email.trim(),
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip.trim(),
  });
}

export function updateInsuranceSettings(input: {
  insurance_provider: string;
  insurance_policy: string;
  insurance_coverage: string;
  insurance_expires: string;
}): CompanySettings {
  return patchSettings({
    insurance_provider: input.insurance_provider.trim(),
    insurance_policy: input.insurance_policy.trim(),
    insurance_coverage: input.insurance_coverage.trim(),
    insurance_expires: input.insurance_expires.trim(),
  });
}

export function updateUnitSettings(input: { currency: string; weight_unit: string }): CompanySettings {
  if (!CURRENCIES.includes(input.currency as (typeof CURRENCIES)[number])) {
    throw new Error("Pick USD or CAD.");
  }
  if (input.weight_unit !== "lb" && input.weight_unit !== "kg") {
    throw new Error("Pick lb or kg.");
  }
  return patchSettings({ currency: input.currency, weight_unit: input.weight_unit });
}

export function updateTaxSettings(input: {
  tax_enabled: boolean;
  tax_kind: string;
  tax_rate: number;
}): CompanySettings {
  if (input.tax_kind !== "sales_tax" && input.tax_kind !== "gst") {
    throw new Error("Pick sales tax or GST.");
  }
  if (input.tax_rate < 0 || input.tax_rate > 30) {
    throw new Error("Tax rate must be between 0 and 30.");
  }
  return patchSettings({
    tax_enabled: input.tax_enabled ? 1 : 0,
    tax_kind: input.tax_kind,
    tax_rate: input.tax_rate,
  });
}

export function updateAlertSettings(input: {
  alert_driver_days: number;
  alert_registration_days: number;
  alert_dot_days: number;
  alert_emails_enabled: boolean;
  alert_gps_quiet_hours?: number;
}): CompanySettings {
  for (const [label, value] of [
    ["License / medical window", input.alert_driver_days],
    ["Registration window", input.alert_registration_days],
    ["DOT window", input.alert_dot_days],
  ] as const) {
    if (!Number.isFinite(value) || value < 1 || value > 365) {
      throw new Error(`${label} must be between 1 and 365 days.`);
    }
  }
  const quietHours = input.alert_gps_quiet_hours ?? getCompanySettings().alert_gps_quiet_hours ?? 2;
  if (!Number.isFinite(quietHours) || quietHours < 1 || quietHours > 48) {
    throw new Error("GPS quiet window must be between 1 and 48 hours.");
  }
  return patchSettings({
    alert_driver_days: input.alert_driver_days,
    alert_registration_days: input.alert_registration_days,
    alert_dot_days: input.alert_dot_days,
    alert_emails_enabled: input.alert_emails_enabled ? 1 : 0,
    alert_gps_quiet_hours: quietHours,
  });
}

export function updateRoutingNotes(notes: string): CompanySettings {
  return patchSettings({ default_routing_notes: notes.trim() });
}

export function updatePaySettings(input: {
  default_oo_percent: number;
  default_gross_margin_percent: number;
  carrier_pay_method: string;
  carrier_pay_notes: string;
}): CompanySettings {
  if (!Number.isFinite(input.default_oo_percent) || input.default_oo_percent < 0 || input.default_oo_percent > 100) {
    throw new Error("Owner-operator default % must be between 0 and 100.");
  }
  if (
    !Number.isFinite(input.default_gross_margin_percent) ||
    input.default_gross_margin_percent < 0 ||
    input.default_gross_margin_percent > 100
  ) {
    throw new Error("Target gross margin must be between 0 and 100.");
  }
  if (!PAY_METHODS.some((item) => item.value === input.carrier_pay_method)) {
    throw new Error("Pick a carrier pay method.");
  }
  return patchSettings({
    default_oo_percent: input.default_oo_percent,
    default_gross_margin_percent: input.default_gross_margin_percent,
    carrier_pay_method: input.carrier_pay_method,
    carrier_pay_notes: input.carrier_pay_notes.trim(),
  });
}

export function updateLoadManagementSettings(input: {
  load_number_prefix: string;
  load_number_next: number;
  show_sample_data: boolean;
}): CompanySettings {
  const prefix = input.load_number_prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!prefix) throw new Error("Load number prefix is required.");
  if (!Number.isInteger(input.load_number_next) || input.load_number_next < 1) {
    throw new Error("Starting load number must be a positive whole number.");
  }
  return patchSettings({
    load_number_prefix: prefix,
    load_number_next: input.load_number_next,
    show_sample_data: input.show_sample_data ? 1 : 0,
  });
}

export function defaultOoPercent(): number {
  return getCompanySettings().default_oo_percent;
}

export function complianceWindows(): ComplianceWindows {
  const settings = getCompanySettings();
  return {
    driverDays: settings.alert_driver_days,
    registrationDays: settings.alert_registration_days,
    dotDays: settings.alert_dot_days,
  };
}

export function peekNextLoadNumber(): string {
  const settings = getCompanySettings();
  return `${settings.load_number_prefix}-${settings.load_number_next}`;
}

export function takeNextLoadNumber(): string {
  const settings = getCompanySettings();
  const loadNumber = `${settings.load_number_prefix}-${settings.load_number_next}`;
  patchSettings({ load_number_next: settings.load_number_next + 1 });
  return loadNumber;
}

export function showsSampleData(): boolean {
  return getCompanySettings().show_sample_data === 1;
}

export function taxOnAmount(amount: number | null | undefined): {
  enabled: boolean;
  label: string;
  rate: number;
  tax: number;
  total: number;
} {
  const settings = getCompanySettings();
  const base = amount ?? 0;
  const tax = settings.tax_enabled ? Math.round(base * (settings.tax_rate / 100) * 100) / 100 : 0;
  return {
    enabled: Boolean(settings.tax_enabled),
    label: settings.tax_kind === "gst" ? "GST" : "Sales tax",
    rate: settings.tax_rate,
    tax,
    total: Math.round((base + tax) * 100) / 100,
  };
}

export function formatCompanyAddress(settings: CompanySettings = getCompanySettings()): string {
  return [settings.street, [settings.city, settings.state].filter(Boolean).join(", "), settings.zip]
    .filter((part) => part.trim())
    .join(" · ");
}

export function listDropdownOptions(kind?: DropdownKind, includeInactive = false): DropdownOption[] {
  const clauses = [];
  const params: string[] = [];
  if (kind) {
    clauses.push("kind = ?");
    params.push(kind);
  }
  if (!includeInactive) clauses.push("active = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `SELECT * FROM dropdown_lists ${where} ORDER BY kind, sort_order, label COLLATE NOCASE`,
    )
    .all(...params) as DropdownOption[];
}

export function addDropdownOption(input: { kind: string; value: string; label: string }): number {
  if (!DROPDOWN_KINDS.some((item) => item.value === input.kind)) {
    throw new Error("Pick commodities, equipment, or load statuses.");
  }
  const label = input.label.trim();
  const value =
    input.value.trim() ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  if (!label || !value) throw new Error("Label is required.");
  const kind = input.kind as DropdownKind;
  const existing = getDb()
    .prepare("SELECT id FROM dropdown_lists WHERE kind = ? AND value = ?")
    .get(kind, value) as { id: number } | undefined;
  if (existing) throw new Error("That list value already exists.");
  const max = getDb()
    .prepare("SELECT COALESCE(MAX(sort_order), 0) as max FROM dropdown_lists WHERE kind = ?")
    .get(kind) as { max: number };
  const result = getDb()
    .prepare(
      `INSERT INTO dropdown_lists (kind, value, label, sort_order, active)
       VALUES (?, ?, ?, ?, 1)`,
    )
    .run(kind, value, label, max.max + 1);
  return Number(result.lastInsertRowid);
}

export function setDropdownOptionActive(id: number, active: boolean): void {
  const row = getDb().prepare("SELECT id FROM dropdown_lists WHERE id = ?").get(id) as { id: number } | undefined;
  if (!row) throw new Error("List item was not found.");
  getDb().prepare("UPDATE dropdown_lists SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
}

export function deleteDropdownOption(id: number): void {
  getDb().prepare("DELETE FROM dropdown_lists WHERE id = ?").run(id);
}

export function isCustomLoadStatus(value: string): boolean {
  return listDropdownOptions("load_status").some((item) => item.value === value);
}

export function isKnownLoadStatus(value: string): boolean {
  return (LOAD_STATUSES as readonly string[]).includes(value) || isCustomLoadStatus(value);
}

export function customLoadStatuses(): Array<{ value: string; label: string }> {
  return listDropdownOptions("load_status").map((item) => ({ value: item.value, label: item.label }));
}

export function commoditySuggestions(): string[] {
  return listDropdownOptions("commodity").map((item) => item.label);
}

export function loadFormSettings(): {
  commodities: string[];
  extraStatuses: Array<{ value: string; label: string }>;
  defaultOoPercent: number;
  weightUnit: "lb" | "kg";
  currency: string;
  targetMarginPercent: number;
  placesEnabled: boolean;
  alertWindows: ComplianceWindows;
} {
  const settings = getCompanySettings();
  return {
    commodities: commoditySuggestions(),
    extraStatuses: customLoadStatuses(),
    defaultOoPercent: settings.default_oo_percent,
    weightUnit: settings.weight_unit,
    currency: settings.currency,
    targetMarginPercent: settings.default_gross_margin_percent,
    placesEnabled: isGooglePlacesConfigured(),
    alertWindows: complianceWindows(),
  };
}

export function equipmentOptions(): Array<{ value: string; label: string }> {
  const extras = listDropdownOptions("equipment");
  if (extras.length === 0) return [];
  return extras.map((item) => ({ value: item.value, label: item.label }));
}

function scrubDocumentLecture(row: DocumentDefaults): DocumentDefaults {
  return {
    ...row,
    footer_text: printablePaperworkCopy(row.footer_text),
    terms_text: printablePaperworkCopy(row.terms_text),
  };
}

export function listDocumentDefaults(): DocumentDefaults[] {
  return (getDb().prepare("SELECT * FROM document_defaults ORDER BY doc_type").all() as DocumentDefaults[]).map(
    scrubDocumentLecture,
  );
}

export function getDocumentDefaults(docType: DocumentType): DocumentDefaults {
  const row = getDb()
    .prepare("SELECT * FROM document_defaults WHERE doc_type = ?")
    .get(docType) as DocumentDefaults | undefined;
  return scrubDocumentLecture(
    row ?? {
      doc_type: docType,
      header_text: "",
      footer_text: "",
      terms_text: "",
      font_size: 10,
    },
  );
}

export function updateDocumentDefaults(input: DocumentDefaults): void {
  if (!DOCUMENT_TYPES.some((item) => item.value === input.doc_type)) {
    throw new Error("Pick a document type.");
  }
  const font = Number(input.font_size);
  if (!Number.isFinite(font) || font < 7 || font > 16) {
    throw new Error("Font size must be between 7 and 16.");
  }
  getDb()
    .prepare(
      `INSERT INTO document_defaults (doc_type, header_text, footer_text, terms_text, font_size)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(doc_type) DO UPDATE SET
         header_text = excluded.header_text,
         footer_text = excluded.footer_text,
         terms_text = excluded.terms_text,
         font_size = excluded.font_size`,
    )
    .run(
      input.doc_type,
      input.header_text.trim(),
      printablePaperworkCopy(input.footer_text),
      printablePaperworkCopy(input.terms_text),
      font,
    );
}

export const DEFAULT_COMPANY_LOGO_FILE = "ms-express-logo.png";

export function defaultCompanyLogoPath(): string | null {
  const candidates = [
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", DEFAULT_COMPANY_LOGO_FILE),
    path.join(/*turbopackIgnore: true*/ process.cwd(), DEFAULT_COMPANY_LOGO_FILE),
  ];
  for (const file of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ file)) return file;
  }
  return null;
}

export function hasCustomCompanyLogo(settings: CompanySettings = getCompanySettings()): boolean {
  if (!settings.logo_stored_name) return false;
  const file = path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", "company", settings.logo_stored_name);
  return fs.existsSync(/*turbopackIgnore: true*/ file);
}

export function companyLogoPath(settings: CompanySettings = getCompanySettings()): string | null {
  if (hasCustomCompanyLogo(settings)) {
    return path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", "company", settings.logo_stored_name);
  }
  return defaultCompanyLogoPath();
}

export function saveCompanyLogo(input: { originalName: string; buffer: Buffer; mimeType: string }): CompanySettings {
  if (input.buffer.length > 4 * 1024 * 1024) throw new Error("Logo must be 4 MB or smaller.");
  const mime = input.mimeType || "";
  if (!mime.startsWith("image/") && !/\.(png|jpe?g|webp)$/i.test(input.originalName)) {
    throw new Error("Upload a PNG, JPG, or WebP logo.");
  }
  const current = getCompanySettings();
  const dir = path.join(/*turbopackIgnore: true*/ getDataDir(), "uploads", "company");
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  if (current.logo_stored_name) {
    const previous = path.join(dir, current.logo_stored_name);
    if (fs.existsSync(/*turbopackIgnore: true*/ previous)) fs.unlinkSync(/*turbopackIgnore: true*/ previous);
  }
  const storedName = `${randomUUID()}-${sanitizeName(input.originalName)}`;
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(dir, storedName), input.buffer);
  return patchSettings({
    logo_stored_name: storedName,
    logo_original_name: input.originalName,
    logo_mime_type: mime || "image/png",
  });
}

export function clearCompanyLogo(): CompanySettings {
  const current = getCompanySettings();
  if (current.logo_stored_name) {
    const file = path.join(
      /*turbopackIgnore: true*/ getDataDir(),
      "uploads",
      "company",
      current.logo_stored_name,
    );
    if (fs.existsSync(/*turbopackIgnore: true*/ file)) fs.unlinkSync(/*turbopackIgnore: true*/ file);
  }
  return patchSettings({ logo_stored_name: "", logo_original_name: "", logo_mime_type: "" });
}

const DISPATCHER_SAFE_COLUMNS = `id, name, role, email, phone, active, permission_group, totp_enrolled, must_change_password,
  CASE WHEN length(trim(password_hash)) > 0 THEN 1 ELSE 0 END AS has_password`;

export function listDispatcherUsers(includeInactive = true): DispatcherUser[] {
  const where = includeInactive ? "" : "WHERE active = 1";
  return getDb()
    .prepare(`SELECT ${DISPATCHER_SAFE_COLUMNS} FROM dispatchers ${where} ORDER BY name COLLATE NOCASE`)
    .all() as DispatcherUser[];
}

export function getDispatcherUser(id: number): DispatcherUser | null {
  return (
    (getDb()
      .prepare(`SELECT ${DISPATCHER_SAFE_COLUMNS} FROM dispatchers WHERE id = ?`)
      .get(id) as DispatcherUser | undefined) ?? null
  );
}

export function isDispatcherTwoFactorRequired(): boolean {
  return Boolean(getCompanySettings().require_dispatcher_2fa);
}

export function updateTwoFactorPolicy(requireDispatcher2fa: boolean): CompanySettings {
  return patchSettings({ require_dispatcher_2fa: requireDispatcher2fa ? 1 : 0 });
}

function parseDispatcherRole(role: string): string {
  if (!DISPATCHER_ROLES.some((item) => item.value === role)) {
    throw new Error("Pick Administrator, Standard, or Accounting.");
  }
  return role;
}

function parsePermissionGroup(value: string): string {
  if (!PERMISSION_GROUPS.some((item) => item.value === value)) {
    throw new Error("Pick a permission group.");
  }
  return value;
}

function countAdmins(exceptId?: number): number {
  const rows = listDispatcherUsers(true).filter(
    (user) => user.active && isAdminRole(user.role) && user.id !== exceptId,
  );
  return rows.length;
}

export function createDispatcherUser(input: {
  name: string;
  password: string;
  role: string;
  email?: string;
  phone?: string;
  permission_group?: string;
  active?: boolean;
}): number {
  const name = input.name.trim();
  const password = input.password;
  if (!name) throw new Error("Name is required.");
  const policy = dispatcherPasswordError(password);
  if (policy) throw new Error(policy);
  const role = parseDispatcherRole(input.role);
  const group = parsePermissionGroup(input.permission_group ?? defaultPermissionGroupForRole(role));
  const result = getDb()
    .prepare(
      `INSERT INTO dispatchers (name, pin, role, email, phone, active, permission_group, password_hash)
       VALUES (?, '', ?, ?, ?, ?, ?, '')`,
    )
    .run(
      name,
      role,
      (input.email ?? "").trim(),
      (input.phone ?? "").trim(),
      input.active === false ? 0 : 1,
      group,
    );
  const id = Number(result.lastInsertRowid);
  setDispatcherPassword(id, password, { requireChange: true });
  return id;
}

export function updateDispatcherUser(
  id: number,
  input: {
    name: string;
    role: string;
    email?: string;
    phone?: string;
    password?: string;
    permission_group?: string;
    active?: boolean;
  },
): void {
  const existing = getDispatcherUser(id);
  if (!existing) throw new Error("User was not found.");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const role = parseDispatcherRole(input.role);
  const group = parsePermissionGroup(input.permission_group ?? existing.permission_group);
  const active = input.active === false ? 0 : 1;
  if ((!active || !isAdminRole(role)) && isAdminRole(existing.role) && existing.active && countAdmins(id) === 0) {
    throw new Error("Keep at least one active Administrator.");
  }
  getDb()
    .prepare(
      `UPDATE dispatchers
       SET name = ?, role = ?, email = ?, phone = ?, active = ?, permission_group = ?, pin = ''
       WHERE id = ?`,
    )
    .run(name, role, (input.email ?? "").trim(), (input.phone ?? existing.phone ?? "").trim(), active, group, id);
  const password = input.password?.trim() ?? "";
  if (password) setDispatcherPassword(id, password, { requireChange: true });
}

export function updateOwnDispatcherContact(
  id: number,
  input: { email?: string; phone?: string },
): void {
  const existing = getDispatcherUser(id);
  if (!existing) throw new Error("User was not found.");
  getDb()
    .prepare("UPDATE dispatchers SET email = ?, phone = ? WHERE id = ?")
    .run((input.email ?? existing.email ?? "").trim(), (input.phone ?? existing.phone ?? "").trim(), id);
}

export function deleteDispatcherUser(id: number, actorId?: number | null): void {
  const existing = getDispatcherUser(id);
  if (!existing) throw new Error("User was not found.");
  const allowed = canDeleteDispatcherUser({
    targetId: id,
    targetRole: existing.role,
    targetActive: existing.active,
    actorId,
    otherActiveAdmins: countAdmins(id),
  });
  if (!allowed.ok) throw new Error(allowed.reason);
  const db = getDb();
  db.prepare("UPDATE loads SET dispatcher_id = NULL WHERE dispatcher_id = ?").run(id);
  const rules = db.prepare("SELECT id, recipient_ids FROM alert_rules").all() as Array<{
    id: number;
    recipient_ids: string;
  }>;
  const rewrite = db.prepare("UPDATE alert_rules SET recipient_ids = ? WHERE id = ?");
  for (const rule of rules) {
    let ids: number[] = [];
    try {
      const parsed = JSON.parse(rule.recipient_ids) as unknown;
      ids = Array.isArray(parsed) ? parsed.map(Number).filter((value) => Number.isInteger(value) && value > 0) : [];
    } catch {
      ids = [];
    }
    if (!ids.includes(id)) continue;
    rewrite.run(JSON.stringify(ids.filter((value) => value !== id)), rule.id);
  }
  db.prepare("DELETE FROM dispatchers WHERE id = ?").run(id);
}

export function getDocumentFont(): { family: DocumentFontFamily; scale: number } {
  const row = getDb()
    .prepare("SELECT document_font_family, document_font_scale FROM company_profile WHERE id = 1")
    .get() as { document_font_family?: string; document_font_scale?: number } | undefined;
  const family = DOCUMENT_FONTS.some((item) => item.value === row?.document_font_family)
    ? (row?.document_font_family as DocumentFontFamily)
    : "helvetica";
  const scale = Number(row?.document_font_scale) || 100;
  return { family, scale: Math.min(160, Math.max(80, scale)) };
}

export function updateDocumentFont(input: { family: string; scale: number }): void {
  if (!DOCUMENT_FONTS.some((item) => item.value === input.family)) {
    throw new Error("Pick Arial, Times, or Courier.");
  }
  const scale = Number(input.scale);
  if (!Number.isFinite(scale) || scale < 80 || scale > 160) {
    throw new Error("Font scale must be between 80% and 160%.");
  }
  getDb()
    .prepare("UPDATE company_profile SET document_font_family = ?, document_font_scale = ? WHERE id = 1")
    .run(input.family, Math.round(scale));
}

export function getWorkflowSettings(): WorkflowSettings {
  const row = getDb()
    .prepare("SELECT workflow_json FROM company_profile WHERE id = 1")
    .get() as { workflow_json?: string } | undefined;
  return parseWorkflowSettings(row?.workflow_json);
}

export function updateWorkflowSettings(input: WorkflowSettings): WorkflowSettings {
  const next = parseWorkflowSettings(JSON.stringify(input));
  const db = getDb();
  const written = db.prepare("UPDATE company_profile SET workflow_json = ? WHERE id = 1").run(JSON.stringify(next));
  if (written.changes === 0) {
    db.prepare(
      `INSERT OR IGNORE INTO company_profile (
        id, company_name, dispatcher_name, dispatcher_phone, dispatcher_fax, dispatcher_email
      ) VALUES (1, 'M&S Loads', 'MS Test', '', '', '')`,
    ).run();
    db.prepare("UPDATE company_profile SET workflow_json = ? WHERE id = 1").run(JSON.stringify(next));
  }
  return next;
}

export function seedDocumentTermsIfEmpty(): void {
  const updates: Array<[DocumentType, string]> = [
    ["load_confirmation", DRIVER_CONFIRMATION_TERMS],
    ["customer_confirmation", CUSTOMER_CONFIRMATION_TERMS],
    ["bol", BOL_TERMS],
  ];
  const read = getDb().prepare("SELECT terms_text FROM document_defaults WHERE doc_type = ?");
  const write = getDb().prepare("UPDATE document_defaults SET terms_text = ? WHERE doc_type = ?");
  for (const [docType, terms] of updates) {
    const row = read.get(docType) as { terms_text?: string } | undefined;
    if (shouldReplaceStoredTerms(docType, row?.terms_text ?? "")) write.run(terms, docType);
  }
}
