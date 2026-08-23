"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromInputDateTime, parseOptionalFloat, parseOptionalInt, requiredString } from "./format";
import {
  assignLoad,
  createCustomer,
  createDriver,
  createLoad,
  createLocation,
  createSavedReport,
  createTrailer,
  createTruck,
  deleteLocation,
  deleteSavedReport,
  findOrCreateCustomer,
  getDriver,
  getTrailer,
  getTruck,
  updateCustomer,
  updateDriver,
  updateLoad,
  updateLoadStatus,
  updateLocation,
  updateTrailer,
  updateTruck,
  type LoadInput,
} from "./queries";
import { collectAssignmentAlerts, requireAssignmentOverride } from "./compliance";
import { computeOwnerOperatorPay } from "./settlement";
import {
  DRIVER_STATUSES,
  DRIVER_TYPES,
  TRAILER_TYPES,
  TRUCK_STATUSES,
  TRUCK_TYPES,
  isLocationRole,
  isSchedulingType,
  type ActionResult,
  type DriverKind,
  type DriverStatus,
  type LocationRole,
  type SchedulingType,
  type TrailerType,
  type TruckStatus,
  type TruckType,
} from "./types";
import { defaultSearchCriteria, isSearchColumnKey, parseSavedFilters, type SearchColumnKey } from "./search";
import { defaultOoPercent, isKnownLoadStatus } from "./settings";

function refresh(): void {
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function parseContacts(formData: FormData) {
  const raw = String(formData.get("contacts") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as Array<{
      name?: string;
      role?: string;
      phone?: string;
      email?: string;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((contact) => ({
      name: String(contact.name ?? "").trim(),
      role: String(contact.role ?? "").trim(),
      phone: String(contact.phone ?? "").trim(),
      email: String(contact.email ?? "").trim(),
    }));
  } catch {
    throw new Error("Contacts could not be saved.");
  }
}

function parseLoadInput(formData: FormData, requireCustomer = true): LoadInput {
  let customerId = parseOptionalInt(formData.get("customer_id"));
  if (!customerId && requireCustomer) {
    const extractedName = String(formData.get("customer_name") ?? "").trim();
    if (extractedName) {
      customerId = findOrCreateCustomer(extractedName);
    }
  }
  if (!customerId) throw new Error("Pick a customer.");
  const statusValue = String(formData.get("status") ?? "available");
  if (!isKnownLoadStatus(statusValue)) throw new Error("Invalid load status.");
  const truckId = parseOptionalInt(formData.get("truck_id"));
  const driverId = parseOptionalInt(formData.get("driver_id"));
  const parsed: LoadInput = {
    customer_id: customerId,
    origin: requiredString(formData.get("origin"), "Origin"),
    destination: requiredString(formData.get("destination"), "Destination"),
    pickup_start: fromInputDateTime(requiredString(formData.get("pickup_start"), "Pickup start")),
    pickup_end: fromInputDateTime(requiredString(formData.get("pickup_end"), "Pickup end")),
    delivery_start: fromInputDateTime(requiredString(formData.get("delivery_start"), "Delivery start")),
    delivery_end: fromInputDateTime(requiredString(formData.get("delivery_end"), "Delivery end")),
    weight: parseOptionalInt(formData.get("weight")),
    commodity: String(formData.get("commodity") ?? "").trim(),
    rate: parseOptionalFloat(formData.get("rate")),
    notes: String(formData.get("notes") ?? "").trim(),
    special_instructions: String(formData.get("special_instructions") ?? "").trim(),
    appointment_notes: String(formData.get("appointment_notes") ?? "").trim(),
    reference_number: String(formData.get("reference_number") ?? "").trim(),
    po_number: String(formData.get("po_number") ?? "").trim(),
    reefer_setpoint_f: parseOptionalFloat(formData.get("reefer_setpoint_f")),
    trailer_number: String(formData.get("trailer_number") ?? "").trim(),
    trailer_id: parseOptionalInt(formData.get("trailer_id")),
    shipper_location_id: parseOptionalInt(formData.get("shipper_location_id")),
    consignee_location_id: parseOptionalInt(formData.get("consignee_location_id")),
    oo_percent: parseOptionalFloat(formData.get("oo_percent")),
    status: statusValue,
    truck_id: truckId,
    driver_id: driverId,
  };
  const driver = driverId ? getDriver(driverId) : null;
  if (driver?.driver_type === "owner_operator") {
    const percent = parsed.oo_percent ?? driver.pay_percent ?? defaultOoPercent();
    parsed.oo_percent = percent;
    parsed.oo_pay = computeOwnerOperatorPay(parsed.rate, percent);
  } else {
    parsed.oo_percent = null;
    parsed.oo_pay = null;
  }
  return parsed;
}

function parseTrailerType(value: FormDataEntryValue | null): TrailerType {
  const type = String(value ?? "");
  if (!TRAILER_TYPES.some((item) => item.value === type)) {
    throw new Error("Pick a trailer type.");
  }
  return type as TrailerType;
}

function parseDriverKind(value: FormDataEntryValue | null): DriverKind {
  const type = String(value ?? "company_driver");
  if (!DRIVER_TYPES.some((item) => item.value === type)) {
    throw new Error("Pick company driver or owner-operator.");
  }
  return type as DriverKind;
}

function parseDateField(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function enforceAssignmentCompliance(formData: FormData, truckId: number | null, driverId: number | null, trailerId: number | null): void {
  if (!truckId && !driverId && !trailerId) return;
  const alerts = collectAssignmentAlerts({
    truck: truckId ? getTruck(truckId) : null,
    driver: driverId ? getDriver(driverId) : null,
    trailer: trailerId ? getTrailer(trailerId) : null,
  });
  const confirmed = String(formData.get("confirm_expired") ?? "") === "1";
  requireAssignmentOverride(alerts, confirmed);
}

function parseTruckType(value: FormDataEntryValue | null): TruckType {
  const type = String(value ?? "");
  if (!TRUCK_TYPES.some((item) => item.value === type)) {
    throw new Error("Pick a truck type.");
  }
  return type as TruckType;
}

function parseTruckStatus(value: FormDataEntryValue | null): TruckStatus {
  const status = String(value ?? "available");
  if (!TRUCK_STATUSES.some((item) => item.value === status)) {
    throw new Error("Invalid truck status.");
  }
  return status as TruckStatus;
}

function parseDriverStatus(value: FormDataEntryValue | null): DriverStatus {
  const status = String(value ?? "available");
  if (!DRIVER_STATUSES.some((item) => item.value === status)) {
    throw new Error("Invalid driver status.");
  }
  return status as DriverStatus;
}

export async function createCustomerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = createCustomer({
      name: requiredString(formData.get("name"), "Customer name"),
      billing_notes: String(formData.get("billing_notes") ?? "").trim(),
      credit_hold: String(formData.get("credit_hold") ?? "") === "1",
      payment_terms: String(formData.get("payment_terms") ?? "").trim(),
      contacts: parseContacts(formData),
    });
    refresh();
    redirect(`/customers/${id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateCustomerAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    updateCustomer(id, {
      name: requiredString(formData.get("name"), "Customer name"),
      billing_notes: String(formData.get("billing_notes") ?? "").trim(),
      credit_hold: String(formData.get("credit_hold") ?? "") === "1",
      payment_terms: String(formData.get("payment_terms") ?? "").trim(),
      contacts: parseContacts(formData),
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function createTruckAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const capacity = parseOptionalInt(formData.get("capacity_lbs"));
    if (capacity == null || capacity <= 0) throw new Error("Capacity must be a positive number.");
    const id = createTruck({
      unit_number: requiredString(formData.get("unit_number"), "Unit number"),
      type: parseTruckType(formData.get("type")),
      capacity_lbs: capacity,
      status: parseTruckStatus(formData.get("status")),
      samsara_vehicle_id: String(formData.get("samsara_vehicle_id") ?? "").trim(),
      samsara_trailer_id: String(formData.get("samsara_trailer_id") ?? "").trim(),
      orbcomm_asset_id: String(formData.get("orbcomm_asset_id") ?? "").trim(),
      trailer_number: String(formData.get("trailer_number") ?? "").trim(),
      registration_issued: parseDateField(formData.get("registration_issued")),
      registration_expires: parseDateField(formData.get("registration_expires")),
      dot_inspected_on: parseDateField(formData.get("dot_inspected_on")),
      dot_expires: parseDateField(formData.get("dot_expires")),
      vin: String(formData.get("vin") ?? "").trim(),
      plate: String(formData.get("plate") ?? "").trim(),
      year: String(formData.get("year") ?? "").trim(),
      make: String(formData.get("make") ?? "").trim(),
    });
    refresh();
    redirect("/fleet");
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateTruckAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const capacity = parseOptionalInt(formData.get("capacity_lbs"));
    if (capacity == null || capacity <= 0) throw new Error("Capacity must be a positive number.");
    updateTruck(id, {
      unit_number: requiredString(formData.get("unit_number"), "Unit number"),
      type: parseTruckType(formData.get("type")),
      capacity_lbs: capacity,
      status: parseTruckStatus(formData.get("status")),
      samsara_vehicle_id: String(formData.get("samsara_vehicle_id") ?? "").trim(),
      samsara_trailer_id: String(formData.get("samsara_trailer_id") ?? "").trim(),
      orbcomm_asset_id: String(formData.get("orbcomm_asset_id") ?? "").trim(),
      trailer_number: String(formData.get("trailer_number") ?? "").trim(),
      registration_issued: parseDateField(formData.get("registration_issued")),
      registration_expires: parseDateField(formData.get("registration_expires")),
      dot_inspected_on: parseDateField(formData.get("dot_inspected_on")),
      dot_expires: parseDateField(formData.get("dot_expires")),
      vin: String(formData.get("vin") ?? "").trim(),
      plate: String(formData.get("plate") ?? "").trim(),
      year: String(formData.get("year") ?? "").trim(),
      make: String(formData.get("make") ?? "").trim(),
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function createDriverAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = createDriver({
      name: requiredString(formData.get("name"), "Driver name"),
      phone: String(formData.get("phone") ?? "").trim(),
      license: [
        String(formData.get("license_state") ?? "").trim().toUpperCase(),
        String(formData.get("license_number") ?? "").trim(),
      ]
        .filter(Boolean)
        .join("-"),
      pin: String(formData.get("pin") ?? "").trim(),
      samsara_driver_id: String(formData.get("samsara_driver_id") ?? "").trim(),
      license_number: String(formData.get("license_number") ?? "").trim(),
      license_state: String(formData.get("license_state") ?? "").trim().toUpperCase(),
      license_expires: parseDateField(formData.get("license_expires")),
      medical_issued: parseDateField(formData.get("medical_issued")),
      medical_expires: parseDateField(formData.get("medical_expires")),
      driver_type: parseDriverKind(formData.get("driver_type")),
      pay_percent: parseOptionalFloat(formData.get("pay_percent")),
      truck_id: parseOptionalInt(formData.get("truck_id")),
      status: parseDriverStatus(formData.get("status")),
    });
    refresh();
    redirect("/fleet");
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateDriverAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    updateDriver(id, {
      name: requiredString(formData.get("name"), "Driver name"),
      phone: String(formData.get("phone") ?? "").trim(),
      license: [
        String(formData.get("license_state") ?? "").trim().toUpperCase(),
        String(formData.get("license_number") ?? "").trim(),
      ]
        .filter(Boolean)
        .join("-"),
      pin: String(formData.get("pin") ?? "").trim(),
      samsara_driver_id: String(formData.get("samsara_driver_id") ?? "").trim(),
      license_number: String(formData.get("license_number") ?? "").trim(),
      license_state: String(formData.get("license_state") ?? "").trim().toUpperCase(),
      license_expires: parseDateField(formData.get("license_expires")),
      medical_issued: parseDateField(formData.get("medical_issued")),
      medical_expires: parseDateField(formData.get("medical_expires")),
      driver_type: parseDriverKind(formData.get("driver_type")),
      pay_percent: parseOptionalFloat(formData.get("pay_percent")),
      truck_id: parseOptionalInt(formData.get("truck_id")),
      status: parseDriverStatus(formData.get("status")),
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function createLoadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const input = parseLoadInput(formData);
    enforceAssignmentCompliance(formData, input.truck_id, input.driver_id, input.trailer_id ?? null);
    const id = createLoad(input);
    const inboxId = String(formData.get("inbox_id") ?? "").trim();
    if (inboxId) {
      const { attachInboxToLoad } = await import("./files");
      attachInboxToLoad(id, inboxId, "rate_con", "dispatcher");
    }
    refresh();
    redirect(`/loads/${id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateLoadAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const input = parseLoadInput(formData);
    enforceAssignmentCompliance(formData, input.truck_id, input.driver_id, input.trailer_id ?? null);
    updateLoad(id, input);
    const inboxId = String(formData.get("inbox_id") ?? "").trim();
    if (inboxId) {
      const { attachInboxToLoad } = await import("./files");
      attachInboxToLoad(id, inboxId, "rate_con", "dispatcher");
    }
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function assignLoadAction(formData: FormData): Promise<ActionResult> {
  try {
    const loadId = parseOptionalInt(formData.get("load_id"));
    const truckId = parseOptionalInt(formData.get("truck_id"));
    const driverId = parseOptionalInt(formData.get("driver_id"));
    const trailerId = parseOptionalInt(formData.get("trailer_id"));
    if (!loadId || !truckId || !driverId) {
      throw new Error("Pick a truck and a driver.");
    }
    enforceAssignmentCompliance(formData, truckId, driverId, trailerId);
    assignLoad(loadId, truckId, driverId, trailerId, {
      oo_percent: parseOptionalFloat(formData.get("oo_percent")),
    });
    refresh();
    return { ok: true, id: loadId };
  } catch (error) {
    return fail(error);
  }
}

export async function refreshIftaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const { refreshIftaForLoad } = await import("./integrations/ifta");
    await refreshIftaForLoad(loadId);
    refresh();
    return { ok: true, id: loadId };
  } catch (error) {
    return fail(error);
  }
}

export async function sendToQuickbooksAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const confirmResend = String(formData.get("confirm_resend") ?? "") === "1";
    const { sendLoadToQuickbooks } = await import("./integrations/quickbooks");
    await sendLoadToQuickbooks(loadId, { confirmResend });
    refresh();
    return { ok: true, id: loadId };
  } catch (error) {
    return fail(error);
  }
}

export async function updateLoadStatusAction(formData: FormData): Promise<ActionResult> {
  try {
    const loadId = parseOptionalInt(formData.get("load_id"));
    const status = String(formData.get("status") ?? "");
    if (!loadId) throw new Error("Load is missing.");
    if (!isKnownLoadStatus(status)) {
      throw new Error("Invalid status.");
    }
    updateLoadStatus(loadId, status);
    refresh();
    return { ok: true, id: loadId };
  } catch (error) {
    return fail(error);
  }
}

export type RateConParseState = {
  ok: true;
  inboxId: string;
  fileName: string;
  warning?: string;
  parsed: import("./rate-con").ParsedRateCon;
} | ActionResult;

export async function parseRateConAction(
  _prev: RateConParseState | null,
  formData: FormData,
): Promise<RateConParseState> {
  try {
    const file = formData.get("rate_con");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Pick a file first.");
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error("File is over 15 MB.");
    }
    const { fileToBuffer, saveInboxFile, writeInboxParse } = await import("./files");
    const { extractDocumentText, parseRateConText, emptyParsedRateCon } = await import("./rate-con");
    const { listCustomers } = await import("./queries");
    const buffer = await fileToBuffer(file);
    const { inboxId } = saveInboxFile(file, buffer);
    let text = "";
    let warning = "";
    try {
      text = await extractDocumentText(buffer, file.type, file.name);
    } catch (error) {
      warning = error instanceof Error ? error.message : "Could not read that file.";
    }
    if (!text) {
      const parsed = emptyParsedRateCon();
      writeInboxParse(inboxId, parsed);
      refresh();
      return {
        ok: true,
        inboxId,
        fileName: file.name,
        warning: warning || "Couldn't read text from this PDF. The file is still attached — finish the fields by hand.",
        parsed,
      };
    }
    const parsed = parseRateConText(text, listCustomers());
    writeInboxParse(inboxId, parsed);
    refresh();
    return { ok: true, inboxId, fileName: file.name, parsed };
  } catch (error) {
    return fail(error);
  }
}

export async function attachFileFormAction(formData: FormData): Promise<void> {
  const result = await attachFileAction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function attachFileAction(formData: FormData): Promise<ActionResult> {
  try {
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!loadId) throw new Error("Load is missing.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Choose a file to upload.");
    }
    const kind = String(formData.get("kind") ?? "other");
    const { addAttachment, fileToBuffer } = await import("./files");
    const { ATTACHMENT_KINDS } = await import("./types");
    if (!ATTACHMENT_KINDS.some((item) => item.value === kind)) {
      throw new Error("Pick an attachment type.");
    }
    await addAttachment({
      loadId,
      kind: kind as (typeof ATTACHMENT_KINDS)[number]["value"],
      originalName: file.name,
      buffer: await fileToBuffer(file),
      mimeType: file.type,
      uploadedBy: "dispatcher",
    });
    refresh();
    return { ok: true, id: loadId };
  } catch (error) {
    return fail(error);
  }
}

export async function importOrbcommReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const pasted = String(formData.get("report_text") ?? "").trim();
    const file = formData.get("file");
    let text = pasted;
    if (!text && file instanceof File && file.size > 0) {
      text = await file.text();
    }
    if (!text) throw new Error("Paste JSON/CSV from the ORBCOMM Reefer Status Report, or choose a file.");
    const { importOrbcommReadings, parseOrbcommReport } = await import("./integrations/orbcomm");
    const rows = parseOrbcommReport(text);
    if (rows.length === 0) {
      throw new Error("No trailer rows found. Use trailer_id, temperature_f, setpoint_f, recorded_at columns.");
    }
    const count = importOrbcommReadings(rows);
    refresh();
    if (count === 0) {
      throw new Error(
        "Rows parsed, but none mapped to a truck/load trailer ID. Set ORBCOMM asset ID or trailer # on the unit.",
      );
    }
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createTrailerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = createTrailer({
      unit_number: requiredString(formData.get("unit_number"), "Trailer number"),
      type: parseTrailerType(formData.get("type")),
      orbcomm_asset_id: String(formData.get("orbcomm_asset_id") ?? "").trim(),
      registration_issued: parseDateField(formData.get("registration_issued")),
      registration_expires: parseDateField(formData.get("registration_expires")),
      dot_inspected_on: parseDateField(formData.get("dot_inspected_on")),
      dot_expires: parseDateField(formData.get("dot_expires")),
      status: parseTruckStatus(formData.get("status")),
    });
    refresh();
    redirect("/fleet");
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateTrailerAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    updateTrailer(id, {
      unit_number: requiredString(formData.get("unit_number"), "Trailer number"),
      type: parseTrailerType(formData.get("type")),
      orbcomm_asset_id: String(formData.get("orbcomm_asset_id") ?? "").trim(),
      registration_issued: parseDateField(formData.get("registration_issued")),
      registration_expires: parseDateField(formData.get("registration_expires")),
      dot_inspected_on: parseDateField(formData.get("dot_inspected_on")),
      dot_expires: parseDateField(formData.get("dot_expires")),
      status: parseTruckStatus(formData.get("status")),
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function attachFleetDocFormAction(formData: FormData): Promise<void> {
  const result = await attachFleetDocAction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function attachFleetDocAction(formData: FormData): Promise<ActionResult> {
  try {
    const ownerId = parseOptionalInt(formData.get("owner_id"));
    const ownerType = String(formData.get("owner_type") ?? "");
    if (!ownerId || !["driver", "truck", "trailer"].includes(ownerType)) {
      throw new Error("Pick a fleet record.");
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
    const kind = String(formData.get("kind") ?? "other");
    const { addFleetDocument, fileToBuffer } = await import("./files");
    const { FLEET_DOC_KINDS } = await import("./types");
    if (!FLEET_DOC_KINDS.some((item) => item.value === kind)) {
      throw new Error("Pick a document type.");
    }
    addFleetDocument({
      ownerType: ownerType as "driver" | "truck" | "trailer",
      ownerId,
      kind: kind as (typeof FLEET_DOC_KINDS)[number]["value"],
      originalName: file.name,
      buffer: await fileToBuffer(file),
      mimeType: file.type,
    });
    refresh();
    return { ok: true, id: ownerId };
  } catch (error) {
    return fail(error);
  }
}

function parseLocationRole(value: FormDataEntryValue | null): LocationRole {
  const role = String(value ?? "both");
  if (!isLocationRole(role)) throw new Error("Pick shipper, receiver, or both.");
  return role;
}

function parseSchedulingType(value: FormDataEntryValue | null): SchedulingType {
  const type = String(value ?? "fcfs");
  if (!isSchedulingType(type)) throw new Error("Pick appointment required or FCFS.");
  return type;
}

function parseLocationInput(formData: FormData) {
  return {
    name: requiredString(formData.get("name"), "Location name"),
    street: String(formData.get("street") ?? "").trim(),
    city: requiredString(formData.get("city"), "City"),
    state: requiredString(formData.get("state"), "State").toUpperCase(),
    zip: String(formData.get("zip") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    role: parseLocationRole(formData.get("role")),
    scheduling_type: parseSchedulingType(formData.get("scheduling_type")),
    hours: String(formData.get("hours") ?? "").trim(),
    scheduling_notes: String(formData.get("scheduling_notes") ?? "").trim(),
    latitude: parseOptionalFloat(formData.get("latitude")),
    longitude: parseOptionalFloat(formData.get("longitude")),
  };
}

export async function createLocationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = createLocation(parseLocationInput(formData));
    refresh();
    redirect(`/locations/${id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateLocationAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    updateLocation(id, parseLocationInput(formData));
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteLocationAction(formData: FormData): Promise<ActionResult> {
  try {
    const id = parseOptionalInt(formData.get("location_id"));
    if (!id) throw new Error("Location is missing.");
    deleteLocation(id);
    refresh();
    redirect("/locations");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function deleteLocationFormAction(formData: FormData): Promise<void> {
  const result = await deleteLocationAction(formData);
  if (result && !result.ok) throw new Error(result.error);
}

function parseReportFilters(formData: FormData) {
  const filters = parseSavedFilters(String(formData.get("filters_json") ?? ""));
  return { ...defaultSearchCriteria(), ...filters };
}

function parseReportColumns(formData: FormData): SearchColumnKey[] {
  const raw = String(formData.get("columns_json") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SearchColumnKey => typeof item === "string" && isSearchColumnKey(item));
  } catch {
    throw new Error("Visible columns could not be saved.");
  }
}

export async function saveSearchReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = createSavedReport({
      name: requiredString(formData.get("name"), "Report name"),
      filters: parseReportFilters(formData),
      columns: parseReportColumns(formData),
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSearchReportAction(formData: FormData): Promise<ActionResult> {
  try {
    const id = parseOptionalInt(formData.get("report_id"));
    if (!id) throw new Error("Report is missing.");
    deleteSavedReport(id);
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSearchReportFormAction(formData: FormData): Promise<void> {
  const result = await deleteSearchReportAction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function updateCompanyProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { updateCompanyProfile } = await import("./company");
    updateCompanyProfile({
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
