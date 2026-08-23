import {
  driverComplianceAlerts,
  trailerComplianceAlerts,
  truckComplianceAlerts,
  type ComplianceAlert,
} from "./compliance";
import { getDb } from "./db";
import { computeOwnerOperatorPay } from "./settlement";
import {
  ACTIVE_LOAD_STATUSES,
  ARCHIVED_LOAD_STATUSES,
  isClosedStatus,
  isRollingStatus,
  LOAD_STATUSES,
  statusNeedsAssets,
  type Contact,
  type Customer,
  type CustomerWithContacts,
  type DashboardStats,
  type Driver,
  type DriverKind,
  type DriverStatus,
  type DriverWithTruck,
  type Load,
  type DriverProgress,
  type LoadStatus,
  type IftaJurisdictionRow,
  type IftaReport,
  type LoadView,
  type Location,
  type Trailer,
  type TrailerType,
  type Truck,
  type TruckStatus,
  type TruckType,
} from "./types";
import { extractStateCode } from "./locations";
import type { LocationInput } from "./locations";
import { complianceWindows, defaultOoPercent, showsSampleData, takeNextLoadNumber } from "./settings";
import {
  defaultSearchCriteria,
  type LoadSearchCriteria,
  type SavedReport,
  type SearchColumnKey,
} from "./search";

const BUSY_STATUSES = ACTIVE_LOAD_STATUSES.filter((status) => statusNeedsAssets(status));
const BUSY_STATUS_SQL = BUSY_STATUSES.map(() => "?").join(", ");
const ROLLING_STATUSES = LOAD_STATUSES.filter((status) => isRollingStatus(status));
const ROLLING_STATUS_SQL = ROLLING_STATUSES.map(() => "?").join(", ");

const LOAD_SELECT = `
  SELECT
    loads.*,
    customers.name AS customer_name,
    trucks.unit_number AS truck_unit,
    trucks.type AS truck_type,
    trucks.samsara_vehicle_id AS truck_samsara_id,
    trucks.samsara_trailer_id AS truck_samsara_trailer_id,
    trucks.orbcomm_asset_id AS truck_orbcomm_asset_id,
    trailers.unit_number AS trailer_unit,
    trailers.orbcomm_asset_id AS trailer_orbcomm_asset_id,
    drivers.name AS driver_name,
    drivers.phone AS driver_phone,
    drivers.driver_type AS driver_type
  FROM loads
  JOIN customers ON customers.id = loads.customer_id
  LEFT JOIN trucks ON trucks.id = loads.truck_id
  LEFT JOIN trailers ON trailers.id = loads.trailer_id
  LEFT JOIN drivers ON drivers.id = loads.driver_id
`;

function now(): string {
  return new Date().toISOString();
}

function asLoadView(row: LoadView | undefined): LoadView | null {
  return row ?? null;
}

export function listLocations(role?: "shipper" | "receiver"): Location[] {
  const rows = getDb()
    .prepare("SELECT * FROM locations ORDER BY name COLLATE NOCASE")
    .all() as Location[];
  if (!role) return rows;
  return rows.filter((location) => location.role === "both" || location.role === role);
}

export function getLocation(id: number): Location | null {
  return (getDb().prepare("SELECT * FROM locations WHERE id = ?").get(id) as Location | undefined) ?? null;
}

export function createLocation(input: LocationInput): number {
  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO locations (
        name, street, city, state, zip, phone, notes, role, scheduling_type, hours, scheduling_notes,
        latitude, longitude, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.street,
      input.city,
      input.state,
      input.zip,
      input.phone,
      input.notes,
      input.role,
      input.scheduling_type,
      input.hours,
      input.scheduling_notes,
      input.latitude ?? null,
      input.longitude ?? null,
      timestamp,
      timestamp,
    );
  return Number(result.lastInsertRowid);
}

export function updateLocation(id: number, input: LocationInput): void {
  if (!getLocation(id)) throw new Error("Location not found.");
  getDb()
    .prepare(
      `UPDATE locations
       SET name = ?, street = ?, city = ?, state = ?, zip = ?, phone = ?, notes = ?,
           role = ?, scheduling_type = ?, hours = ?, scheduling_notes = ?,
           latitude = ?, longitude = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name,
      input.street,
      input.city,
      input.state,
      input.zip,
      input.phone,
      input.notes,
      input.role,
      input.scheduling_type,
      input.hours,
      input.scheduling_notes,
      input.latitude ?? null,
      input.longitude ?? null,
      now(),
      id,
    );
}

export function deleteLocation(id: number): void {
  if (!getLocation(id)) throw new Error("Location not found.");
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE loads SET shipper_location_id = NULL WHERE shipper_location_id = ?").run(id);
    db.prepare("UPDATE loads SET consignee_location_id = NULL WHERE consignee_location_id = ?").run(id);
    db.prepare("DELETE FROM locations WHERE id = ?").run(id);
  })();
}

export function locationsForLoad(load: {
  shipper_location_id: number | null;
  consignee_location_id: number | null;
}): { shipper: Location | null; consignee: Location | null } {
  return {
    shipper: load.shipper_location_id ? getLocation(load.shipper_location_id) : null,
    consignee: load.consignee_location_id ? getLocation(load.consignee_location_id) : null,
  };
}

export function listCustomers(): Customer[] {
  return getDb().prepare("SELECT * FROM customers ORDER BY name COLLATE NOCASE").all() as Customer[];
}

export function getCustomer(id: number): CustomerWithContacts | null {
  const customer = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id) as Customer | undefined;
  if (!customer) return null;
  const contacts = getDb()
    .prepare("SELECT * FROM contacts WHERE customer_id = ? ORDER BY id")
    .all(id) as Contact[];
  return { ...customer, contacts };
}

export function createCustomer(input: {
  name: string;
  billing_notes: string;
  credit_hold?: boolean;
  payment_terms?: string;
  contacts: Array<{ name: string; role: string; phone: string; email: string }>;
}): number {
  const db = getDb();
  const timestamp = now();
  const result = db
    .prepare(
      `INSERT INTO customers (name, billing_notes, credit_hold, payment_terms, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.billing_notes,
      input.credit_hold ? 1 : 0,
      input.payment_terms ?? "",
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  replaceContacts(id, input.contacts);
  return id;
}

export function updateCustomer(
  id: number,
  input: {
    name: string;
    billing_notes: string;
    credit_hold?: boolean;
    payment_terms?: string;
    contacts: Array<{ name: string; role: string; phone: string; email: string }>;
  },
): void {
  const existing = getCustomer(id);
  if (!existing) throw new Error("Customer not found.");
  getDb()
    .prepare(
      "UPDATE customers SET name = ?, billing_notes = ?, credit_hold = ?, payment_terms = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      input.name,
      input.billing_notes,
      input.credit_hold ? 1 : 0,
      input.payment_terms ?? existing.payment_terms ?? "",
      now(),
      id,
    );
  replaceContacts(id, input.contacts);
}

function replaceContacts(
  customerId: number,
  contacts: Array<{ name: string; role: string; phone: string; email: string }>,
): void {
  const db = getDb();
  db.prepare("DELETE FROM contacts WHERE customer_id = ?").run(customerId);
  const insert = db.prepare(
    `INSERT INTO contacts (customer_id, name, role, phone, email)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const contact of contacts) {
    const name = contact.name.trim();
    if (!name) continue;
    insert.run(customerId, name, contact.role.trim(), contact.phone.trim(), contact.email.trim());
  }
}

export function listTrucks(): Truck[] {
  return getDb()
    .prepare("SELECT * FROM trucks ORDER BY CAST(unit_number AS INTEGER), unit_number")
    .all() as Truck[];
}

export function getTruck(id: number): Truck | null {
  return (getDb().prepare("SELECT * FROM trucks WHERE id = ?").get(id) as Truck | undefined) ?? null;
}

export function listTrailers(): Trailer[] {
  return getDb()
    .prepare("SELECT * FROM trailers ORDER BY unit_number COLLATE NOCASE")
    .all() as Trailer[];
}

export function getTrailer(id: number): Trailer | null {
  return (getDb().prepare("SELECT * FROM trailers WHERE id = ?").get(id) as Trailer | undefined) ?? null;
}

export function createTrailer(input: {
  unit_number: string;
  type: TrailerType;
  orbcomm_asset_id?: string;
  registration_issued?: string;
  registration_expires?: string;
  dot_inspected_on?: string;
  dot_expires?: string;
  status?: TruckStatus;
}): number {
  const timestamp = now();
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO trailers (
          unit_number, type, orbcomm_asset_id, registration_issued, registration_expires,
          dot_inspected_on, dot_expires, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.unit_number,
        input.type,
        input.orbcomm_asset_id ?? "",
        input.registration_issued ?? "",
        input.registration_expires ?? "",
        input.dot_inspected_on ?? "",
        input.dot_expires ?? "",
        input.status ?? "available",
        timestamp,
        timestamp,
      );
    return Number(result.lastInsertRowid);
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new Error("A trailer with that unit number already exists.");
    }
    throw error;
  }
}

export function updateTrailer(
  id: number,
  input: {
    unit_number: string;
    type: TrailerType;
    orbcomm_asset_id?: string;
    registration_issued?: string;
    registration_expires?: string;
    dot_inspected_on?: string;
    dot_expires?: string;
    status?: TruckStatus;
  },
): void {
  if (!getTrailer(id)) throw new Error("Trailer not found.");
  try {
    getDb()
      .prepare(
        `UPDATE trailers
         SET unit_number = ?, type = ?, orbcomm_asset_id = ?, registration_issued = ?,
             registration_expires = ?, dot_inspected_on = ?, dot_expires = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.unit_number,
        input.type,
        input.orbcomm_asset_id ?? "",
        input.registration_issued ?? "",
        input.registration_expires ?? "",
        input.dot_inspected_on ?? "",
        input.dot_expires ?? "",
        input.status ?? "available",
        now(),
        id,
      );
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new Error("A trailer with that unit number already exists.");
    }
    throw error;
  }
}

export function createTruck(input: {
  unit_number: string;
  type: TruckType;
  capacity_lbs: number;
  status: TruckStatus;
  samsara_vehicle_id?: string;
  samsara_trailer_id?: string;
  orbcomm_asset_id?: string;
  trailer_number?: string;
  registration_issued?: string;
  registration_expires?: string;
  dot_inspected_on?: string;
  dot_expires?: string;
  vin?: string;
  plate?: string;
  year?: string;
  make?: string;
}): number {
  const timestamp = now();
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO trucks (unit_number, type, capacity_lbs, status, samsara_vehicle_id, samsara_trailer_id, orbcomm_asset_id, trailer_number,
            registration_issued, registration_expires, dot_inspected_on, dot_expires, vin, plate, year, make, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.unit_number,
        input.type,
        input.capacity_lbs,
        input.status,
        input.samsara_vehicle_id ?? "",
        input.samsara_trailer_id ?? "",
        input.orbcomm_asset_id ?? "",
        input.trailer_number ?? "",
        input.registration_issued ?? "",
        input.registration_expires ?? "",
        input.dot_inspected_on ?? "",
        input.dot_expires ?? "",
        input.vin ?? "",
        input.plate ?? "",
        input.year ?? "",
        input.make ?? "",
        timestamp,
        timestamp,
      );
    return Number(result.lastInsertRowid);
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new Error("A truck with that unit number already exists.");
    }
    throw error;
  }
}

export function updateTruck(
  id: number,
  input: {
    unit_number: string;
    type: TruckType;
    capacity_lbs: number;
    status: TruckStatus;
    samsara_vehicle_id?: string;
    samsara_trailer_id?: string;
    orbcomm_asset_id?: string;
    trailer_number?: string;
    registration_issued?: string;
    registration_expires?: string;
    dot_inspected_on?: string;
    dot_expires?: string;
    vin?: string;
    plate?: string;
    year?: string;
    make?: string;
  },
): void {
  if (!getTruck(id)) throw new Error("Truck not found.");
  try {
    getDb()
      .prepare(
        `UPDATE trucks
         SET unit_number = ?, type = ?, capacity_lbs = ?, status = ?,
             samsara_vehicle_id = ?, samsara_trailer_id = ?, orbcomm_asset_id = ?, trailer_number = ?,
             registration_issued = ?, registration_expires = ?, dot_inspected_on = ?, dot_expires = ?,
             vin = ?, plate = ?, year = ?, make = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.unit_number,
        input.type,
        input.capacity_lbs,
        input.status,
        input.samsara_vehicle_id ?? "",
        input.samsara_trailer_id ?? "",
        input.orbcomm_asset_id ?? "",
        input.trailer_number ?? "",
        input.registration_issued ?? "",
        input.registration_expires ?? "",
        input.dot_inspected_on ?? "",
        input.dot_expires ?? "",
        input.vin ?? "",
        input.plate ?? "",
        input.year ?? "",
        input.make ?? "",
        now(),
        id,
      );
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new Error("A truck with that unit number already exists.");
    }
    throw error;
  }
}

export function listDrivers(): DriverWithTruck[] {
  return getDb()
    .prepare(
      `SELECT drivers.*, trucks.unit_number AS truck_unit, trucks.type AS truck_type
       FROM drivers
       LEFT JOIN trucks ON trucks.id = drivers.truck_id
       ORDER BY drivers.name COLLATE NOCASE`,
    )
    .all() as DriverWithTruck[];
}

export function getDriver(id: number): DriverWithTruck | null {
  return (
    (getDb()
      .prepare(
        `SELECT drivers.*, trucks.unit_number AS truck_unit, trucks.type AS truck_type
         FROM drivers
         LEFT JOIN trucks ON trucks.id = drivers.truck_id
         WHERE drivers.id = ?`,
      )
      .get(id) as DriverWithTruck | undefined) ?? null
  );
}

export function createDriver(input: {
  name: string;
  phone: string;
  license: string;
  pin?: string;
  samsara_driver_id?: string;
  license_number?: string;
  license_state?: string;
  license_expires?: string;
  medical_issued?: string;
  medical_expires?: string;
  driver_type?: DriverKind;
  pay_percent?: number | null;
  truck_id: number | null;
  status: DriverStatus;
}): number {
  if (input.truck_id && !getTruck(input.truck_id)) {
    throw new Error("Assigned truck not found.");
  }
  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO drivers (
        name, phone, license, license_number, license_state, license_expires,
        medical_issued, medical_expires, driver_type, pay_percent,
        pin, samsara_driver_id, truck_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.phone,
      input.license,
      input.license_number ?? "",
      input.license_state ?? "",
      input.license_expires ?? "",
      input.medical_issued ?? "",
      input.medical_expires ?? "",
      input.driver_type ?? "company_driver",
      input.pay_percent ?? null,
      input.pin ?? "",
      input.samsara_driver_id ?? "",
      input.truck_id,
      input.status,
      timestamp,
      timestamp,
    );
  return Number(result.lastInsertRowid);
}

export function updateDriver(
  id: number,
  input: {
    name: string;
    phone: string;
    license: string;
    pin?: string;
    samsara_driver_id?: string;
    license_number?: string;
    license_state?: string;
    license_expires?: string;
    medical_issued?: string;
    medical_expires?: string;
    driver_type?: DriverKind;
    pay_percent?: number | null;
    truck_id: number | null;
    status: DriverStatus;
  },
): void {
  if (!getDriver(id)) throw new Error("Driver not found.");
  if (input.truck_id && !getTruck(input.truck_id)) {
    throw new Error("Assigned truck not found.");
  }
  getDb()
    .prepare(
      `UPDATE drivers
       SET name = ?, phone = ?, license = ?, license_number = ?, license_state = ?, license_expires = ?,
           medical_issued = ?, medical_expires = ?, driver_type = ?, pay_percent = ?,
           pin = ?, samsara_driver_id = ?, truck_id = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name,
      input.phone,
      input.license,
      input.license_number ?? "",
      input.license_state ?? "",
      input.license_expires ?? "",
      input.medical_issued ?? "",
      input.medical_expires ?? "",
      input.driver_type ?? "company_driver",
      input.pay_percent ?? null,
      input.pin ?? "",
      input.samsara_driver_id ?? "",
      input.truck_id,
      input.status,
      now(),
      id,
    );
}

export function authenticateDriver(driverId: number, pin: string): DriverWithTruck {
  const driver = getDriver(driverId);
  if (!driver || !driver.pin || driver.pin !== pin.trim()) {
    throw new Error("Driver or PIN is not recognized.");
  }
  return driver;
}

export function listLoadsForDriver(driverId: number): LoadView[] {
  return getDb()
    .prepare(
      `${LOAD_SELECT}
       WHERE loads.driver_id = ?
         AND loads.status != 'cancelled'
       ORDER BY CASE loads.status
         WHEN 'in_transit' THEN 0
         WHEN 'picked_up' THEN 0
         WHEN 'at_delivery' THEN 0
         WHEN 'unloading' THEN 0
         WHEN 'dispatched' THEN 1
         WHEN 'at_pickup' THEN 1
         WHEN 'loading' THEN 1
         WHEN 'assigned' THEN 2
         ELSE 3
       END, loads.pickup_start ASC`,
    )
    .all(driverId) as LoadView[];
}

export function findOrCreateCustomer(name: string): number {
  const existing = listCustomers().find(
    (customer) => customer.name.toLowerCase() === name.trim().toLowerCase(),
  );
  if (existing) return existing.id;
  return createCustomer({
    name: name.trim(),
    billing_notes: "Created from a rate confirmation import.",
    contacts: [],
  });
}

export type LoadFilters = {
  status?: string;
  date?: string;
  q?: string;
};

export function listLoads(filters: LoadFilters = {}): LoadView[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.status === "active" || !filters.status) {
    clauses.push(`loads.status IN (${ACTIVE_LOAD_STATUSES.map(() => "?").join(", ")})`);
    params.push(...ACTIVE_LOAD_STATUSES);
  } else if (filters.status !== "all") {
    clauses.push("loads.status = ?");
    params.push(filters.status);
  }

  if (filters.date) {
    clauses.push("date(loads.pickup_start, 'localtime') = ?");
    params.push(filters.date);
  }

  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    clauses.push(
      `(loads.load_number LIKE ? OR customers.name LIKE ? OR loads.origin LIKE ? OR loads.destination LIKE ? OR loads.commodity LIKE ?)`,
    );
    params.push(term, term, term, term, term);
  }

  if (!showsSampleData()) {
    clauses.push("loads.is_sample = 0");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `${LOAD_SELECT} ${where}
       ORDER BY CASE loads.status
         WHEN 'in_transit' THEN 0
         WHEN 'picked_up' THEN 0
         WHEN 'at_delivery' THEN 0
         WHEN 'unloading' THEN 0
         WHEN 'dispatched' THEN 1
         WHEN 'at_pickup' THEN 1
         WHEN 'loading' THEN 1
         WHEN 'assigned' THEN 2
         WHEN 'available' THEN 3
         WHEN 'hold' THEN 4
         WHEN 'delivered' THEN 5
         WHEN 'completed' THEN 5
         ELSE 6
       END, loads.pickup_start ASC`,
    )
    .all(...params) as LoadView[];
}

export function getLoad(id: number): LoadView | null {
  return asLoadView(getDb().prepare(`${LOAD_SELECT} WHERE loads.id = ?`).get(id) as LoadView | undefined);
}

function searchStatuses(criteria: LoadSearchCriteria): string[] {
  if (criteria.status) {
    return [criteria.status];
  }
  const statuses: string[] = [];
  if (criteria.includeLive) statuses.push(...ACTIVE_LOAD_STATUSES);
  if (criteria.includeArchived) statuses.push(...ARCHIVED_LOAD_STATUSES);
  if (criteria.includeCancelled) statuses.push("cancelled");
  return statuses;
}

export function searchLoads(input: Partial<LoadSearchCriteria> = {}): LoadView[] {
  const criteria = { ...defaultSearchCriteria(), ...input };
  const statuses = searchStatuses(criteria);
  if (statuses.length === 0) return [];

  const clauses: string[] = [`loads.status IN (${statuses.map(() => "?").join(", ")})`];
  const params: Array<string | number> = [...statuses];

  if (criteria.q.trim()) {
    const term = `%${criteria.q.trim()}%`;
    clauses.push(
      `(loads.load_number LIKE ? OR customers.name LIKE ? OR loads.origin LIKE ? OR loads.destination LIKE ?
        OR loads.commodity LIKE ? OR loads.reference_number LIKE ? OR loads.po_number LIKE ?
        OR loads.notes LIKE ? OR loads.special_instructions LIKE ? OR loads.appointment_notes LIKE ?)`,
    );
    params.push(term, term, term, term, term, term, term, term, term, term);
  }

  if (criteria.customerId) {
    clauses.push("loads.customer_id = ?");
    params.push(criteria.customerId);
  }
  if (criteria.driverId) {
    clauses.push("loads.driver_id = ?");
    params.push(criteria.driverId);
  }
  if (criteria.truckId) {
    clauses.push("loads.truck_id = ?");
    params.push(criteria.truckId);
  }
  if (criteria.trailerId) {
    clauses.push("loads.trailer_id = ?");
    params.push(criteria.trailerId);
  }

  if (criteria.dateFrom) {
    clauses.push("date(loads.pickup_start, 'localtime') >= ?");
    params.push(criteria.dateFrom);
  }
  if (criteria.dateTo) {
    clauses.push("date(loads.pickup_start, 'localtime') <= ?");
    params.push(criteria.dateTo);
  }

  if (!showsSampleData()) {
    clauses.push("loads.is_sample = 0");
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  const rows = getDb()
    .prepare(
      `${LOAD_SELECT} ${where}
       ORDER BY loads.pickup_start ASC, loads.load_number`,
    )
    .all(...params) as LoadView[];

  return rows.filter((load) => {
    if (criteria.originState && extractStateCode(load.origin) !== criteria.originState.toUpperCase()) {
      return false;
    }
    if (criteria.destState && extractStateCode(load.destination) !== criteria.destState.toUpperCase()) {
      return false;
    }
    return true;
  });
}

export function listSavedReports(): SavedReport[] {
  return getDb()
    .prepare("SELECT * FROM saved_reports ORDER BY name COLLATE NOCASE")
    .all() as SavedReport[];
}

export function getSavedReport(id: number): SavedReport | null {
  return (
    (getDb().prepare("SELECT * FROM saved_reports WHERE id = ?").get(id) as SavedReport | undefined) ?? null
  );
}

export function createSavedReport(input: {
  name: string;
  filters: LoadSearchCriteria;
  columns: SearchColumnKey[];
}): number {
  const name = input.name.trim();
  if (!name) throw new Error("Name the report.");
  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO saved_reports (name, filters_json, columns_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(name, JSON.stringify(input.filters), JSON.stringify(input.columns), timestamp, timestamp);
  return Number(result.lastInsertRowid);
}

export function deleteSavedReport(id: number): void {
  getDb().prepare("DELETE FROM saved_reports WHERE id = ?").run(id);
}

export function nextLoadNumber(): string {
  return takeNextLoadNumber();
}

export type LoadInput = {
  customer_id: number;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  weight: number | null;
  commodity: string;
  rate: number | null;
  notes: string;
  special_instructions: string;
  appointment_notes: string;
  reference_number: string;
  po_number: string;
  reefer_setpoint_f: number | null;
  trailer_number: string;
  trailer_id?: number | null;
  shipper_location_id?: number | null;
  consignee_location_id?: number | null;
  oo_percent?: number | null;
  oo_pay?: number | null;
  status: string;
  truck_id: number | null;
  driver_id: number | null;
};

function validateLoadInput(input: LoadInput): void {
  if (!getCustomer(input.customer_id)) {
    throw new Error("Pick a customer.");
  }
  if (input.shipper_location_id && !getLocation(input.shipper_location_id)) {
    throw new Error("Shipper location was not found.");
  }
  if (input.consignee_location_id && !getLocation(input.consignee_location_id)) {
    throw new Error("Consignee location was not found.");
  }
  if (new Date(input.pickup_end) < new Date(input.pickup_start)) {
    throw new Error("Pickup window end must be after the start.");
  }
  if (new Date(input.delivery_end) < new Date(input.delivery_start)) {
    throw new Error("Delivery window end must be after the start.");
  }
  if (statusNeedsAssets(input.status) && (!input.truck_id || !input.driver_id)) {
    throw new Error("Assign a truck and driver before setting this status.");
  }
}

function normalizeAssignment(input: LoadInput): LoadInput {
  if (input.status === "available") {
    return { ...input, truck_id: null, driver_id: null };
  }
  return input;
}

export function createLoad(input: LoadInput): number {
  input = normalizeAssignment(input);
  validateLoadInput(input);
  const timestamp = now();
  const loadNumber = nextLoadNumber();
  const db = getDb();
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO loads (
          load_number, customer_id, origin, destination,
          pickup_start, pickup_end, delivery_start, delivery_end,
          weight, commodity, rate, notes, special_instructions, appointment_notes,
          reference_number, po_number, reefer_setpoint_f, trailer_number, trailer_id,
          shipper_location_id, consignee_location_id,
          oo_percent, oo_pay, status, truck_id, driver_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        loadNumber,
        input.customer_id,
        input.origin,
        input.destination,
        input.pickup_start,
        input.pickup_end,
        input.delivery_start,
        input.delivery_end,
        input.weight,
        input.commodity,
        input.rate,
        input.notes,
        input.special_instructions,
        input.appointment_notes,
        input.reference_number,
        input.po_number,
        input.reefer_setpoint_f,
        input.trailer_number,
        input.trailer_id ?? null,
        input.shipper_location_id ?? null,
        input.consignee_location_id ?? null,
        input.oo_percent ?? null,
        input.oo_pay ?? null,
        input.status,
        input.truck_id,
        input.driver_id,
        timestamp,
        timestamp,
      );
    const id = Number(result.lastInsertRowid);
    syncAssignment(id, input.status, input.truck_id, input.driver_id);
    return id;
  });
  return insert();
}

export function updateLoad(id: number, input: LoadInput): void {
  const existing = getLoad(id);
  if (!existing) throw new Error("Load not found.");
  input = normalizeAssignment(input);
  validateLoadInput(input);
  const db = getDb();
  db.transaction(() => {
    releaseAssetsIfNeeded(existing);
    db.prepare(
      `UPDATE loads SET
        customer_id = ?, origin = ?, destination = ?,
        pickup_start = ?, pickup_end = ?, delivery_start = ?, delivery_end = ?,
        weight = ?, commodity = ?, rate = ?, notes = ?,
        special_instructions = ?, appointment_notes = ?,
        reference_number = ?, po_number = ?, reefer_setpoint_f = ?, trailer_number = ?, trailer_id = ?,
        shipper_location_id = ?, consignee_location_id = ?,
        oo_percent = ?, oo_pay = ?, status = ?, truck_id = ?, driver_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.customer_id,
      input.origin,
      input.destination,
      input.pickup_start,
      input.pickup_end,
      input.delivery_start,
      input.delivery_end,
      input.weight,
      input.commodity,
      input.rate,
      input.notes,
      input.special_instructions,
      input.appointment_notes,
      input.reference_number,
      input.po_number,
      input.reefer_setpoint_f,
      input.trailer_number,
      input.trailer_id ?? null,
      input.shipper_location_id ?? null,
      input.consignee_location_id ?? null,
      input.oo_percent ?? null,
      input.oo_pay ?? null,
      input.status,
      input.truck_id,
      input.driver_id,
      now(),
      id,
    );
    syncAssignment(id, input.status, input.truck_id, input.driver_id);
  })();
}

export function assignLoad(
  loadId: number,
  truckId: number,
  driverId: number,
  trailerId?: number | null,
  settlement?: { oo_percent?: number | null },
): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (isClosedStatus(load.status)) {
    throw new Error("Cannot assign a closed load.");
  }
  const truck = getTruck(truckId);
  const driver = getDriver(driverId);
  const trailer = trailerId ? getTrailer(trailerId) : null;
  if (!truck) throw new Error("Truck not found.");
  if (!driver) throw new Error("Driver not found.");
  if (trailerId && !trailer) throw new Error("Trailer not found.");
  if (truck.status === "maintenance" || truck.status === "out_of_service") {
    throw new Error(`Truck ${truck.unit_number} is ${truck.status.replaceAll("_", " ")}.`);
  }
  if (driver.status === "off_duty") {
    throw new Error(`${driver.name} is off duty.`);
  }
  assertAssetFree(truckId, driverId, loadId, trailerId ?? null);

  const ooPercent =
    driver.driver_type === "owner_operator"
      ? settlement?.oo_percent ?? driver.pay_percent ?? defaultOoPercent()
      : null;
  const ooPay = computeOwnerOperatorPay(load.rate, ooPercent);

  const db = getDb();
  db.transaction(() => {
    releaseAssetsIfNeeded(load);
    const nextStatus = isRollingStatus(load.status) ? load.status : "assigned";
    db.prepare(
      `UPDATE loads SET truck_id = ?, driver_id = ?, trailer_id = ?, trailer_number = ?,
         oo_percent = ?, oo_pay = ?, status = ?, driver_progress = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      truckId,
      driverId,
      trailerId ?? null,
      trailer?.unit_number ?? load.trailer_number,
      ooPercent,
      ooPay,
      nextStatus,
      isRollingStatus(nextStatus) ? load.driver_progress : "",
      now(),
      loadId,
    );
    markAssetsOnDuty(truckId, driverId);
  })();
}

export function getIftaReport(loadId: number): IftaReport | null {
  const report = getDb()
    .prepare("SELECT * FROM ifta_reports WHERE load_id = ?")
    .get(loadId) as Omit<IftaReport, "rows"> | undefined;
  if (!report) return null;
  const rows = getDb()
    .prepare(
      "SELECT jurisdiction, name, miles FROM ifta_jurisdictions WHERE report_id = ? ORDER BY miles DESC, jurisdiction",
    )
    .all(report.id) as IftaJurisdictionRow[];
  return { ...report, rows };
}

export function saveIftaReport(input: {
  loadId: number;
  source: "demo" | "samsara";
  vehicleId: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  totalMiles: number;
  note: string;
  error?: string;
  attachmentId: number | null;
  rows: IftaJurisdictionRow[];
}): IftaReport {
  if (!getLoad(input.loadId)) throw new Error("Load not found.");
  const db = getDb();
  const persist = db.transaction(() => {
    db.prepare("DELETE FROM ifta_reports WHERE load_id = ?").run(input.loadId);
    const result = db
      .prepare(
        `INSERT INTO ifta_reports (
          load_id, source, vehicle_id, generated_at, window_start, window_end,
          total_miles, note, error, attachment_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.loadId,
        input.source,
        input.vehicleId,
        input.generatedAt,
        input.windowStart,
        input.windowEnd,
        input.totalMiles,
        input.note,
        input.error ?? "",
        input.attachmentId,
      );
    const reportId = Number(result.lastInsertRowid);
    const insertRow = db.prepare(
      "INSERT INTO ifta_jurisdictions (report_id, jurisdiction, name, miles) VALUES (?, ?, ?, ?)",
    );
    for (const row of input.rows) {
      insertRow.run(reportId, row.jurisdiction, row.name, row.miles);
    }
    return reportId;
  });
  persist();
  const saved = getIftaReport(input.loadId);
  if (!saved) throw new Error("IFTA report could not be saved.");
  return saved;
}

export function markQboInvoice(
  loadId: number,
  input: {
    invoiceId: string;
    invoiceNumber: string;
    source: "demo" | "quickbooks";
    sentAt: string;
  },
): void {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  getDb()
    .prepare(
      `UPDATE loads
       SET qbo_invoice_id = ?, qbo_invoice_number = ?, qbo_sent_at = ?, qbo_source = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(input.invoiceId, input.invoiceNumber, input.sentAt, input.source, input.sentAt, loadId);
}

export function updateLoadStatus(loadId: number, status: string): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (statusNeedsAssets(status) && (!load.truck_id || !load.driver_id)) {
    throw new Error("Assign a truck and driver first.");
  }
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE loads SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), loadId);
    if (status === "available") {
      db.prepare("UPDATE loads SET truck_id = NULL, driver_id = NULL, updated_at = ? WHERE id = ?").run(
        now(),
        loadId,
      );
      releaseAssetsIfNeeded(load);
    } else if (statusNeedsAssets(status)) {
      markAssetsOnDuty(load.truck_id, load.driver_id);
    } else if (status !== "hold") {
      releaseAssetsIfNeeded(load);
    }
  })();
}

function assertAssetFree(
  truckId: number,
  driverId: number,
  exceptLoadId: number,
  trailerId?: number | null,
): void {
  const conflict = getDb()
    .prepare(
      `SELECT load_number FROM loads
       WHERE id != ?
         AND status IN (${BUSY_STATUS_SQL})
         AND (truck_id = ? OR driver_id = ? OR (? IS NOT NULL AND trailer_id = ?))
       LIMIT 1`,
    )
    .get(exceptLoadId, ...BUSY_STATUSES, truckId, driverId, trailerId ?? null, trailerId ?? null) as
    | { load_number: string }
    | undefined;
  if (conflict) {
    throw new Error(`That truck, trailer, or driver is already on ${conflict.load_number}.`);
  }
}

function markAssetsOnDuty(truckId: number | null, driverId: number | null): void {
  const db = getDb();
  const timestamp = now();
  if (truckId) {
    db.prepare("UPDATE trucks SET status = 'in_use', updated_at = ? WHERE id = ?").run(timestamp, truckId);
  }
  if (driverId) {
    db.prepare("UPDATE drivers SET status = 'on_duty', updated_at = ? WHERE id = ?").run(timestamp, driverId);
  }
}

function releaseAssetsIfNeeded(load: Load): void {
  const db = getDb();
  const timestamp = now();
  if (load.truck_id) {
    const stillUsed = db
      .prepare(
        `SELECT id FROM loads
         WHERE id != ? AND truck_id = ? AND status IN (${BUSY_STATUS_SQL})`,
      )
      .get(load.id, load.truck_id, ...BUSY_STATUSES);
    if (!stillUsed) {
      const truck = getTruck(load.truck_id);
      if (truck && truck.status === "in_use") {
        db.prepare("UPDATE trucks SET status = 'available', updated_at = ? WHERE id = ?").run(
          timestamp,
          load.truck_id,
        );
      }
    }
  }
  if (load.driver_id) {
    const stillUsed = db
      .prepare(
        `SELECT id FROM loads
         WHERE id != ? AND driver_id = ? AND status IN (${BUSY_STATUS_SQL})`,
      )
      .get(load.id, load.driver_id, ...BUSY_STATUSES);
    if (!stillUsed) {
      const driver = getDb().prepare("SELECT * FROM drivers WHERE id = ?").get(load.driver_id) as
        | Driver
        | undefined;
      if (driver && driver.status === "on_duty") {
        db.prepare("UPDATE drivers SET status = 'available', updated_at = ? WHERE id = ?").run(
          timestamp,
          load.driver_id,
        );
      }
    }
  }
}

function syncAssignment(
  loadId: number,
  status: string,
  truckId: number | null,
  driverId: number | null,
): void {
  if (statusNeedsAssets(status)) {
    if (!truckId || !driverId) {
      throw new Error("Assign a truck and driver before setting this status.");
    }
    assertAssetFree(truckId, driverId, loadId);
    markAssetsOnDuty(truckId, driverId);
  } else if (status !== "hold") {
    const load = getLoad(loadId);
    if (load) releaseAssetsIfNeeded(load);
  }
}

export function listAssignableTrucks(loadId?: number): Truck[] {
  return listTrucks().filter((truck) => {
    if (truck.status === "maintenance" || truck.status === "out_of_service") return false;
    const busy = getDb()
      .prepare(
        `SELECT id FROM loads
         WHERE truck_id = ? AND status IN (${BUSY_STATUS_SQL}) AND id != ?`,
      )
      .get(truck.id, ...BUSY_STATUSES, loadId ?? -1);
    return !busy;
  });
}

export function listAssignableDrivers(loadId?: number): DriverWithTruck[] {
  return listDrivers().filter((driver) => {
    if (driver.status === "off_duty") return false;
    const busy = getDb()
      .prepare(
        `SELECT id FROM loads
         WHERE driver_id = ? AND status IN (${BUSY_STATUS_SQL}) AND id != ?`,
      )
      .get(driver.id, ...BUSY_STATUSES, loadId ?? -1);
    return !busy;
  });
}

export function updateDriverProgress(loadId: number, driverId: number, progress: DriverProgress): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.driver_id !== driverId) {
    throw new Error("This load is not on your dispatch.");
  }
  if (load.status === "cancelled") {
    throw new Error("This load was cancelled.");
  }
  const nextStatus: LoadStatus = progress === "delivered" ? "delivered" : "in_transit";
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `UPDATE loads SET driver_progress = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).run(progress, nextStatus, now(), loadId);
    if (nextStatus === "delivered") {
      releaseAssetsIfNeeded({ ...load, status: nextStatus });
    } else {
      markAssetsOnDuty(load.truck_id, load.driver_id);
    }
  })();
}

function sampleFilterSql(): string {
  return showsSampleData() ? "" : " AND is_sample = 0";
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const sample = sampleFilterSql();
  const openLoads = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM loads WHERE status IN (${ACTIVE_LOAD_STATUSES.map(() => "?").join(", ")})${sample}`,
      )
      .get(...ACTIVE_LOAD_STATUSES) as { count: number }
  ).count;
  const inTransit = (
    db
      .prepare(`SELECT COUNT(*) as count FROM loads WHERE status IN (${ROLLING_STATUS_SQL})${sample}`)
      .get(...ROLLING_STATUSES) as { count: number }
  ).count;
  const availableTrucks = (
    db.prepare("SELECT COUNT(*) as count FROM trucks WHERE status = 'available'").get() as { count: number }
  ).count;
  const unassignedLoads = (
    db.prepare(`SELECT COUNT(*) as count FROM loads WHERE status = 'available'${sample}`).get() as { count: number }
  ).count;
  return { openLoads, inTransit, availableTrucks, unassignedLoads };
}

export function listAttentionLoads(): LoadView[] {
  return listLoads({ status: "available" }).slice(0, 6);
}

export function listMovingLoads(): LoadView[] {
  return listLoads({ status: "all" }).filter((load) => isRollingStatus(load.status));
}

export function listAssignableTrailers(loadId?: number): Trailer[] {
  return listTrailers().filter((trailer) => {
    if (trailer.status === "maintenance" || trailer.status === "out_of_service") return false;
    const busy = getDb()
      .prepare(
        `SELECT id FROM loads
         WHERE trailer_id = ? AND status IN (${BUSY_STATUS_SQL}) AND id != ?`,
      )
      .get(trailer.id, ...BUSY_STATUSES, loadId ?? -1);
    return !busy;
  });
}

export function listUpcomingCompliance(): ComplianceAlert[] {
  const windows = complianceWindows();
  return [
    ...listDrivers().flatMap((driver) => driverComplianceAlerts(driver, windows)),
    ...listTrucks().flatMap((truck) => truckComplianceAlerts(truck, windows)),
    ...listTrailers().flatMap((trailer) => trailerComplianceAlerts(trailer, windows)),
  ].sort((a, b) => a.days - b.days);
}

export function cloneLoad(loadId: number): number {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const id = createLoad({
    customer_id: load.customer_id,
    origin: load.origin,
    destination: load.destination,
    pickup_start: load.pickup_start,
    pickup_end: load.pickup_end,
    delivery_start: load.delivery_start,
    delivery_end: load.delivery_end,
    weight: load.weight,
    commodity: load.commodity,
    rate: load.rate,
    notes: load.notes,
    special_instructions: load.special_instructions,
    appointment_notes: load.appointment_notes,
    reference_number: load.reference_number,
    po_number: load.po_number,
    reefer_setpoint_f: load.reefer_setpoint_f,
    trailer_number: load.trailer_number,
    trailer_id: null,
    shipper_location_id: load.shipper_location_id,
    consignee_location_id: load.consignee_location_id,
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  getDb().prepare("UPDATE loads SET cloned_from_id = ? WHERE id = ?").run(loadId, id);
  updateLoadDetails(id, {
    equipment: load.equipment,
    hazmat: Boolean(load.hazmat),
    commodity_class: load.commodity_class,
    team: Boolean(load.team),
    lumper_expected: load.lumper_expected,
    unload_type: load.unload_type,
  });
  return id;
}

export function setLoadWatched(loadId: number, watched: boolean): void {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  getDb().prepare("UPDATE loads SET watched = ?, updated_at = ? WHERE id = ?").run(watched ? 1 : 0, now(), loadId);
}

export function listWatchedLoads(): LoadView[] {
  return listLoads({ status: "all" }).filter((load) => load.watched);
}

export function updateLoadDetails(
  loadId: number,
  details: {
    status_reason?: string;
    cancel_reason?: string;
    cover_by?: string;
    equipment?: string;
    hazmat?: boolean;
    commodity_class?: string;
    seal_numbers?: string;
    pallet_count?: number | null;
    case_count?: number | null;
    team?: boolean;
    lumper_expected?: number | null;
    lumper_actual?: number | null;
    detention_started_at?: string;
    detention_ended_at?: string;
    appointment_confirmation?: string;
    unload_type?: string;
  },
): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  getDb()
    .prepare(
      `UPDATE loads SET
        status_reason = ?, cancel_reason = ?, cover_by = ?, equipment = ?, hazmat = ?,
        commodity_class = ?, seal_numbers = ?, pallet_count = ?, case_count = ?, team = ?,
        lumper_expected = ?, lumper_actual = ?, detention_started_at = ?, detention_ended_at = ?,
        appointment_confirmation = ?, unload_type = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      details.status_reason ?? load.status_reason ?? "",
      details.cancel_reason ?? load.cancel_reason ?? "",
      details.cover_by ?? load.cover_by ?? "",
      details.equipment ?? load.equipment ?? "",
      (details.hazmat ?? Boolean(load.hazmat)) ? 1 : 0,
      details.commodity_class ?? load.commodity_class ?? "",
      details.seal_numbers ?? load.seal_numbers ?? "",
      details.pallet_count ?? load.pallet_count,
      details.case_count ?? load.case_count,
      (details.team ?? Boolean(load.team)) ? 1 : 0,
      details.lumper_expected ?? load.lumper_expected,
      details.lumper_actual ?? load.lumper_actual,
      details.detention_started_at ?? load.detention_started_at ?? "",
      details.detention_ended_at ?? load.detention_ended_at ?? "",
      details.appointment_confirmation ?? load.appointment_confirmation ?? "",
      details.unload_type ?? load.unload_type ?? "",
      now(),
      loadId,
    );
}

export function markInvoicePaid(loadId: number, paid: boolean): void {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  getDb().prepare("UPDATE loads SET invoice_paid = ?, updated_at = ? WHERE id = ?").run(paid ? 1 : 0, now(), loadId);
}
