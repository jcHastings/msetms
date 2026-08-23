import {
  driverComplianceAlerts,
  trailerComplianceAlerts,
  truckComplianceAlerts,
  type ComplianceAlert,
} from "./compliance";
import {
  dueDateFromIssued,
  effectiveCommission,
  invoiceAmountForLoad,
  nextInvoiceNumber,
} from "./accounting";
import { getDb } from "./db";
import { computeOwnerOperatorPay } from "./settlement";
import {
  ACTIVE_LOAD_STATUSES,
  isInvoiceStatus,
  isLoadStatus,
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
  type CommissionRow,
  type DriverPayRow,
  type Invoice,
  type InvoiceStatus,
  type LoadView,
  type LoadSearchCriteria,
  type Location,
  type LocationInput,
  type LocationRole,
  type Payable,
  type SavedSearchReport,
  type Trailer,
  type TrailerType,
  type Truck,
  type TruckStatus,
  type TruckType,
} from "./types";
import {
  criteriaFromReportFilters,
  loadMatchesDateRange,
  loadMatchesStateFilters,
  resolveSearchDates,
  statusesForSearch,
} from "./load-search";

const LOAD_SELECT = `
  SELECT
    loads.*,
    customers.name AS customer_name,
    customers.commission_percent AS customer_commission_percent,
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

const SEARCH_SELECT = `${LOAD_SELECT.replace(
  "SELECT",
  "SELECT shipper_loc.state AS shipper_state, consignee_loc.state AS consignee_state,",
)}
  LEFT JOIN locations shipper_loc ON shipper_loc.id = loads.shipper_location_id
  LEFT JOIN locations consignee_loc ON consignee_loc.id = loads.consignee_location_id
`;

function now(): string {
  return new Date().toISOString();
}

function asLoadView(row: LoadView | undefined): LoadView | null {
  return row ?? null;
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

export function listLocations(filters: { q?: string; role?: LocationRole | "all" } = {}): Location[] {
  const q = filters.q?.trim().toLowerCase() ?? "";
  const role = filters.role && filters.role !== "all" ? filters.role : "";
  const rows = getDb()
    .prepare("SELECT * FROM locations ORDER BY name COLLATE NOCASE")
    .all() as Location[];
  return rows.filter((location) => {
    if (role && location.role !== "both" && location.role !== role) return false;
    if (!q) return true;
    const haystack = [
      location.name,
      location.street,
      location.city,
      location.state,
      location.zip,
      location.phone,
      location.notes,
      location.hours,
      location.scheduling_notes,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function listLocationsForRole(role: "shipper" | "receiver"): Location[] {
  return listLocations({ role });
}

export function getLocation(id: number): Location | null {
  return (getDb().prepare("SELECT * FROM locations WHERE id = ?").get(id) as Location | undefined) ?? null;
}

export function createLocation(input: LocationInput): number {
  validateLocationInput(input);
  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO locations (
        name, street, city, state, zip, phone, notes, role, scheduling_type,
        hours, scheduling_notes, scheduling_email, scheduling_portal, created_at, updated_at
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
      input.scheduling_email,
      input.scheduling_portal,
      timestamp,
      timestamp,
    );
  return Number(result.lastInsertRowid);
}

export function updateLocation(id: number, input: LocationInput): void {
  if (!getLocation(id)) throw new Error("Location not found.");
  validateLocationInput(input);
  getDb()
    .prepare(
      `UPDATE locations
       SET name = ?, street = ?, city = ?, state = ?, zip = ?, phone = ?, notes = ?,
           role = ?, scheduling_type = ?, hours = ?, scheduling_notes = ?,
           scheduling_email = ?, scheduling_portal = ?, updated_at = ?
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
      input.scheduling_email,
      input.scheduling_portal,
      now(),
      id,
    );
}

function validateLocationInput(input: LocationInput): void {
  if (!input.name.trim()) throw new Error("Location name is required.");
  if (!input.city.trim() && !input.street.trim()) {
    throw new Error("Add a city or street for this location.");
  }
}

export function createCustomer(input: {
  name: string;
  billing_notes: string;
  commission_percent?: number | null;
  contacts: Array<{ name: string; role: string; phone: string; email: string }>;
}): number {
  const db = getDb();
  const timestamp = now();
  const result = db
    .prepare(
      `INSERT INTO customers (name, billing_notes, commission_percent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.billing_notes, input.commission_percent ?? null, timestamp, timestamp);
  const id = Number(result.lastInsertRowid);
  replaceContacts(id, input.contacts);
  return id;
}

export function updateCustomer(
  id: number,
  input: {
    name: string;
    billing_notes: string;
    commission_percent?: number | null;
    contacts: Array<{ name: string; role: string; phone: string; email: string }>;
  },
): void {
  const existing = getCustomer(id);
  if (!existing) throw new Error("Customer not found.");
  getDb()
    .prepare(
      "UPDATE customers SET name = ?, billing_notes = ?, commission_percent = ?, updated_at = ? WHERE id = ?",
    )
    .run(input.name, input.billing_notes, input.commission_percent ?? null, now(), id);
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
}): number {
  const timestamp = now();
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO trucks (unit_number, type, capacity_lbs, status, samsara_vehicle_id, samsara_trailer_id, orbcomm_asset_id, trailer_number,
            registration_issued, registration_expires, dot_inspected_on, dot_expires, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  },
): void {
  if (!getTruck(id)) throw new Error("Truck not found.");
  try {
    getDb()
      .prepare(
        `UPDATE trucks
         SET unit_number = ?, type = ?, capacity_lbs = ?, status = ?,
             samsara_vehicle_id = ?, samsara_trailer_id = ?, orbcomm_asset_id = ?, trailer_number = ?,
             registration_issued = ?, registration_expires = ?, dot_inspected_on = ?, dot_expires = ?, updated_at = ?
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
         AND loads.status IN ('assigned', 'in_transit', 'delivered')
       ORDER BY CASE loads.status
         WHEN 'in_transit' THEN 0
         WHEN 'assigned' THEN 1
         ELSE 2
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
  } else if (filters.status !== "all" && isLoadStatus(filters.status)) {
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

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `${LOAD_SELECT} ${where}
       ORDER BY CASE loads.status
         WHEN 'in_transit' THEN 0
         WHEN 'assigned' THEN 1
         WHEN 'available' THEN 2
         WHEN 'delivered' THEN 3
         ELSE 4
       END, loads.pickup_start ASC`,
    )
    .all(...params) as LoadView[];
}

export type SearchLoadRow = LoadView & {
  shipper_state: string | null;
  consignee_state: string | null;
};

export function searchLoads(criteria: LoadSearchCriteria): SearchLoadRow[] {
  const statuses = statusesForSearch(criteria);
  if (statuses.length === 0) return [];
  const dates = resolveSearchDates(criteria);
  const clauses: string[] = [`loads.status IN (${statuses.map(() => "?").join(", ")})`];
  const params: Array<string | number> = [...statuses];

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
  if (criteria.q.trim()) {
    const term = `%${criteria.q.trim()}%`;
    clauses.push(
      `(loads.load_number LIKE ? OR customers.name LIKE ? OR loads.origin LIKE ? OR loads.destination LIKE ?
        OR loads.commodity LIKE ? OR loads.notes LIKE ? OR loads.special_instructions LIKE ?
        OR loads.appointment_notes LIKE ? OR loads.reference_number LIKE ? OR loads.po_number LIKE ?)`,
    );
    params.push(term, term, term, term, term, term, term, term, term, term);
  }

  const rows = getDb()
    .prepare(
      `${SEARCH_SELECT}
       WHERE ${clauses.join(" AND ")}
       ORDER BY loads.pickup_start DESC, loads.id DESC`,
    )
    .all(...params) as SearchLoadRow[];

  return rows
    .map((row) => ({
      ...row,
      shipper_state: row.shipper_state ?? null,
      consignee_state: row.consignee_state ?? null,
    }))
    .filter((row) => loadMatchesStateFilters(row, criteria))
    .filter((row) => loadMatchesDateRange(row, dates.from, dates.to));
}

export function listSavedSearchReports(): SavedSearchReport[] {
  return (getDb().prepare("SELECT * FROM saved_search_reports ORDER BY name COLLATE NOCASE").all() as Array<{
    id: number;
    name: string;
    filters_json: string;
    created_at: string;
    updated_at: string;
  }>).map(asSavedSearchReport);
}

export function getSavedSearchReport(id: number): SavedSearchReport | null {
  const row = getDb().prepare("SELECT * FROM saved_search_reports WHERE id = ?").get(id) as
    | { id: number; name: string; filters_json: string; created_at: string; updated_at: string }
    | undefined;
  return row ? asSavedSearchReport(row) : null;
}

export function createSavedSearchReport(input: { name: string; filters: LoadSearchCriteria }): number {
  const name = input.name.trim();
  if (!name) throw new Error("Report name is required.");
  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO saved_search_reports (name, filters_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(name, JSON.stringify(input.filters), timestamp, timestamp);
  return Number(result.lastInsertRowid);
}

export function deleteSavedSearchReport(id: number): void {
  getDb().prepare("DELETE FROM saved_search_reports WHERE id = ?").run(id);
}

function asSavedSearchReport(row: {
  id: number;
  name: string;
  filters_json: string;
  created_at: string;
  updated_at: string;
}): SavedSearchReport {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.filters_json);
  } catch {
    parsed = {};
  }
  return {
    id: row.id,
    name: row.name,
    filters: { ...criteriaFromReportFilters(parsed), reportId: row.id },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getLoad(id: number): LoadView | null {
  return asLoadView(getDb().prepare(`${LOAD_SELECT} WHERE loads.id = ?`).get(id) as LoadView | undefined);
}

export function nextLoadNumber(): string {
  const row = getDb()
    .prepare(`SELECT load_number FROM loads ORDER BY id DESC LIMIT 1`)
    .get() as { load_number: string } | undefined;
  if (!row) return "MSE-1001";
  const match = row.load_number.match(/(\d+)$/);
  const next = match ? Number.parseInt(match[1], 10) + 1 : 1001;
  return `MSE-${next}`;
}

export type LoadInput = {
  customer_id: number;
  origin: string;
  destination: string;
  shipper_location_id?: number | null;
  consignee_location_id?: number | null;
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
  oo_percent?: number | null;
  oo_pay?: number | null;
  commission_percent?: number | null;
  status: LoadStatus;
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
  if ((input.status === "assigned" || input.status === "in_transit") && (!input.truck_id || !input.driver_id)) {
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
          load_number, customer_id, origin, destination, shipper_location_id, consignee_location_id,
          pickup_start, pickup_end, delivery_start, delivery_end,
          weight, commodity, rate, notes, special_instructions, appointment_notes,
          reference_number, po_number, reefer_setpoint_f, trailer_number, trailer_id,
          oo_percent, oo_pay, commission_percent, status, truck_id, driver_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        loadNumber,
        input.customer_id,
        input.origin,
        input.destination,
        input.shipper_location_id ?? null,
        input.consignee_location_id ?? null,
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
        input.oo_percent ?? null,
        input.oo_pay ?? null,
        input.commission_percent ?? null,
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
        customer_id = ?, origin = ?, destination = ?, shipper_location_id = ?, consignee_location_id = ?,
        pickup_start = ?, pickup_end = ?, delivery_start = ?, delivery_end = ?,
        weight = ?, commodity = ?, rate = ?, notes = ?,
        special_instructions = ?, appointment_notes = ?,
        reference_number = ?, po_number = ?, reefer_setpoint_f = ?, trailer_number = ?, trailer_id = ?,
        oo_percent = ?, oo_pay = ?, commission_percent = ?, status = ?, truck_id = ?, driver_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.customer_id,
      input.origin,
      input.destination,
      input.shipper_location_id ?? null,
      input.consignee_location_id ?? null,
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
      input.oo_percent ?? null,
      input.oo_pay ?? null,
      input.commission_percent ?? null,
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
  if (load.status === "delivered" || load.status === "cancelled") {
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
      ? settlement?.oo_percent ?? driver.pay_percent ?? 75
      : null;
  const ooPay = computeOwnerOperatorPay(load.rate, ooPercent);

  const db = getDb();
  db.transaction(() => {
    releaseAssetsIfNeeded(load);
    const nextStatus = load.status === "in_transit" ? "in_transit" : "assigned";
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
      nextStatus === "in_transit" ? load.driver_progress : "",
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
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const db = getDb();
  const timestamp = input.sentAt;
  db.transaction(() => {
    db.prepare(
      `UPDATE loads
       SET qbo_invoice_id = ?, qbo_invoice_number = ?, qbo_sent_at = ?, qbo_source = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.invoiceId, input.invoiceNumber, timestamp, input.source, timestamp, loadId);

    const existing = getInvoiceByLoad(loadId);
    if (existing) {
      db.prepare(
        `UPDATE invoices
         SET status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'sent' END,
             source = ?, qbo_invoice_id = ?, qbo_invoice_number = ?,
             due_at = CASE WHEN due_at = '' THEN ? ELSE due_at END,
             updated_at = ?
         WHERE id = ?`,
      ).run(
        input.source,
        input.invoiceId,
        input.invoiceNumber,
        dueDateFromIssued(existing.issued_at),
        timestamp,
        existing.id,
      );
      return;
    }

    db.prepare(
      `INSERT INTO invoices (
        load_id, customer_id, number, amount, status, source, issued_at, due_at, paid_at,
        qbo_invoice_id, qbo_invoice_number, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, '', ?, ?, ?, ?, ?)`,
    ).run(
      loadId,
      load.customer_id,
      input.invoiceNumber || nextInvoiceNumber(listInvoiceNumbers()),
      invoiceAmountForLoad(load),
      input.source,
      timestamp,
      dueDateFromIssued(timestamp),
      input.invoiceId,
      input.invoiceNumber,
      `Sent via ${input.source === "demo" ? "demo QuickBooks" : "QuickBooks"}.`,
      timestamp,
      timestamp,
    );
  })();
}

export function updateLoadStatus(loadId: number, status: LoadStatus): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if ((status === "assigned" || status === "in_transit") && (!load.truck_id || !load.driver_id)) {
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
    } else if (status === "assigned" || status === "in_transit") {
      markAssetsOnDuty(load.truck_id, load.driver_id);
    } else {
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
         AND status IN ('assigned', 'in_transit')
         AND (truck_id = ? OR driver_id = ? OR (? IS NOT NULL AND trailer_id = ?))
       LIMIT 1`,
    )
    .get(exceptLoadId, truckId, driverId, trailerId ?? null, trailerId ?? null) as
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
         WHERE id != ? AND truck_id = ? AND status IN ('assigned', 'in_transit')`,
      )
      .get(load.id, load.truck_id);
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
         WHERE id != ? AND driver_id = ? AND status IN ('assigned', 'in_transit')`,
      )
      .get(load.id, load.driver_id);
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
  status: LoadStatus,
  truckId: number | null,
  driverId: number | null,
): void {
  if (status === "assigned" || status === "in_transit") {
    if (!truckId || !driverId) {
      throw new Error("Assign a truck and driver before setting this status.");
    }
    assertAssetFree(truckId, driverId, loadId);
    markAssetsOnDuty(truckId, driverId);
  } else {
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
         WHERE truck_id = ? AND status IN ('assigned', 'in_transit') AND id != ?`,
      )
      .get(truck.id, loadId ?? -1);
    return !busy;
  });
}

export function listAssignableDrivers(loadId?: number): DriverWithTruck[] {
  return listDrivers().filter((driver) => {
    if (driver.status === "off_duty") return false;
    const busy = getDb()
      .prepare(
        `SELECT id FROM loads
         WHERE driver_id = ? AND status IN ('assigned', 'in_transit') AND id != ?`,
      )
      .get(driver.id, loadId ?? -1);
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

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const openLoads = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM loads WHERE status IN (${ACTIVE_LOAD_STATUSES.map(() => "?").join(", ")})`,
      )
      .get(...ACTIVE_LOAD_STATUSES) as { count: number }
  ).count;
  const inTransit = (
    db.prepare("SELECT COUNT(*) as count FROM loads WHERE status = 'in_transit'").get() as { count: number }
  ).count;
  const availableTrucks = (
    db.prepare("SELECT COUNT(*) as count FROM trucks WHERE status = 'available'").get() as { count: number }
  ).count;
  const unassignedLoads = (
    db.prepare("SELECT COUNT(*) as count FROM loads WHERE status = 'available'").get() as { count: number }
  ).count;
  return { openLoads, inTransit, availableTrucks, unassignedLoads };
}

export function listAttentionLoads(): LoadView[] {
  return listLoads({ status: "available" }).slice(0, 6);
}

export function listMovingLoads(): LoadView[] {
  return listLoads({ status: "in_transit" });
}

export function listAssignableTrailers(loadId?: number): Trailer[] {
  return listTrailers().filter((trailer) => {
    if (trailer.status === "maintenance" || trailer.status === "out_of_service") return false;
    const busy = getDb()
      .prepare(
        `SELECT id FROM loads
         WHERE trailer_id = ? AND status IN ('assigned', 'in_transit') AND id != ?`,
      )
      .get(trailer.id, loadId ?? -1);
    return !busy;
  });
}

export function listUpcomingCompliance(): ComplianceAlert[] {
  return [
    ...listDrivers().flatMap((driver) => driverComplianceAlerts(driver)),
    ...listTrucks().flatMap((truck) => truckComplianceAlerts(truck)),
    ...listTrailers().flatMap((trailer) => trailerComplianceAlerts(trailer)),
  ].sort((a, b) => a.days - b.days);
}

const INVOICE_SELECT = `
  SELECT invoices.*, customers.name AS customer_name, loads.load_number AS load_number
  FROM invoices
  JOIN customers ON customers.id = invoices.customer_id
  JOIN loads ON loads.id = invoices.load_id
`;

function asInvoice(row: Invoice | undefined): Invoice | null {
  return row ?? null;
}

export function listInvoiceNumbers(): string[] {
  return (getDb().prepare("SELECT number FROM invoices").all() as Array<{ number: string }>).map(
    (row) => row.number,
  );
}

export function listInvoices(): Invoice[] {
  return getDb()
    .prepare(`${INVOICE_SELECT} ORDER BY invoices.issued_at DESC, invoices.id DESC`)
    .all() as Invoice[];
}

export function listUnpaidInvoices(): Invoice[] {
  return getDb()
    .prepare(
      `${INVOICE_SELECT} WHERE invoices.status != 'paid' ORDER BY invoices.issued_at ASC, invoices.id ASC`,
    )
    .all() as Invoice[];
}

export function getInvoice(id: number): Invoice | null {
  return asInvoice(
    getDb().prepare(`${INVOICE_SELECT} WHERE invoices.id = ?`).get(id) as Invoice | undefined,
  );
}

export function getInvoiceByLoad(loadId: number): Invoice | null {
  return asInvoice(
    getDb().prepare(`${INVOICE_SELECT} WHERE invoices.load_id = ?`).get(loadId) as Invoice | undefined,
  );
}

export function listDeliveredLoadsWithoutInvoice(): LoadView[] {
  return getDb()
    .prepare(
      `${LOAD_SELECT}
       WHERE loads.status = 'delivered'
         AND loads.rate IS NOT NULL
         AND loads.rate > 0
         AND NOT EXISTS (SELECT 1 FROM invoices WHERE invoices.load_id = loads.id)
       ORDER BY loads.delivery_end DESC, loads.id DESC`,
    )
    .all() as LoadView[];
}

export function createInvoiceFromLoad(loadId: number): number {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.status !== "delivered") {
    throw new Error("Mark the load Delivered before creating an invoice.");
  }
  if (getInvoiceByLoad(loadId)) {
    throw new Error("This load already has an invoice.");
  }
  const amount = invoiceAmountForLoad(load);
  const timestamp = now();
  const number = nextInvoiceNumber(listInvoiceNumbers());
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO invoices (
          load_id, customer_id, number, amount, status, source, issued_at, due_at, paid_at,
          qbo_invoice_id, qbo_invoice_number, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'draft', 'local', ?, ?, '', '', '', ?, ?, ?)`,
      )
      .run(
        loadId,
        load.customer_id,
        number,
        amount,
        timestamp,
        dueDateFromIssued(timestamp),
        `Customer rate for ${load.load_number}.`,
        timestamp,
        timestamp,
      );
    return Number(result.lastInsertRowid);
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new Error("This load already has an invoice.");
    }
    throw error;
  }
}

export function updateInvoiceStatus(id: number, status: InvoiceStatus): void {
  if (!isInvoiceStatus(status)) throw new Error("Invalid invoice status.");
  const invoice = getInvoice(id);
  if (!invoice) throw new Error("Invoice not found.");
  const timestamp = now();
  const paidAt = status === "paid" ? invoice.paid_at || timestamp : "";
  getDb()
    .prepare("UPDATE invoices SET status = ?, paid_at = ?, updated_at = ? WHERE id = ?")
    .run(status, paidAt, timestamp, id);
}

export function listPayables(): Payable[] {
  const rows = getDb()
    .prepare(
      `SELECT
         loads.id AS load_id,
         loads.load_number,
         loads.driver_id,
         drivers.name AS driver_name,
         customers.name AS customer_name,
         loads.oo_pay AS amount,
         loads.driver_pay_paid AS paid,
         loads.delivery_end AS delivered_at
       FROM loads
       JOIN customers ON customers.id = loads.customer_id
       LEFT JOIN drivers ON drivers.id = loads.driver_id
       WHERE loads.oo_pay IS NOT NULL
         AND loads.oo_pay > 0
         AND loads.status != 'cancelled'
       ORDER BY loads.delivery_end DESC, loads.id DESC`,
    )
    .all() as Array<Omit<Payable, "paid"> & { paid: number }>;
  return rows.map((row) => ({ ...row, paid: Boolean(row.paid) }));
}

export function listDriverPay(): DriverPayRow[] {
  const rows = getDb()
    .prepare(
      `${LOAD_SELECT}
       WHERE loads.status = 'delivered'
         AND loads.driver_id IS NOT NULL
       ORDER BY loads.delivery_end DESC, loads.id DESC`,
    )
    .all() as LoadView[];
  return rows.map((load) => ({
    load_id: load.id,
    load_number: load.load_number,
    driver_id: load.driver_id,
    driver_name: load.driver_name,
    driver_type: load.driver_type,
    customer_name: load.customer_name,
    rate: load.rate,
    oo_percent: load.oo_percent,
    oo_pay: load.oo_pay,
    paid: Boolean(load.driver_pay_paid),
    status: load.status,
  }));
}

export function listCommissions(): CommissionRow[] {
  const loads = getDb()
    .prepare(
      `${LOAD_SELECT}
       WHERE loads.status = 'delivered'
         AND loads.rate IS NOT NULL
       ORDER BY loads.delivery_end DESC, loads.id DESC`,
    )
    .all() as LoadView[];
  const rows: CommissionRow[] = [];
  for (const load of loads) {
    const commission = effectiveCommission(load);
    if (!commission) continue;
    rows.push({
      load_id: load.id,
      load_number: load.load_number,
      customer_name: load.customer_name,
      rate: load.rate,
      percent: commission.percent,
      source: commission.source,
      amount: commission.amount,
      paid: Boolean(load.commission_paid),
    });
  }
  return rows;
}

export function setDriverPayPaid(loadId: number, paid: boolean): void {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  getDb()
    .prepare("UPDATE loads SET driver_pay_paid = ?, updated_at = ? WHERE id = ?")
    .run(paid ? 1 : 0, now(), loadId);
}

export function setCommissionPaid(loadId: number, paid: boolean): void {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  getDb()
    .prepare("UPDATE loads SET commission_paid = ?, updated_at = ? WHERE id = ?")
    .run(paid ? 1 : 0, now(), loadId);
}
