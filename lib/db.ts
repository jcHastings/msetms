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
    backfillDemoDriverCompliance(db);
    backfillDemoRegistration(db);
    backfillDemoInboxExceptions(db);
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

    CREATE TABLE IF NOT EXISTS trailers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'reefer',
      orbcomm_asset_id TEXT NOT NULL DEFAULT '',
      registration_issued TEXT NOT NULL DEFAULT '',
      registration_expires TEXT NOT NULL DEFAULT '',
      dot_inspected_on TEXT NOT NULL DEFAULT '',
      dot_expires TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fleet_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL,
      dispatcher_name TEXT NOT NULL,
      dispatcher_phone TEXT NOT NULL,
      dispatcher_fax TEXT NOT NULL,
      dispatcher_email TEXT NOT NULL
    );

    INSERT OR IGNORE INTO company_profile (
      id, company_name, dispatcher_name, dispatcher_phone, dispatcher_fax, dispatcher_email
    ) VALUES (1, 'M&S Loads', 'Ana G', '402-302-0097', '', 'ana@msloads.com');

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
  ensureColumn(db, "trucks", "samsara_trailer_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "orbcomm_asset_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "trailer_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "pin", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "samsara_driver_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "special_instructions", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "appointment_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "reference_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "po_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "reefer_setpoint_f", "REAL");
  ensureColumn(db, "loads", "trailer_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "driver_progress", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "trailer_id", "INTEGER");
  ensureColumn(db, "loads", "oo_percent", "REAL");
  ensureColumn(db, "loads", "oo_pay", "REAL");
  ensureColumn(db, "trucks", "registration_issued", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "registration_expires", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "dot_inspected_on", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "dot_expires", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "license_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "license_state", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "license_expires", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "medical_issued", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "medical_expires", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "driver_type", "TEXT NOT NULL DEFAULT 'company_driver'");
  ensureColumn(db, "drivers", "pay_percent", "REAL");
  ensureColumn(db, "reefer_readings", "return_air_f", "REAL");
  ensureColumn(db, "reefer_readings", "supply_air_f", "REAL");
  ensureColumn(db, "reefer_readings", "latitude", "REAL");
  ensureColumn(db, "reefer_readings", "longitude", "REAL");
  ensureColumn(db, "reefer_readings", "address", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "qbo_invoice_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "qbo_invoice_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "qbo_sent_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "qbo_source", "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS ifta_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL UNIQUE REFERENCES loads(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      vehicle_id TEXT NOT NULL DEFAULT '',
      generated_at TEXT NOT NULL,
      window_start TEXT NOT NULL DEFAULT '',
      window_end TEXT NOT NULL DEFAULT '',
      total_miles REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      attachment_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS ifta_jurisdictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES ifta_reports(id) ON DELETE CASCADE,
      jurisdiction TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      miles REAL NOT NULL
    );
  `);
}

function isoDateOffset(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function backfillDemoDriverCompliance(db: Database.Database): void {
  const rows: Array<[string, string, string, string, string]> = [
    ["Denise Ortega", "772110", "TN", isoDateOffset(25), isoDateOffset(200)],
    ["Tyrell Brooks", "104552", "MS", isoDateOffset(400), isoDateOffset(-10)],
  ];
  const update = db.prepare(
    `UPDATE drivers
     SET license_number = CASE WHEN license_number = '' THEN ? ELSE license_number END,
         license_state = CASE WHEN license_state = '' THEN ? ELSE license_state END,
         license_expires = CASE WHEN license_expires = '' THEN ? ELSE license_expires END,
         medical_expires = CASE WHEN medical_expires = '' THEN ? ELSE medical_expires END
     WHERE name = ?`,
  );
  for (const [name, number, state, licenseExpires, medicalExpires] of rows) {
    update.run(number, state, licenseExpires, medicalExpires, name);
  }
}

function backfillDemoRegistration(db: Database.Database): void {
  db.prepare(
    `UPDATE trucks
     SET registration_issued = CASE WHEN registration_issued = '' THEN ? ELSE registration_issued END,
         registration_expires = CASE WHEN registration_expires = '' THEN ? ELSE registration_expires END
     WHERE unit_number = '210'`,
  ).run(isoDateOffset(-250), isoDateOffset(40));
  db.prepare(
    `UPDATE trailers
     SET registration_issued = CASE WHEN registration_issued = '' THEN ? ELSE registration_issued END,
         registration_expires = CASE WHEN registration_expires = '' THEN ? ELSE registration_expires END
     WHERE unit_number = 'TR-8801'`,
  ).run(isoDateOffset(-200), isoDateOffset(45));
  db.prepare(
    `UPDATE trucks
     SET dot_inspected_on = CASE WHEN dot_inspected_on = '' THEN ? ELSE dot_inspected_on END,
         dot_expires = CASE WHEN dot_expires = '' THEN ? ELSE dot_expires END
     WHERE unit_number = '108'`,
  ).run(isoDateOffset(-200), isoDateOffset(20));
}

/** Keep the exception inbox non-empty on existing demo databases. */
function backfillDemoInboxExceptions(db: Database.Database): void {
  const load1045 = db.prepare("SELECT id FROM loads WHERE load_number = 'MSE-1045'").get() as
    | { id: number }
    | undefined;
  if (load1045) {
    const excursion = db
      .prepare(
        `SELECT id FROM reefer_readings
         WHERE load_id = ? AND (temperature_f >= 40 OR alarm != '')
         LIMIT 1`,
      )
      .get(load1045.id) as { id: number } | undefined;
    if (!excursion) {
      const truck = db.prepare("SELECT id FROM trucks WHERE unit_number = '112'").get() as
        | { id: number }
        | undefined;
      const recorded = new Date();
      recorded.setMinutes(recorded.getMinutes() - 20);
      db.prepare(
        `INSERT INTO reefer_readings (
          load_id, truck_id, trailer_id, setpoint_f, temperature_f, return_air_f, supply_air_f,
          door_open, alarm, latitude, longitude, address, source, recorded_at
        ) VALUES (?, ?, 'TR-7742', 34, 48.6, 47.8, 46.2, 0, 'HIGH TEMP', 32.7791, -96.8002, 'Dallas, TX', 'demo', ?)`,
      ).run(load1045.id, truck?.id ?? null, recorded.toISOString());
    }
  }

  const load1046 = db
    .prepare("SELECT id, delivery_end, status FROM loads WHERE load_number = 'MSE-1046'")
    .get() as { id: number; delivery_end: string; status: string } | undefined;
  if (load1046?.status === "in_transit") {
    const end = new Date(load1046.delivery_end);
    if (!Number.isNaN(end.getTime()) && end.getTime() > Date.now()) {
      const lateEnd = new Date();
      lateEnd.setDate(lateEnd.getDate() - 1);
      lateEnd.setHours(12, 0, 0, 0);
      const lateStart = new Date(lateEnd);
      lateStart.setHours(8, 0, 0, 0);
      db.prepare("UPDATE loads SET delivery_start = ?, delivery_end = ? WHERE id = ?").run(
        lateStart.toISOString(),
        lateEnd.toISOString(),
        load1046.id,
      );
    }
  }
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
