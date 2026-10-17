import { getDb } from "./db";
import {
  fuelCardAliasKey,
  fuelCardNameMatchesDriver,
  isMoneyCodeCategory,
  type FuelCardAlias,
  type FuelMatchContext,
  type FuelTruckAssignment,
} from "./fuel";
import { extractNProductDriverName } from "./fuel-fleetone";
import { listDrivers } from "./queries";

export type DriverCardAlias = {
  id: number;
  driverId: number;
  alias: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function requireAliasKey(alias: string): string {
  const key = fuelCardAliasKey(alias);
  if (!key) throw new Error("Enter a card name.");
  return key;
}

function requireDriver(driverId: number): void {
  const driver = listDrivers().find((item) => item.id === driverId);
  if (!driver) throw new Error("Pick a driver.");
}

export function listDriverCardAliases(driverId?: number): DriverCardAlias[] {
  const rows = (
    driverId
      ? getDb()
          .prepare(
            `SELECT id, driver_id, alias FROM driver_card_aliases
             WHERE driver_id = ? ORDER BY alias COLLATE NOCASE, id`,
          )
          .all(driverId)
      : getDb()
          .prepare(`SELECT id, driver_id, alias FROM driver_card_aliases ORDER BY alias COLLATE NOCASE, id`)
          .all()
  ) as Array<{ id: number; driver_id: number; alias: string }>;
  return rows.map((row) => ({ id: row.id, driverId: row.driver_id, alias: row.alias }));
}

export function listFuelCardAliases(): FuelCardAlias[] {
  return listDriverCardAliases().map((row) => ({ driverId: row.driverId, alias: row.alias }));
}

export function addDriverCardAlias(driverId: number, alias: string): number {
  requireDriver(driverId);
  const key = requireAliasKey(alias);
  const trimmed = alias.trim();
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO driver_card_aliases (driver_id, alias, alias_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(driverId, trimmed, key, nowIso(), nowIso());
    return Number(result.lastInsertRowid);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new Error("That card name is already saved.");
    throw error;
  }
}

export function updateDriverCardAlias(id: number, alias: string): void {
  const existing = getDb().prepare("SELECT id, driver_id FROM driver_card_aliases WHERE id = ?").get(id) as
    | { id: number; driver_id: number }
    | undefined;
  if (!existing) throw new Error("Card name is missing.");
  const key = requireAliasKey(alias);
  try {
    getDb()
      .prepare("UPDATE driver_card_aliases SET alias = ?, alias_key = ?, updated_at = ? WHERE id = ?")
      .run(alias.trim(), key, nowIso(), id);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new Error("That card name is already saved.");
    throw error;
  }
}

export function deleteDriverCardAlias(id: number): void {
  const result = getDb().prepare("DELETE FROM driver_card_aliases WHERE id = ?").run(id);
  if (!result.changes) throw new Error("Card name is missing.");
}

export function listTruckDriverAssignments(): FuelTruckAssignment[] {
  const rows = getDb()
    .prepare("SELECT truck_id, driver_id FROM truck_driver_assignments ORDER BY truck_id")
    .all() as Array<{ truck_id: number; driver_id: number }>;
  return rows.map((row) => ({ truckId: row.truck_id, driverId: row.driver_id }));
}

export function listFuelBackupDriverIds(): number[] {
  const rows = getDb().prepare("SELECT id FROM drivers WHERE fuel_backup = 1").all() as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

export function setFuelBackupDriver(driverId: number, backup: boolean): void {
  requireDriver(driverId);
  getDb().prepare("UPDATE drivers SET fuel_backup = ?, updated_at = ? WHERE id = ?").run(backup ? 1 : 0, nowIso(), driverId);
  if (backup) {
    getDb().prepare("DELETE FROM truck_driver_assignments WHERE driver_id = ?").run(driverId);
  }
}

/** One driver, one truck. A backup driver is never stored here. */
export function setTruckDriverAssignment(truckId: number, driverId: number | null): void {
  const truck = getDb().prepare("SELECT id FROM trucks WHERE id = ?").get(truckId) as { id: number } | undefined;
  if (!truck) throw new Error("Truck not found.");
  const db = getDb();
  if (driverId == null) {
    db.prepare("DELETE FROM truck_driver_assignments WHERE truck_id = ?").run(truckId);
    return;
  }
  requireDriver(driverId);
  const backup = db.prepare("SELECT fuel_backup FROM drivers WHERE id = ?").get(driverId) as
    | { fuel_backup: number }
    | undefined;
  if (backup?.fuel_backup) throw new Error("A backup driver is not assigned to a truck.");
  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare("DELETE FROM truck_driver_assignments WHERE truck_id = ? OR driver_id = ?").run(truckId, driverId);
    db.prepare(
      "INSERT INTO truck_driver_assignments (truck_id, driver_id, updated_at) VALUES (?, ?, ?)",
    ).run(truckId, driverId, timestamp);
  })();
}

export function fuelMatchContext(): FuelMatchContext {
  return {
    aliases: listFuelCardAliases(),
    assignments: listTruckDriverAssignments(),
    backupDriverIds: listFuelBackupDriverIds(),
  };
}

function cardNameFromRow(row: { driver_name_raw: string; prompt_data: string }): string {
  return (
    extractNProductDriverName(row.driver_name_raw) ||
    row.driver_name_raw.trim() ||
    extractNProductDriverName(row.prompt_data)
  );
}

/** Card names that hit neither an alias nor a cleaned driver name. */
export function listNewFuelCardNames(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT driver_name_raw, prompt_data, category FROM fuel_transactions
       WHERE TRIM(IFNULL(driver_name_raw, '')) != '' OR TRIM(IFNULL(prompt_data, '')) != ''`,
    )
    .all() as Array<{ driver_name_raw: string; prompt_data: string; category: string }>;
  const drivers = listDrivers();
  const aliases = listFuelCardAliases();
  const names = new Set<string>();
  for (const row of rows) {
    if (isMoneyCodeCategory(row.category)) continue;
    const name = cardNameFromRow(row).trim();
    if (!fuelCardAliasKey(name)) continue;
    if (fuelCardNameMatchesDriver(name, drivers, aliases)) continue;
    names.add(name);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}
