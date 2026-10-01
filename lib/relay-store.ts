import { driverName, recordLoadAudit, trailerUnit, truckUnit } from "./audit";
import { getDb } from "./db";
import { applyLoadCustody } from "./trailer-custody";
import {
  assertRelayCompletionTime,
  currentAssignmentFromRelays,
  extraRelayCount,
  formatRelayLane,
  type LoadRelayView,
  type RelayAssignment,
  type RelayAssignmentPatch,
  type RelayInput,
} from "./relays";
import { computeOwnerOperatorPay } from "./settlement";

const RELAY_SELECT = `SELECT load_relays.*,
  from_drivers.name AS from_driver_name,
  from_drivers.driver_type AS from_driver_type,
  from_drivers.company_name AS from_driver_company_name,
  from_trucks.unit_number AS from_truck_unit,
  from_trailers.unit_number AS from_trailer_unit,
  drivers.name AS driver_name,
  drivers.driver_type AS driver_type,
  drivers.company_name AS driver_company_name,
  trucks.unit_number AS truck_unit,
  trailers.unit_number AS trailer_unit
  FROM load_relays
  LEFT JOIN drivers AS from_drivers ON from_drivers.id = load_relays.from_driver_id
  LEFT JOIN trucks AS from_trucks ON from_trucks.id = load_relays.from_truck_id
  LEFT JOIN trailers AS from_trailers ON from_trailers.id = load_relays.from_trailer_id
  LEFT JOIN drivers ON drivers.id = load_relays.driver_id
  LEFT JOIN trucks ON trucks.id = load_relays.truck_id
  LEFT JOIN trailers ON trailers.id = load_relays.trailer_id`;

function nowIso(): string {
  return new Date().toISOString();
}

function requiredPlace(value: string | undefined, label: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function optionalId(value: number | null | undefined): number | null {
  return value ?? null;
}

function loadOriginDest(loadId: number): {
  origin: string;
  destination: string;
  driver_id: number | null;
  truck_id: number | null;
  trailer_id: number | null;
  rate: number | null;
  load_number: string;
  status: string;
} {
  const row = getDb()
    .prepare(
      "SELECT origin, destination, driver_id, truck_id, trailer_id, rate, load_number, status FROM loads WHERE id = ?",
    )
    .get(loadId) as
    | {
        origin: string;
        destination: string;
        driver_id: number | null;
        truck_id: number | null;
        trailer_id: number | null;
        rate: number | null;
        load_number: string;
        status: string;
      }
    | undefined;
  if (!row) throw new Error("Load not found.");
  return row;
}

function completedAtValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function sameAssignment(left: RelayAssignment, right: RelayAssignment): boolean {
  return left.driver_id === right.driver_id && left.truck_id === right.truck_id && left.trailer_id === right.trailer_id;
}

function snapshotFirstLegIfMissing(loadId: number): void {
  const load = loadOriginDest(loadId);
  const first = listRelays(loadId)[0];
  if (!first) return;
  if (first.driver_id && load.driver_id === first.driver_id) return;
  const fromDriverId = first.from_driver_id ?? load.driver_id;
  const fromTruckId = first.from_truck_id ?? load.truck_id;
  const fromTrailerId = first.from_trailer_id ?? load.trailer_id;
  if (
    fromDriverId === first.from_driver_id &&
    fromTruckId === first.from_truck_id &&
    fromTrailerId === first.from_trailer_id
  ) {
    return;
  }
  getDb()
    .prepare(
      "UPDATE load_relays SET from_driver_id = ?, from_truck_id = ?, from_trailer_id = ?, updated_at = ? WHERE id = ?",
    )
    .run(fromDriverId, fromTruckId, fromTrailerId, nowIso(), first.id);
}

export function applyCurrentLoadAssignment(
  loadId: number,
  emptyFallback?: RelayAssignment,
): void {
  snapshotFirstLegIfMissing(loadId);
  const load = loadOriginDest(loadId);
  const relays = listRelays(loadId);
  const next = relays.length
    ? currentAssignmentFromRelays(load, relays)
    : emptyFallback ?? { driver_id: load.driver_id, truck_id: load.truck_id, trailer_id: load.trailer_id };
  if (sameAssignment(load, next)) return;
  const timestamp = nowIso();
  getDb()
    .prepare("UPDATE loads SET driver_id = ?, truck_id = ?, trailer_id = ?, updated_at = ? WHERE id = ?")
    .run(next.driver_id, next.truck_id, next.trailer_id, timestamp, loadId);
  applyLoadCustody({
    loadId,
    loadNumber: load.load_number,
    previous: {
      trailerId: load.trailer_id,
      driverId: load.driver_id,
      truckId: load.truck_id,
      status: load.status,
    },
    next: {
      trailerId: next.trailer_id,
      driverId: next.driver_id,
      truckId: next.truck_id,
      status: load.status,
    },
  });
  recordLoadAudit({
    loadId,
    action: "assign",
    field: "current",
    oldValue: describeAssignment(load),
    newValue: describeAssignment(next),
  });
}

export function listRelays(loadId: number): LoadRelayView[] {
  return getDb()
    .prepare(`${RELAY_SELECT} WHERE load_relays.load_id = ? ORDER BY load_relays.sequence, load_relays.id`)
    .all(loadId) as LoadRelayView[];
}

export function getRelay(id: number): LoadRelayView | null {
  return (
    (getDb().prepare(`${RELAY_SELECT} WHERE load_relays.id = ?`).get(id) as LoadRelayView | undefined) ?? null
  );
}

export function relayForDriver(loadId: number, driverId: number): LoadRelayView | null {
  return (
    (getDb()
      .prepare(
        `${RELAY_SELECT} WHERE load_relays.load_id = ? AND (load_relays.driver_id = ? OR load_relays.from_driver_id = ?)
         ORDER BY load_relays.sequence LIMIT 1`,
      )
      .get(loadId, driverId, driverId) as LoadRelayView | undefined) ?? null
  );
}

export function driverAssignedToLoad(loadId: number, driverId: number, primaryDriverId?: number | null): boolean {
  if (primaryDriverId === driverId) return true;
  if (primaryDriverId === undefined) {
    const load = getDb().prepare("SELECT driver_id FROM loads WHERE id = ?").get(loadId) as
      | { driver_id: number | null }
      | undefined;
    if (load?.driver_id === driverId) return true;
  }
  const row = getDb()
    .prepare(
      "SELECT id FROM load_relays WHERE load_id = ? AND (driver_id = ? OR from_driver_id = ?)",
    )
    .get(loadId, driverId, driverId) as { id: number } | undefined;
  return Boolean(row);
}

export function extraRelayLabelsByLoad(
  loads: Array<{ id: number; driver_id: number | null }>,
): Map<number, string> {
  const map = new Map<number, string>();
  if (loads.length === 0) return map;
  const ids = loads.map((load) => load.id);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT load_id, driver_id, from_driver_id FROM load_relays
       WHERE load_id IN (${placeholders}) AND (driver_id IS NOT NULL OR from_driver_id IS NOT NULL)`,
    )
    .all(...ids) as Array<{ load_id: number; driver_id: number | null; from_driver_id: number | null }>;
  const byLoad = new Map<number, Array<{ driver_id: number | null; from_driver_id: number | null }>>();
  for (const row of rows) {
    const list = byLoad.get(row.load_id) ?? [];
    list.push({ driver_id: row.driver_id, from_driver_id: row.from_driver_id });
    byLoad.set(row.load_id, list);
  }
  for (const load of loads) {
    const count = extraRelayCount(load.driver_id, byLoad.get(load.id) ?? []);
    if (count > 0) map.set(load.id, count === 1 ? "+1 relay" : `+${count} relays`);
  }
  return map;
}

function settleRelayPay(loadRate: number | null, input: RelayInput): { percent: number | null; pay: number | null } {
  const percent = input.oo_percent ?? null;
  const pay = input.oo_pay ?? computeOwnerOperatorPay(loadRate, percent);
  return { percent, pay };
}

function describeAssignment(assignment: RelayAssignment): string {
  return [
    assignment.driver_id ? driverName(assignment.driver_id) : "Unassigned",
    assignment.truck_id ? truckUnit(assignment.truck_id) : "",
    assignment.trailer_id ? trailerUnit(assignment.trailer_id) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function describeRelay(relay: {
  pickup: string;
  delivery: string;
  from_driver_id?: number | null;
  driver_id: number | null;
  truck_id: number | null;
  trailer_id: number | null;
  oo_percent: number | null;
  oo_pay: number | null;
  completed_at?: string | null;
}): string {
  const bits = [
    `${relay.from_driver_id ? driverName(relay.from_driver_id) : "Unassigned"} → ${
      relay.driver_id ? driverName(relay.driver_id) : "Unassigned"
    } at ${relay.delivery || relay.pickup}`,
  ];
  if (relay.truck_id) bits.push(truckUnit(relay.truck_id));
  if (relay.trailer_id) bits.push(trailerUnit(relay.trailer_id));
  if (relay.completed_at) bits.push(`completed ${relay.completed_at}`);
  if (relay.oo_pay != null) bits.push(`internal $${relay.oo_pay}`);
  else if (relay.oo_percent != null) bits.push(`internal ${relay.oo_percent}%`);
  return bits.filter(Boolean).join(" · ");
}

function resolveRelayDrivers(input: RelayInput, loadId: number): { fromDriverId: number | null; driverId: number | null } {
  const fromDriverId = optionalId(input.from_driver_id);
  const driverId = optionalId(input.driver_id);
  if (fromDriverId && driverId && fromDriverId === driverId) {
    throw new Error("Pick two different drivers for the handoff.");
  }
  return { fromDriverId, driverId };
}

function resolveRelayPlaces(loadId: number, input: RelayInput, existingPickup?: string): { pickup: string; delivery: string } {
  const load = loadOriginDest(loadId);
  const delivery = requiredPlace(input.delivery, "Relay point");
  const previous = listRelays(loadId);
  const pickup =
    (input.pickup ?? "").trim() ||
    existingPickup?.trim() ||
    previous[previous.length - 1]?.delivery ||
    load.origin;
  return { pickup, delivery };
}

export function addRelay(loadId: number, input: RelayInput): number {
  const load = loadOriginDest(loadId);
  const { pickup, delivery } = resolveRelayPlaces(loadId, input);
  const { fromDriverId, driverId } = resolveRelayDrivers(input, loadId);
  const fromTruckId = optionalId(input.from_truck_id) ?? load.truck_id;
  const fromTrailerId = optionalId(input.from_trailer_id) ?? load.trailer_id;
  const completedAt = completedAtValue(input.completed_at);
  const truckId = optionalId(input.truck_id);
  const trailerId = optionalId(input.trailer_id);
  assertRelayCompletionTime({ driver_id: driverId, truck_id: truckId, trailer_id: trailerId, completed_at: completedAt });
  const settled = settleRelayPay(load.rate, input);
  const nextSeq =
    (
      getDb().prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM load_relays WHERE load_id = ?").get(loadId) as {
        next: number;
      }
    ).next ?? 1;
  const timestamp = nowIso();
  const result = getDb()
    .prepare(
      `INSERT INTO load_relays (
        load_id, sequence, pickup, delivery, from_driver_id, from_truck_id, from_trailer_id,
        driver_id, truck_id, trailer_id, completed_at, oo_percent, oo_pay, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      loadId,
      nextSeq,
      pickup,
      delivery,
      fromDriverId ?? load.driver_id,
      fromTruckId,
      fromTrailerId,
      driverId,
      truckId,
      trailerId,
      completedAt,
      settled.percent,
      settled.pay,
      (input.notes ?? "").trim(),
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  if (!load.driver_id && fromDriverId) {
    getDb().prepare("UPDATE loads SET driver_id = ?, updated_at = ? WHERE id = ? AND driver_id IS NULL").run(
      fromDriverId,
      timestamp,
      loadId,
    );
  }
  recordLoadAudit({
    loadId,
    action: "relay",
    field: "leg",
    oldValue: "",
    newValue: describeRelay({
      pickup,
      delivery,
      from_driver_id: fromDriverId ?? load.driver_id,
      driver_id: driverId,
      truck_id: truckId,
      trailer_id: trailerId,
      oo_percent: settled.percent,
      oo_pay: settled.pay,
      completed_at: completedAt,
    }),
  });
  applyCurrentLoadAssignment(loadId);
  return id;
}

export function updateRelay(id: number, input: RelayInput): void {
  const existing = getRelay(id);
  if (!existing) throw new Error("Relay is missing.");
  const { pickup, delivery } = resolveRelayPlaces(existing.load_id, input, existing.pickup);
  const { fromDriverId, driverId } = resolveRelayDrivers(input, existing.load_id);
  const load = loadOriginDest(existing.load_id);
  const truckId = input.truck_id !== undefined ? optionalId(input.truck_id) : existing.truck_id;
  const trailerId = input.trailer_id !== undefined ? optionalId(input.trailer_id) : existing.trailer_id;
  const fromTruckId = input.from_truck_id !== undefined ? optionalId(input.from_truck_id) : existing.from_truck_id;
  const fromTrailerId =
    input.from_trailer_id !== undefined ? optionalId(input.from_trailer_id) : existing.from_trailer_id;
  const completedAt =
    input.completed_at !== undefined ? completedAtValue(input.completed_at) : completedAtValue(existing.completed_at);
  assertRelayCompletionTime({ driver_id: driverId, truck_id: truckId, trailer_id: trailerId, completed_at: completedAt });
  const settled = settleRelayPay(load.rate, input);
  getDb()
    .prepare(
      `UPDATE load_relays
       SET pickup = ?, delivery = ?, from_driver_id = ?, from_truck_id = ?, from_trailer_id = ?,
           driver_id = ?, truck_id = ?, trailer_id = ?, completed_at = ?,
           oo_percent = ?, oo_pay = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      pickup,
      delivery,
      fromDriverId,
      fromTruckId,
      fromTrailerId,
      driverId,
      truckId,
      trailerId,
      completedAt,
      settled.percent,
      settled.pay,
      (input.notes ?? "").trim(),
      nowIso(),
      id,
    );
  recordLoadAudit({
    loadId: existing.load_id,
    action: "relay",
    field: "leg",
    oldValue: describeRelay(existing),
    newValue: describeRelay({
      pickup,
      delivery,
      from_driver_id: fromDriverId,
      driver_id: driverId,
      truck_id: truckId,
      trailer_id: trailerId,
      oo_percent: settled.percent,
      oo_pay: settled.pay,
      completed_at: completedAt,
    }),
  });
  applyCurrentLoadAssignment(existing.load_id);
}

export function updateRelayAssignment(id: number, patch: RelayAssignmentPatch): void {
  const existing = getRelay(id);
  if (!existing) throw new Error("Relay is missing.");
  const next = {
    from_driver_id: patch.from_driver_id !== undefined ? optionalId(patch.from_driver_id) : existing.from_driver_id,
    from_truck_id: patch.from_truck_id !== undefined ? optionalId(patch.from_truck_id) : existing.from_truck_id,
    from_trailer_id: patch.from_trailer_id !== undefined ? optionalId(patch.from_trailer_id) : existing.from_trailer_id,
    driver_id: patch.driver_id !== undefined ? optionalId(patch.driver_id) : existing.driver_id,
    truck_id: patch.truck_id !== undefined ? optionalId(patch.truck_id) : existing.truck_id,
    trailer_id: patch.trailer_id !== undefined ? optionalId(patch.trailer_id) : existing.trailer_id,
    completed_at:
      patch.completed_at !== undefined ? completedAtValue(patch.completed_at) : completedAtValue(existing.completed_at),
  };
  if (next.from_driver_id && next.driver_id && next.from_driver_id === next.driver_id) {
    throw new Error("Pick two different drivers for the handoff.");
  }
  getDb()
    .prepare(
      `UPDATE load_relays
       SET from_driver_id = ?, from_truck_id = ?, from_trailer_id = ?,
           driver_id = ?, truck_id = ?, trailer_id = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.from_driver_id,
      next.from_truck_id,
      next.from_trailer_id,
      next.driver_id,
      next.truck_id,
      next.trailer_id,
      next.completed_at,
      nowIso(),
      id,
    );
  recordLoadAudit({
    loadId: existing.load_id,
    action: "relay",
    field: "assignment",
    oldValue: describeRelay(existing),
    newValue: describeRelay({ ...existing, ...next }),
  });
  applyCurrentLoadAssignment(existing.load_id);
}

export function deleteRelay(id: number): void {
  const existing = getRelay(id);
  if (!existing) throw new Error("Relay is missing.");
  getDb().prepare("DELETE FROM load_relays WHERE id = ?").run(id);
  resequence(existing.load_id);
  recordLoadAudit({
    loadId: existing.load_id,
    action: "relay",
    field: "leg",
    oldValue: describeRelay(existing),
    newValue: "",
  });
  applyCurrentLoadAssignment(existing.load_id, {
    driver_id: existing.from_driver_id,
    truck_id: existing.from_truck_id,
    trailer_id: existing.from_trailer_id,
  });
}

export function moveRelay(id: number, direction: number): void {
  const existing = getRelay(id);
  if (!existing) throw new Error("Relay is missing.");
  const relays = listRelays(existing.load_id);
  const index = relays.findIndex((row) => row.id === id);
  const swapWith = relays[index + direction];
  if (!swapWith) return;
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE load_relays SET sequence = ? WHERE id = ?").run(swapWith.sequence, existing.id);
    db.prepare("UPDATE load_relays SET sequence = ? WHERE id = ?").run(existing.sequence, swapWith.id);
  })();
  recordLoadAudit({
    loadId: existing.load_id,
    action: "relay",
    field: "order",
    oldValue: formatRelayLane(existing.pickup, existing.delivery),
    newValue: direction < 0 ? "moved up" : "moved down",
  });
}

function resequence(loadId: number): void {
  const rows = getDb()
    .prepare("SELECT id FROM load_relays WHERE load_id = ? ORDER BY sequence, id")
    .all(loadId) as Array<{ id: number }>;
  const update = getDb().prepare("UPDATE load_relays SET sequence = ? WHERE id = ?");
  rows.forEach((row, index) => update.run(index + 1, row.id));
}
