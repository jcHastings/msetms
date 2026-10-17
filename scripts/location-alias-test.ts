/**
 * Merged names still find the kept location. Fixtures only.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-location-alias-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";

const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

function runBackfill(args: string[]) {
  return spawnSync(tsxBin, ["scripts/location-alias-backfill.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function aliasRows(db: { prepare: (sql: string) => { all: () => unknown[] } }) {
  return db.prepare("SELECT location_id, name, street, city, state, zip FROM location_aliases ORDER BY id").all();
}

async function main() {
  const queries = await import("../lib/queries");
  const { closeDb, getDb } = await import("../lib/db");
  const { normalizeMergeName, resolveLocation } = await import("../lib/location-resolve");

  function make(name: string, city = "Ames", street = "", zip = "50010") {
    return queries.createLocation({
      name,
      street,
      city,
      state: "IA",
      zip,
      phone: "",
      notes: "",
      role: "both",
      scheduling_type: "fcfs",
      hours: "",
      scheduling_notes: "",
    });
  }

  const keeperId = make("Oak Barrel Dock", "Ames", "14 Harbor Lane", "50010");
  const midId = make("Cedar Ridge Copy", "Ames", "", "");
  const oldId = make("Harbor Dock 4", "Ames", "9 Old Dock", "50010");
  const suffixId = make("Oak Barrel Dock, LLC", "Ames", "", "");
  const otherId = make("Pine Harbor Foods", "Cedar Falls", "100 Example Dock Rd", "50613");
  const db = getDb();
  const now = "2026-10-15T00:00:00.000Z";
  db.prepare("UPDATE locations SET archived_at = ?, merged_into = ? WHERE id = ?").run(now, keeperId, midId);
  db.prepare("UPDATE locations SET archived_at = ?, merged_into = ? WHERE id = ?").run(now, midId, oldId);
  db.prepare("UPDATE locations SET archived_at = ?, merged_into = ? WHERE id = ?").run(now, keeperId, suffixId);
  db.prepare(
    `INSERT INTO location_aliases (location_id, name, street, city, state, zip, created_at)
     VALUES (?, 'Cedar Ridge Copy', '', 'Ames', 'IA', '', ?)`,
  ).run(keeperId, now);

  const followed = queries.resolveExistingLocation({
    name: "Harbor Dock 4",
    street: "",
    city: "Ames",
    state: "IA",
  });
  assert.equal(followed?.id, keeperId, "a merged name finds the keeper");
  assert.equal(followed?.archived_at ?? null, null);

  const aliasOnly = resolveLocation(
    [
      {
        id: keeperId,
        name: "Oak Barrel Dock",
        street: "14 Harbor Lane",
        city: "Ames",
        state: "IA",
        zip: "50010",
        archived_at: null,
        merged_into: null,
        aliases: [{ name: "Old Wharf Shed" }],
      },
    ],
    { name: "old wharf shed", street: "", city: "Ames", state: "IA" },
  );
  assert.equal(aliasOnly?.id, keeperId, "the resolver uses aliases");
  assert.equal(normalizeMergeName("Oak Barrel Dock, LLC"), normalizeMergeName("Oak Barrel Dock"));

  assert.equal(queries.searchLocationPickerRows("harbor dock").some((row) => row.id === oldId), false);
  assert.equal(queries.searchLocationPickerRows("harbor dock").some((row) => row.id === keeperId), false);

  const before = aliasRows(db);
  closeDb();

  const dry = runBackfill(["--db", dbPath]);
  assert.equal(dry.status, 0, dry.stderr);
  const dryReport = JSON.parse(dry.stdout) as {
    dryRun: boolean;
    aliases: Array<{ fromId: number; keeperId: number; name: string }>;
    skipped: Array<{ fromId: number; reason: string }>;
  };
  assert.equal(dryReport.dryRun, true);
  assert.ok(dryReport.aliases.some((row) => row.fromId === oldId && row.keeperId === keeperId && row.name === "Harbor Dock 4"));
  assert.ok(dryReport.skipped.some((row) => row.fromId === midId && row.reason === "alias already stored"));
  assert.ok(dryReport.skipped.some((row) => row.fromId === suffixId && row.reason === "same name as the keeper"));

  const { getDb: reopen, closeDb: closeAgain } = await import("../lib/db");
  const afterDry = reopen();
  assert.deepEqual(aliasRows(afterDry), before, "the backfill dry run writes nothing");
  closeAgain();

  const refused = runBackfill(["--db", dbPath, "--apply"]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /refused/i);

  const backup = path.join(os.tmpdir(), `alias-backup-${process.pid}.db`);
  fs.writeFileSync(backup, "backup");
  const applied = runBackfill(["--db", dbPath, "--apply", "--backup", backup]);
  assert.equal(applied.status, 0, applied.stderr);
  const appliedReport = JSON.parse(applied.stdout) as { dryRun: boolean; aliases: Array<{ keeperId: number; name: string }> };
  assert.equal(appliedReport.dryRun, false);
  assert.deepEqual(
    appliedReport.aliases.map((row) => row.name),
    ["Harbor Dock 4"],
  );

  const after = reopen();
  const stored = aliasRows(after) as Array<{ location_id: number; name: string; street: string; city: string; state: string; zip: string }>;
  assert.equal(stored.filter((row) => row.name === "Harbor Dock 4").length, 1);
  const harbor = stored.find((row) => row.name === "Harbor Dock 4");
  assert.equal(harbor?.location_id, keeperId);
  assert.equal(harbor?.street, "9 Old Dock");
  assert.equal(harbor?.city, "Ames");
  assert.equal(harbor?.state, "IA");
  assert.equal(stored.filter((row) => row.name === "Cedar Ridge Copy").length, 1);
  assert.equal(stored.some((row) => normalizeMergeName(row.name) === "oak barrel dock"), false);
  const count = stored.length;
  closeAgain();

  const again = runBackfill(["--db", dbPath, "--apply", "--backup", backup]);
  assert.equal(again.status, 0, again.stderr);
  const againReport = JSON.parse(again.stdout) as { aliases: unknown[] };
  assert.equal(againReport.aliases.length, 0, "the backfill is idempotent");
  const finalDb = reopen();
  assert.equal((aliasRows(finalDb) as unknown[]).length, count);

  const hits = queries.searchLocationPickerRows("HARBOR DOCK");
  assert.deepEqual(hits.map((row) => row.id), [keeperId]);
  assert.equal(hits[0]?.matched_alias, "Harbor Dock 4");
  assert.equal(hits.some((row) => row.id === oldId || row.id === otherId), false);

  const cedar = queries.searchLocationPickerRows("cedar ridge");
  assert.deepEqual(cedar.map((row) => row.id), [keeperId]);
  assert.equal(cedar[0]?.matched_alias, "Cedar Ridge Copy");

  finalDb.prepare(
    `INSERT INTO location_aliases (location_id, name, street, city, state, zip, created_at)
     VALUES (?, 'Old Wharf Shed', '', 'Ames', 'IA', '', ?)`,
  ).run(keeperId, now);
  const wharf = queries.searchLocationPickerRows("old wharf");
  assert.equal(wharf.length, 1);
  assert.equal(wharf[0]?.id, keeperId);
  assert.equal(wharf[0]?.matched_alias, "Old Wharf Shed");

  const directory = queries.searchLocationsDirectory({ q: "harbor dock" });
  assert.deepEqual(directory.locations.map((row) => row.id), [keeperId]);
  assert.equal(directory.locations[0]?.matched_alias, "Harbor Dock 4");
  assert.equal(directory.locations.some((row) => row.archived_at), false);

  const viaAlias = queries.resolveExistingLocation({
    name: "Old Wharf Shed",
    street: "",
    city: "Ames",
    state: "IA",
  });
  assert.equal(viaAlias?.id, keeperId);

  closeAgain();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
  fs.rmSync(backup, { force: true });
  console.log("location alias ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
