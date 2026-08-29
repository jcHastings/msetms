"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withRequestAuditActor } from "./audit";
import { cleanDateInput, parseDriverPin, parseOptionalFloat, parseOptionalInt, requiredString } from "./format";
import { parseLoadInput } from "./load-input";
import { safeReturnTo } from "./load-page-shared";
import { addPayItem, deletePayItem } from "./pay-items";
import {
  assignLoad,
  createCustomer,
  createDriver,
  createLoad,
  createLocation,
  findDuplicateLocation,
  getLoad,
  getLocation,
  createSavedReport,
  createTrailer,
  createTruck,
  deleteDriver,
  deleteLocation,
  deleteSavedReport,
  deleteTrailer,
  deleteTruck,
  getDriver,
  getTrailer,
  getTruck,
  importLocationsFromCsv,
  updateCustomer,
  updateDriver,
  updateLoad,
  updateLoadDetails,
  updateLoadStatus,
  updateLoadTruckStatus,
  updateLocation,
  setDriverActive,
  setTrailerActive,
  setTruckActive,
  updateTrailer,
  updateTruck,
  type LoadInput,
} from "./queries";
import { collectAssignmentAlerts, requireAssignmentOverride } from "./compliance";
import {
  DRIVER_STATUSES,
  DRIVER_TYPES,
  TRUCK_STATUSES,
  isLocationRole,
  isOwnerOperator,
  isSchedulingType,
  parseCdlEndorsements,
  type ActionResult,
  type DriverKind,
  type DriverStatus,
  type Location,
  type LocationRole,
  type SchedulingType,
  type TruckStatus,
} from "./types";
import { parseTrailerType, parseTruckType } from "./fleet-form-shared";
import { defaultSearchCriteria, isSearchColumnKey, parseSavedFilters, type SearchColumnKey } from "./search";
import { complianceWindows, isKnownLoadStatus } from "./settings";
import { decodeCsvBuffer, type LocationCsvImportResult } from "./location-csv";
import { assertNyBoroughState } from "./places-shared";
import { fileToBuffer } from "./files";
import { type FuelImportResult } from "./fuel";
import {
  assignFuelTransactionDriver,
  assignFuelTransactionLoad,
  deleteFuelTransaction,
  importFuelFromText,
} from "./fuel-store";
import {
  requireCapability,
  requireLoadAssigner,
  requireLoadEditor,
  requireSettingsEditor,
} from "./dispatcher-session";
import {
  canAccessAccounting,
  canAssignLoads,
  canDeleteDocuments,
  canDeleteFleet,
  canDeleteLocations,
  canEditFleet,
  canEditLocations,
  canImportLocations,
  canUploadFuel,
  canViewIfta,
  canViewLoadFinancials,
} from "./settings-shared";

function refresh(): void {
  try {
    revalidatePath("/", "layout");
  } catch {
    // Tests and scripts have no Next.js request cache.
  }
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function applyLoadPermissions(
  input: LoadInput,
  role: string,
  existing?: {
    rate: number | null;
    oo_percent: number | null;
    oo_pay: number | null;
    truck_id: number | null;
    driver_id: number | null;
    trailer_id: number | null;
  },
): LoadInput {
  const next = { ...input };
  if (!canViewLoadFinancials(role)) {
    next.rate = existing?.rate ?? null;
    next.oo_percent = existing?.oo_percent ?? null;
    next.oo_pay = existing?.oo_pay ?? null;
  }
  if (!canAssignLoads(role)) {
    next.truck_id = existing?.truck_id ?? null;
    next.driver_id = existing?.driver_id ?? null;
    next.trailer_id = existing?.trailer_id ?? null;
  }
  return next;
}

function parseActive(formData: FormData): number {
  return String(formData.get("active") ?? "") === "1" ? 1 : 0;
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


function parseDriverKind(value: FormDataEntryValue | null): DriverKind {
  const type = String(value ?? "").trim();
  if (!type) throw new Error("Pick a driver type.");
  if (type === "single") return "company_driver";
  if (!DRIVER_TYPES.some((item) => item.value === type)) {
    throw new Error("Pick a driver type.");
  }
  return type as DriverKind;
}

function parsePayPercent(formData: FormData, driverType: DriverKind): number | null {
  if (!isOwnerOperator(driverType)) return null;
  const raw = String(formData.get("pay_percent") ?? "").trim();
  if (!raw) throw new Error("Owner-operator percent is required.");
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Owner-operator percent must be 0 to 100.");
  }
  return value;
}

function parseDateField(value: FormDataEntryValue | null): string {
  return cleanDateInput(value);
}

function enforceAssignmentCompliance(formData: FormData, truckId: number | null, driverId: number | null, trailerId: number | null): void {
  if (!truckId && !driverId && !trailerId) return;
  const alerts = collectAssignmentAlerts(
    {
      truck: truckId ? getTruck(truckId) : null,
      driver: driverId ? getDriver(driverId) : null,
      trailer: trailerId ? getTrailer(trailerId) : null,
    },
    complianceWindows(),
  );
  const confirmed = String(formData.get("confirm_expired") ?? "") === "1";
  requireAssignmentOverride(alerts, confirmed);
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
    await requireLoadEditor();
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
    await requireLoadEditor();
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
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
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
      plate_state: String(formData.get("plate_state") ?? "").trim().toUpperCase(),
      year: String(formData.get("year") ?? "").trim(),
      make: String(formData.get("make") ?? "").trim(),
      model: String(formData.get("model") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      active: parseActive(formData),
      assigned_driver_id: parseOptionalInt(formData.get("assigned_driver_id")),
    });
    refresh();
    redirect("/fleet/trucks");
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateTruckAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Truck not found.");
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
      plate_state: String(formData.get("plate_state") ?? "").trim().toUpperCase(),
      year: String(formData.get("year") ?? "").trim(),
      make: String(formData.get("make") ?? "").trim(),
      model: String(formData.get("model") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      active: parseActive(formData),
      assigned_driver_id: parseOptionalInt(formData.get("assigned_driver_id")),
    });
    refresh();
    redirect("/fleet/trucks");
    return { ok: true, id: id ?? undefined };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function createDriverAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const driverType = parseDriverKind(formData.get("driver_type"));
    const id = createDriver({
      name: requiredString(formData.get("name"), "Name"),
      phone: requiredString(formData.get("phone"), "Telephone"),
      email: String(formData.get("email") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      active: parseActive(formData),
      license: String(formData.get("license_number") ?? "").trim(),
      license_number: String(formData.get("license_number") ?? "").trim(),
      license_expires: parseDateField(formData.get("license_expires")),
      medical_issued: parseDateField(formData.get("medical_issued")),
      medical_expires: parseDateField(formData.get("medical_expires")),
      driver_type: driverType,
      pay_percent: parsePayPercent(formData, driverType),
      truck_id: null,
      status: "available",
      alt_phone: String(formData.get("alt_phone") ?? "").trim(),
      cell_phone: String(formData.get("cell_phone") ?? "").trim(),
      pager: String(formData.get("pager") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      country: requiredString(formData.get("country"), "Country") || "USA",
      city: requiredString(formData.get("city"), "City"),
      state: requiredString(formData.get("state"), "State"),
      postal_zip: String(formData.get("postal_zip") ?? "").trim(),
      date_of_birth: parseDateField(formData.get("date_of_birth")),
      date_of_hire: parseDateField(formData.get("date_of_hire")),
      drug_test_last: parseDateField(formData.get("drug_test_last")),
      drug_test_next: parseDateField(formData.get("drug_test_next")),
      termination_date: parseDateField(formData.get("termination_date")),
      pin: parseDriverPin(formData.get("pin")),
      cdl_endorsements: parseCdlEndorsements(formData.getAll("cdl_endorsements")).join(","),
    });
    refresh();
    redirect("/fleet/drivers");
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateDriverAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Driver not found.");
    const current = getDriver(id);
    if (!current) throw new Error("Driver not found.");
    const driverType = parseDriverKind(formData.get("driver_type"));
    updateDriver(id, {
      name: requiredString(formData.get("name"), "Name"),
      phone: requiredString(formData.get("phone"), "Telephone"),
      email: String(formData.get("email") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      active: parseActive(formData),
      license: String(formData.get("license_number") ?? "").trim() || current.license,
      pin: parseDriverPin(formData.get("pin")),
      samsara_driver_id: current.samsara_driver_id,
      license_number: String(formData.get("license_number") ?? "").trim(),
      license_state: current.license_state,
      license_expires: parseDateField(formData.get("license_expires")),
      medical_issued: parseDateField(formData.get("medical_issued")),
      medical_expires: parseDateField(formData.get("medical_expires")),
      driver_type: driverType,
      pay_percent: parsePayPercent(formData, driverType),
      truck_id: current.truck_id,
      status: current.status,
      alt_phone: String(formData.get("alt_phone") ?? "").trim(),
      cell_phone: String(formData.get("cell_phone") ?? "").trim(),
      pager: String(formData.get("pager") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      country: requiredString(formData.get("country"), "Country") || "USA",
      city: requiredString(formData.get("city"), "City"),
      state: requiredString(formData.get("state"), "State"),
      postal_zip: String(formData.get("postal_zip") ?? "").trim(),
      date_of_birth: parseDateField(formData.get("date_of_birth")),
      date_of_hire: parseDateField(formData.get("date_of_hire")),
      drug_test_last: parseDateField(formData.get("drug_test_last")),
      drug_test_next: parseDateField(formData.get("drug_test_next")),
      termination_date: parseDateField(formData.get("termination_date")),
      cdl_endorsements: parseCdlEndorsements(formData.getAll("cdl_endorsements")).join(","),
    });
    refresh();
    redirect("/fleet/drivers");
    return { ok: true, id: id ?? undefined };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function createLoadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const actor = await requireLoadEditor();
      const input = applyLoadPermissions(parseLoadInput(formData), actor.role);
      enforceAssignmentCompliance(formData, input.truck_id, input.driver_id, input.trailer_id ?? null);
      const id = createLoad(input);
      const inboxId = String(formData.get("inbox_id") ?? "").trim();
      if (inboxId) {
        const { attachInboxToLoad } = await import("./files");
        attachInboxToLoad(id, inboxId, "rate_con", "dispatcher");
      }
      const { applyRateConStopsToLoad, formHasRateConStops } = await import("./rate-con-stops");
      if (formHasRateConStops(formData)) applyRateConStopsToLoad(id, formData);
      const { refreshLoadRouteQuiet } = await import("./routing");
      await refreshLoadRouteQuiet(id);
      refresh();
      redirect(`/loads/${id}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      return fail(error);
    }
  });
}

export async function updateLoadAction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const actor = await requireLoadEditor();
      const existing = getLoad(id);
      if (existing) {
        const { assertCanEditLoadRecord } = await import("./accounting-desk");
        assertCanEditLoadRecord(existing, actor.role);
      }
      const input = applyLoadPermissions(parseLoadInput(formData, true, existing), actor.role, existing ?? undefined);
      enforceAssignmentCompliance(formData, input.truck_id, input.driver_id, input.trailer_id ?? null);
      updateLoad(id, input);
      if (String(formData.get("save_load_details") ?? "") === "1") {
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
      }
      const inboxId = String(formData.get("inbox_id") ?? "").trim();
      if (inboxId) {
        const { attachInboxToLoad } = await import("./files");
        attachInboxToLoad(id, inboxId, "rate_con", "dispatcher");
      }
      const { applyRateConStopsToLoad, formHasRateConStops } = await import("./rate-con-stops");
      if (formHasRateConStops(formData)) applyRateConStopsToLoad(id, formData);
      if (String(formData.get("skip_route_refresh") ?? "") !== "1") {
        const { refreshLoadRouteQuiet } = await import("./routing");
        await refreshLoadRouteQuiet(id);
      }
      refresh();
      // Existing-load Save must stay on this load/tab. Close is what leaves.
      return { ok: true, id };
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      return fail(error);
    }
  });
}

export async function assignLoadAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const actor = await requireLoadAssigner();
      const loadId = parseOptionalInt(formData.get("load_id"));
      const truckId = parseOptionalInt(formData.get("truck_id"));
      const driverId = parseOptionalInt(formData.get("driver_id"));
      const trailerId = parseOptionalInt(formData.get("trailer_id"));
      if (!loadId || !truckId || !driverId) {
        throw new Error("Pick a truck and a driver.");
      }
      const existing = getLoad(loadId);
      if (existing) {
        const { assertCanEditLoadRecord } = await import("./accounting-desk");
        assertCanEditLoadRecord(existing, actor.role);
      }
      enforceAssignmentCompliance(formData, truckId, driverId, trailerId);
      const previousDriverId = existing?.driver_id ?? null;
      assignLoad(loadId, truckId, driverId, trailerId, {
        oo_percent: parseOptionalFloat(formData.get("oo_percent")),
        dispatch: String(formData.get("dispatch") ?? "") === "1",
      });
      const { refreshEmptyMilesAround } = await import("./empty-miles");
      await refreshEmptyMilesAround(loadId, previousDriverId);
      refresh();
      return { ok: true, id: loadId };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function refreshIftaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canViewIfta, "IFTA is for Administrator and Accounting.");
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

export async function disconnectQuickbooksAction(): Promise<void> {
  await requireSettingsEditor();
  const { clearStoredQuickbooksTokens } = await import("./integrations/quickbooks");
  clearStoredQuickbooksTokens();
  refresh();
}

export async function sendToQuickbooksFormAction(formData: FormData): Promise<void> {
  const result = await sendToQuickbooksAction(null, formData);
  if (!result.ok) throw new Error(result.error);
}

export async function sendToQuickbooksAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canAccessAccounting, "Sending invoices is for Administrator and Accounting.");
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
  return withRequestAuditActor(async () => {
    try {
      const actor = await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      const status = String(formData.get("status") ?? "");
      if (!loadId) throw new Error("Load is missing.");
      if (!isKnownLoadStatus(status)) {
        throw new Error("Invalid status.");
      }
      const existing = getLoad(loadId);
      if (existing) {
        const { assertCanEditLoadRecord } = await import("./accounting-desk");
        assertCanEditLoadRecord(existing, actor.role);
      }
      updateLoadStatus(loadId, status);
      refresh();
      if (status === "cancelled") {
        redirect(safeReturnTo(formData.get("return_to"), "/board"));
      }
      return { ok: true, id: loadId };
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      return fail(error);
    }
  });
}

export async function updateLoadTruckStatusAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      const actor = await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const existing = getLoad(loadId);
      if (existing) {
        const { assertCanEditLoadRecord } = await import("./accounting-desk");
        assertCanEditLoadRecord(existing, actor.role);
      }
      updateLoadTruckStatus(loadId, String(formData.get("truck_status") ?? ""));
      refresh();
      return { ok: true, id: loadId };
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      return fail(error);
    }
  });
}

export type RateConParseState = {
  ok: true;
  inboxId: string;
  fileName: string;
  warning?: string;
  parsed: import("./rate-con-shared").ParsedRateCon;
} | ActionResult;

export async function parseRateConAction(
  _prev: RateConParseState | null,
  formData: FormData,
): Promise<RateConParseState> {
  try {
    await requireLoadEditor();
    const file = formData.get("rate_con");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Pick a file first.");
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error("File is over 15 MB.");
    }
    const lowerName = file.name.toLowerCase();
    const mime = (file.type || "").toLowerCase();
    const looksPdf = mime.includes("pdf") || lowerName.endsWith(".pdf");
    const looksImage =
      mime.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/.test(lowerName);
    const looksEmail =
      mime.includes("message") ||
      mime.includes("rfc822") ||
      mime.includes("text/plain") ||
      /\.(eml|msg|txt)$/.test(lowerName);
    if (!looksPdf && !looksImage && !looksEmail) {
      throw new Error("Upload a PDF, image, or forwarded load email.");
    }
    const { fileToBuffer, saveInboxFile, writeInboxParse } = await import("./files");
    const { extractDocumentText, parseRateConText, emptyParsedRateCon, textLooksLikeFilenameOnly } = await import("./rate-con");
    const { attachParsedLocationMatches } = await import("./rate-con-shared");
    const { listCustomers, listLocations } = await import("./queries");
    const buffer = await fileToBuffer(file);
    const { inboxId } = saveInboxFile(file, buffer);
    let text = "";
    let warning = "";
    try {
      text = await extractDocumentText(buffer, mime || (looksPdf ? "application/pdf" : file.type), file.name);
    } catch (error) {
      warning = error instanceof Error ? error.message : "Could not read that file.";
    }
    if (!text || textLooksLikeFilenameOnly(text, file.name)) {
      const parsed = emptyParsedRateCon();
      writeInboxParse(inboxId, parsed);
      return {
        ok: true,
        inboxId,
        fileName: file.name,
        warning: warning || "Couldn't read text from this PDF",
        parsed,
      };
    }
    const parsed = attachParsedLocationMatches(parseRateConText(text, listCustomers(), file.name), listLocations());
    const thin =
      !parsed.origin && !parsed.destination && parsed.weight == null && parsed.rate == null;
    writeInboxParse(inboxId, parsed);
    return {
      ok: true,
      inboxId,
      fileName: file.name,
      warning: thin
        ? "Read the file, but almost no load fields were in the text. Finish the form by hand — the original file stays attached."
        : undefined,
      parsed,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function makeBolAction(
  loadId: number,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      if (!loadId) throw new Error("Load is missing.");
      const { generateBolPdf } = await import("./bol");
      const { addAttachment } = await import("./files");
      const { buffer, filename } = await generateBolPdf(loadId);
      const attachment = addAttachment({
        loadId,
        kind: "bol",
        originalName: filename,
        buffer,
        mimeType: "application/pdf",
        uploadedBy: "dispatcher",
      });
      refresh();
      return { ok: true, id: attachment.id, message: "BOL saved on Load Documents." };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function attachFileFormAction(formData: FormData): Promise<void> {
  const result = await attachFileAction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function attachFileAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Choose a file to upload.");
      }
      const kind = String(formData.get("kind") ?? "other");
      const { addAttachment, fileToBuffer, isPdfOrImage } = await import("./files");
      const { ATTACHMENT_KINDS } = await import("./types");
      if (!ATTACHMENT_KINDS.some((item) => item.value === kind)) {
        throw new Error("Pick an attachment type.");
      }
      if (file.size > 15 * 1024 * 1024) throw new Error("File is over 15 MB.");
      if (!isPdfOrImage(file)) throw new Error("Upload a PDF or image.");
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
  });
}

export async function replaceAttachmentFormAction(formData: FormData): Promise<void> {
  const result = await replaceAttachmentAction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function replaceAttachmentAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const attachmentId = parseOptionalInt(formData.get("attachment_id"));
      if (!attachmentId) throw new Error("Attachment is missing.");
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Choose a file to replace this one.");
      }
      if (file.size > 15 * 1024 * 1024) throw new Error("File is over 15 MB.");
      const { replaceAttachment, fileToBuffer, isPdfOrImage } = await import("./files");
      if (!isPdfOrImage(file)) throw new Error("Upload a PDF or image.");
      replaceAttachment(attachmentId, {
        originalName: file.name,
        buffer: await fileToBuffer(file),
        mimeType: file.type,
        uploadedBy: "dispatcher",
      });
      refresh();
      return { ok: true, id: attachmentId };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function deleteAttachmentFormAction(formData: FormData): Promise<void> {
  const result = await deleteAttachmentAction(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function deleteAttachmentAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireCapability(canDeleteDocuments, "Only an Administrator can delete documents.");
      const attachmentId = parseOptionalInt(formData.get("attachment_id"));
      if (!attachmentId) throw new Error("Attachment is missing.");
      const { deleteAttachment } = await import("./files");
      deleteAttachment(attachmentId);
      refresh();
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function importOrbcommReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const pasted = String(formData.get("report_text") ?? "").trim();
    const file = formData.get("file");
    let text = pasted;
    if (!text && file instanceof File && file.size > 0) {
      text = await file.text();
    }
    if (!text) throw new Error("Paste JSON/CSV from the Orbcomm Reefer Status Report, or choose a file.");
    const { importOrbcommReadings, parseOrbcommReport } = await import("./integrations/orbcomm");
    const rows = parseOrbcommReport(text);
    if (rows.length === 0) {
      throw new Error("No trailer rows found. Use trailer_id, temperature_f, setpoint_f, recorded_at columns.");
    }
    const count = importOrbcommReadings(rows);
    refresh();
    if (count === 0) {
      throw new Error(
        "Rows parsed, but none mapped to a truck/load trailer ID. Set Orbcomm asset ID or trailer # on the unit.",
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
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const id = createTrailer({
      unit_number: requiredString(formData.get("unit_number"), "Trailer number"),
      type: parseTrailerType(formData.get("type")),
      orbcomm_asset_id: String(formData.get("orbcomm_asset_id") ?? "").trim(),
      registration_issued: parseDateField(formData.get("registration_issued")),
      registration_expires: parseDateField(formData.get("registration_expires")),
      dot_inspected_on: parseDateField(formData.get("dot_inspected_on")),
      dot_expires: parseDateField(formData.get("dot_expires")),
      status: parseTruckStatus(formData.get("status")),
      vin: String(formData.get("vin") ?? "").trim(),
      plate: String(formData.get("plate") ?? "").trim(),
      truck_id: parseOptionalInt(formData.get("truck_id")),
      notes: String(formData.get("notes") ?? "").trim(),
      reefer_setpoint_f: parseOptionalFloat(formData.get("reefer_setpoint_f")),
      active: parseActive(formData),
    });
    refresh();
    redirect("/fleet/trailers");
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateTrailerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Trailer not found.");
    updateTrailer(id, {
      unit_number: requiredString(formData.get("unit_number"), "Trailer number"),
      type: parseTrailerType(formData.get("type")),
      orbcomm_asset_id: String(formData.get("orbcomm_asset_id") ?? "").trim(),
      registration_issued: parseDateField(formData.get("registration_issued")),
      registration_expires: parseDateField(formData.get("registration_expires")),
      dot_inspected_on: parseDateField(formData.get("dot_inspected_on")),
      dot_expires: parseDateField(formData.get("dot_expires")),
      status: parseTruckStatus(formData.get("status")),
      vin: String(formData.get("vin") ?? "").trim(),
      plate: String(formData.get("plate") ?? "").trim(),
      truck_id: parseOptionalInt(formData.get("truck_id")),
      notes: String(formData.get("notes") ?? "").trim(),
      reefer_setpoint_f: parseOptionalFloat(formData.get("reefer_setpoint_f")),
      active: parseActive(formData),
    });
    refresh();
    redirect("/fleet/trailers");
    return { ok: true, id: id ?? undefined };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function deleteTruckAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canDeleteFleet, "Accounting cannot delete fleet records.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Truck not found.");
    deleteTruck(id);
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleTruckActiveAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Truck not found.");
    setTruckActive(id, String(formData.get("active") ?? "") === "1");
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDriverAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canDeleteFleet, "Accounting cannot delete fleet records.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Driver not found.");
    deleteDriver(id);
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleDriverActiveAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Driver not found.");
    setDriverActive(id, String(formData.get("active") ?? "") === "1");
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteTrailerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canDeleteFleet, "Accounting cannot delete fleet records.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Trailer not found.");
    deleteTrailer(id);
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleTrailerActiveAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("id"));
    if (id == null) throw new Error("Trailer not found.");
    setTrailerActive(id, String(formData.get("active") ?? "") === "1");
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
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
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
  const city = requiredString(formData.get("city"), "City");
  const state = requiredString(formData.get("state"), "State").toUpperCase();
  assertNyBoroughState(city, state);
  return {
    name: requiredString(formData.get("name"), "Location name"),
    street: String(formData.get("street") ?? "").trim(),
    city,
    state,
    zip: String(formData.get("zip") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    role: parseLocationRole(formData.get("role")),
    scheduling_type: parseSchedulingType(formData.get("scheduling_type")),
    hours: String(formData.get("hours") ?? "").trim(),
    scheduling_notes: String(formData.get("scheduling_notes") ?? "").trim(),
    call_before: String(formData.get("call_before") ?? "") === "1" ? 1 : 0,
    latitude: parseOptionalFloat(formData.get("latitude")),
    longitude: parseOptionalFloat(formData.get("longitude")),
    google_place_id: String(formData.get("google_place_id") ?? "").trim(),
  };
}

export type SaveRateConLocationState =
  | { ok: true; location: Location }
  | { ok: false; error: string };

export async function saveRateConLocationAction(
  _prev: SaveRateConLocationState | null,
  formData: FormData,
): Promise<SaveRateConLocationState> {
  try {
    await requireCapability(canEditLocations, "You cannot save locations.");
    const id = createLocation({
      ...parseLocationInput(formData),
      notes: String(formData.get("notes") ?? "").trim() || "Added from rate confirmation",
      scheduling_type: parseSchedulingType(formData.get("scheduling_type") || "appointment"),
    });
    refresh();
    const location = getLocation(id);
    if (!location) throw new Error("Location was not saved.");
    return { ok: true, location };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function createLocationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canEditLocations, "You cannot save locations.");
    const input = parseLocationInput(formData);
    if (String(formData.get("confirm_duplicate") ?? "") !== "1") {
      const existing = findDuplicateLocation(input);
      if (existing) {
        return {
          ok: false,
          error: "Location already exists.",
          duplicate: true,
          existingId: existing.id,
        };
      }
    }
    const id = createLocation(input);
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
    await requireCapability(canEditLocations, "You cannot save locations.");
    updateLocation(id, parseLocationInput(formData));
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function importLocationsCsvAction(
  _prev: LocationCsvImportResult | null,
  formData: FormData,
): Promise<LocationCsvImportResult> {
  try {
    await requireCapability(canImportLocations, "Only an Administrator can import locations.");
    const file = formData.get("csv");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a CSV file." };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, error: "CSV is too large (max 5 MB)." };
    }
    const text = decodeCsvBuffer(await fileToBuffer(file));
    const result = importLocationsFromCsv(text);
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function importFuelCsvAction(
  _prev: FuelImportResult | null,
  formData: FormData,
): Promise<FuelImportResult> {
  try {
    await requireCapability(canUploadFuel, "Fuel upload is for Administrator and Standard.");
    const file = formData.get("csv");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a CSV, Excel, or PDF." };
    }
    const name = file.name.toLowerCase();
    const mime = (file.type || "").toLowerCase();
    const { isFuelPdfUpload, readFuelUploadText } = await import("./fuel-pdf");
    const nameHintPdf = isFuelPdfUpload(file.name, mime);
    const isXlsx = name.endsWith(".xlsx") || mime.includes("spreadsheet");
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, error: "PDF is too large (max 15 MB)." };
    }
    if (!nameHintPdf && file.size > 5 * 1024 * 1024) {
      return { ok: false, error: "File is too large (max 5 MB)." };
    }
    if (name.endsWith(".xls") && !isXlsx) {
      return { ok: false, error: "Save the workbook as .xlsx or CSV UTF-8." };
    }
    const buffer = await fileToBuffer(file);
    const isPdf = isFuelPdfUpload(file.name, mime, buffer);
    if (isPdf && buffer.length > 15 * 1024 * 1024) {
      return { ok: false, error: "PDF is too large (max 15 MB)." };
    }
    let text = "";
    if (isPdf) {
      const extracted = await readFuelUploadText(buffer, file.name, mime);
      text = extracted.text;
      if (!text.trim()) {
        return { ok: false, error: "Couldn't read text from this PDF. Save the report as CSV and upload that." };
      }
    } else if (isXlsx) {
      const { recordsFromFirstSheet } = await import("./xlsx-first-sheet");
      const records = recordsFromFirstSheet(new Uint8Array(buffer));
      if (!records.length) return { ok: false, error: "Excel sheet is empty." };
      const headers = Object.keys(records[0] ?? {});
      text = [
        headers.join(","),
        ...records.map((row) =>
          headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(","),
        ),
      ].join("\n");
    } else {
      text = decodeCsvBuffer(buffer);
    }
    const result = importFuelFromText(text, file.name || "fuel.csv");
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function linkFuelReceiptAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireCapability(canUploadFuel, "Fuel upload is for Administrator and Standard.");
    const receiptId = parseOptionalInt(formData.get("receipt_id"));
    const fuelId = parseOptionalInt(formData.get("fuel_id"));
    if (!receiptId || !fuelId) throw new Error("Pick a receipt and a fuel row.");
    const { linkFuelReceipt } = await import("./fuel-receipts");
    linkFuelReceipt(receiptId, fuelId);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function assignFuelDriverAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCapability(canUploadFuel, "Fuel upload is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("fuel_id"));
    const driverId = parseOptionalInt(formData.get("driver_id"));
    const loadId = parseOptionalInt(formData.get("load_id"));
    if (!id) return { ok: false, error: "Fuel row is missing." };
    if (!driverId && !loadId) return { ok: false, error: "Pick a driver or a load." };
    if (driverId) assignFuelTransactionDriver(id, driverId);
    if (loadId) assignFuelTransactionLoad(id, loadId);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function deleteFuelTransactionFormAction(formData: FormData): Promise<void> {
  await deleteFuelTransactionAction(formData);
}

export async function linkFuelReceiptFormAction(formData: FormData): Promise<void> {
  await linkFuelReceiptAction(formData);
}

export async function deleteFuelTransactionAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireCapability(canUploadFuel, "Fuel upload is for Administrator and Standard.");
    const id = parseOptionalInt(formData.get("fuel_id"));
    if (!id) throw new Error("Fuel row is missing.");
    deleteFuelTransaction(id);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function deleteLocationAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireCapability(canDeleteLocations, "You cannot delete locations.");
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
    await requireLoadEditor();
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
    await requireLoadEditor();
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
    await requireSettingsEditor();
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

export async function previewSamsaraTrucksAction(
  _prev: SamsaraPreviewState | null,
  _formData: FormData,
): Promise<SamsaraPreviewState> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const { listSamsaraVehicles } = await import("./integrations/samsara");
    const listed = await listSamsaraVehicles();
    if (!listed.ok) return { ok: false, error: listed.error };
    const { previewSamsaraTrucks } = await import("./fleet-import");
    const { samsaraOmittedVehiclesWarning, samsaraReturnedNames, samsaraUnmatchedUnitsWarning } = await import(
      "./fleet-import-shared"
    );
    const { listTrucks } = await import("./queries");
    const rows = previewSamsaraTrucks(listed.vehicles);
    const names = samsaraReturnedNames(listed.vehicles);
    if (rows.length === 0) {
      return {
        ok: false,
        error: names.length
          ? `Samsara returned vehicles but none could be previewed. Names that came back: ${names.join(", ")}.`
          : "Samsara returned no vehicles.",
      };
    }
    const warning = [
      samsaraUnmatchedUnitsWarning(listTrucks(), listed.vehicles),
      samsaraOmittedVehiclesWarning(listed.vehicles, rows),
    ]
      .filter(Boolean)
      .join(" ");
    return {
      ok: true,
      source: "samsara",
      rows,
      warning: warning || undefined,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Samsara preview failed." };
  }
}

export async function confirmSamsaraTrucksImportAction(
  _prev: SamsaraPreviewState | null,
  formData: FormData,
): Promise<SamsaraPreviewState> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const selected = parseSelectedJson<SamsaraTruckPreviewRow>(formData, "selectKey");
    if (selected.length === 0) {
      return { ok: false, error: "Select at least one Samsara vehicle to import." };
    }
    const { applySamsaraTruckImport } = await import("./fleet-import");
    const { resetSamsaraCache } = await import("./integrations/samsara");
    const result = applySamsaraTruckImport(selected);
    resetSamsaraCache();
    refresh();
    return {
      ok: true,
      source: "samsara",
      ...result,
      message: `Imported trucks: created ${result.created}, updated ${result.updated}${result.skipped ? `, skipped ${result.skipped}` : ""}.`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Samsara import failed." };
  }
}

export async function previewOrbcommTrailersAction(
  _prev: OrbcommPreviewState | null,
  formData: FormData,
): Promise<OrbcommPreviewState> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const pasted = String(formData.get("report_text") ?? "").trim();
    const file = formData.get("file");
    let text = pasted;
    if (!text && file instanceof File && file.size > 0) {
      text = await file.text();
    }
    const { previewOrbcommTrailers } = await import("./fleet-import");
    const mode = String(formData.get("mode") ?? "");
    if (mode !== "api" && text) {
      const { parseOrbcommFleetText } = await import("./fleet-import-shared");
      const assets = parseOrbcommFleetText(text);
      const rows = previewOrbcommTrailers(assets);
      if (rows.length === 0) {
        return {
          ok: false,
          error:
            "No trailer rows found. Use a Location Tracking Report or export with Trailer # / Asset ID / VIN / Lat-Lng columns (title rows are skipped). Not a portal scrape.",
        };
      }
      return { ok: true, source: "orbcomm_csv", rows };
    }
    const { listOrbcommFleetAssets } = await import("./integrations/orbcomm");
    const listed = await listOrbcommFleetAssets();
    if (!listed.ok) return { ok: false, error: listed.error };
    const rows = previewOrbcommTrailers(listed.assets);
    if (rows.length === 0) {
      return {
        ok: false,
        error: "Orbcomm API did not return a trailer list. Upload a CSV/export (do not scrape the portal).",
      };
    }
    return { ok: true, source: "orbcomm_api", rows };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Orbcomm preview failed." };
  }
}

export async function confirmOrbcommTrailersImportAction(
  _prev: OrbcommPreviewState | null,
  formData: FormData,
): Promise<OrbcommPreviewState> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const selected = parseSelectedJson<OrbcommTrailerPreviewRow>(formData, "selectKey");
    if (selected.length === 0) {
      return { ok: false, error: "Select at least one trailer to import." };
    }
    const { applyOrbcommTrailerImport } = await import("./fleet-import");
    const result = applyOrbcommTrailerImport(selected);
    refresh();
    return {
      ok: true,
      source: "orbcomm_csv",
      ...result,
      message: `Imported trailers: created ${result.created}, updated ${result.updated}${result.skipped ? `, skipped ${result.skipped}` : ""}.`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Orbcomm import failed." };
  }
}

export async function previewDriversImportAction(
  _prev: DriverImportPreviewState | null,
  formData: FormData,
): Promise<DriverImportPreviewState> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const pasted = String(formData.get("report_text") ?? "").trim();
    const file = formData.get("file");
    const { previewDriversFromText, previewDriversFromXlsx } = await import("./driver-import");
    if (file instanceof File && file.size > 0) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const { fileToBuffer } = await import("./files");
        const rows = previewDriversFromXlsx(new Uint8Array(await fileToBuffer(file)));
        if (rows.length === 0) {
          return { ok: false, error: "Need a Name column." };
        }
        return { ok: true, rows };
      }
      const { decodeCsvBuffer } = await import("./location-csv");
      const { fileToBuffer } = await import("./files");
      const rows = previewDriversFromText(decodeCsvBuffer(await fileToBuffer(file)));
      if (rows.length === 0) {
        return { ok: false, error: "Need a Name column." };
      }
      return { ok: true, rows };
    }
    if (pasted) {
      const rows = previewDriversFromText(pasted);
      if (rows.length === 0) {
        return { ok: false, error: "Need a Name column." };
      }
      return { ok: true, rows };
    }
    return { ok: false, error: "Choose a spreadsheet or paste rows." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Driver preview failed." };
  }
}

export async function confirmDriversImportAction(
  _prev: DriverImportPreviewState | null,
  formData: FormData,
): Promise<DriverImportPreviewState> {
  try {
    await requireCapability(canEditFleet, "Fleet is for Administrator and Standard.");
    const selected = parseSelectedJson<DriverImportPreviewRow>(formData, "selectKey");
    if (selected.length === 0) {
      return { ok: false, error: "Select at least one driver to import." };
    }
    const { applyDriverImport } = await import("./driver-import");
    const result = applyDriverImport(selected);
    refresh();
    return {
      ok: true,
      ...result,
      message: `Imported drivers: created ${result.created}, updated ${result.updated}${result.skipped ? `, skipped ${result.skipped}` : ""}.`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Driver import failed." };
  }
}

type DriverImportPreviewState = import("./driver-import-shared").DriverImportPreviewState;
type DriverImportPreviewRow = import("./driver-import-shared").DriverImportPreviewRow;
type SamsaraPreviewState = import("./fleet-import-shared").FleetImportPreviewState<
  import("./fleet-import-shared").SamsaraTruckPreviewRow
>;
type OrbcommPreviewState = import("./fleet-import-shared").FleetImportPreviewState<
  import("./fleet-import-shared").OrbcommTrailerPreviewRow
>;
type SamsaraTruckPreviewRow = import("./fleet-import-shared").SamsaraTruckPreviewRow;
type OrbcommTrailerPreviewRow = import("./fleet-import-shared").OrbcommTrailerPreviewRow;

export async function addPayItemAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const side = String(formData.get("side") ?? "");
      if (side !== "income" && side !== "expense") throw new Error("Pick income or expenses.");
      const billTo = String(formData.get("bill_to") ?? "customer");
      if (billTo !== "customer" && billTo !== "driver") throw new Error("Pick who this bills.");
      addPayItem(loadId, {
        side,
        bill_to: billTo,
        payee: String(formData.get("payee") ?? "").trim(),
        category: String(formData.get("category") ?? ""),
        rate: parseOptionalFloat(formData.get("rate")),
        qty: parseOptionalFloat(formData.get("qty")) ?? 1,
        total: parseOptionalFloat(formData.get("total")),
        notes: String(formData.get("notes") ?? "").trim(),
      });
      refresh();
      return { ok: true, id: loadId };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function deletePayItemAction(formData: FormData): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const id = parseOptionalInt(formData.get("pay_item_id"));
      if (!id) throw new Error("Pay item is missing.");
      deletePayItem(id);
      refresh();
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function createTmsInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return withRequestAuditActor(async () => {
    try {
      await requireLoadEditor();
      const loadId = parseOptionalInt(formData.get("load_id"));
      if (!loadId) throw new Error("Load is missing.");
      const { createTmsInvoice } = await import("./invoice");
      const result = await createTmsInvoice(loadId);
      refresh();
      return { ok: true, id: result.attachmentId, message: `Invoice ${result.invoiceNumber}` };
    } catch (error) {
      return fail(error);
    }
  });
}

export async function previewLoadsImportAction(
  _prev: LoadImportPreviewState | null,
  formData: FormData,
): Promise<LoadImportPreviewState> {
  try {
    await requireLoadEditor();
    const pasted = String(formData.get("report_text") ?? "").trim();
    const file = formData.get("file");
    const { previewLoadsFromText, previewLoadsFromXlsx } = await import("./load-import");
    let rows: LoadImportPreviewRow[] = [];
    if (file instanceof File && file.size > 0) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const { fileToBuffer } = await import("./files");
        rows = previewLoadsFromXlsx(new Uint8Array(await fileToBuffer(file)));
      } else {
        const { decodeCsvBuffer } = await import("./location-csv");
        const { fileToBuffer } = await import("./files");
        rows = previewLoadsFromText(decodeCsvBuffer(await fileToBuffer(file)));
      }
    } else if (pasted) {
      rows = previewLoadsFromText(pasted);
    } else {
      return { ok: false, error: "Choose a spreadsheet or paste rows." };
    }
    if (rows.length === 0) {
      return {
        ok: false,
        error: "Need a Load # column.",
      };
    }
    return {
      ok: true,
      rows,
      count: rows.length,
      sampleNumbers: rows.slice(0, 8).map((row) => row.load_number),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Load preview failed." };
  }
}

export async function confirmLoadsImportAction(
  _prev: LoadImportPreviewState | null,
  formData: FormData,
): Promise<LoadImportPreviewState> {
  try {
    await requireLoadEditor();
    const raw = String(formData.get("rows") ?? "").trim();
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const rows = Array.isArray(parsed)
      ? parsed.filter((item): item is LoadImportPreviewRow => Boolean(item) && typeof item === "object")
      : [];
    if (rows.length === 0) return { ok: false, error: "Preview the sheet first, then import." };
    const { applyLoadImport } = await import("./load-import");
    const result = applyLoadImport(rows);
    refresh();
    return {
      ok: true,
      ...result,
      count: rows.length,
      sampleNumbers: rows.slice(0, 8).map((row) => row.load_number),
      message: `Imported loads: created ${result.created}, updated ${result.updated}${
        result.skipped ? `, skipped ${result.skipped}` : ""
      }.`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Load import failed." };
  }
}

type LoadImportPreviewState = import("./load-import-shared").LoadImportPreviewState;
type LoadImportPreviewRow = import("./load-import-shared").LoadImportPreviewRow;

function parseSelectedJson<T>(formData: FormData, ...idKeys: string[]): T[] {
  const raw = String(formData.get("rows") ?? "").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  const selected = new Set(
    formData
      .getAll("selected")
      .map((value) => String(value).trim())
      .filter(Boolean),
  );
  const rows = parsed.filter((item): item is T => Boolean(item) && typeof item === "object");
  if (selected.size === 0) return [];
  return rows.filter((row) => {
    const record = row as Record<string, unknown>;
    return idKeys.some((key) => selected.has(String(record[key] ?? "").trim()));
  });
}
