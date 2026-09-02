import fs from "node:fs";
import path from "node:path";
import {
  BOL_TERMS,
  CUSTOMER_CONFIRMATION_TERMS,
  DRIVER_CONFIRMATION_TERMS,
  shouldReplaceStoredTerms,
} from "./document-copy";
import { Database } from "./sqlite";
import { seedDatabase, seedDemoLocations } from "./seed";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "tms.db");

let connection: Database | null = null;
let connectedPath: string | null = null;

export function getDbPath(): string {
  return process.env.TMS_DB_PATH || DEFAULT_DB_PATH;
}

/** Project `data/` (or dirname of TMS_DB_PATH). Standalone cwd is `.next/standalone`. */
export function getDataDir(): string {
  if (process.env.TMS_DATA_DIR) return process.env.TMS_DATA_DIR;
  if (process.env.TMS_DB_PATH) return path.dirname(process.env.TMS_DB_PATH);
  return path.join(process.cwd(), "data");
}

export function getDb(): Database {
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
  const driverCount = db.prepare("SELECT COUNT(*) as count FROM drivers").get() as {
    count: number;
  };
  if (customerCount.count === 0 && driverCount.count === 0 && process.env.TMS_SKIP_SEED !== "1") {
    seedDatabase(db);
  } else {
    backfillDemoRegistration(db);
    backfillDemoTruckDetails(db);
    backfillDemoInboxExceptions(db);
    backfillDemoLocations(db);
  }
  backfillDemoAccounting(db);
  backfillSampleLoads(db);
  backfillLoadNumbering(db);
  backfillCustomerMainEmail(db);

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

export function migrate(db: Database): void {
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
      type TEXT NOT NULL DEFAULT 'reefer',
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
    ) VALUES (1, 'M&S Loads', 'MS Test', '402-302-0097', '', 'ana@msloads.com');

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
  ensureColumn(db, "trucks", "gps_latitude", "REAL");
  ensureColumn(db, "trucks", "gps_longitude", "REAL");
  ensureColumn(db, "trucks", "gps_address", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "gps_recorded_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "gps_source", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "gps_speed_mph", "REAL");
  ensureColumn(db, "trucks", "gps_heading_deg", "REAL");
  ensureColumn(db, "trucks", "gps_engine_on", "INTEGER");
  ensureColumn(db, "trucks", "orbcomm_asset_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "trailer_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "pin", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "samsara_driver_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "special_instructions", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "appointment_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "reference_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "po_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "reefer_setpoint_f", "REAL");
  ensureColumn(db, "loads", "reefer_mode", "TEXT NOT NULL DEFAULT ''");
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
  ensureColumn(db, "reefer_readings", "operating_mode", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "reefer_readings", "speed_mph", "REAL");
  ensureColumn(db, "reefer_readings", "heading_deg", "REAL");
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

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      street TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      zip TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'both',
      scheduling_type TEXT NOT NULL DEFAULT 'fcfs',
      hours TEXT NOT NULL DEFAULT '',
      scheduling_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      columns_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "loads", "shipper_location_id", "INTEGER");
  ensureColumn(db, "loads", "consignee_location_id", "INTEGER");
  ensureColumn(db, "loads", "status_reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "cancel_reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "cover_by", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "equipment", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "hazmat", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "commodity_class", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "seal_numbers", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "pallet_count", "INTEGER");
  ensureColumn(db, "loads", "case_count", "INTEGER");
  ensureColumn(db, "loads", "team", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "lumper_expected", "REAL");
  ensureColumn(db, "loads", "lumper_actual", "REAL");
  ensureColumn(db, "loads", "detention_started_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "detention_ended_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "appointment_confirmation", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "unload_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "watched", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "cloned_from_id", "INTEGER");
  ensureColumn(db, "loads", "invoice_paid", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "dispatcher_id", "INTEGER");
  ensureColumn(db, "loads", "docs_requested", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "docs_requested_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "ready_to_invoice", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "accounting_desk", "TEXT NOT NULL DEFAULT 'operations'");
  ensureColumn(db, "loads", "accounting_return_status", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "accounting_sent_at", "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS qbo_item_maps (
      category TEXT PRIMARY KEY,
      qbo_item_id TEXT NOT NULL DEFAULT '',
      qbo_item_name TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS qbo_vendor_maps (
      payee TEXT PRIMARY KEY,
      qbo_vendor_id TEXT NOT NULL DEFAULT '',
      qbo_vendor_name TEXT NOT NULL DEFAULT ''
    );
  `);
  ensureColumn(db, "loads", "truck_status", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "branch", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "declared_value", "REAL");
  ensureColumn(db, "loads", "load_size", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "condition_new_used", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "equipment_length", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "temperature_f", "REAL");
  ensureColumn(db, "loads", "temp_low_f", "REAL");
  ensureColumn(db, "loads", "temp_high_f", "REAL");
  ensureColumn(db, "loads", "temp_time_tolerance", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "container_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "last_free_day", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "public_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "posting_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "contact_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "contact_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "contact_phone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "contact_ext", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "customer_reference", "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS load_pay_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      side TEXT NOT NULL,
      bill_to TEXT NOT NULL,
      payee TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      rate REAL,
      qty REAL,
      total REAL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_load_pay_items_load ON load_pay_items(load_id, side);
  `);
  ensureColumn(db, "customers", "credit_hold", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "customers", "payment_terms", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "customers", "qbo_customer_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "customers", "qbo_status", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "customers", "main_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "customers", "billing_email", "TEXT NOT NULL DEFAULT ''");
  backfillCustomerMainEmail(db);
  ensureColumn(db, "trucks", "vin", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "plate", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "plate_state", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "year", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "make", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "model", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trucks", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "drivers", "email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "drivers", "alt_phone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "cell_phone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "pager", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "address", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "country", "TEXT NOT NULL DEFAULT 'USA'");
  ensureColumn(db, "drivers", "city", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "state", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "postal_zip", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "date_of_birth", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "date_of_hire", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "drug_test_last", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "drug_test_next", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "termination_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drivers", "cdl_endorsements", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trailers", "vin", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trailers", "plate", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trailers", "truck_id", "INTEGER");
  ensureColumn(db, "trailers", "notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trailers", "reefer_setpoint_f", "REAL");
  ensureColumn(db, "trailers", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "trailers", "gps_latitude", "REAL");
  ensureColumn(db, "trailers", "gps_longitude", "REAL");
  ensureColumn(db, "trailers", "gps_address", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trailers", "gps_recorded_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trailers", "gps_source", "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS load_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      location_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      window_start TEXT NOT NULL DEFAULT '',
      window_end TEXT NOT NULL DEFAULT '',
      confirmation TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS load_pay_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      side TEXT NOT NULL,
      bill_to TEXT NOT NULL,
      payee TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      rate REAL,
      qty REAL,
      total REAL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_load_pay_items_load ON load_pay_items(load_id, side);
  `);

  ensureColumn(db, "load_stops", "street", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "zip", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "phone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "cargo", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "reference", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "instructions", "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS load_relays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      pickup TEXT NOT NULL DEFAULT '',
      delivery TEXT NOT NULL DEFAULT '',
      from_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      truck_id INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
      trailer_id INTEGER REFERENCES trailers(id) ON DELETE SET NULL,
      oo_percent REAL,
      oo_pay REAL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_load_relays_load ON load_relays(load_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_load_relays_driver ON load_relays(driver_id);
  `);
  ensureColumn(db, "load_relays", "from_driver_id", "INTEGER");
  ensureColumn(db, "load_relays", "from_leg_miles", "REAL");
  ensureColumn(db, "load_relays", "to_leg_miles", "REAL");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_load_relays_from_driver ON load_relays(from_driver_id);`);
  db.exec(`

    CREATE TABLE IF NOT EXISTS load_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      customer_id INTEGER,
      origin TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '',
      commodity TEXT NOT NULL DEFAULT '',
      weight INTEGER,
      rate REAL,
      notes TEXT NOT NULL DEFAULT '',
      special_instructions TEXT NOT NULL DEFAULT '',
      appointment_notes TEXT NOT NULL DEFAULT '',
      equipment TEXT NOT NULL DEFAULT '',
      reefer_setpoint_f REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      load_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      load_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      paid_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dispatchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'dispatcher'
    );

    CREATE TABLE IF NOT EXISTS exception_states (
      exception_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      until TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS desk_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      handoff_note TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO desk_state (id, handoff_note) VALUES (1, '');

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      claim_number TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'osd',
      status TEXT NOT NULL DEFAULT 'open',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL DEFAULT 'dispatcher',
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS load_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL,
      load_number TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL,
      actor_kind TEXT NOT NULL DEFAULT 'dispatcher',
      action TEXT NOT NULL,
      field TEXT NOT NULL DEFAULT '',
      old_value TEXT NOT NULL DEFAULT '',
      new_value TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_load_audit_load ON load_audit(load_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_load_audit_actor ON load_audit(actor, created_at);

    CREATE TABLE IF NOT EXISTS dropdown_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(kind, value)
    );

    CREATE TABLE IF NOT EXISTS document_defaults (
      doc_type TEXT PRIMARY KEY,
      header_text TEXT NOT NULL DEFAULT '',
      footer_text TEXT NOT NULL DEFAULT '',
      terms_text TEXT NOT NULL DEFAULT '',
      font_size INTEGER NOT NULL DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS fuel_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      truck_id INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
      location TEXT NOT NULL DEFAULT '',
      gallons REAL,
      price_per_gallon REAL,
      amount REAL,
      card_last4 TEXT NOT NULL DEFAULT '',
      source_file TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      unit_number TEXT NOT NULL DEFAULT '',
      driver_name_raw TEXT NOT NULL DEFAULT '',
      invoice_number TEXT NOT NULL DEFAULT '',
      prompt_data TEXT NOT NULL DEFAULT '',
      dedup_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fuel_driver ON fuel_transactions(driver_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_fuel_occurred ON fuel_transactions(occurred_at);
    CREATE TABLE IF NOT EXISTS fuel_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
      fuel_transaction_id INTEGER REFERENCES fuel_transactions(id) ON DELETE SET NULL,
      occurred_at TEXT NOT NULL DEFAULT '',
      gallons REAL,
      state TEXT NOT NULL DEFAULT '',
      station TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fuel_receipts_load ON fuel_receipts(load_id);
    CREATE TABLE IF NOT EXISTS fuel_week_reports (
      week_start_ymd TEXT PRIMARY KEY,
      week_end_ymd TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      driver_rollups_json TEXT NOT NULL DEFAULT '[]',
      truck_rollups_json TEXT NOT NULL DEFAULT '[]',
      tx_count INTEGER NOT NULL DEFAULT 0,
      saved_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      outcome TEXT NOT NULL,
      step TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_audit_created ON login_audit(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_login_audit_user ON login_audit(user_name, created_at DESC);
  `);

  for (const [column, definition] of [
    ["street", "TEXT NOT NULL DEFAULT ''"],
    ["city", "TEXT NOT NULL DEFAULT ''"],
    ["state", "TEXT NOT NULL DEFAULT ''"],
    ["zip", "TEXT NOT NULL DEFAULT ''"],
    ["insurance_provider", "TEXT NOT NULL DEFAULT ''"],
    ["insurance_policy", "TEXT NOT NULL DEFAULT ''"],
    ["insurance_coverage", "TEXT NOT NULL DEFAULT ''"],
    ["insurance_expires", "TEXT NOT NULL DEFAULT ''"],
    ["logo_stored_name", "TEXT NOT NULL DEFAULT ''"],
    ["logo_original_name", "TEXT NOT NULL DEFAULT ''"],
    ["logo_mime_type", "TEXT NOT NULL DEFAULT ''"],
    ["currency", "TEXT NOT NULL DEFAULT 'USD'"],
    ["weight_unit", "TEXT NOT NULL DEFAULT 'lb'"],
    ["tax_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["tax_kind", "TEXT NOT NULL DEFAULT 'sales_tax'"],
    ["tax_rate", "REAL NOT NULL DEFAULT 0"],
    ["alert_driver_days", "INTEGER NOT NULL DEFAULT 30"],
    ["alert_registration_days", "INTEGER NOT NULL DEFAULT 60"],
    ["alert_dot_days", "INTEGER NOT NULL DEFAULT 30"],
    ["alert_emails_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["default_routing_notes", "TEXT NOT NULL DEFAULT ''"],
    ["default_oo_percent", "REAL NOT NULL DEFAULT 75"],
    ["default_gross_margin_percent", "REAL NOT NULL DEFAULT 18"],
    ["carrier_pay_method", "TEXT NOT NULL DEFAULT 'ach'"],
    ["carrier_pay_notes", "TEXT NOT NULL DEFAULT ''"],
    ["load_number_prefix", "TEXT NOT NULL DEFAULT 'MSE'"],
    ["load_number_next", "INTEGER NOT NULL DEFAULT 1001"],
    ["show_sample_data", "INTEGER NOT NULL DEFAULT 1"],
    ["require_dispatcher_2fa", "INTEGER NOT NULL DEFAULT 1"],
    ["email_otp_shipped", "INTEGER NOT NULL DEFAULT 0"],
    ["password_change_gate_shipped", "INTEGER NOT NULL DEFAULT 0"],
    ["alert_gps_quiet_hours", "REAL NOT NULL DEFAULT 2"],
    ["document_font_family", "TEXT NOT NULL DEFAULT 'helvetica'"],
    ["document_font_scale", "INTEGER NOT NULL DEFAULT 100"],
    ["workflow_json", "TEXT NOT NULL DEFAULT ''"],
    ["invoice_email_body", "TEXT NOT NULL DEFAULT ''"],
  ] as const) {
    ensureColumn(db, "company_profile", column, definition);
  }
  db.prepare(
    `UPDATE company_profile
     SET street = '600 E 39th St',
         city = 'Hastings',
         state = CASE WHEN trim(state) = '' THEN 'NE' ELSE state END,
         zip = CASE WHEN trim(zip) = '' THEN '68901' ELSE zip END
     WHERE id = 1 AND trim(street) = '' AND trim(city) = ''`,
  ).run();

  ensureColumn(db, "bills", "qbo_bill_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "dispatchers", "email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "dispatchers", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "dispatchers", "permission_group", "TEXT NOT NULL DEFAULT 'all'");
  ensureColumn(db, "dispatchers", "totp_secret", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "dispatchers", "totp_pending_secret", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "dispatchers", "totp_enrolled", "INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE TABLE IF NOT EXISTS dispatcher_totp_recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatcher_id INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_totp_recovery_dispatcher
      ON dispatcher_totp_recovery_codes(dispatcher_id, used_at);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS dispatcher_email_otp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatcher_id INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_email_otp_dispatcher
      ON dispatcher_email_otp(dispatcher_id, used_at);
    CREATE TABLE IF NOT EXISTS dispatcher_trusted_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatcher_id INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_dispatcher
      ON dispatcher_trusted_devices(dispatcher_id, expires_at);
  `);
  ensureColumn(db, "dispatchers", "password_hash", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "dispatchers", "phone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "dispatchers", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "company_profile", "password_change_gate_shipped", "INTEGER NOT NULL DEFAULT 0");
  const changeGate = db.prepare("SELECT password_change_gate_shipped AS shipped FROM company_profile WHERE id = 1").get() as
    | { shipped?: number }
    | undefined;
  if (!Number(changeGate?.shipped)) {
    db.prepare(
      "UPDATE dispatchers SET must_change_password = 1 WHERE length(trim(password_hash)) > 0",
    ).run();
    db.prepare("UPDATE company_profile SET password_change_gate_shipped = 1 WHERE id = 1").run();
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS dispatcher_password_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatcher_id INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_history_dispatcher
      ON dispatcher_password_history(dispatcher_id);
    CREATE TABLE IF NOT EXISTS dispatcher_password_reset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatcher_id INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_token
      ON dispatcher_password_reset(token_hash, used_at);
    CREATE TABLE IF NOT EXISTS dispatcher_password_sms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatcher_id INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_password_sms_dispatcher
      ON dispatcher_password_sms(dispatcher_id, used_at);
  `);
  const otpShip = db.prepare("SELECT email_otp_shipped AS shipped FROM company_profile WHERE id = 1").get() as
    | { shipped?: number }
    | undefined;
  if (!Number(otpShip?.shipped)) {
    db.prepare("UPDATE company_profile SET require_dispatcher_2fa = 1, email_otp_shipped = 1 WHERE id = 1").run();
  }
  ensureColumn(db, "loads", "is_sample", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "route_miles", "REAL");
  ensureColumn(db, "locations", "call_before", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "load_pay_items", "paid_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_templates", "reefer_mode", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_templates", "public_notes", "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS load_template_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES load_templates(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      location_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      street TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      zip TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );
  `);
  ensureColumn(db, "loads", "route_leg_miles", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "route_state_miles", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "route_calculated_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "route_source", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "route_polyline", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "empty_miles", "REAL");
  ensureColumn(db, "loads", "empty_state_miles", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "empty_from", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "empty_to", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "empty_calculated_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "empty_source", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "empty_polyline", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "tms_invoice_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "tms_invoice_at", "TEXT NOT NULL DEFAULT ''");
  db.prepare("UPDATE dispatchers SET name = 'MS Test' WHERE name = 'Ana G' AND pin = '4020'").run();
  db.prepare("UPDATE company_profile SET dispatcher_name = 'MS Test' WHERE id = 1 AND dispatcher_name = 'Ana G'").run();
  db.prepare("UPDATE dispatchers SET pin = '' WHERE pin != ''").run();
  ensureColumn(db, "locations", "latitude", "REAL");
  ensureColumn(db, "locations", "longitude", "REAL");
  ensureColumn(db, "locations", "google_place_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "fuel_transactions", "invoice_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "fuel_transactions", "prompt_data", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "fuel_transactions", "load_id", "INTEGER");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fuel_import_sources (
      source_file TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "loads", "non_revenue", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "loads", "bol_json", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "parent_load_id", "INTEGER");
  ensureColumn(db, "loads", "master_suffix", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "loads", "is_master", "INTEGER NOT NULL DEFAULT 0");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loads_parent ON loads(parent_load_id);`);
  ensureColumn(db, "drivers", "division", "TEXT NOT NULL DEFAULT 'MSE'");
  ensureColumn(db, "trucks", "division", "TEXT NOT NULL DEFAULT 'MSE'");
  ensureColumn(db, "trailers", "division", "TEXT NOT NULL DEFAULT 'MSE'");
  ensureColumn(db, "drivers", "last_trailer_id", "INTEGER");
  ensureColumn(db, "drivers", "company_name", "TEXT NOT NULL DEFAULT ''");
  db.prepare(
    "UPDATE drivers SET company_name = 'Brennan Trucking' WHERE name = 'Cole Brennan' AND driver_type = 'owner_operator' AND company_name = ''",
  ).run();
  db.prepare(
    "UPDATE drivers SET company_name = 'Keene Transport' WHERE name = 'Sam Keene' AND driver_type = 'owner_operator' AND company_name = ''",
  ).run();
  ensureColumn(db, "load_stops", "arrived_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "departed_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "schedule_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "load_stops", "delivered", "INTEGER NOT NULL DEFAULT 0");
  db.prepare(
    `UPDATE trucks SET type = 'sleeper' WHERE type NOT IN ('sleeper', 'day_cab')`,
  ).run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS truck_odometer_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      truck_id INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      miles REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'samsara',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_truck_odometer_truck_time
      ON truck_odometer_readings(truck_id, recorded_at);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS truck_gps_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      truck_id INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      address TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'samsara'
    );
    CREATE INDEX IF NOT EXISTS idx_truck_gps_truck_time
      ON truck_gps_readings(truck_id, recorded_at);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sent_mail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sent_mail_load ON sent_mail(load_id, kind, id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger_key TEXT NOT NULL,
      recipient_ids TEXT NOT NULL DEFAULT '[]',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alert_rule_fires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      subject_key TEXT NOT NULL,
      expires_on TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(rule_id, subject_key, expires_on)
    );
    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatcher_id INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
      rule_id INTEGER REFERENCES alert_rules(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      href TEXT NOT NULL DEFAULT '',
      read_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user
      ON user_notifications(dispatcher_id, id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS trailer_share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      trailer_id INTEGER NOT NULL REFERENCES trailers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      snapshot_latitude REAL,
      snapshot_longitude REAL,
      snapshot_address TEXT NOT NULL DEFAULT '',
      snapshot_temperature_f REAL,
      snapshot_setpoint_f REAL,
      snapshot_recorded_at TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trailer_share_token ON trailer_share_links(token);
    CREATE INDEX IF NOT EXISTS idx_trailer_share_trailer ON trailer_share_links(trailer_id, id DESC);
  `);
  ensureColumn(db, "trailer_share_links", "snapshot_latitude", "REAL");
  ensureColumn(db, "trailer_share_links", "snapshot_longitude", "REAL");
  ensureColumn(db, "trailer_share_links", "snapshot_address", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "trailer_share_links", "snapshot_temperature_f", "REAL");
  ensureColumn(db, "trailer_share_links", "snapshot_setpoint_f", "REAL");
  ensureColumn(db, "trailer_share_links", "snapshot_recorded_at", "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS load_share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_load_share_token ON load_share_links(token);
    CREATE INDEX IF NOT EXISTS idx_load_share_load ON load_share_links(load_id, id DESC);
    CREATE TABLE IF NOT EXISTS load_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
      author_role TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      author_name TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_load_chat_load ON load_chat_messages(load_id, id);
  `);

  backfillDispatchers(db);
  backfillSettingsUsers(db);
  backfillDropdownLists(db);
  backfillDocumentDefaults(db);
  backfillLoadNumbering(db);
  backfillSampleLoads(db);
}

function backfillDispatchers(db: Database): void {
  const count = (db.prepare("SELECT COUNT(*) as count FROM dispatchers").get() as { count: number }).count;
  if (count > 0) return;
  db.prepare(
    "INSERT INTO dispatchers (name, pin, role, email, active, permission_group, password_hash, phone) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
  ).run("MS Test", "", "manager", "ana@msloads.com", "all", "", "");
}

function backfillSettingsUsers(db: Database): void {
  const extras: Array<[string, string, string, string]> = [
    ["Jordan Lee", "dispatcher", "jordan@msloads.com", "dispatch"],
    ["Casey Ortiz", "accounting", "casey@msloads.com", "billing"],
    ["Riley Parks", "read_only", "riley@msloads.com", "dispatch"],
  ];
  const find = db.prepare("SELECT id FROM dispatchers WHERE name = ?");
  const insert = db.prepare(
    "INSERT INTO dispatchers (name, pin, role, email, active, permission_group, password_hash, phone) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
  );
  for (const [name, role, email, group] of extras) {
    if (find.get(name)) continue;
    insert.run(name, "", role, email, group, "", "");
  }
}

const SEED_LOAD_NUMBERS = [
  "MSE-1042",
  "MSE-1043",
  "MSE-1044",
  "MSE-1045",
  "MSE-1046",
  "MSE-1047",
  "MSE-1048",
  "MSE-1049",
  "MSE-1050",
  "MSE-1051",
  "MSE-1052",
  "MSE-1053",
];

function backfillSampleLoads(db: Database): void {
  db.prepare(
    `UPDATE loads SET is_sample = 1 WHERE load_number IN (${SEED_LOAD_NUMBERS.map(() => "?").join(", ")})`,
  ).run(...SEED_LOAD_NUMBERS);
}

function backfillLoadNumbering(db: Database): void {
  const row = db
    .prepare("SELECT load_number_prefix, load_number_next FROM company_profile WHERE id = 1")
    .get() as { load_number_prefix: string; load_number_next: number } | undefined;
  if (!row) return;
  const loads = db.prepare("SELECT load_number FROM loads").all() as Array<{ load_number: string }>;
  let max = 0;
  for (const load of loads) {
    const match = load.load_number.match(/(\d+)$/);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  if (row.load_number_next === 1001 && max >= 1001) {
    db.prepare("UPDATE company_profile SET load_number_next = ? WHERE id = 1").run(max + 1);
  }
}

function backfillDropdownLists(db: Database): void {
  const count = (db.prepare("SELECT COUNT(*) as count FROM dropdown_lists").get() as { count: number }).count;
  if (count > 0) return;
  const insert = db.prepare(
    "INSERT INTO dropdown_lists (kind, value, label, sort_order, active) VALUES (?, ?, ?, ?, 1)",
  );
  const commodities = [
    "Packaged grocery",
    "Fresh produce",
    "Frozen food",
    "Paper rolls",
    "Dry goods",
    "Beverages",
  ];
  commodities.forEach((label, index) => {
    insert.run("commodity", label.toLowerCase().replace(/\s+/g, "_"), label, index + 1);
  });
  const equipment = [
    ["reefer_53", "53' Reefer"],
    ["dry_van_53", "53' Dry Van"],
    ["flatbed", "Flatbed"],
    ["box", "Box Truck"],
    ["power_only", "Power Only"],
  ];
  equipment.forEach(([value, label], index) => {
    insert.run("equipment", value, label, index + 1);
  });
}

function backfillDocumentDefaults(db: Database): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO document_defaults (doc_type, header_text, footer_text, terms_text, font_size)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const rows: Array<[string, string, string, string, number]> = [
    ["load_confirmation", "Rate & Load Confirmation", "", "", 10],
    [
      "carrier_confirmation",
      "Carrier Confirmation",
      "Pay follows the agreed owner-operator percentage.",
      "This confirmation is not a QuickBooks bill. Settlements stay in Driver pay.",
      10,
    ],
    ["invoice", "Invoice", "", "", 10],
    [
      "customer_confirmation",
      "Customer Confirmation",
      "Questions? Call dispatch.",
      "This is a shipment confirmation, not a customer portal login.",
      10,
    ],
    [
      "bol",
      "Bill of Lading",
      "Driver must sign and attach photos.",
      "Seal numbers and piece counts belong on the BOL and the load record.",
      10,
    ],
  ];
  for (const row of rows) insert.run(...row);
  db.prepare(
    `UPDATE document_defaults
     SET footer_text = CASE
       WHEN lower(footer_text) LIKE '%linehaul is the customer rate%'
         OR lower(footer_text) LIKE '%accessorials are billed separately%'
         OR lower(footer_text) = 'payment due per customer terms.'
         OR lower(footer_text) LIKE '%thank you for hauling with us%'
         OR lower(footer_text) LIKE '%carrier is responsible for cargo%'
         OR lower(footer_text) LIKE '%report exceptions at pickup%'
       THEN ''
       ELSE footer_text
     END,
     terms_text = CASE
       WHEN lower(terms_text) LIKE '%linehaul is the customer rate%'
         OR lower(terms_text) LIKE '%accessorials are billed separately%'
         OR lower(terms_text) = 'payment due per customer terms.'
         OR lower(terms_text) LIKE '%thank you for hauling with us%'
         OR lower(terms_text) LIKE '%carrier is responsible for cargo%'
         OR lower(terms_text) LIKE '%report exceptions at pickup%'
         OR lower(terms_text) LIKE '%customer portal%'
       THEN ''
       ELSE terms_text
     END`,
  ).run();
  const fill = db.prepare("UPDATE document_defaults SET terms_text = ? WHERE doc_type = ?");
  const current = db.prepare("SELECT terms_text FROM document_defaults WHERE doc_type = ?");
  for (const [docType, terms] of [
    ["load_confirmation", DRIVER_CONFIRMATION_TERMS],
    ["customer_confirmation", CUSTOMER_CONFIRMATION_TERMS],
    ["bol", BOL_TERMS],
  ] as const) {
    const row = current.get(docType) as { terms_text?: string } | undefined;
    if (shouldReplaceStoredTerms(docType, row?.terms_text ?? "")) fill.run(terms, docType);
  }
}

function backfillDemoAccounting(db: Database): void {
  const bills = (db.prepare("SELECT COUNT(*) as count FROM bills").get() as { count: number }).count;
  if (bills === 0) {
    const delivered = db.prepare("SELECT id FROM loads WHERE status = 'delivered' LIMIT 1").get() as
      | { id: number }
      | undefined;
    db.prepare(
      `INSERT INTO bills (vendor, memo, amount, load_id, status, created_at)
       VALUES (?, ?, ?, ?, 'open', ?)`,
    ).run(
      "Atlanta DC Lumper",
      "Demo lumper bill",
      150,
      delivered?.id ?? null,
      new Date().toISOString(),
    );
  }
  const templates = (db.prepare("SELECT COUNT(*) as count FROM load_templates").get() as { count: number }).count;
  if (templates === 0) {
    const customer = db.prepare("SELECT id FROM customers ORDER BY id LIMIT 1").get() as { id: number } | undefined;
    if (customer) {
      db.prepare(
        `INSERT INTO load_templates (
          name, customer_id, origin, destination, commodity, weight, rate, notes,
          special_instructions, appointment_notes, equipment, reefer_setpoint_f, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "Heartland Chicago → Indianapolis grocery",
        customer.id,
        "Chicago, IL",
        "Indianapolis, IN",
        "Packaged grocery",
        38400,
        1850,
        "Template from the demo lane.",
        "Live unload.",
        "",
        "dry_van_53",
        null,
        new Date().toISOString(),
      );
    }
  }
}

function isoDateOffset(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function backfillDemoRegistration(db: Database): void {
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
function backfillDemoTruckDetails(db: Database): void {
  const rows: Array<[string, string, string, string, string, string]> = [
    ["2020", "Volvo", "VNL 760", "KY-102", "4V4NC9EH5LN102001", "102"],
    ["2019", "Kenworth", "T680", "TN-108", "1XKYD49X5KJ108001", "108"],
    ["2021", "Freightliner", "Cascadia", "TN-112", "3AKJHHDR8MSLJ1120", "112"],
    ["2018", "Peterbilt", "579", "TN-210", "1XPBD49X5JD210001", "210"],
  ];
  const update = db.prepare(
    `UPDATE trucks
     SET year = CASE WHEN year = '' THEN ? ELSE year END,
         make = CASE WHEN make = '' THEN ? ELSE make END,
         model = CASE WHEN model = '' THEN ? ELSE model END,
         plate = CASE WHEN plate = '' THEN ? ELSE plate END,
         vin = CASE WHEN vin = '' THEN ? ELSE vin END
     WHERE unit_number = ?`,
  );
  for (const row of rows) {
    update.run(...row);
  }
}

function backfillDemoInboxExceptions(db: Database): void {
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

/** Existing demo databases created before Locations shipped. */
function backfillDemoLocations(db: Database): void {
  const count = (db.prepare("SELECT COUNT(*) as count FROM locations").get() as { count: number }).count;
  if (count > 0) return;
  seedDemoLocations(db);
}

function ensureColumn(
  db: Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function backfillCustomerMainEmail(db: Database): void {
  db.exec(`
    UPDATE customers
    SET main_email = COALESCE((
      SELECT TRIM(contacts.email)
      FROM contacts
      WHERE contacts.customer_id = customers.id
        AND TRIM(contacts.email) != ''
        AND TRIM(contacts.email) LIKE '%@%.%'
      ORDER BY contacts.id
      LIMIT 1
    ), '')
    WHERE TRIM(main_email) = ''
  `);
}
