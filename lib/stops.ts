import { getDb } from "./db";
import { applyGeofenceArrivals } from "./geofence";
import { applyLocationToStop, matchLocationForStop } from "./locations";
import { getLoad, getLocation, listLocations } from "./queries";
import { stopDeliveredFlag, type LoadStopKind, type LoadStop, type StopInput } from "./stops-shared";

export type { LoadStopKind, LoadStop, StopInput };
export { stopTypeNumber, stopTypeLabel, stopMapMarkerText, stopIsDelivered, stopDeliveredFlag } from "./stops-shared";


function asStopKind(value: string): LoadStopKind {
  return value === "delivery" ? "delivery" : "pickup";
}

function asStop(row: Record<string, unknown>): LoadStop {
  return {
    id: Number(row.id),
    load_id: Number(row.load_id),
    sequence: Number(row.sequence),
    kind: asStopKind(String(row.kind ?? "pickup")),
    location_id: row.location_id == null ? null : Number(row.location_id),
    name: String(row.name ?? ""),
    street: String(row.street ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    zip: String(row.zip ?? ""),
    phone: String(row.phone ?? ""),
    window_start: String(row.window_start ?? ""),
    window_end: String(row.window_end ?? ""),
    confirmation: String(row.confirmation ?? ""),
    cargo: String(row.cargo ?? ""),
    reference: String(row.reference ?? ""),
    instructions: String(row.instructions ?? ""),
    notes: String(row.notes ?? ""),
    arrived_at: String(row.arrived_at ?? ""),
    departed_at: String(row.departed_at ?? ""),
    delivered: stopDeliveredFlag(row.delivered),
    schedule_type: String(row.schedule_type ?? ""),
  };
}

function hydrateStopFromLocations(
  stop: LoadStop,
  locations: ReturnType<typeof listLocations>,
): LoadStop {
  const picked = stop.location_id ? locations.find((location) => location.id === stop.location_id) ?? null : null;
  const matched = picked ?? matchLocationForStop(locations, stop);
  if (!matched) return stop;
  const filled = applyLocationToStop(stop, matched);
  return {
    ...stop,
    location_id: filled.location_id ?? stop.location_id,
    name: filled.name,
    street: filled.street ?? "",
    city: filled.city ?? "",
    state: filled.state ?? "",
    zip: filled.zip ?? "",
    phone: filled.phone ?? "",
  };
}

export function listStopAppointmentTargets(loadId: number): Array<{
  id: number;
  kind: LoadStopKind;
  name: string;
  window_start: string;
  confirmation: string;
  schedule_type: string;
}> {
  return (
    getDb()
      .prepare(
        `SELECT id, kind, name, window_start, confirmation, schedule_type
         FROM load_stops
         WHERE load_id = ?
         ORDER BY sequence, id`,
      )
      .all(loadId) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: Number(row.id),
    kind: asStopKind(String(row.kind ?? "pickup")),
    name: String(row.name ?? ""),
    window_start: String(row.window_start ?? ""),
    confirmation: String(row.confirmation ?? ""),
    schedule_type: String(row.schedule_type ?? ""),
  }));
}

export function listStops(loadId: number): LoadStop[] {
  applyGeofenceArrivals(loadId);
  const locations = listLocations();
  return (
    getDb()
      .prepare("SELECT * FROM load_stops WHERE load_id = ? ORDER BY sequence, id")
      .all(loadId) as Array<Record<string, unknown>>
  )
    .map(asStop)
    .map((stop) => hydrateStopFromLocations(stop, locations));
}

function splitLaneCityState(value: string): { city: string; state: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+),\s*([A-Za-z]{2})$/);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  return { city: trimmed, state: "" };
}

function seedStopFromLane(
  kind: LoadStopKind,
  locationId: number | null,
  lane: string,
  windowStart: string,
  windowEnd: string,
  extra: Partial<StopInput> = {},
): StopInput {
  const location = locationId ? getLocation(locationId) : null;
  if (location) {
    return {
      kind,
      location_id: location.id,
      name: location.name,
      street: location.street,
      city: location.city,
      state: location.state,
      zip: location.zip,
      phone: location.phone,
      window_start: windowStart,
      window_end: windowEnd,
      ...extra,
    };
  }
  const split = splitLaneCityState(lane);
  return {
    kind,
    name: split.city || lane,
    street: "",
    city: split.city || lane,
    state: split.state,
    zip: "",
    window_start: windowStart,
    window_end: windowEnd,
    ...extra,
  };
}

export function ensureDefaultStops(loadId: number): LoadStop[] {
  const existing = listStops(loadId);
  if (existing.length) return existing;
  const load = getLoad(loadId);
  if (!load) return [];
  addStop(
    loadId,
    seedStopFromLane("pickup", load.shipper_location_id, load.origin, load.pickup_start, load.pickup_end, {
      confirmation: load.appointment_confirmation ?? "",
      instructions: load.special_instructions,
      notes: load.appointment_notes,
    }),
  );
  addStop(
    loadId,
    seedStopFromLane("delivery", load.consignee_location_id, load.destination, load.delivery_start, load.delivery_end),
  );
  return listStops(loadId);
}

function resolveStopLocation(input: StopInput): StopInput {
  const picked = input.location_id ? getLocation(input.location_id) : null;
  const matched = picked ?? matchLocationForStop(listLocations(), input);
  return matched ? applyLocationToStop(input, matched) : input;
}

export function addStop(loadId: number, input: StopInput): number {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  input = resolveStopLocation(input);
  const max = getDb()
    .prepare("SELECT COALESCE(MAX(sequence), 0) as seq FROM load_stops WHERE load_id = ?")
    .get(loadId) as { seq: number };
  const result = getDb()
    .prepare(
      `INSERT INTO load_stops (
        load_id, sequence, kind, location_id, name, street, city, state, zip, phone,
        window_start, window_end, confirmation, cargo, reference, instructions, notes,
        arrived_at, departed_at, delivered, schedule_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      loadId,
      max.seq + 1,
      asStopKind(input.kind),
      input.location_id ?? null,
      input.name.trim(),
      (input.street ?? "").trim(),
      input.city.trim(),
      input.state.trim(),
      (input.zip ?? "").trim(),
      (input.phone ?? "").trim(),
      input.window_start ?? "",
      input.window_end ?? "",
      input.confirmation ?? "",
      (input.cargo ?? "").trim(),
      (input.reference ?? "").trim(),
      (input.instructions ?? "").trim(),
      input.notes ?? "",
      input.arrived_at ?? "",
      input.departed_at ?? "",
      stopDeliveredFlag(input.delivered),
      input.schedule_type ?? "",
    );
  syncLoadLaneFromStops(loadId);
  return Number(result.lastInsertRowid);
}

export function stampStopTime(stopId: number, field: "arrived_at" | "departed_at", iso: string): void {
  const stop = getDb().prepare("SELECT id FROM load_stops WHERE id = ?").get(stopId) as { id: number } | undefined;
  if (!stop) throw new Error("Stop not found.");
  getDb().prepare(`UPDATE load_stops SET ${field} = ? WHERE id = ?`).run(iso, stopId);
}

export function setStopDelivered(stopId: number, delivered: boolean): void {
  const stop = getStop(stopId);
  if (!stop) throw new Error("Stop not found.");
  const hasTimes = Boolean(stop.arrived_at.trim() || stop.departed_at.trim());
  const value = delivered ? 1 : hasTimes ? 2 : 0;
  getDb()
    .prepare("UPDATE load_stops SET delivered = ? WHERE id = ?")
    .run(value, stopId);
}

export function getStop(stopId: number): LoadStop | null {
  const row = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(stopId) as Record<string, unknown> | undefined;
  return row ? asStop(row) : null;
}

export function updateStop(stopId: number, input: StopInput): void {
  const stop = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(stopId) as
    | Record<string, unknown>
    | undefined;
  if (!stop) throw new Error("Stop not found.");
  input = resolveStopLocation(input);
  getDb()
    .prepare(
      `UPDATE load_stops SET
        kind = ?, location_id = ?, name = ?, street = ?, city = ?, state = ?, zip = ?, phone = ?,
        window_start = ?, window_end = ?, confirmation = ?, cargo = ?, reference = ?,
        instructions = ?, notes = ?, arrived_at = ?, departed_at = ?, delivered = ?, schedule_type = ?
       WHERE id = ?`,
    )
    .run(
      asStopKind(input.kind),
      input.location_id ?? null,
      input.name.trim(),
      (input.street ?? "").trim(),
      input.city.trim(),
      input.state.trim(),
      (input.zip ?? "").trim(),
      (input.phone ?? "").trim(),
      input.window_start ?? "",
      input.window_end ?? "",
      input.confirmation ?? "",
      (input.cargo ?? "").trim(),
      (input.reference ?? "").trim(),
      (input.instructions ?? "").trim(),
      input.notes ?? "",
      input.arrived_at ?? String(stop.arrived_at ?? ""),
      input.departed_at ?? String(stop.departed_at ?? ""),
      input.delivered === 1 || input.delivered === 0 || input.delivered === 2
        ? input.delivered
        : stopDeliveredFlag(stop.delivered),
      input.schedule_type ?? String(stop.schedule_type ?? ""),
      stopId,
    );
  syncLoadLaneFromStops(Number(stop.load_id));
}

export function moveStop(stopId: number, direction: -1 | 1): void {
  const stop = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(stopId) as LoadStop | undefined;
  if (!stop) throw new Error("Stop not found.");
  const neighbor = getDb()
    .prepare(
      `SELECT * FROM load_stops WHERE load_id = ? AND sequence ${direction < 0 ? "<" : ">"} ? ORDER BY sequence ${
        direction < 0 ? "DESC" : "ASC"
      } LIMIT 1`,
    )
    .get(stop.load_id, stop.sequence) as LoadStop | undefined;
  if (!neighbor) return;
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE load_stops SET sequence = ? WHERE id = ?").run(neighbor.sequence, stop.id);
    db.prepare("UPDATE load_stops SET sequence = ? WHERE id = ?").run(stop.sequence, neighbor.id);
  })();
  syncLoadLaneFromStops(stop.load_id);
}

export function replaceStops(loadId: number, stops: StopInput[]): void {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM load_stops WHERE load_id = ?").run(loadId);
  })();
  for (const stop of stops) {
    addStop(loadId, stop);
  }
}

export function reorderStops(loadId: number, orderedIds: number[]): void {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  const existing = (
    getDb()
      .prepare("SELECT id FROM load_stops WHERE load_id = ? ORDER BY sequence, id")
      .all(loadId) as Array<{ id: number }>
  ).map((row) => row.id);
  if (!existing.length) return;
  if (orderedIds.length !== existing.length || new Set(orderedIds).size !== existing.length) {
    throw new Error("Stop order is incomplete.");
  }
  const allowed = new Set(existing);
  if (orderedIds.some((id) => !allowed.has(id))) throw new Error("Stop order does not match this load.");
  const db = getDb();
  db.transaction(() => {
    orderedIds.forEach((id, index) => {
      db.prepare("UPDATE load_stops SET sequence = ? WHERE id = ? AND load_id = ?").run(index + 1, id, loadId);
    });
  })();
  syncLoadLaneFromStops(loadId);
}

export function deleteStop(stopId: number): void {
  const stop = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(stopId) as LoadStop | undefined;
  if (!stop) throw new Error("Stop not found.");
  getDb().prepare("DELETE FROM load_stops WHERE id = ?").run(stopId);
  syncLoadLaneFromStops(stop.load_id);
}

export function syncLoadLaneFromStops(loadId: number): void {
  const stops = listStops(loadId);
  if (!stops.length) return;
  const pickup = stops.find((item) => item.kind === "pickup") ?? stops[0];
  const delivery = [...stops].reverse().find((item) => item.kind === "delivery") ?? stops[stops.length - 1];
  const origin = [pickup.city, pickup.state].filter(Boolean).join(", ") || pickup.name || "TBD";
  const destination = [delivery.city, delivery.state].filter(Boolean).join(", ") || delivery.name || "TBD";
  getDb()
    .prepare(
      `UPDATE loads SET
        origin = ?, destination = ?,
        pickup_start = CASE WHEN ? != '' THEN ? ELSE pickup_start END,
        pickup_end = CASE WHEN ? != '' THEN ? ELSE pickup_end END,
        delivery_start = CASE WHEN ? != '' THEN ? ELSE delivery_start END,
        delivery_end = CASE WHEN ? != '' THEN ? ELSE delivery_end END,
        shipper_location_id = ?, consignee_location_id = ?
       WHERE id = ?`,
    )
    .run(
      origin,
      destination,
      pickup.window_start,
      pickup.window_start,
      pickup.window_end,
      pickup.window_end,
      delivery.window_start,
      delivery.window_start,
      delivery.window_end,
      delivery.window_end,
      pickup.location_id,
      delivery.location_id,
      loadId,
    );
}
