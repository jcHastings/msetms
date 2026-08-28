/** Everyday load fields that persist on blur / tab leave. No env, db, or keys. */

export const LOAD_AUTOSAVE_FIELDS = [
  "commodity",
  "weight",
  "temperature_f",
  "notes",
  "public_notes",
  "posting_notes",
  "reference_number",
  "unload_type",
  "status",
  "truck_status",
  "load_size",
  "equipment",
  "reefer_mode",
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact_ext",
] as const;

export const LOAD_CRITICAL_FIELDS = [
  "customer_id",
  "customer_name",
  "new_customer_name",
  "rate",
  "oo_pay",
  "oo_percent",
  "declared_value",
  "non_revenue",
  "shipper_location_id",
  "consignee_location_id",
  "origin",
  "destination",
  "pickup_start",
  "pickup_end",
  "delivery_start",
  "delivery_end",
] as const;

export type LoadAutosaveField = (typeof LOAD_AUTOSAVE_FIELDS)[number];
export type LoadCriticalField = (typeof LOAD_CRITICAL_FIELDS)[number];

export function isLoadAutosaveField(name: string): boolean {
  return (LOAD_AUTOSAVE_FIELDS as readonly string[]).includes(name);
}

export function isLoadCriticalField(name: string): boolean {
  return (LOAD_CRITICAL_FIELDS as readonly string[]).includes(name);
}

export function everydayFieldsFromForm(form: Pick<HTMLFormElement, "elements">): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const name of LOAD_AUTOSAVE_FIELDS) {
    const el = form.elements.namedItem(name);
    if (!el || !("value" in el)) continue;
    fields[name] = String((el as { value: string }).value);
  }
  return fields;
}
