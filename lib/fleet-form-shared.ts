/** Client-safe fleet form values. No PIN, no sqlite row objects. */

import {
  DEFAULT_CAB_TYPE,
  DEFAULT_FLEET_TYPE,
  TRAILER_TYPES,
  normalizeCabType,
  normalizeDriverKind,
  type TrailerType,
  type TruckType,
  parseFleetDivision,
  type FleetDivision,
} from "./types";

export function parseTruckType(value: unknown): TruckType {
  return normalizeCabType(value || DEFAULT_CAB_TYPE);
}

export function parseTrailerType(value: unknown): TrailerType {
  const type = String(value ?? "").trim() || DEFAULT_FLEET_TYPE;
  if (!TRAILER_TYPES.some((item) => item.value === type)) {
    throw new Error("Pick a trailer type.");
  }
  return type as TrailerType;
}

export type FleetDriverOption = { id: number; name: string };
export type FleetTruckOption = { id: number; unit_number: string };

export type TruckFormValues = {
  id: number;
  unit_number: string;
  type: string;
  capacity_lbs: number;
  status: string;
  samsara_vehicle_id: string;
  vin: string;
  plate: string;
  plate_state: string;
  year: string;
  make: string;
  model: string;
  notes: string;
  active: number;
  assigned_driver_id: number | null;
  division: FleetDivision;
  registration_issued: string;
  registration_expires: string;
  dot_inspected_on: string;
  dot_expires: string;
};

export type TrailerFormValues = {
  id: number;
  unit_number: string;
  type: string;
  vin: string;
  plate: string;
  truck_id: number | null;
  orbcomm_asset_id: string;
  reefer_setpoint_f: number | null;
  status: string;
  notes: string;
  active: number;
  registration_issued: string;
  registration_expires: string;
  dot_inspected_on: string;
  dot_expires: string;
  division: FleetDivision;
};

export type DriverFormValues = {
  id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  active: number;
  license_number: string;
  license_expires: string;
  cdl_endorsements: string;
  medical_issued: string;
  medical_expires: string;
  driver_type: string;
  pay_percent: number | null;
  alt_phone: string;
  cell_phone: string;
  pager: string;
  address: string;
  country: string;
  city: string;
  state: string;
  postal_zip: string;
  date_of_birth: string;
  date_of_hire: string;
  drug_test_last: string;
  drug_test_next: string;
  termination_date: string;
  has_app_login: boolean;
  division: FleetDivision;
};

function num(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function driverOption(driver: { id: unknown; name: unknown }): FleetDriverOption {
  return { id: num(driver.id), name: text(driver.name) };
}

export function truckOption(truck: { id: unknown; unit_number: unknown }): FleetTruckOption {
  return { id: num(truck.id), unit_number: text(truck.unit_number) };
}

export function truckFormValues(truck: Record<string, unknown>): TruckFormValues {
  return {
    id: num(truck.id),
    unit_number: text(truck.unit_number),
    type: normalizeCabType(truck.type || DEFAULT_CAB_TYPE),
    capacity_lbs: num(truck.capacity_lbs) || 45000,
    status: text(truck.status) || "available",
    samsara_vehicle_id: text(truck.samsara_vehicle_id),
    vin: text(truck.vin),
    plate: text(truck.plate),
    plate_state: text(truck.plate_state).toUpperCase(),
    year: text(truck.year),
    make: text(truck.make),
    model: text(truck.model),
    notes: text(truck.notes),
    active: num(truck.active),
    assigned_driver_id: numOrNull(truck.assigned_driver_id),
    division: parseFleetDivision(truck.division),
    registration_issued: text(truck.registration_issued),
    registration_expires: text(truck.registration_expires),
    dot_inspected_on: text(truck.dot_inspected_on),
    dot_expires: text(truck.dot_expires),
  };
}

export function trailerFormValues(trailer: Record<string, unknown>): TrailerFormValues {
  return {
    id: num(trailer.id),
    unit_number: text(trailer.unit_number),
    type: text(trailer.type) || DEFAULT_FLEET_TYPE,
    vin: text(trailer.vin),
    plate: text(trailer.plate),
    truck_id: numOrNull(trailer.truck_id),
    orbcomm_asset_id: text(trailer.orbcomm_asset_id),
    reefer_setpoint_f: numOrNull(trailer.reefer_setpoint_f),
    status: text(trailer.status) || "available",
    notes: text(trailer.notes),
    active: num(trailer.active),
    registration_issued: text(trailer.registration_issued),
    registration_expires: text(trailer.registration_expires),
    dot_inspected_on: text(trailer.dot_inspected_on),
    dot_expires: text(trailer.dot_expires),
    division: parseFleetDivision(trailer.division),
  };
}

export function driverFormValues(driver: Record<string, unknown>): DriverFormValues {
  return {
    id: num(driver.id),
    name: text(driver.name),
    phone: text(driver.phone),
    email: text(driver.email),
    notes: text(driver.notes),
    active: num(driver.active),
    license_number: text(driver.license_number),
    license_expires: text(driver.license_expires),
    cdl_endorsements: text(driver.cdl_endorsements),
    medical_issued: text(driver.medical_issued),
    medical_expires: text(driver.medical_expires),
    driver_type: normalizeDriverKind(text(driver.driver_type)),
    pay_percent: numOrNull(driver.pay_percent),
    alt_phone: text(driver.alt_phone),
    cell_phone: text(driver.cell_phone),
    pager: text(driver.pager),
    address: text(driver.address),
    country: text(driver.country) || "USA",
    city: text(driver.city),
    state: text(driver.state),
    postal_zip: text(driver.postal_zip),
    date_of_birth: text(driver.date_of_birth),
    date_of_hire: text(driver.date_of_hire),
    drug_test_last: text(driver.drug_test_last),
    drug_test_next: text(driver.drug_test_next),
    termination_date: text(driver.termination_date),
    has_app_login: num(driver.has_app_login) !== 0,
    division: parseFleetDivision(driver.division),
  };
}
