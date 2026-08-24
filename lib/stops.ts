import { getDb } from "./db";
import { getLoad } from "./queries";

export type LoadStopKind = "pickup" | "delivery";

export type LoadStop = {
  id: number;
  load_id: number;
  sequence: number;
  kind: LoadStopKind;
  location_id: number | null;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  window_start: string;
  window_end: string;
  confirmation: string;
  cargo: string;
  reference: string;
  instructions: string;
  notes: string;
};

export type StopInput = {
  kind: LoadStopKind;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  phone?: string;
  window_start?: string;
  window_end?: string;
  confirmation?: string;
  cargo?: string;
  reference?: string;
  instructions?: string;
  notes?: string;
  location_id?: number | null;
};

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
  };
}

export function listStops(loadId: number): LoadStop[] {
  return (
    getDb()
      .prepare("SELECT * FROM load_stops WHERE load_id = ? ORDER BY sequence, id")
      .all(loadId) as Array<Record<string, unknown>>
  ).map(asStop);
}

export function ensureDefaultStops(loadId: number): LoadStop[] {
  const existing = listStops(loadId);
  if (existing.length) return existing;
  const load = getLoad(loadId);
  if (!load) return [];
  addStop(loadId, {
    kind: "pickup",
    name: load.origin,
    city: load.origin,
    state: "",
    window_start: load.pickup_start,
    window_end: load.pickup_end,
    confirmation: load.appointment_confirmation ?? "",
    instructions: load.special_instructions,
    notes: load.appointment_notes,
  });
  addStop(loadId, {
    kind: "delivery",
    name: load.destination,
    city: load.destination,
    state: "",
    window_start: load.delivery_start,
    window_end: load.delivery_end,
  });
  return listStops(loadId);
}

export function addStop(loadId: number, input: StopInput): number {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  const max = getDb()
    .prepare("SELECT COALESCE(MAX(sequence), 0) as seq FROM load_stops WHERE load_id = ?")
    .get(loadId) as { seq: number };
  const result = getDb()
    .prepare(
      `INSERT INTO load_stops (
        load_id, sequence, kind, location_id, name, street, city, state, zip, phone,
        window_start, window_end, confirmation, cargo, reference, instructions, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
  syncLoadLaneFromStops(loadId);
  return Number(result.lastInsertRowid);
}

export function updateStop(stopId: number, input: StopInput): void {
  const stop = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(stopId) as
    | Record<string, unknown>
    | undefined;
  if (!stop) throw new Error("Stop not found.");
  getDb()
    .prepare(
      `UPDATE load_stops SET
        kind = ?, location_id = ?, name = ?, street = ?, city = ?, state = ?, zip = ?, phone = ?,
        window_start = ?, window_end = ?, confirmation = ?, cargo = ?, reference = ?,
        instructions = ?, notes = ?
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
