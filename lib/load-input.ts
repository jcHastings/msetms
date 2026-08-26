import { cleanDateInput, fromInputDateTime, parseOptionalFloat, parseOptionalInt } from "./format";
import { placeholderLane } from "./load-page-shared";
import { findOrCreateCustomer, getDriver, type LoadInput } from "./queries";
import { isReeferMode } from "./reefer-shared";
import { DEFAULT_LOAD_EQUIPMENT, isOwnerOperator } from "./types";
import { computeOwnerOperatorPay } from "./settlement";
import { defaultOoPercent, isKnownLoadStatus } from "./settings";

export type ExistingLoadFields = {
  customer_id?: number;
  origin?: string;
  destination?: string;
  pickup_start?: string;
  pickup_end?: string;
  delivery_start?: string;
  delivery_end?: string;
  weight?: number | null;
  commodity?: string;
  rate?: number | null;
  notes?: string;
  special_instructions?: string;
  appointment_notes?: string;
  reference_number?: string;
  po_number?: string;
  reefer_setpoint_f?: number | null;
  reefer_mode?: string;
  trailer_number?: string;
  trailer_id?: number | null;
  shipper_location_id?: number | null;
  consignee_location_id?: number | null;
  oo_percent?: number | null;
  oo_pay?: number | null;
  status?: string;
  truck_id?: number | null;
  driver_id?: number | null;
  truck_status?: string;
  branch?: string;
  declared_value?: number | null;
  load_size?: string;
  condition_new_used?: string;
  equipment?: string;
  equipment_length?: string;
  temperature_f?: number | null;
  temp_low_f?: number | null;
  temp_high_f?: number | null;
  temp_time_tolerance?: string;
  container_number?: string;
  last_free_day?: string;
  public_notes?: string;
  posting_notes?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_ext?: string;
  customer_reference?: string;
  unload_type?: string;
  non_revenue?: number;
};

function keptString(formData: FormData, key: string, existing: string | undefined, fallback = ""): string {
  if (!formData.has(key)) return existing ?? fallback;
  return String(formData.get(key) ?? "").trim();
}

function keptOptionalFloat(
  formData: FormData,
  key: string,
  existing: number | null | undefined,
): number | null {
  if (!formData.has(key)) return existing ?? null;
  return parseOptionalFloat(formData.get(key));
}

function parseLaneDate(
  formData: FormData,
  key: string,
  fallback: string | undefined,
  placeholder: string,
): string {
  if (!formData.has(key)) return fallback || placeholder;
  const raw = String(formData.get(key) ?? "").trim();
  if (raw) return fromInputDateTime(raw);
  if (fallback) return fallback;
  return placeholder;
}

function parseAssignmentId(
  formData: FormData,
  key: "truck_id" | "driver_id" | "trailer_id",
  existing: number | null | undefined,
): number | null {
  if (!formData.has(key)) return existing ?? null;
  return parseOptionalInt(formData.get(key));
}

function parseCustomerId(
  formData: FormData,
  requireCustomer: boolean,
  existing: ExistingLoadFields | null | undefined,
): number {
  const hasCustomerFields =
    formData.has("customer_id") || formData.has("customer_name") || formData.has("new_customer_name");
  if (!hasCustomerFields) {
    if (existing?.customer_id) return existing.customer_id;
    throw new Error("Pick a customer.");
  }
  let customerId = parseOptionalInt(formData.get("customer_id"));
  if (!customerId && requireCustomer) {
    const extractedName = String(
      formData.get("customer_name") || formData.get("new_customer_name") || "",
    ).trim();
    if (extractedName) customerId = findOrCreateCustomer(extractedName);
  }
  if (!customerId) throw new Error("Pick a customer.");
  return customerId;
}

function parseStatus(formData: FormData, existing: ExistingLoadFields | null | undefined): string {
  if (!formData.has("status")) return existing?.status || "available";
  const status = String(formData.get("status") ?? "available");
  if (!isKnownLoadStatus(status)) throw new Error("Invalid load status.");
  return status;
}

function parseReeferModeField(
  formData: FormData,
  existing: ExistingLoadFields | null | undefined,
): string {
  if (!formData.has("reefer_mode")) return existing?.reefer_mode ?? "";
  const mode = String(formData.get("reefer_mode") ?? "").trim();
  if (!mode) return "";
  if (!isReeferMode(mode)) throw new Error("Pick Continuous or Start/Stop.");
  return mode;
}

function parseEquipment(formData: FormData, existing: ExistingLoadFields | null | undefined): string {
  if (!formData.has("equipment")) return existing?.equipment || DEFAULT_LOAD_EQUIPMENT;
  return String(formData.get("equipment") ?? "").trim() || DEFAULT_LOAD_EQUIPMENT;
}

function parseReferenceNumbers(
  formData: FormData,
  existing: ExistingLoadFields | null | undefined,
): { po_number: string; customer_reference: string } {
  if (formData.has("customer_reference")) {
    const ref = String(formData.get("customer_reference") ?? "").trim();
    const po = formData.has("po_number") ? String(formData.get("po_number") ?? "").trim() || ref : ref;
    return { po_number: po, customer_reference: ref };
  }
  if (formData.has("po_number")) {
    return {
      po_number: String(formData.get("po_number") ?? "").trim(),
      customer_reference: existing?.customer_reference ?? "",
    };
  }
  return {
    po_number: existing?.po_number ?? "",
    customer_reference: existing?.customer_reference ?? "",
  };
}

export function parseLoadInput(
  formData: FormData,
  requireCustomer = true,
  existing?: ExistingLoadFields | null,
): LoadInput {
  const lane = placeholderLane();
  const truckId = parseAssignmentId(formData, "truck_id", existing?.truck_id);
  const driverId = parseAssignmentId(formData, "driver_id", existing?.driver_id);
  const trailerId = parseAssignmentId(formData, "trailer_id", existing?.trailer_id);
  const refs = parseReferenceNumbers(formData, existing);
  const parsed: LoadInput = {
    customer_id: parseCustomerId(formData, requireCustomer, existing),
    origin: keptString(formData, "origin", existing?.origin, lane.origin),
    destination: keptString(formData, "destination", existing?.destination, lane.destination),
    pickup_start: parseLaneDate(formData, "pickup_start", existing?.pickup_start, lane.pickup_start),
    pickup_end: parseLaneDate(formData, "pickup_end", existing?.pickup_end, lane.pickup_end),
    delivery_start: parseLaneDate(formData, "delivery_start", existing?.delivery_start, lane.delivery_start),
    delivery_end: parseLaneDate(formData, "delivery_end", existing?.delivery_end, lane.delivery_end),
    weight: keptOptionalFloat(formData, "weight", existing?.weight),
    commodity: keptString(formData, "commodity", existing?.commodity),
    rate: keptOptionalFloat(formData, "rate", existing?.rate),
    notes: keptString(formData, "notes", existing?.notes),
    special_instructions: keptString(formData, "special_instructions", existing?.special_instructions),
    appointment_notes: keptString(formData, "appointment_notes", existing?.appointment_notes),
    reference_number: keptString(formData, "reference_number", existing?.reference_number),
    po_number: refs.po_number,
    reefer_setpoint_f: keptOptionalFloat(formData, "reefer_setpoint_f", existing?.reefer_setpoint_f),
    reefer_mode: parseReeferModeField(formData, existing),
    trailer_number: keptString(formData, "trailer_number", existing?.trailer_number),
    trailer_id: trailerId,
    shipper_location_id: formData.has("shipper_location_id")
      ? parseOptionalInt(formData.get("shipper_location_id"))
      : existing?.shipper_location_id ?? null,
    consignee_location_id: formData.has("consignee_location_id")
      ? parseOptionalInt(formData.get("consignee_location_id"))
      : existing?.consignee_location_id ?? null,
    oo_percent: formData.has("oo_percent")
      ? parseOptionalFloat(formData.get("oo_percent"))
      : existing?.oo_percent ?? null,
    status: parseStatus(formData, existing),
    truck_id: truckId,
    driver_id: driverId,
    truck_status: keptString(formData, "truck_status", existing?.truck_status),
    branch: keptString(formData, "branch", existing?.branch),
    declared_value: keptOptionalFloat(formData, "declared_value", existing?.declared_value),
    load_size: keptString(formData, "load_size", existing?.load_size),
    condition_new_used: keptString(formData, "condition_new_used", existing?.condition_new_used),
    equipment: parseEquipment(formData, existing),
    equipment_length: keptString(formData, "equipment_length", existing?.equipment_length),
    temperature_f: keptOptionalFloat(formData, "temperature_f", existing?.temperature_f),
    temp_low_f: keptOptionalFloat(formData, "temp_low_f", existing?.temp_low_f),
    temp_high_f: keptOptionalFloat(formData, "temp_high_f", existing?.temp_high_f),
    temp_time_tolerance: keptString(formData, "temp_time_tolerance", existing?.temp_time_tolerance),
    container_number: keptString(formData, "container_number", existing?.container_number),
    last_free_day: formData.has("last_free_day")
      ? cleanDateInput(formData.get("last_free_day"))
      : existing?.last_free_day ?? "",
    public_notes: keptString(formData, "public_notes", existing?.public_notes),
    posting_notes: keptString(formData, "posting_notes", existing?.posting_notes),
    contact_name: keptString(formData, "contact_name", existing?.contact_name),
    contact_email: keptString(formData, "contact_email", existing?.contact_email),
    contact_phone: keptString(formData, "contact_phone", existing?.contact_phone),
    contact_ext: keptString(formData, "contact_ext", existing?.contact_ext),
    customer_reference: refs.customer_reference,
    unload_type: keptString(formData, "unload_type", existing?.unload_type),
    non_revenue: formData.has("non_revenue")
      ? String(formData.get("non_revenue") ?? "") === "1"
        ? 1
        : 0
      : existing?.non_revenue ?? 0,
  };
  const driver = driverId ? getDriver(driverId) : null;
  if (isOwnerOperator(driver?.driver_type)) {
    const percent = parsed.oo_percent ?? driver.pay_percent ?? defaultOoPercent();
    parsed.oo_percent = percent;
    parsed.oo_pay = computeOwnerOperatorPay(parsed.rate, percent);
  } else {
    parsed.oo_percent = null;
    parsed.oo_pay = null;
  }
  return parsed;
}
