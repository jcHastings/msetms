import { getDb } from "./db";
import {
  CUSTODY_LEFT_WHERE,
  type CustodyLeftWhere,
} from "./trailer-custody-shared";

export {
  CUSTODY_LEFT_WHERE,
  labelForCustodyLeftWhere,
  labelForCustodySource,
  type CustodyLeftWhere,
} from "./trailer-custody-shared";

const LEFT_WHERE_VALUES = new Set<string>(CUSTODY_LEFT_WHERE.map((item) => item.value));
const DROP_STATUSES = new Set(["delivered", "completed", "cancelled"]);
const ASSIGN_SOURCE = "load_assign";

export type CustodyHold = {
  trailerId: number | null;
  driverId: number | null;
  truckId: number | null;
  status: string;
};

export type TrailerCustodyEvent = {
  id: number;
  trailer_id: number;
  driver_id: number | null;
  truck_id: number | null;
  from_at: string;
  to_at: string | null;
  left_where: string;
  left_name: string | null;
  load_number: string | null;
  note: string | null;
  source: string;
  driver_name: string | null;
  truck_unit: string | null;
  trailer_unit: string | null;
};

type CustodyRow = {
  id: number;
  trailer_id: number;
  driver_id: number | null;
  truck_id: number | null;
  from_at: string;
  to_at: string | null;
  left_where: string;
  left_name: string | null;
  load_number: string | null;
  note: string | null;
  source: string;
};

export type DriverCustodyQuery =
  | { ok: true; rows: TrailerCustodyEvent[] }
  | {
      ok: false;
      reason: "empty" | "need_driver" | "need_dates" | "bad_range" | "driver_missing";
      rows: [];
    };

const EVENT_SELECT = `SELECT trailer_custody_events.*,
  drivers.name AS driver_name,
  trucks.unit_number AS truck_unit,
  trailers.unit_number AS trailer_unit
  FROM trailer_custody_events
  JOIN trailers ON trailers.id = trailer_custody_events.trailer_id
  LEFT JOIN drivers ON drivers.id = trailer_custody_events.driver_id
  LEFT JOIN trucks ON trucks.id = trailer_custody_events.truck_id`;

export function listTrailerCustody(trailerId: number): TrailerCustodyEvent[] {
  if (!Number.isInteger(trailerId) || trailerId <= 0) return [];
  return getDb()
    .prepare(`${EVENT_SELECT} WHERE trailer_custody_events.trailer_id = ? ORDER BY from_at DESC, id DESC`)
    .all(trailerId) as TrailerCustodyEvent[];
}

export function queryDriverCustody(input: {
  driverId: number | null;
  from: string;
  to: string;
}): DriverCustodyQuery {
  const fromText = input.from.trim();
  const toText = input.to.trim();
  const driverId = input.driverId;
  if ((driverId == null || driverId <= 0) && !fromText && !toText) {
    return { ok: false, reason: "empty", rows: [] };
  }
  if (driverId == null || !Number.isInteger(driverId) || driverId <= 0) {
    return { ok: false, reason: "need_driver", rows: [] };
  }
  const rangeStart = utcDayStart(fromText);
  const rangeEnd = utcDayEndExclusive(toText);
  if (!rangeStart || !rangeEnd) return { ok: false, reason: "need_dates", rows: [] };
  if (rangeStart >= rangeEnd) return { ok: false, reason: "bad_range", rows: [] };
  if (!rowExists("drivers", driverId)) return { ok: false, reason: "driver_missing", rows: [] };
  const rows = getDb()
    .prepare(
      `${EVENT_SELECT}
       WHERE trailer_custody_events.driver_id = ?
         AND trailer_custody_events.from_at < ?
         AND (trailer_custody_events.to_at IS NULL OR trailer_custody_events.to_at > ?)
       ORDER BY trailer_custody_events.from_at DESC, trailer_custody_events.id DESC`,
    )
    .all(driverId, rangeEnd, rangeStart) as TrailerCustodyEvent[];
  return { ok: true, rows };
}

export function applyLoadCustody(input: {
  loadId: number;
  loadNumber: string;
  previous: CustodyHold | null;
  next: CustodyHold;
  at?: string;
}): void {
  const loadNumber = input.loadNumber.trim();
  if (!loadNumber) return;
  const at = atOrNow(input.at);
  const next = normalizeHold(input.next);
  const prev = input.previous ? normalizeHold(input.previous) : null;
  const nextIsDrop = DROP_STATUSES.has(next.status);
  const prevIsDrop = prev ? DROP_STATUSES.has(prev.status) : false;
  const enteredDrop = nextIsDrop && !prevIsDrop;
  const assignmentChanged =
    !prev ||
    prev.trailerId !== next.trailerId ||
    prev.driverId !== next.driverId ||
    prev.truckId !== next.truckId;
  const movedOffTrailer = Boolean(prev?.trailerId && assignmentChanged && prev.trailerId !== next.trailerId);

  if (prev?.trailerId && movedOffTrailer) {
    closeMatching(prev.trailerId, {
      at,
      loadNumber,
      driverId: prev.driverId,
    });
  }

  if (assignmentChanged && next.trailerId && !nextIsDrop) {
    openHold({
      trailerId: next.trailerId,
      driverId: next.driverId,
      truckId: next.truckId,
      loadNumber,
      at,
    });
  }

  if (enteredDrop && next.trailerId && !movedOffTrailer) {
    const where = dropWhere(next.status, input.loadId);
    closeMatching(next.trailerId, {
      at,
      loadNumber,
      driverId: prev?.driverId ?? next.driverId,
      leftWhere: where.leftWhere,
      leftName: where.leftName,
    });
  }
}

export function recordOfficeDrop(input: {
  trailerId: number;
  leftWhere: string;
  leftName?: string | null;
  loadNumber?: string | null;
  note?: string | null;
  at?: string;
}): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(input.trailerId) || input.trailerId <= 0 || !rowExists("trailers", input.trailerId)) {
    return { ok: false, error: "Trailer not found." };
  }
  const leftWhere = normalizeLeftWhere(input.leftWhere);
  if (!leftWhere) return { ok: false, error: "Pick where it was left." };
  const open = listOpen(input.trailerId)[0];
  if (!open) return { ok: false, error: "No open custody on this trailer." };
  const requestedLoad = blank(input.loadNumber);
  const openLoad = blank(open.load_number);
  if (requestedLoad && openLoad && requestedLoad !== openLoad) {
    return { ok: false, error: `Open custody is load ${openLoad}.` };
  }
  closeRow(open, {
    at: atOrNow(input.at),
    leftWhere,
    leftName: blank(input.leftName),
    note: blank(input.note),
    loadNumber: requestedLoad,
  });
  return { ok: true };
}

function openHold(input: {
  trailerId: number;
  driverId: number | null;
  truckId: number | null;
  loadNumber: string;
  at: string;
}): void {
  if (!rowExists("trailers", input.trailerId)) return;
  const driverId = input.driverId && rowExists("drivers", input.driverId) ? input.driverId : null;
  const truckId = input.truckId && rowExists("trucks", input.truckId) ? input.truckId : null;
  const opens = listOpen(input.trailerId);
  if (
    opens.length === 1 &&
    opens[0].driver_id === driverId &&
    opens[0].truck_id === truckId &&
    (opens[0].load_number ?? "").trim() === input.loadNumber
  ) {
    return;
  }
  for (const open of opens) closeRow(open, { at: input.at });
  getDb()
    .prepare(
      `INSERT INTO trailer_custody_events (
        trailer_id, driver_id, truck_id, from_at, to_at, left_where, left_name, load_number, note, source
      ) VALUES (?, ?, ?, ?, NULL, '', NULL, ?, NULL, ?)`,
    )
    .run(input.trailerId, driverId, truckId, input.at, input.loadNumber, ASSIGN_SOURCE);
}

function closeMatching(
  trailerId: number,
  input: {
    at: string;
    loadNumber: string;
    driverId: number | null;
    leftWhere?: string;
    leftName?: string | null;
  },
): void {
  for (const open of listOpen(trailerId)) {
    if (!matchesLoad(open, input.loadNumber) || !matchesDriver(open, input.driverId)) continue;
    closeRow(open, {
      at: input.at,
      leftWhere: input.leftWhere ?? "",
      leftName: input.leftName ?? null,
    });
  }
}

function closeRow(
  row: CustodyRow,
  patch: {
    at: string;
    leftWhere?: string;
    leftName?: string | null;
    note?: string | null;
    loadNumber?: string | null;
  },
): void {
  const leftWhere = row.left_where.trim() ? row.left_where : normalizeLeftWhere(patch.leftWhere ?? "");
  const leftName = blank(row.left_name) ?? patch.leftName ?? null;
  const note = blank(row.note) ?? patch.note ?? null;
  const loadNumber = blank(row.load_number) ?? patch.loadNumber ?? null;
  getDb()
    .prepare(
      `UPDATE trailer_custody_events
       SET to_at = ?, left_where = ?, left_name = ?, note = ?, load_number = ?
       WHERE id = ? AND to_at IS NULL`,
    )
    .run(patch.at, leftWhere, leftName, note, loadNumber, row.id);
}

function listOpen(trailerId: number): CustodyRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM trailer_custody_events
       WHERE trailer_id = ? AND to_at IS NULL
       ORDER BY id DESC`,
    )
    .all(trailerId) as CustodyRow[];
}

function matchesLoad(open: CustodyRow, loadNumber: string): boolean {
  const eventLoad = (open.load_number ?? "").trim();
  if (!loadNumber) return !eventLoad;
  if (!eventLoad) return true;
  return eventLoad === loadNumber;
}

function matchesDriver(open: CustodyRow, driverId: number | null): boolean {
  if (driverId == null) return open.driver_id == null;
  if (open.driver_id == null) return true;
  return open.driver_id === driverId;
}

function dropWhere(status: string, loadId: number): { leftWhere: string; leftName: string | null } {
  if (status !== "delivered" && status !== "completed") return { leftWhere: "", leftName: null };
  const name = consigneeName(loadId);
  if (!name) return { leftWhere: "", leftName: null };
  return { leftWhere: "receiver", leftName: name };
}

function consigneeName(loadId: number): string {
  if (!Number.isInteger(loadId) || loadId <= 0) return "";
  const row = getDb()
    .prepare(
      `SELECT TRIM(IFNULL(locations.name, '')) AS name
       FROM loads
       LEFT JOIN locations ON locations.id = loads.consignee_location_id
       WHERE loads.id = ?`,
    )
    .get(loadId) as { name: string } | undefined;
  return row?.name.trim() ?? "";
}

function normalizeHold(hold: CustodyHold): CustodyHold {
  return {
    trailerId: positiveId(hold.trailerId),
    driverId: positiveId(hold.driverId),
    truckId: positiveId(hold.truckId),
    status: hold.status.trim(),
  };
}

function normalizeLeftWhere(value: string): CustodyLeftWhere | "" {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return LEFT_WHERE_VALUES.has(trimmed) ? (trimmed as CustodyLeftWhere) : "";
}

function positiveId(value: number | null | undefined): number | null {
  if (value == null || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function blank(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function rowExists(table: "trailers" | "drivers" | "trucks", id: number): boolean {
  return Boolean(getDb().prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ?`).get(id));
}

function atOrNow(value?: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return new Date().toISOString();
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function utcDayStart(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString();
}

function utcDayEndExclusive(value: string): string | null {
  const start = utcDayStart(value);
  if (!start) return null;
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
