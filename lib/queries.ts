import { getDb } from "./db";
import {
  ACTIVE_LOAD_STATUSES,
  isLoadStatus,
  type Contact,
  type Customer,
  type CustomerWithContacts,
  type DashboardStats,
  type Driver,
  type DriverStatus,
  type DriverWithTruck,
  type Load,
  type LoadStatus,
  type LoadView,
  type Truck,
  type TruckStatus,
  type TruckType,
} from "./types";

const LOAD_SELECT = `
  SELECT
    loads.*,
    customers.name AS customer_name,
    trucks.unit_number AS truck_unit,
    trucks.type AS truck_type,
    drivers.name AS driver_name
  FROM loads
  JOIN customers ON customers.id = loads.customer_id
  LEFT JOIN trucks ON trucks.id = loads.truck_id
  LEFT JOIN drivers ON drivers.id = loads.driver_id
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

export function createCustomer(input: {
  name: string;
  billing_notes: string;
  contacts: Array<{ name: string; role: string; phone: string; email: string }>;
}): number {
  const db = getDb();
  const timestamp = now();
  const result = db
    .prepare(
      `INSERT INTO customers (name, billing_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.name, input.billing_notes, timestamp, timestamp);
  const id = Number(result.lastInsertRowid);
  replaceContacts(id, input.contacts);
  return id;
}

export function updateCustomer(
  id: number,
  input: {
    name: string;
    billing_notes: string;
    contacts: Array<{ name: string; role: string; phone: string; email: string }>;
  },
): void {
  const existing = getCustomer(id);
  if (!existing) throw new Error("Customer not found.");
  getDb()
    .prepare("UPDATE customers SET name = ?, billing_notes = ?, updated_at = ? WHERE id = ?")
    .run(input.name, input.billing_notes, now(), id);
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

export function createTruck(input: {
  unit_number: string;
  type: TruckType;
  capacity_lbs: number;
  status: TruckStatus;
}): number {
  const timestamp = now();
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO trucks (unit_number, type, capacity_lbs, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.unit_number, input.type, input.capacity_lbs, input.status, timestamp, timestamp);
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
  },
): void {
  if (!getTruck(id)) throw new Error("Truck not found.");
  try {
    getDb()
      .prepare(
        `UPDATE trucks
         SET unit_number = ?, type = ?, capacity_lbs = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(input.unit_number, input.type, input.capacity_lbs, input.status, now(), id);
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
  truck_id: number | null;
  status: DriverStatus;
}): number {
  if (input.truck_id && !getTruck(input.truck_id)) {
    throw new Error("Assigned truck not found.");
  }
  const timestamp = now();
  const result = getDb()
    .prepare(
      `INSERT INTO drivers (name, phone, license, truck_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.phone, input.license, input.truck_id, input.status, timestamp, timestamp);
  return Number(result.lastInsertRowid);
}

export function updateDriver(
  id: number,
  input: {
    name: string;
    phone: string;
    license: string;
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
       SET name = ?, phone = ?, license = ?, truck_id = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(input.name, input.phone, input.license, input.truck_id, input.status, now(), id);
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
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  weight: number | null;
  commodity: string;
  rate: number | null;
  notes: string;
  status: LoadStatus;
  truck_id: number | null;
  driver_id: number | null;
};

function validateLoadInput(input: LoadInput): void {
  if (!getCustomer(input.customer_id)) {
    throw new Error("Pick a customer.");
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
          load_number, customer_id, origin, destination,
          pickup_start, pickup_end, delivery_start, delivery_end,
          weight, commodity, rate, notes, status, truck_id, driver_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        weight = ?, commodity = ?, rate = ?, notes = ?, status = ?,
        truck_id = ?, driver_id = ?, updated_at = ?
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
      input.status,
      input.truck_id,
      input.driver_id,
      now(),
      id,
    );
    syncAssignment(id, input.status, input.truck_id, input.driver_id);
  })();
}

export function assignLoad(loadId: number, truckId: number, driverId: number): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.status === "delivered" || load.status === "cancelled") {
    throw new Error("Cannot assign a closed load.");
  }
  const truck = getTruck(truckId);
  const driver = getDriver(driverId);
  if (!truck) throw new Error("Truck not found.");
  if (!driver) throw new Error("Driver not found.");
  if (truck.status === "maintenance" || truck.status === "out_of_service") {
    throw new Error(`Truck ${truck.unit_number} is ${truck.status.replaceAll("_", " ")}.`);
  }
  if (driver.status === "off_duty") {
    throw new Error(`${driver.name} is off duty.`);
  }
  assertAssetFree(truckId, driverId, loadId);

  const db = getDb();
  db.transaction(() => {
    releaseAssetsIfNeeded(load);
    db.prepare(
      `UPDATE loads SET truck_id = ?, driver_id = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).run(truckId, driverId, "assigned", now(), loadId);
    markAssetsOnDuty(truckId, driverId);
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

function assertAssetFree(truckId: number, driverId: number, exceptLoadId: number): void {
  const conflict = getDb()
    .prepare(
      `SELECT load_number FROM loads
       WHERE id != ?
         AND status IN ('assigned', 'in_transit')
         AND (truck_id = ? OR driver_id = ?)
       LIMIT 1`,
    )
    .get(exceptLoadId, truckId, driverId) as { load_number: string } | undefined;
  if (conflict) {
    throw new Error(`That truck or driver is already on ${conflict.load_number}.`);
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
