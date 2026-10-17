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

export function formControlValue(
  form: Pick<HTMLFormElement, "elements">,
  name: string,
): string | undefined {
  const el = form.elements.namedItem(name);
  if (!el) return undefined;
  const list = el as RadioNodeList;
  if (typeof list.length === "number" && typeof list.item === "function") {
    for (let i = 0; i < list.length; i++) {
      const node = list.item(i) as { name?: string; value?: string } | null;
      if (node && node.name === name && node.value !== undefined) return String(node.value);
    }
    return undefined;
  }
  if ("value" in el) return String((el as { value: string }).value);
  return undefined;
}

export function everydayFieldsFromForm(form: Pick<HTMLFormElement, "elements">): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const name of LOAD_AUTOSAVE_FIELDS) {
    const value = formControlValue(form, name);
    if (value === undefined) continue;
    fields[name] = value;
  }
  return fields;
}
