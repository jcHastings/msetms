/**
 * Merged duplicate locations stay in the database. Lists, search, and pickers
 * hide them until Locations has Include archived on. A direct id still opens.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-location-archive-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

async function main() {
  const queries = await import("../lib/queries");
  const { closeDb, getDb, migrate } = await import("../lib/db");
  const {
    ACTIVE_LOCATION_SQL,
    ARCHIVED_MERGE_LEAD,
    archivedMergeNote,
    filterLocationsForPicker,
    isArchivedLocation,
  } = await import("../lib/locations");
  const { listUnverifiedLocations } = await import("../lib/location-verify-store");
  const { getResolvedFleetLaneRates } = await import("../lib/lane-average");

  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(locations)").all() as Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
  }>;
  const archivedCol = columns.find((column) => column.name === "archived_at");
  const mergedCol = columns.find((column) => column.name === "merged_into");
  assert.ok(archivedCol, "fresh databases add archived_at when it is absent");
  assert.ok(mergedCol, "fresh databases add merged_into when it is absent");
  assert.equal(archivedCol.type, "TEXT");
  assert.equal(mergedCol.type, "INTEGER");
  assert.equal(archivedCol.notnull, 0);
  assert.equal(mergedCol.notnull, 0);
  assert.equal(archivedCol.dflt_value, null);
  assert.equal(mergedCol.dflt_value, null);

  const dbSource = read("lib/db.ts");
  assert.match(dbSource, /ensureColumn\(db, "locations", "archived_at", "TEXT"\)/);
  assert.match(dbSource, /ensureColumn\(db, "locations", "merged_into", "INTEGER"\)/);
  const createAt = dbSource.indexOf("CREATE TABLE IF NOT EXISTS locations");
  const createEnd = dbSource.indexOf("CREATE TABLE IF NOT EXISTS saved_reports", createAt);
  assert.doesNotMatch(dbSource.slice(createAt, createEnd), /archived_at|merged_into/);

  function make(name: string, extra: { google_place_id?: string; latitude?: number; longitude?: number } = {}) {
    return queries.createLocation({
      name,
      street: "100 Merge Rd",
      city: "Omaha",
      state: "NE",
      zip: "68102",
      phone: "402-555-0100",
      notes: "",
      role: "shipper",
      scheduling_type: "appointment",
      hours: "",
      scheduling_notes: "",
      google_place_id: extra.google_place_id,
      latitude: extra.latitude,
      longitude: extra.longitude,
    });
  }

  const keeperId = make("Keeper Yard", { google_place_id: "place-keeper", latitude: 41.25, longitude: -96.0 });
  const dupId = make("Dup Yard", { google_place_id: "place-dup", latitude: 41.26, longitude: -96.01 });
  const otherId = make("Other Dock");
  const before = (db.prepare("SELECT COUNT(*) AS n FROM locations").get() as { n: number }).n;
  db.prepare("UPDATE locations SET archived_at = ?, merged_into = ? WHERE id = ?").run(
    "2026-10-01T12:00:00.000Z",
    keeperId,
    dupId,
  );
  migrate(db);
  const still = db.prepare("SELECT archived_at, merged_into FROM locations WHERE id = ?").get(dupId) as {
    archived_at: string;
    merged_into: number;
  };
  assert.equal(still.archived_at, "2026-10-01T12:00:00.000Z", "a second migrate leaves prod archive stamps alone");
  assert.equal(still.merged_into, keeperId);
  const after = (db.prepare("SELECT COUNT(*) AS n FROM locations").get() as { n: number }).n;
  assert.equal(after, before, "hiding archived locations does not delete them");

  const archived = queries.getLocation(dupId);
  assert.ok(archived);
  assert.equal(isArchivedLocation(archived), true);
  assert.equal(queries.getLocation(keeperId)?.name, "Keeper Yard", "direct id still opens the keeper");
  assert.equal(archived.name, "Dup Yard", "direct id still opens an archived location");
  assert.equal(archivedMergeNote("Keeper Yard"), `${ARCHIVED_MERGE_LEAD} Keeper Yard`);

  assert.equal(
    queries.listLocations().some((location) => location.id === dupId),
    false,
    "listLocations hides archived duplicates",
  );
  assert.equal(queries.listLocations().some((location) => location.id === keeperId), true);
  assert.equal(queries.listLocations("shipper").some((location) => location.id === dupId), false);
  assert.equal(listUnverifiedLocations().some((location) => location.id === dupId), false);

  assert.equal(
    queries.searchLocationPickerRows("Dup Yard").some((row) => row.id === dupId),
    false,
    "picker search hides archived duplicates",
  );
  assert.equal(queries.searchLocationPickerRows("Keeper").some((row) => row.id === keeperId), true);
  assert.deepEqual(
    filterLocationsForPicker(
      [
        { id: keeperId, name: "Keeper Yard", street: "100 Merge Rd", city: "Omaha", state: "NE", zip: "68102" },
        {
          id: dupId,
          name: "Dup Yard",
          street: "100 Merge Rd",
          city: "Omaha",
          state: "NE",
          zip: "68102",
          archived_at: "2026-10-01T12:00:00.000Z",
        },
      ],
      "yard",
    ).map((row) => row.id),
    [keeperId],
  );

  const directory = queries.searchLocationsDirectory({ q: "Yard" });
  assert.equal(directory.locations.some((location) => location.id === dupId), false);
  assert.equal(directory.locations.some((location) => location.id === keeperId), true);
  assert.equal(directory.total, 1);
  const withArchived = queries.searchLocationsDirectory({ q: "Dup Yard", includeArchived: true });
  assert.equal(withArchived.locations.some((location) => location.id === dupId), true);
  assert.equal(withArchived.total, 1);
  assert.equal(queries.searchLocationsDirectory({ q: "Dup Yard" }).total, 0, "the name alone does not bypass Include archived");
  const hiddenBook = queries.searchLocationsDirectory({ pageSize: 100 });
  const shownBook = queries.searchLocationsDirectory({ pageSize: 100, includeArchived: true });
  assert.equal(hiddenBook.locations.some((location) => location.id === otherId), true);
  assert.equal(hiddenBook.locations.some((location) => location.id === dupId), false);
  assert.equal(shownBook.locations.some((location) => location.id === dupId), true);
  assert.equal(shownBook.total, hiddenBook.total + 1, "Include archived adds the merged duplicate and nothing else");

  assert.equal(
    queries.findDuplicateLocation({
      name: "Dup Yard",
      street: "100 Merge Rd",
      city: "Omaha",
      state: "NE",
      google_place_id: "place-dup",
    }),
    null,
    "findDuplicateLocation skips an archived place id",
  );
  assert.equal(
    queries.findDuplicateLocation({
      name: "Dup Yard",
      street: "100 Merge Rd",
      city: "Omaha",
      state: "NE",
    })?.id ?? null,
    null,
    "findDuplicateLocation skips an archived name and address",
  );
  assert.equal(
    queries.findDuplicateLocation({
      name: "Keeper Yard",
      street: "100 Merge Rd",
      city: "Omaha",
      state: "ne",
      google_place_id: "place-keeper",
    })?.id,
    keeperId,
  );
  assert.equal(
    queries.findLocationByNameAddress("Dup Yard", "100 Merge Rd", "Omaha", "NE", "68102"),
    null,
  );
  assert.equal(
    queries.findLocationByNameAddress("Keeper Yard", "100 Merge Rd", "Omaha", "NE", "68102")?.id,
    keeperId,
  );
  assert.deepEqual(
    queries.locationsForIds([dupId, keeperId]).map((location) => location.id).sort((a, b) => a - b),
    [dupId, keeperId].sort((a, b) => a - b),
  );

  const lanes = getResolvedFleetLaneRates();
  assert.equal(
    lanes.hints.some((hint) => hint.name === "Dup Yard"),
    false,
    "lane city search skips archived locations",
  );
  assert.equal(lanes.byId.has(dupId), true, "a load still pointing at an archived id keeps its pin");
  assert.equal(lanes.byId.has(keeperId), true);
  assert.match(read("lib/load-map.ts"), /ACTIVE_LOCATION_SQL/);
  assert.equal(ACTIVE_LOCATION_SQL, "IFNULL(archived_at, '') = ''");

  const page = read("app/locations/page.tsx");
  const toggle = read("components/location-archive-toggle.tsx");
  const detail = read("app/locations/[id]/page.tsx");
  assert.match(page, /includeArchived/);
  assert.match(page, /archived/);
  assert.match(page, /LocationArchiveToggle/);
  assert.match(toggle, /Include archived/);
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /aria-checked/);
  assert.match(toggle, /archived", "1"|archived=1/);
  assert.match(page, /archived: "1"/);
  assert.match(detail, /ARCHIVED_MERGE_LEAD/);
  assert.match(detail, /data-archived-location-note/);
  assert.match(detail, /\/locations\/\$\{keeper\.id\}/);

  closeDb();
  fs.rmSync(dbPath, { force: true });
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
  console.log("location archive ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
