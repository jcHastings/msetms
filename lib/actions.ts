"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromInputDateTime, parseOptionalFloat, parseOptionalInt, requiredString } from "./format";
import {
  assignLoad,
  createCustomer,
  createDriver,
  createLoad,
  createTruck,
  updateCustomer,
  updateDriver,
  updateLoad,
  updateLoadStatus,
  updateTruck,
  type LoadInput,
} from "./queries";
import {
  DRIVER_STATUSES,
  LOAD_STATUSES,
  TRUCK_STATUSES,
  TRUCK_TYPES,
  isLoadStatus,
  type ActionResult,
  type DriverStatus,
  type LoadStatus,
  type TruckStatus,
  type TruckType,
} from "./types";

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

function parseLoadInput(formData: FormData): LoadInput {
  const customerId = parseOptionalInt(formData.get("customer_id"));
  if (!customerId) throw new Error("Pick a customer.");
  const statusValue = String(formData.get("status") ?? "available");
  if (!isLoadStatus(statusValue)) throw new Error("Invalid load status.");
  const truckId = parseOptionalInt(formData.get("truck_id"));
  const driverId = parseOptionalInt(formData.get("driver_id"));
  return {
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
    status: statusValue,
    truck_id: truckId,
    driver_id: driverId,
  };
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
      license: String(formData.get("license") ?? "").trim(),
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
      license: String(formData.get("license") ?? "").trim(),
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
    const id = createLoad(parseLoadInput(formData));
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
    updateLoad(id, parseLoadInput(formData));
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
    if (!loadId || !truckId || !driverId) {
      throw new Error("Pick a truck and a driver.");
    }
    assignLoad(loadId, truckId, driverId);
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
    if (!isLoadStatus(status) || !LOAD_STATUSES.includes(status)) {
      throw new Error("Invalid status.");
    }
    updateLoadStatus(loadId, status as LoadStatus);
    refresh();
    return { ok: true, id: loadId };
  } catch (error) {
    return fail(error);
  }
}
