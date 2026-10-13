/**
 * Time the office paths the QA walk called slow, on a local database
 * sized like live: ~272 loads, ~3,300 locations, months of fuel rows.
 * Prints one JSON line. Does not touch the project database.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-qa-profile-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";

function ms(start: number): number {
  return Math.round(performance.now() - start);
}

async function main(): Promise<void> {
  const { getDb } = await import("../lib/db");
  const db = getDb();
  const customerId = (
    db.prepare("SELECT id FROM customers ORDER BY id LIMIT 1").get() as { id: number }
  ).id;
  const now = new Date();

  const insertLocation = db.prepare(
    `INSERT INTO locations (name, street, city, state, zip, phone, notes, role, scheduling_type, hours, scheduling_notes, created_at, updated_at)
     VALUES (?, ?, ?, 'NE', '68102', '', ?, 'both', 'fcfs', '', '', ?, ?)`,
  );
  const insertLoad = db.prepare(
    `INSERT INTO loads (
       load_number, customer_id, status, origin, destination, pickup_start, pickup_end, delivery_start, delivery_end,
       rate, created_at, updated_at, is_sample
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  const insertFuel = db.prepare(
    `INSERT INTO fuel_transactions (
       occurred_at, driver_id, truck_id, load_id, location, gallons, price_per_gallon, amount,
       card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
       prompt_data, dedup_key, created_at
     ) VALUES (?, NULL, NULL, NULL, 'OMAHA NE', 50, 3.5, 175, '', 'profile.csv', 'truck_diesel', '', ?, '', '', ?, ?)`,
  );

  const stamp = now.toISOString();
  db.transaction(() => {
    for (let i = 0; i < 3300; i += 1) {
      insertLocation.run(
        `Profile Yard ${i}`,
        `${100 + (i % 800)} Profile Ave`,
        i % 2 === 0 ? "Omaha" : "Lincoln",
        i % 17 === 0 ? "x".repeat(400) : "",
        stamp,
        stamp,
      );
    }
    for (let i = 0; i < 272; i += 1) {
      const day = new Date(now.getTime() - (i % 40) * 86_400_000);
      const iso = day.toISOString();
      const end = new Date(day.getTime() + 86_400_000).toISOString();
      const status = i % 11 === 0 ? "available" : i % 5 === 0 ? "in_transit" : i % 4 === 0 ? "dispatched" : "delivered";
      insertLoad.run(
        `PF-${100000 + i}`,
        customerId,
        status,
        "Omaha, NE",
        "Dallas, TX",
        iso,
        iso,
        end,
        end,
        i % 9 === 0 ? null : 2000,
        stamp,
        stamp,
      );
    }
    for (let i = 0; i < 4800; i += 1) {
      const when = new Date(now.getTime() - (i % 180) * 86_400_000).toISOString();
      insertFuel.run(when, i % 3 === 0 ? "" : `Driver ${i % 40}`, `pf-${i}`, stamp);
    }
    db.prepare("INSERT INTO fuel_import_sources (source_file, text, created_at) VALUES (?, ?, ?)").run(
      "profile.csv",
      `Date,Driver,Amount\n${"2026-01-01,Driver 1,10\n".repeat(8000)}`,
      stamp,
    );
  })();

  const counts = {
    loads: (db.prepare("SELECT COUNT(*) AS n FROM loads").get() as { n: number }).n,
    locations: (db.prepare("SELECT COUNT(*) AS n FROM locations").get() as { n: number }).n,
    fuel: (db.prepare("SELECT COUNT(*) AS n FROM fuel_transactions").get() as { n: number }).n,
  };

  const { listExceptionInbox } = await import("../lib/exceptions");
  const { listLocations, searchLoads } = await import("../lib/queries");
  const { rematchUnmatchedFuelTransactions } = await import("../lib/fuel-store");
  const { latestReeferForTrailer } = await import("../lib/integrations/orbcomm");

  const inboxStart = performance.now();
  const inbox = listExceptionInbox();
  const inboxMs = ms(inboxStart);

  const locStart = performance.now();
  const locations = listLocations();
  const locationsMs = ms(locStart);
  const locationsJsonBytes = Buffer.byteLength(JSON.stringify(locations));

  const fuelStart = performance.now();
  const rematched = rematchUnmatchedFuelTransactions();
  const fuelMs = ms(fuelStart);
  const fuelAgainStart = performance.now();
  rematchUnmatchedFuelTransactions();
  const fuelAgainMs = ms(fuelAgainStart);
  db.prepare(
    "UPDATE fuel_transactions SET driver_id = (SELECT id FROM drivers ORDER BY id LIMIT 1) WHERE driver_id IS NULL",
  ).run();
  const fuelMatchedStart = performance.now();
  const rematchedWhenMatched = rematchUnmatchedFuelTransactions();
  const fuelMatchedMs = ms(fuelMatchedStart);

  const searchStart = performance.now();
  const found = searchLoads({ q: "PF-100", includeLive: true, includeArchived: true, includeCancelled: false });
  const searchMs = ms(searchStart);

  const reeferStart = performance.now();
  for (let i = 0; i < 40; i += 1) {
    latestReeferForTrailer({ unit_number: `MS${1500 + i}`, orbcomm_asset_id: "" });
  }
  const reeferMs = ms(reeferStart);

  console.log(
    JSON.stringify({
      counts,
      inboxMs,
      inboxItems: inbox.items.length,
      locationsMs,
      locationsJsonBytes,
      fuelMs,
      fuelAgainMs,
      fuelMatchedMs,
      rematchedWhenMatched,
      rematched,
      searchMs,
      searchHits: found.length,
      reeferMs,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(dbPath, { force: true });
  });
