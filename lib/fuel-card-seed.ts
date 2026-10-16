import fs from "node:fs";
import type { Database } from "./sqlite";
import { fuelCardAliasKey, normalizeUnit } from "./fuel";

/**
 * Schema for fuel card aliases and the one truck assignment list.
 * Live names are not stored here. Apply them with scripts/seed-fuel-card-directory.ts
 * from a file that stays off git. data/fuel-card-directory.example.json is a fictional sample.
 */
export type FuelCardDirectory = {
  aliases: Array<{ driver: string; aliases: string[] }>;
  assignments: Array<{ unit: string; driver: string }>;
  backupDrivers: string[];
  blockedDrivers: string[];
};

export type FuelCardDirectoryResult = {
  aliasesInserted: number;
  assignmentsSet: number;
  backupsMarked: number;
  blockedCleared: number;
  missingDrivers: string[];
  missingTrucks: string[];
};

type NameRow = { id: number; name: string };
type TruckRow = { id: number; unit_number: string };

function nameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findDriver(drivers: NameRow[], name: string): NameRow | undefined {
  const want = nameKey(name);
  return drivers.find((driver) => nameKey(driver.name) === want);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function readFuelCardDirectory(filePath: string): FuelCardDirectory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that file.";
    throw new Error(`Could not read the fuel card directory: ${message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The fuel card directory must be a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  const aliases = requireArray(record.aliases, "aliases").map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`aliases[${index}] must be an object.`);
    const row = entry as Record<string, unknown>;
    return {
      driver: requireText(row.driver, `aliases[${index}].driver`),
      aliases: requireArray(row.aliases, `aliases[${index}].aliases`).map((alias, aliasIndex) =>
        requireText(alias, `aliases[${index}].aliases[${aliasIndex}]`),
      ),
    };
  });
  const assignments = requireArray(record.assignments, "assignments").map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`assignments[${index}] must be an object.`);
    const row = entry as Record<string, unknown>;
    return {
      unit: requireText(row.unit, `assignments[${index}].unit`),
      driver: requireText(row.driver, `assignments[${index}].driver`),
    };
  });
  const backupDrivers = requireArray(record.backupDrivers, "backupDrivers").map((name, index) =>
    requireText(name, `backupDrivers[${index}]`),
  );
  const blockedDrivers = requireArray(record.blockedDrivers, "blockedDrivers").map((name, index) =>
    requireText(name, `blockedDrivers[${index}]`),
  );
  return { aliases, assignments, backupDrivers, blockedDrivers };
}

export function ensureFuelCardTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS driver_card_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      alias_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_driver_card_aliases_driver ON driver_card_aliases(driver_id);
    CREATE TABLE IF NOT EXISTS truck_driver_assignments (
      truck_id INTEGER PRIMARY KEY REFERENCES trucks(id) ON DELETE CASCADE,
      driver_id INTEGER NOT NULL UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
      updated_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare("PRAGMA table_info(drivers)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "fuel_backup")) {
    db.exec("ALTER TABLE drivers ADD COLUMN fuel_backup INTEGER NOT NULL DEFAULT 0");
  }
}

export function applyFuelCardDirectory(
  db: Database,
  directory: FuelCardDirectory,
  options: { write: boolean },
): FuelCardDirectoryResult {
  ensureFuelCardTables(db);
  const drivers = db.prepare("SELECT id, name FROM drivers").all() as NameRow[];
  const trucks = db.prepare("SELECT id, unit_number FROM trucks").all() as TruckRow[];
  const missingDrivers: string[] = [];
  const missingTrucks: string[] = [];
  const timestamp = new Date().toISOString();
  let aliasesInserted = 0;
  let assignmentsSet = 0;
  let backupsMarked = 0;
  let blockedCleared = 0;

  const noteMissingDriver = (name: string) => {
    if (!missingDrivers.includes(name)) missingDrivers.push(name);
  };

  if (options.write) {
    const insertAlias = db.prepare(
      `INSERT INTO driver_card_aliases (driver_id, alias, alias_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(alias_key) DO NOTHING`,
    );
    for (const group of directory.aliases) {
      const driver = findDriver(drivers, group.driver);
      if (!driver) {
        noteMissingDriver(group.driver);
        continue;
      }
      for (const alias of group.aliases) {
        const key = fuelCardAliasKey(alias);
        if (!key) continue;
        aliasesInserted += insertAlias.run(driver.id, alias.trim(), key, timestamp, timestamp).changes;
      }
    }

    const markBackup = db.prepare("UPDATE drivers SET fuel_backup = 1 WHERE id = ? AND fuel_backup = 0");
    const clearAssignment = db.prepare("DELETE FROM truck_driver_assignments WHERE driver_id = ?");
    for (const name of directory.backupDrivers) {
      const driver = findDriver(drivers, name);
      if (!driver) {
        noteMissingDriver(name);
        continue;
      }
      backupsMarked += markBackup.run(driver.id).changes;
      clearAssignment.run(driver.id);
    }

    for (const name of directory.blockedDrivers) {
      const driver = findDriver(drivers, name);
      if (!driver) {
        noteMissingDriver(name);
        continue;
      }
      blockedCleared += clearAssignment.run(driver.id).changes;
    }

    const blocked = new Set(directory.blockedDrivers.map(nameKey));
    const upsert = db.prepare(
      `INSERT INTO truck_driver_assignments (truck_id, driver_id, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(truck_id) DO UPDATE SET driver_id = excluded.driver_id, updated_at = excluded.updated_at`,
    );
    for (const pair of directory.assignments) {
      const driver = findDriver(drivers, pair.driver);
      const truck = trucks.find((item) => normalizeUnit(item.unit_number) === normalizeUnit(pair.unit));
      if (!driver) noteMissingDriver(pair.driver);
      if (!truck && !missingTrucks.includes(pair.unit)) missingTrucks.push(pair.unit);
      if (!driver || !truck) continue;
      if (blocked.has(nameKey(driver.name))) continue;
      const backup = db.prepare("SELECT fuel_backup FROM drivers WHERE id = ?").get(driver.id) as
        | { fuel_backup: number }
        | undefined;
      if (backup?.fuel_backup) continue;
      db.prepare("DELETE FROM truck_driver_assignments WHERE driver_id = ? AND truck_id != ?").run(driver.id, truck.id);
      assignmentsSet += upsert.run(truck.id, driver.id, timestamp).changes;
    }
  } else {
    for (const group of directory.aliases) {
      if (!findDriver(drivers, group.driver)) noteMissingDriver(group.driver);
    }
    for (const name of [...directory.backupDrivers, ...directory.blockedDrivers]) {
      if (!findDriver(drivers, name)) noteMissingDriver(name);
    }
    for (const pair of directory.assignments) {
      if (!findDriver(drivers, pair.driver)) noteMissingDriver(pair.driver);
      const truck = trucks.find((item) => normalizeUnit(item.unit_number) === normalizeUnit(pair.unit));
      if (!truck && !missingTrucks.includes(pair.unit)) missingTrucks.push(pair.unit);
    }
  }

  return { aliasesInserted, assignmentsSet, backupsMarked, blockedCleared, missingDrivers, missingTrucks };
}
