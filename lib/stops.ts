import { getDb } from "./db";
import { getLoad } from "./queries";

export type LoadStop = {
  id: number;
  load_id: number;
  sequence: number;
  kind: "pickup" | "delivery" | "stopoff";
  location_id: number | null;
  name: string;
  city: string;
  state: string;
  window_start: string;
  window_end: string;
  confirmation: string;
  notes: string;
};

function nowUnused(): string {
  return new Date().toISOString();
}

export function listStops(loadId: number): LoadStop[] {
  return getDb()
    .prepare("SELECT * FROM load_stops WHERE load_id = ? ORDER BY sequence, id")
    .all(loadId) as LoadStop[];
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
    notes: load.appointment_notes,
  });
  addStop(loadId, {
    kind: "delivery",
    name: load.destination,
    city: load.destination,
    state: "",
    window_start: load.delivery_start,
    window_end: load.delivery_end,
    confirmation: "",
    notes: "",
  });
  return listStops(loadId);
}

export function addStop(
  loadId: number,
  input: {
    kind: LoadStop["kind"];
    name: string;
    city: string;
    state: string;
    window_start?: string;
    window_end?: string;
    confirmation?: string;
    notes?: string;
    location_id?: number | null;
  },
): number {
  if (!getLoad(loadId)) throw new Error("Load not found.");
  const max = getDb()
    .prepare("SELECT COALESCE(MAX(sequence), 0) as seq FROM load_stops WHERE load_id = ?")
    .get(loadId) as { seq: number };
  const result = getDb()
    .prepare(
      `INSERT INTO load_stops (
        load_id, sequence, kind, location_id, name, city, state, window_start, window_end, confirmation, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      loadId,
      max.seq + 1,
      input.kind,
      input.location_id ?? null,
      input.name.trim(),
      input.city.trim(),
      input.state.trim(),
      input.window_start ?? "",
      input.window_end ?? "",
      input.confirmation ?? "",
      input.notes ?? "",
    );
  void nowUnused;
  return Number(result.lastInsertRowid);
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
}

export function deleteStop(stopId: number): void {
  const stop = getDb().prepare("SELECT * FROM load_stops WHERE id = ?").get(stopId) as LoadStop | undefined;
  if (!stop) throw new Error("Stop not found.");
  const remaining = listStops(stop.load_id).length;
  if (remaining <= 2) throw new Error("A load needs at least two stops.");
  getDb().prepare("DELETE FROM load_stops WHERE id = ?").run(stopId);
}
