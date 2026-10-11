import { recordLoadAudit } from "./audit";
import { getDb } from "./db";
import { findLoadIdByNumber, getDriver, getLoad } from "./queries";
import { normalizePayWeek } from "./pay-week";
import { applyCurrentLoadAssignment, deleteRelay, listRelays } from "./relay-store";
import { totalLoadedMiles } from "./relay-pay";
import {
  decodePolyline,
  estimateStateMiles,
  parseRouteStateMiles,
  serializeRouteStateMiles,
  splitRouteAtPoint,
  type RouteStateMile,
} from "./routing-shared";
import { isAdminRole } from "./settings-shared";
import { fetchLaneDirections } from "./routing";
import { isOwnerOperator } from "./types";

export type SwapPointInput = {
  address: string;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  locationId?: number | null;
};

export type CreateLoadSwapInput = {
  loadAId: number;
  loadBId: number;
  point: SwapPointInput;
  swapAt: string;
  notes?: string;
  createdBy?: string;
  detentionLegA?: string;
  detentionLegB?: string;
};

export type MeasuredSwapLegs = {
  fromMiles: number | null;
  toMiles: number | null;
  fromStates: RouteStateMile[];
  toStates: RouteStateMile[];
  source: "polyline" | "google" | "missing";
  offRoute: boolean;
};

export type LoadSwapLegView = {
  loadId: number;
  loadNumber: string;
  fromMiles: number | null;
  toMiles: number | null;
  totalMiles: number | null;
  source: string;
  offRoute: boolean;
  milesLocked: boolean;
  fromDriverName: string;
  toDriverName: string;
  fromDriverPercent: number | null;
  toDriverPercent: number | null;
};

export type LoadSwapView = {
  id: number;
  loadAId: number;
  loadBId: number;
  loadANumber: string;
  loadBNumber: string;
  address: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  locationId: number | null;
  swapAt: string;
  notes: string;
  legs: LoadSwapLegView[];
};

type LoadSwapRow = {
  id: number;
  origin: string;
  destination: string;
  driver_id: number | null;
  truck_id: number | null;
  trailer_id: number | null;
  rate: number | null;
  route_miles: number | null;
  route_polyline: string;
  load_number: string;
  status: string;
  delivery_end: string;
  delivery_start: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function roundMile(value: number): number {
  return Math.round(value * 10) / 10;
}

export function loadHasSwap(loadId: number): boolean {
  const row = getDb()
    .prepare("SELECT id FROM load_relays WHERE load_id = ? AND swap_id IS NOT NULL LIMIT 1")
    .get(loadId) as { id: number } | undefined;
  return Boolean(row);
}

function loadRow(loadId: number): LoadSwapRow {
  const row = getDb()
    .prepare(
      `SELECT id, origin, destination, driver_id, truck_id, trailer_id, rate, route_miles, route_polyline,
              load_number, status, delivery_end, delivery_start, updated_at
       FROM loads WHERE id = ?`,
    )
    .get(loadId) as LoadSwapRow | undefined;
  if (!row) throw new Error("Load not found.");
  return row;
}

function driverPercent(driverId: number | null): number | null {
  if (!driverId) return null;
  const driver = getDriver(driverId);
  if (!driver || !isOwnerOperator(driver.driver_type)) return null;
  if (driver.pay_percent == null || Number.isNaN(Number(driver.pay_percent))) return null;
  return Number(driver.pay_percent);
}

function assertEquipment(load: LoadSwapRow): void {
  if (!load.driver_id) throw new Error(`Assign a driver on ${load.load_number} before the swap.`);
  if (!load.truck_id || !load.trailer_id) {
    throw new Error(`Assign a truck and a trailer on ${load.load_number} before the swap.`);
  }
}

export function loadPayWeekIsFrozen(loadId: number): boolean {
  const load = getDb()
    .prepare("SELECT id, driver_id, delivery_end, delivery_start, updated_at FROM loads WHERE id = ?")
    .get(loadId) as
    | { id: number; driver_id: number | null; delivery_end: string; delivery_start: string; updated_at: string }
    | undefined;
  if (!load) return false;
  const period = load.delivery_end || load.delivery_start || load.updated_at || "";
  if (load.driver_id && period) {
    const week = normalizePayWeek(period.slice(0, 10));
    const paid = getDb()
      .prepare(
        `SELECT id FROM settlement_statements
         WHERE driver_id = ? AND week_start = ? AND TRIM(paid_at) != ''`,
      )
      .get(load.driver_id, week.from) as { id: number } | undefined;
    if (paid) return true;
  }
  const snapshots = getDb()
    .prepare(`SELECT snapshot_json FROM settlement_statements WHERE TRIM(paid_at) != '' AND TRIM(snapshot_json) != ''`)
    .all() as Array<{ snapshot_json: string }>;
  for (const row of snapshots) {
    try {
      const parsed = JSON.parse(row.snapshot_json) as { loads?: Array<{ loadId?: number }> };
      if ((parsed.loads ?? []).some((line) => line.loadId === loadId)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function assertSwapMutable(loadIds: number[]): void {
  for (const loadId of loadIds) {
    if (loadPayWeekIsFrozen(loadId)) {
      throw new Error("This load is on a paid settlement. Leave that statement as it was.");
    }
  }
}

export async function measureSwapLegs(
  load: Pick<LoadSwapRow, "origin" | "destination" | "route_miles" | "route_polyline">,
  point: SwapPointInput,
): Promise<MeasuredSwapLegs> {
  const lat = point.lat ?? null;
  const lng = point.lng ?? null;
  const polyline = String(load.route_polyline ?? "").trim();
  const routeMiles = load.route_miles != null && load.route_miles > 0 ? load.route_miles : null;
  if (polyline && routeMiles && lat != null && lng != null) {
    const split = splitRouteAtPoint(decodePolyline(polyline), { lat, lng }, routeMiles);
    if (split) {
      return {
        fromMiles: split.fromMiles,
        toMiles: split.toMiles,
        fromStates: estimateStateMiles(split.fromPoints, split.fromMiles),
        toStates: estimateStateMiles(split.toPoints, split.toMiles),
        source: "polyline",
        offRoute: split.offRoute,
      };
    }
  }
  const address = point.address.trim();
  if (load.origin.trim() && address && load.destination.trim()) {
    try {
      const outbound = await fetchLaneDirections(load.origin, address);
      const inbound = await fetchLaneDirections(address, load.destination);
      const fromMiles = outbound.totalMiles;
      const toMiles = inbound.totalMiles;
      return {
        fromMiles,
        toMiles,
        fromStates: estimateStateMiles(outbound.points, fromMiles),
        toStates: estimateStateMiles(inbound.points, toMiles),
        source: "google",
        offRoute: false,
      };
    } catch {
      // No saved route and no Google result. An administrator can enter loaded miles.
    }
  }
  return {
    fromMiles: null,
    toMiles: null,
    fromStates: [],
    toStates: [],
    source: "missing",
    offRoute: false,
  };
}

function insertRelay(
  swapId: number,
  load: LoadSwapRow,
  other: LoadSwapRow,
  point: SwapPointInput,
  swapAt: string,
  measured: MeasuredSwapLegs,
  notes: string,
): void {
  const timestamp = nowIso();
  getDb()
    .prepare(
      `INSERT INTO load_relays (
        load_id, sequence, pickup, delivery, from_driver_id, from_truck_id, from_trailer_id,
        driver_id, truck_id, trailer_id, completed_at, oo_percent, oo_pay, notes,
        relay_place_id, relay_lat, relay_lng, relay_address, swap_id, miles_source, miles_locked,
        from_leg_miles, to_leg_miles, from_leg_state_miles, to_leg_state_miles, created_at, updated_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      load.id,
      load.origin,
      point.address.trim(),
      load.driver_id,
      load.truck_id,
      load.trailer_id,
      other.driver_id,
      other.truck_id,
      load.trailer_id,
      swapAt,
      notes,
      point.placeId?.trim() || null,
      point.lat ?? null,
      point.lng ?? null,
      point.address.trim(),
      swapId,
      measured.source,
      measured.fromMiles,
      measured.toMiles,
      measured.fromStates.length ? serializeRouteStateMiles(measured.fromStates) : "",
      measured.toStates.length ? serializeRouteStateMiles(measured.toStates) : "",
      timestamp,
      timestamp,
    );
}

function setDetentionLeg(loadId: number, leg: string | undefined): void {
  const normalized = String(leg ?? "").trim().toLowerCase();
  const stored = normalized === "pickup" || normalized === "delivery" ? normalized : "";
  if (!stored) return;
  getDb().prepare("UPDATE loads SET detention_leg = ?, updated_at = ? WHERE id = ?").run(stored, nowIso(), loadId);
}

export async function createLoadSwap(input: CreateLoadSwapInput): Promise<number> {
  if (input.loadAId === input.loadBId) throw new Error("Pick a different load to swap with.");
  const address = input.point.address.trim();
  if (!address) throw new Error("Enter the swap point.");
  const swapAt = input.swapAt.trim();
  if (!swapAt) throw new Error("Enter the swap date and time.");
  const loadA = loadRow(input.loadAId);
  const loadB = loadRow(input.loadBId);
  assertEquipment(loadA);
  assertEquipment(loadB);
  if (loadA.driver_id === loadB.driver_id) throw new Error("Pick two different drivers for the swap.");
  if (listRelays(loadA.id).length || listRelays(loadB.id).length) {
    throw new Error("This load already has a relay. A swap links two loads that do not already relay.");
  }
  if (loadHasSwap(loadA.id) || loadHasSwap(loadB.id)) throw new Error("One of these loads is already in a swap.");
  assertSwapMutable([loadA.id, loadB.id]);
  const [milesA, milesB] = await Promise.all([
    measureSwapLegs(loadA, input.point),
    measureSwapLegs(loadB, input.point),
  ]);
  const notes = (input.notes ?? "").trim();
  const timestamp = nowIso();
  const swapId = getDb().transaction(() => {
    const result = getDb()
      .prepare(
        `INSERT INTO load_swaps (
          load_a_id, load_b_id, location_id, place_id, lat, lng, address, swap_at, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        loadA.id,
        loadB.id,
        input.point.locationId ?? null,
        input.point.placeId?.trim() || null,
        input.point.lat ?? null,
        input.point.lng ?? null,
        address,
        swapAt,
        notes,
        (input.createdBy ?? "").trim(),
        timestamp,
        timestamp,
      );
    const id = Number(result.lastInsertRowid);
    insertRelay(id, loadA, loadB, { ...input.point, address }, swapAt, milesA, notes);
    insertRelay(id, loadB, loadA, { ...input.point, address }, swapAt, milesB, notes);
    setDetentionLeg(loadA.id, input.detentionLegA);
    setDetentionLeg(loadB.id, input.detentionLegB);
    return id;
  })();
  applyCurrentLoadAssignment(loadA.id);
  applyCurrentLoadAssignment(loadB.id);
  recordLoadAudit({
    loadId: loadA.id,
    action: "swap",
    field: "swap",
    newValue: `${loadA.load_number} with ${loadB.load_number} at ${address}`,
  });
  recordLoadAudit({
    loadId: loadB.id,
    action: "swap",
    field: "swap",
    newValue: `${loadB.load_number} with ${loadA.load_number} at ${address}`,
  });
  return swapId;
}

export function deleteLoadSwap(swapId: number): void {
  const swap = getDb().prepare("SELECT id, load_a_id, load_b_id FROM load_swaps WHERE id = ?").get(swapId) as
    | { id: number; load_a_id: number; load_b_id: number }
    | undefined;
  if (!swap) throw new Error("Swap not found.");
  assertSwapMutable([swap.load_a_id, swap.load_b_id]);
  const relays = getDb()
    .prepare("SELECT id, load_id FROM load_relays WHERE swap_id = ?")
    .all(swapId) as Array<{ id: number; load_id: number }>;
  getDb().prepare("UPDATE load_relays SET swap_id = NULL WHERE swap_id = ?").run(swapId);
  getDb().prepare("DELETE FROM load_swaps WHERE id = ?").run(swapId);
  for (const relay of relays) {
    deleteRelay(relay.id);
  }
}

export function setSwapLegMiles(input: {
  loadId: number;
  fromMiles: number;
  toMiles: number;
  role: string;
}): void {
  if (!isAdminRole(input.role)) throw new Error("Only an administrator can override leg miles.");
  if (!Number.isFinite(input.fromMiles) || !Number.isFinite(input.toMiles) || input.fromMiles < 0 || input.toMiles < 0) {
    throw new Error("Enter loaded miles for both legs.");
  }
  if (input.fromMiles + input.toMiles <= 0) throw new Error("Enter loaded miles for both legs.");
  const relay = getDb()
    .prepare("SELECT id, load_id, from_leg_miles, to_leg_miles FROM load_relays WHERE load_id = ? AND swap_id IS NOT NULL")
    .get(input.loadId) as
    | { id: number; load_id: number; from_leg_miles: number | null; to_leg_miles: number | null }
    | undefined;
  if (!relay) throw new Error("This load is not in a swap.");
  assertSwapMutable([input.loadId]);
  const fromMiles = roundMile(input.fromMiles);
  const toMiles = roundMile(input.toMiles);
  getDb()
    .prepare(
      `UPDATE load_relays
       SET from_leg_miles = ?, to_leg_miles = ?, miles_source = 'manual', miles_locked = 1,
           from_leg_state_miles = '', to_leg_state_miles = '', updated_at = ?
       WHERE id = ?`,
    )
    .run(fromMiles, toMiles, nowIso(), relay.id);
  recordLoadAudit({
    loadId: input.loadId,
    action: "swap",
    field: "miles",
    oldValue: `${relay.from_leg_miles ?? ""} / ${relay.to_leg_miles ?? ""}`,
    newValue: `${fromMiles} / ${toMiles} (manual)`,
  });
}

function legView(loadId: number): LoadSwapLegView | null {
  const relay = getDb()
    .prepare(
      `SELECT load_relays.*, loads.load_number, loads.route_miles
       FROM load_relays JOIN loads ON loads.id = load_relays.load_id
       WHERE load_relays.load_id = ? AND load_relays.swap_id IS NOT NULL`,
    )
    .get(loadId) as
    | {
        load_id: number;
        load_number: string;
        from_leg_miles: number | null;
        to_leg_miles: number | null;
        route_miles: number | null;
        miles_source: string;
        miles_locked: number;
        from_driver_id: number | null;
        driver_id: number | null;
      }
    | undefined;
  if (!relay) return null;
  const fromDriver = relay.from_driver_id ? getDriver(relay.from_driver_id) : null;
  const toDriver = relay.driver_id ? getDriver(relay.driver_id) : null;
  return {
    loadId: relay.load_id,
    loadNumber: relay.load_number,
    fromMiles: relay.from_leg_miles,
    toMiles: relay.to_leg_miles,
    totalMiles: totalLoadedMiles(relay.route_miles, relay.from_leg_miles, relay.to_leg_miles),
    source: relay.miles_source || "",
    offRoute: false,
    milesLocked: Boolean(relay.miles_locked),
    fromDriverName: fromDriver?.name ?? "",
    toDriverName: toDriver?.name ?? "",
    fromDriverPercent: driverPercent(relay.from_driver_id),
    toDriverPercent: driverPercent(relay.driver_id),
  };
}

export function getLoadSwap(loadId: number): LoadSwapView | null {
  const swap = getDb()
    .prepare(
      `SELECT load_swaps.*, a.load_number AS load_a_number, b.load_number AS load_b_number
       FROM load_swaps
       JOIN loads a ON a.id = load_swaps.load_a_id
       JOIN loads b ON b.id = load_swaps.load_b_id
       WHERE load_swaps.load_a_id = ? OR load_swaps.load_b_id = ?`,
    )
    .get(loadId, loadId) as
    | {
        id: number;
        load_a_id: number;
        load_b_id: number;
        load_a_number: string;
        load_b_number: string;
        address: string;
        lat: number | null;
        lng: number | null;
        place_id: string | null;
        location_id: number | null;
        swap_at: string;
        notes: string;
      }
    | undefined;
  if (!swap) return null;
  const legs = [legView(swap.load_a_id), legView(swap.load_b_id)].filter((leg): leg is LoadSwapLegView => Boolean(leg));
  return {
    id: swap.id,
    loadAId: swap.load_a_id,
    loadBId: swap.load_b_id,
    loadANumber: swap.load_a_number,
    loadBNumber: swap.load_b_number,
    address: swap.address,
    lat: swap.lat,
    lng: swap.lng,
    placeId: swap.place_id,
    locationId: swap.location_id,
    swapAt: swap.swap_at,
    notes: swap.notes,
    legs,
  };
}

export function findSwapPartnerId(loadId: number, loadNumber: string): number {
  const otherId = findLoadIdByNumber(loadNumber);
  if (!otherId) throw new Error("Load number was not found.");
  if (otherId === loadId) throw new Error("Pick a different load to swap with.");
  return otherId;
}

export type SwapLegForPay = {
  swapId: number;
  loadId: number;
  role: "from" | "to";
  leg: "1" | "2";
  miles: number | null;
  totalMiles: number | null;
  driverId: number;
  storedPercent: number | null;
  driverType: string | null;
};

export function listSwapLegsForDriver(driverId: number): SwapLegForPay[] {
  const rows = getDb()
    .prepare(
      `SELECT load_relays.swap_id, load_relays.load_id, load_relays.from_driver_id, load_relays.driver_id,
              load_relays.from_leg_miles, load_relays.to_leg_miles, loads.route_miles,
              from_drivers.driver_type AS from_driver_type, from_drivers.pay_percent AS from_pay_percent,
              to_drivers.driver_type AS to_driver_type, to_drivers.pay_percent AS to_pay_percent
       FROM load_relays
       JOIN loads ON loads.id = load_relays.load_id
       LEFT JOIN drivers AS from_drivers ON from_drivers.id = load_relays.from_driver_id
       LEFT JOIN drivers AS to_drivers ON to_drivers.id = load_relays.driver_id
       WHERE load_relays.swap_id IS NOT NULL
         AND (load_relays.from_driver_id = ? OR load_relays.driver_id = ?)`,
    )
    .all(driverId, driverId) as Array<{
    swap_id: number;
    load_id: number;
    from_driver_id: number | null;
    driver_id: number | null;
    from_leg_miles: number | null;
    to_leg_miles: number | null;
    route_miles: number | null;
    from_driver_type: string | null;
    from_pay_percent: number | null;
    to_driver_type: string | null;
    to_pay_percent: number | null;
  }>;
  const legs: SwapLegForPay[] = [];
  for (const row of rows) {
    const total = totalLoadedMiles(row.route_miles, row.from_leg_miles, row.to_leg_miles);
    if (row.from_driver_id === driverId) {
      legs.push({
        swapId: row.swap_id,
        loadId: row.load_id,
        role: "from",
        leg: "1",
        miles: row.from_leg_miles,
        totalMiles: total,
        driverId,
        storedPercent:
          row.from_pay_percent == null || !isOwnerOperator(row.from_driver_type) ? null : Number(row.from_pay_percent),
        driverType: row.from_driver_type,
      });
    }
    if (row.driver_id === driverId) {
      legs.push({
        swapId: row.swap_id,
        loadId: row.load_id,
        role: "to",
        leg: "2",
        miles: row.to_leg_miles,
        totalMiles: total,
        driverId,
        storedPercent: row.to_pay_percent == null || !isOwnerOperator(row.to_driver_type) ? null : Number(row.to_pay_percent),
        driverType: row.to_driver_type,
      });
    }
  }
  return legs;
}

export function swapDriverIdsInRange(loadIds: number[]): number[] {
  if (!loadIds.length) return [];
  const placeholders = loadIds.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT from_driver_id, driver_id FROM load_relays
       WHERE swap_id IS NOT NULL AND load_id IN (${placeholders})`,
    )
    .all(...loadIds) as Array<{ from_driver_id: number | null; driver_id: number | null }>;
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.from_driver_id) ids.add(row.from_driver_id);
    if (row.driver_id) ids.add(row.driver_id);
  }
  return [...ids];
}

export type TruckLegMiles = {
  loadId: number;
  loadNumber: string;
  truckId: number | null;
  driverId: number | null;
  leg: "1" | "2";
  miles: number;
  states: RouteStateMile[];
};

export function truckLegsForLoad(loadId: number): TruckLegMiles[] | null {
  const rows = getDb()
    .prepare(
      `SELECT load_relays.from_truck_id, load_relays.truck_id, load_relays.from_driver_id, load_relays.driver_id,
              load_relays.from_leg_miles, load_relays.to_leg_miles, load_relays.from_leg_state_miles,
              load_relays.to_leg_state_miles, loads.load_number
       FROM load_relays JOIN loads ON loads.id = load_relays.load_id
       WHERE load_relays.load_id = ? AND load_relays.swap_id IS NOT NULL
       ORDER BY load_relays.sequence, load_relays.id`,
    )
    .all(loadId) as Array<{
    from_truck_id: number | null;
    truck_id: number | null;
    from_driver_id: number | null;
    driver_id: number | null;
    from_leg_miles: number | null;
    to_leg_miles: number | null;
    from_leg_state_miles: string;
    to_leg_state_miles: string;
    load_number: string;
  }>;
  if (!rows.length) return null;
  const legs: TruckLegMiles[] = [];
  for (const row of rows) {
    if (row.from_leg_miles != null) {
      legs.push({
        loadId,
        loadNumber: row.load_number,
        truckId: row.from_truck_id,
        driverId: row.from_driver_id,
        leg: "1",
        miles: row.from_leg_miles,
        states: parseRouteStateMiles(row.from_leg_state_miles),
      });
    }
    if (row.to_leg_miles != null) {
      legs.push({
        loadId,
        loadNumber: row.load_number,
        truckId: row.truck_id,
        driverId: row.driver_id,
        leg: "2",
        miles: row.to_leg_miles,
        states: parseRouteStateMiles(row.to_leg_state_miles),
      });
    }
  }
  return legs;
}

/** Loaded miles for one driver or truck on a swap. Null when the load is not a swap. */
export function swapLoadedMilesForAssignment(
  loadId: number,
  driverId: number,
  truckId: number | null | undefined,
): number | null {
  const legs = truckLegsForLoad(loadId);
  if (!legs) return null;
  const forDriver = legs.filter((leg) => leg.driverId === driverId);
  const picked = forDriver.length ? forDriver : legs.filter((leg) => truckId != null && leg.truckId === truckId);
  if (!picked.length) return 0;
  return Math.round(picked.reduce((sum, leg) => sum + leg.miles, 0) * 10) / 10;
}

export async function previewLoadSwap(input: {
  loadAId: number;
  loadBId: number;
  point: SwapPointInput;
}): Promise<{ loadA: MeasuredSwapLegs & { loadNumber: string }; loadB: MeasuredSwapLegs & { loadNumber: string } }> {
  const loadA = loadRow(input.loadAId);
  const loadB = loadRow(input.loadBId);
  const [milesA, milesB] = await Promise.all([
    measureSwapLegs(loadA, input.point),
    measureSwapLegs(loadB, input.point),
  ]);
  return {
    loadA: { ...milesA, loadNumber: loadA.load_number },
    loadB: { ...milesB, loadNumber: loadB.load_number },
  };
}

export function relayMilesAreLocked(relay: { miles_locked?: number | null; miles_source?: string | null; swap_id?: number | null }): boolean {
  if (relay.miles_locked) return true;
  if (relay.swap_id && (relay.miles_source === "polyline" || relay.miles_source === "manual")) return true;
  return false;
}
