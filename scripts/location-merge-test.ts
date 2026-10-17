/**
 * Location merge and the shared resolver. Fixtures only.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-location-merge-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";

const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

function runMerge(args: string[]) {
  return spawnSync(tsxBin, ["scripts/location-merge.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function snapshot(db: { prepare: (sql: string) => { all: () => unknown[] } }) {
  return {
    locations: db.prepare("SELECT id, name, street, zip, phone, latitude, longitude, archived_at, merged_into FROM locations ORDER BY id").all(),
    loads: db.prepare("SELECT id, shipper_location_id, consignee_location_id FROM loads ORDER BY id").all(),
    stops: db.prepare("SELECT id, location_id, street, zip FROM load_stops ORDER BY id").all(),
    templateStops: db.prepare("SELECT id, location_id FROM load_template_stops ORDER BY id").all(),
    swaps: db.prepare("SELECT id, location_id FROM load_swaps ORDER BY id").all(),
    aliases: db.prepare("SELECT location_id, name FROM location_aliases ORDER BY id").all(),
    cache: db.prepare("SELECT location_id, query_key FROM location_verify_cache ORDER BY query_key").all(),
    audits: db.prepare("SELECT action, entity, entity_id, detail FROM audit_log ORDER BY id").all(),
    locationCount: (db.prepare("SELECT COUNT(*) AS n FROM locations").all()[0] as { n: number }).n,
  };
}

async function main() {
  const { normalizeMergeName, resolveLocation } = await import("../lib/location-resolve");
  const { filterLocationSuggestions } = await import("../lib/locations");
  assert.equal(normalizeMergeName("Pine Harbor Foods, LLC"), "pine harbor foods");
  assert.equal(normalizeMergeName("Pine Harbor Foods Inc."), "pine harbor foods");
  assert.equal(normalizeMergeName("  Pine   Harbor   Co  "), "pine harbor");

  const addressed = {
    id: 1,
    name: "Oak Barrel Dock",
    street: "10 First St",
    city: "Cedar Falls",
    state: "IA",
    zip: "50613",
    verified_at: "2026-01-02T00:00:00.000Z",
    created_at: "2026-01-02T00:00:00.000Z",
    archived_at: null,
    merged_into: null,
  };
  const blank = {
    id: 2,
    name: "Oak Barrel Dock",
    street: "",
    city: "Cedar Falls",
    state: "IA",
    zip: "",
    verified_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    merged_into: null,
  };
  const picked = resolveLocation([blank, addressed], {
    name: "Oak Barrel Dock",
    street: "",
    city: "Cedar Falls",
    state: "IA",
  });
  assert.equal(picked?.id, 1, "two rows with the same name resolve to the one with an address");

  const archived = { ...addressed, id: 3, name: "Gone Dock", archived_at: "2026-02-01T00:00:00.000Z", merged_into: null, google_place_id: "place-gone" };
  assert.equal(
    resolveLocation([archived], { name: "Gone Dock", street: "10 First St", zip: "50613", google_place_id: "place-gone" }),
    null,
    "an archived row is never returned",
  );
  const followed = resolveLocation(
    [
      { ...addressed, id: 4, name: "Cedar Ridge Kept", google_place_id: "place-kept" },
      {
        ...blank,
        id: 5,
        name: "Cedar Ridge Copy",
        google_place_id: "place-copy",
        archived_at: "2026-03-01T00:00:00.000Z",
        merged_into: 4,
      },
    ],
    { name: "Cedar Ridge Copy", google_place_id: "place-copy" },
  );
  assert.equal(followed?.id, 4, "merged_into is followed to the kept record");

  assert.deepEqual(
    filterLocationSuggestions(
      [
        { id: 4, name: "Cedar Ridge Kept", street: "10 First St", city: "Cedar Falls", state: "IA", zip: "50613" },
        {
          id: 5,
          name: "Cedar Ridge Copy",
          street: "",
          city: "Cedar Falls",
          state: "IA",
          zip: "",
          merged_into: 4,
          archived_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      "cedar",
    ).map((row) => row.id),
    [4],
  );

  const queries = await import("../lib/queries");
  const { closeDb, getDb } = await import("../lib/db");
  const { saveTieSheetDraft } = await import("../lib/tie-sheet");

  function make(
    name: string,
    extra: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      phone?: string;
      google_place_id?: string;
      latitude?: number | null;
      longitude?: number | null;
      verified_at?: string | null;
      hours?: string;
    } = {},
  ) {
    return queries.createLocation({
      name,
      street: extra.street ?? "",
      city: extra.city ?? "Cedar Falls",
      state: extra.state ?? "IA",
      zip: extra.zip ?? "",
      phone: extra.phone ?? "",
      notes: "",
      role: "both",
      scheduling_type: "fcfs",
      hours: extra.hours ?? "",
      scheduling_notes: "",
      google_place_id: extra.google_place_id,
      latitude: extra.latitude,
      longitude: extra.longitude,
      verified_at: extra.verified_at,
    });
  }

  const keeperId = make("Pine Harbor Foods", {
    street: "100 Example Dock Rd",
    zip: "50613",
    hours: "Mon–Fri 06:00–14:00",
  });
  const copyId = make("Pine Harbor Foods LLC", {
    phone: "319-555-0142",
    verified_at: "2026-04-01T00:00:00.000Z",
    latitude: 42.53,
    longitude: -92.45,
  });
  const secondCopyId = make("Pine Harbor Foods, Inc.");
  const db = getDb();
  db.prepare("UPDATE locations SET created_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", keeperId);
  db.prepare("UPDATE locations SET created_at = ? WHERE id = ?").run("2026-02-01T00:00:00.000Z", copyId);
  db.prepare("UPDATE locations SET created_at = ? WHERE id = ?").run("2026-03-01T00:00:00.000Z", secondCopyId);

  const beforeCreate = (db.prepare("SELECT COUNT(*) AS n FROM locations WHERE name LIKE 'Pine Harbor%'").get() as { n: number }).n;
  assert.equal(beforeCreate, 3);
  const saved = saveTieSheetDraft({
    customer_name: "Northwind Grocers",
    tie_sheet_load_id: "fixture-1",
    origin: "Cedar Falls, IA",
    destination: "Ames, IA",
    pickup_start: "2026-10-20T12:00:00.000Z",
    pickup_end: "2026-10-20T16:00:00.000Z",
    delivery_start: "2026-10-21T12:00:00.000Z",
    delivery_end: "2026-10-21T18:00:00.000Z",
    weight: 1000,
    case_count: 10,
    po_number: "PO-100",
    notes: "Fixture tie sheet",
    equipment: "reefer_53",
    reefer_mode: "continuous",
    pickup: {
      name: "Pine Harbor Foods",
      city: "Cedar Falls",
      state: "IA",
      schedule_type: "appointment",
      call_before: true,
      window_start: "2026-10-20T12:00:00.000Z",
      window_end: "2026-10-20T16:00:00.000Z",
    },
    drop: {
      name: "Maple Street Cold",
      city: "Ames",
      state: "IA",
      schedule_type: "fcfs",
      call_before: false,
      window_start: "2026-10-21T15:00:00.000Z",
      window_end: "2026-10-21T18:00:00.000Z",
      order_numbers: ["100"],
      po_numbers: ["PO-100"],
      confirmation: "",
      reference: "",
      notes: "",
      cargo: "",
    },
    drops: [],
  });
  const afterCreate = (db.prepare("SELECT COUNT(*) AS n FROM locations WHERE name LIKE 'Pine Harbor%'").get() as { n: number }).n;
  assert.equal(afterCreate, 3, "two existing rows with the same name must not create a third");
  const shipperId = (db.prepare("SELECT shipper_location_id AS id FROM loads WHERE id = ?").get(saved.id) as { id: number }).id;
  assert.equal(shipperId, keeperId, "the builder keeps the row that has a street");

  const keptId = make("Cedar Ridge Kept", { street: "10 First St", zip: "50613", google_place_id: "place-kept" });
  const archivedId = make("Cedar Ridge Copy", { google_place_id: "place-copy" });
  db.prepare("UPDATE locations SET archived_at = ?, merged_into = ? WHERE id = ?").run(
    "2026-03-01T00:00:00.000Z",
    keptId,
    archivedId,
  );
  const followedRow = queries.resolveExistingLocation({
    name: "Cedar Ridge Copy",
    google_place_id: "place-copy",
  });
  assert.equal(followedRow?.id, keptId);
  assert.equal(followedRow?.archived_at ?? null, null);
  const hiddenId = make("Hidden Twin Dock", { street: "8 Quiet Ln", zip: "50613" });
  db.prepare("UPDATE locations SET merged_into = ? WHERE id = ?").run(keptId, hiddenId);

  assert.equal(queries.searchLocationPickerRows("hidden").some((row) => row.id === hiddenId), false);
  assert.equal(queries.searchLocationPickerRows("cedar ridge").some((row) => row.id === archivedId), false);
  assert.equal(queries.searchLocationPickerRows("cedar").some((row) => row.id === keptId), true);
  assert.equal(queries.searchLocationPickerRows("FALLS").some((row) => row.id === keptId), true);
  assert.equal(queries.searchLocationPickerRows("pine").some((row) => row.id === copyId), true);
  assert.equal(queries.searchLocationPickerRows("PINE").some((row) => row.id === keeperId), true);
  assert.ok(queries.searchLocationPickerRows("pine").length <= 10);

  const customerId = queries.findOrCreateCustomer("Northwind Grocers");
  const loadInput = {
    customer_id: customerId,
    origin: "Cedar Falls, IA",
    destination: "Ames, IA",
    pickup_start: "2026-10-20T12:00:00.000Z",
    pickup_end: "2026-10-20T16:00:00.000Z",
    delivery_start: "2026-10-21T12:00:00.000Z",
    delivery_end: "2026-10-21T18:00:00.000Z",
    weight: 1000,
    commodity: "Frozen peas",
    rate: null,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: copyId,
    consignee_location_id: copyId,
    status: "available",
    truck_id: null,
    driver_id: null,
  };
  const loadA = queries.createLoad({ ...loadInput, load_number: "900100" });
  const loadB = queries.createLoad({ ...loadInput, load_number: "900101", shipper_location_id: secondCopyId });
  const now = "2026-10-01T00:00:00.000Z";
  db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, location_id, name, city, state, street, zip)
     VALUES (?, 1, 'pickup', ?, 'Pine Harbor Foods LLC', 'Cedar Falls', 'IA', '', '')`,
  ).run(loadA, copyId);
  db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, location_id, name, city, state, street, zip)
     VALUES (?, 2, 'delivery', ?, 'Pine Harbor Foods LLC', 'Cedar Falls', 'IA', '9 Keep This Rd', '')`,
  ).run(loadA, copyId);
  const template = db
    .prepare(
      `INSERT INTO load_templates (name, customer_id, origin, destination, created_at)
       VALUES ('Sample lane', ?, 'Cedar Falls, IA', 'Ames, IA', ?)`,
    )
    .run(customerId, now);
  db.prepare(
    `INSERT INTO load_template_stops (template_id, sequence, kind, location_id, name, city, state)
     VALUES (?, 1, 'pickup', ?, 'Pine Harbor Foods LLC', 'Cedar Falls', 'IA')`,
  ).run(Number(template.lastInsertRowid), secondCopyId);
  db.prepare(
    `INSERT INTO load_swaps (load_a_id, load_b_id, location_id, address, created_at, updated_at)
     VALUES (?, ?, ?, 'Cedar Falls, IA', ?, ?)`,
  ).run(loadA, loadB, copyId, now, now);
  db.prepare(
    `INSERT INTO location_aliases (location_id, name, street, city, state, zip, created_at)
     VALUES (?, 'Harbor Dock 4', '', 'Cedar Falls', 'IA', '', ?)`,
  ).run(copyId, now);
  db.prepare(
    `INSERT INTO location_verify_cache (location_id, query_key, payload_json, looked_up_at)
     VALUES (?, 'pine-harbor', '{}', ?)`,
  ).run(secondCopyId, now);

  const before = snapshot(db);
  closeDb();

  const dry = runMerge(["--db", dbPath]);
  assert.equal(dry.status, 0, dry.stderr);
  const dryReport = JSON.parse(dry.stdout) as {
    dryRun: boolean;
    groups: Array<{ keepId: number; mergeIds: number[]; linkCounts: Record<string, number>; changes: unknown[] }>;
  };
  assert.equal(dryReport.dryRun, true);
  const pineGroup = dryReport.groups.find((group) => group.keepId === keeperId || group.mergeIds.includes(copyId));
  assert.ok(pineGroup, "dry-run reports the Pine Harbor group");
  assert.equal(pineGroup.keepId, keeperId, "keep rule prefers the row that has a street");
  assert.deepEqual(pineGroup.mergeIds.sort((a, b) => a - b), [copyId, secondCopyId].sort((a, b) => a - b));
  assert.ok(pineGroup.linkCounts[String(copyId)] > pineGroup.linkCounts[String(keeperId)]);
  assert.ok(pineGroup.changes.length > 0);

  const { getDb: reopen, closeDb: closeAgain } = await import("../lib/db");
  const afterDry = snapshot(reopen());
  assert.deepEqual(afterDry, before, "the merge dry-run makes no writes");
  closeAgain();

  const refused = runMerge(["--db", dbPath, "--apply"]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /refused/i);
  const missingBackup = path.join(os.tmpdir(), `missing-backup-${process.pid}.db`);
  const missing = runMerge(["--db", dbPath, "--apply", "--backup", missingBackup]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /not found/i);
  const staleBackup = path.join(os.tmpdir(), `stale-backup-${process.pid}.db`);
  fs.writeFileSync(staleBackup, "backup");
  const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(staleBackup, staleTime, staleTime);
  const stale = runMerge(["--db", dbPath, "--apply", "--backup", staleBackup]);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /60 minutes/);

  const still = snapshot(reopen());
  assert.deepEqual(still, before, "a refused apply does not write");
  closeAgain();

  const backup = path.join(os.tmpdir(), `fresh-backup-${process.pid}.db`);
  fs.writeFileSync(backup, "backup");
  const applied = runMerge(["--db", dbPath, "--apply", "--backup", backup]);
  assert.equal(applied.status, 0, applied.stderr);
  const appliedReport = JSON.parse(applied.stdout) as { dryRun: boolean };
  assert.equal(appliedReport.dryRun, false);

  const after = reopen();
  const locationCount = (after.prepare("SELECT COUNT(*) AS n FROM locations").get() as { n: number }).n;
  assert.equal(locationCount, before.locationCount, "apply never hard-deletes a location");
  const keeper = after.prepare("SELECT phone, street, latitude, longitude, archived_at FROM locations WHERE id = ?").get(keeperId) as {
    phone: string;
    street: string;
    latitude: number;
    longitude: number;
    archived_at: string | null;
  };
  assert.equal(keeper.street, "100 Example Dock Rd");
  assert.equal(keeper.phone, "319-555-0142");
  assert.equal(keeper.latitude, 42.53);
  assert.equal(keeper.longitude, -92.45);
  assert.equal(keeper.archived_at, null);
  for (const id of [copyId, secondCopyId]) {
    const copy = after.prepare("SELECT archived_at, merged_into FROM locations WHERE id = ?").get(id) as {
      archived_at: string;
      merged_into: number;
    };
    assert.ok(copy.archived_at);
    assert.equal(copy.merged_into, keeperId);
  }
  const loads = after.prepare("SELECT shipper_location_id, consignee_location_id FROM loads WHERE id IN (?, ?)").all(loadA, loadB) as Array<{
    shipper_location_id: number;
    consignee_location_id: number;
  }>;
  assert.ok(loads.every((row) => row.shipper_location_id === keeperId && row.consignee_location_id === keeperId));
  const stops = after
    .prepare("SELECT street, zip, location_id FROM load_stops WHERE name = 'Pine Harbor Foods LLC' ORDER BY id")
    .all() as Array<{
    street: string;
    zip: string;
    location_id: number;
  }>;
  assert.equal(stops.length, 2);
  assert.ok(stops.every((row) => row.location_id === keeperId));
  assert.equal(stops[0]?.street, "100 Example Dock Rd");
  assert.equal(stops[0]?.zip, "50613");
  assert.equal(stops[1]?.street, "9 Keep This Rd");
  assert.equal(stops[1]?.zip, "50613");
  const templateStop = after.prepare("SELECT location_id FROM load_template_stops").get() as { location_id: number };
  assert.equal(templateStop.location_id, keeperId);
  const swap = after.prepare("SELECT location_id FROM load_swaps").get() as { location_id: number };
  assert.equal(swap.location_id, keeperId);
  const aliases = after.prepare("SELECT location_id, name FROM location_aliases ORDER BY id").all() as Array<{
    location_id: number;
    name: string;
  }>;
  assert.ok(aliases.every((row) => row.location_id === keeperId));
  assert.ok(aliases.some((row) => row.name === "Harbor Dock 4"));
  assert.equal(
    aliases.filter((row) => normalizeMergeName(row.name) === "pine harbor foods").length,
    0,
    "a copy whose name normalizes to the keeper does not become an alias",
  );
  const cache = after.prepare("SELECT location_id FROM location_verify_cache WHERE query_key = 'pine-harbor'").get() as {
    location_id: number;
  };
  assert.equal(cache.location_id, keeperId);
  const audits = after.prepare("SELECT action, entity, entity_id FROM audit_log WHERE action = 'location_merge'").all() as Array<{
    action: string;
    entity: string;
    entity_id: number;
  }>;
  assert.equal(audits.length, 2);
  assert.ok(audits.every((row) => row.entity === "location" && row.entity_id === keeperId));

  closeAgain();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
  fs.rmSync(staleBackup, { force: true });
  fs.rmSync(backup, { force: true });
  console.log("location merge ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
