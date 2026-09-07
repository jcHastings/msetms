import { driverName, recordLoadAudit, trailerUnit, truckUnit } from "./audit";
import { getDb } from "./db";
import {
  extraRelayCount,
  formatRelayLane,
  type LoadRelayView,
  type RelayInput,
} from "./relays";
import { computeOwnerOperatorPay } from "./settlement";

const RELAY_SELECT = `SELECT load_relays.*,
  from_drivers.name AS from_driver_name,
  from_drivers.driver_type AS from_driver_type,
  from_drivers.company_name AS from_driver_company_name,
  drivers.name AS driver_name,
  drivers.driver_type AS driver_type,
  drivers.company_name AS driver_company_name,
  trucks.unit_number AS truck_unit,
  trailers.unit_number AS trailer_unit
  FROM load_relays
  LEFT JOIN drivers AS from_drivers ON from_drivers.id = load_relays.from_driver_id
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

function loadOriginDest(loadId: number): { origin: string; destination: string; driver_id: number | null; rate: number | null } {
  const row = getDb()
    .prepare("SELECT origin, destination, driver_id, rate FROM loads WHERE id = ?")
    .get(loadId) as
    | { origin: string; destination: string; driver_id: number | null; rate: number | null }
    | undefined;
  if (!row) throw new Error("Load not found.");
  return row;
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

function describeRelay(relay: {
  pickup: string;
  delivery: string;
  from_driver_id?: number | null;
  driver_id: number | null;
  truck_id: number | null;
  trailer_id: number | null;
  oo_percent: number | null;
  oo_pay: number | null;
}): string {
  const bits = [
    `${relay.from_driver_id ? driverName(relay.from_driver_id) : "Unassigned"} → ${
      relay.driver_id ? driverName(relay.driver_id) : "Unassigned"
    } at ${relay.delivery || relay.pickup}`,
  ];
  if (relay.truck_id) bits.push(truckUnit(relay.truck_id));
  if (relay.trailer_id) bits.push(trailerUnit(relay.trailer_id));
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
        load_id, sequence, pickup, delivery, from_driver_id, driver_id, truck_id, trailer_id,
        oo_percent, oo_pay, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      loadId,
      nextSeq,
      pickup,
      delivery,
      fromDriverId,
      driverId,
      input.truck_id ?? null,
      input.trailer_id ?? null,
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
      from_driver_id: fromDriverId,
      driver_id: driverId,
      truck_id: input.truck_id ?? null,
      trailer_id: input.trailer_id ?? null,
      oo_percent: settled.percent,
      oo_pay: settled.pay,
    }),
  });
  return id;
}

export function updateRelay(id: number, input: RelayInput): void {
  const existing = getRelay(id);
  if (!existing) throw new Error("Relay is missing.");
  const { pickup, delivery } = resolveRelayPlaces(existing.load_id, input, existing.pickup);
  const { fromDriverId, driverId } = resolveRelayDrivers(input, existing.load_id);
  const load = loadOriginDest(existing.load_id);
  const settled = settleRelayPay(load.rate, input);
  getDb()
    .prepare(
      `UPDATE load_relays
       SET pickup = ?, delivery = ?, from_driver_id = ?, driver_id = ?, truck_id = ?, trailer_id = ?,
           oo_percent = ?, oo_pay = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      pickup,
      delivery,
      fromDriverId,
      driverId,
      input.truck_id ?? existing.truck_id,
      input.trailer_id ?? existing.trailer_id,
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
      truck_id: input.truck_id ?? existing.truck_id,
      trailer_id: input.trailer_id ?? existing.trailer_id,
      oo_percent: settled.percent,
      oo_pay: settled.pay,
    }),
  });
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
