/**
 * Archived loads stay in the database. Search and All Loads hide them until
 * Include archived is on. A direct load id still opens.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-archive-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.WORKING_LOAD_WINDOW_DAYS = "45";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString();
}

async function main() {
  const queries = await import("../lib/queries");
  const { closeDb, getDb } = await import("../lib/db");
  const { ARCHIVED_EMPTY_HINT, isArchivedLoad } = await import("../lib/working-loads-shared");
  const { archiveCutoff } = await import("../lib/working-loads");
  const { criteriaFromSearchParams, searchShareQuery } = await import("../lib/search");

  const customerId = queries.createCustomer({ name: "Archive Yard", billing_notes: "", contacts: [] });
  const cutoff = archiveCutoff();

  function make(number: string, status: string, delivery: string) {
    const pickup = delivery;
    return queries.createLoad({
      load_number: number,
      customer_id: customerId,
      origin: "Omaha, NE",
      destination: "Dallas, TX",
      pickup_start: pickup,
      pickup_end: pickup,
      delivery_start: delivery,
      delivery_end: delivery,
      weight: 1000,
      commodity: "History",
      rate: 100,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      status,
      truck_id: null,
      driver_id: null,
    });
  }

  const activeId = make("ARC-ACTIVE", "available", iso(3));
  const recentId = make("ARC-RECENT", "delivered", iso(-10));
  const oldId = make("ARC-OLD", "completed", "2019-06-15T17:00:00.000Z");
  const before = (getDb().prepare("SELECT COUNT(*) AS n FROM loads").get() as { n: number }).n;

  const old = queries.getLoad(oldId);
  assert.ok(old);
  assert.equal(isArchivedLoad(old, cutoff), true);
  assert.equal(isArchivedLoad(queries.getLoad(recentId)!, cutoff), false);
  assert.equal(isArchivedLoad(queries.getLoad(activeId)!, cutoff), false);

  const searchDefault = queries.searchLoads({ includeLive: true, includeArchived: false, includeCancelled: false });
  assert.equal(searchDefault.some((load) => load.id === activeId), true);
  assert.equal(searchDefault.some((load) => load.id === recentId), true);
  assert.equal(searchDefault.some((load) => load.id === oldId), false, "old completed stays out of default search");
  assert.equal(
    queries.searchLoads({ includeLive: true, includeArchived: false, q: "ARC-OLD" }).some((load) => load.id === oldId),
    false,
    "typing the old load number does not bypass Include archived",
  );

  const searchArchived = queries.searchLoads({ includeLive: true, includeArchived: true, includeCancelled: false });
  assert.equal(searchArchived.some((load) => load.id === oldId), true);
  assert.equal(
    queries.searchLoads({ includeLive: false, includeArchived: true, q: "ARC-OLD" }).some((load) => load.id === oldId),
    true,
  );

  const allDefault = queries.listLoads({ status: "all", excludeArchived: true });
  assert.equal(allDefault.some((load) => load.id === activeId), true);
  assert.equal(allDefault.some((load) => load.id === recentId), true);
  assert.equal(allDefault.some((load) => load.id === oldId), false, "All Loads hides archived by default");

  const allOn = queries.listLoads({ status: "all", excludeArchived: false });
  assert.equal(allOn.some((load) => load.id === oldId), true, "All Loads with Include archived shows the old load");
  assert.equal(queries.getLoad(oldId)?.load_number, "ARC-OLD", "direct id still opens an archived load");

  const after = (getDb().prepare("SELECT COUNT(*) AS n FROM loads").get() as { n: number }).n;
  assert.equal(after, before, "search and All Loads do not delete historical loads");

  assert.equal(criteriaFromSearchParams({}).includeArchived, false);
  assert.equal(criteriaFromSearchParams({ archived: "1" }).includeArchived, true);
  assert.match(searchShareQuery({ ...criteriaFromSearchParams({}), includeArchived: true, q: "ARC-OLD" }), /archived=1/);
  assert.match(searchShareQuery(criteriaFromSearchParams({ q: "ARC-OLD" })), /^q=ARC-OLD$/);

  const board = read("app/board/page.tsx");
  const toolbar = read("components/board-toolbar.tsx");
  const searchUi = read("components/load-search.tsx");
  const editor = read("components/load-editor.tsx");
  assert.match(toolbar, /Include archived/);
  assert.match(toolbar, /role="switch"/);
  assert.match(toolbar, /archived=1|includeArchived/);
  assert.match(toolbar, /aria-checked/);
  assert.match(board, /excludeArchived/);
  assert.match(board, /ARCHIVED_EMPTY_HINT/);
  assert.match(searchUi, /Include archived/);
  assert.match(searchUi, /role="switch"/);
  assert.match(searchUi, /ARCHIVED_EMPTY_HINT/);
  assert.match(searchUi, /searchShareQuery/);
  assert.equal(ARCHIVED_EMPTY_HINT, "Older loads are archived. Include archived");
  assert.match(editor, /data-archived-badge/);
  assert.match(editor, /Archived/);

  closeDb();
  fs.rmSync(dbPath, { force: true });
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
  console.log("archive window ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
