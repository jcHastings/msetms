import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { seedDatabase } from "./seed";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "tms.db");

let connection: Database.Database | null = null;
let connectedPath: string | null = null;

export function getDbPath(): string {
  return process.env.TMS_DB_PATH || DEFAULT_DB_PATH;
}

export function getDb(): Database.Database {
  const dbPath = getDbPath();
  if (connection && connectedPath === dbPath) {
    return connection;
  }
  if (connection) {
    connection.close();
    connection = null;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  const customerCount = db.prepare("SELECT COUNT(*) as count FROM customers").get() as {
    count: number;
  };
  if (customerCount.count === 0 && process.env.TMS_SKIP_SEED !== "1") {
    seedDatabase(db);
  } else {
    backfillDemoPins(db);
  }

  connection = db;
  connectedPath = dbPath;
  return db;
}

export function closeDb(): void {
  if (connection) {
    connection.close();
    connection = null;
    connectedPath = null;
  }
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      billing_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS trucks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      capacity_lbs INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      license TEXT NOT NULL DEFAULT '',
      truck_id INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      pickup_start TEXT NOT NULL,
      pickup_end TEXT NOT NULL,
      delivery_start TEXT NOT NULL,
      delivery_end TEXT NOT NULL,
      weight INTEGER,
      commodity TEXT NOT NULL DEFAULT '',
      rate REAL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'available',
      truck_id INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
      driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
    CREATE INDEX IF NOT EXISTS idx_loads_pickup ON loads(pickup_start);
    CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reefer_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER REFERENCES loads(id) ON DELETE CASCADE,
      truck_id INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
      trailer_id TEXT NOT NULL DEFAULT '',
      setpoint_f REAL,
      temperature_f REAL,
      door_open INTEGER,
      alarm TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'demo',
      recorded_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "trucks", "samsara_vehicle_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "trailer_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "pin", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "special_instructions", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "appointment_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "reference_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "po_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "reefer_setpoint_f", "REAL");
  ensureColumn(db, "loads", "trailer_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "driver_progress", "TEXT NOT NULL DEFAULT ''");
}

function backfillDemoPins(db: Database.Database): void {
  const pins: Record<string, string> = {
    "Marcus Hale": "1024",
    "Denise Ortega": "1125",
    "James Whitaker": "1186",
    "Cole Brennan": "2051",
    "Priya Shah": "1010",
    "Angela Ruiz": "1080",
    "Tyrell Brooks": "3000",
    "Sam Keene": "2100",
  };
  const update = db.prepare("UPDATE drivers SET pin = ? WHERE name = ? AND (pin IS NULL OR pin = '')");
  for (const [name, pin] of Object.entries(pins)) {
    update.run(pin, name);
  }
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
