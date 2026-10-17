/**
 * Synthetic history only. Does not read .env. Times the exception inbox and
 * the active-board data build against about 6,000 completed loads.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-board-perf-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.WORKING_LOAD_WINDOW_DAYS = "45";
delete process.env.ORBCOMM_USERNAME;
delete process.env.ORBCOMM_PASSWORD;
delete process.env.ORBCOMM_ACCOUNT_ID;
delete process.env.SAMSARA_API_TOKEN;

const HISTORY = 6000;
const BUDGET_MS = 500;

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("perf test must not call the network or read credentials");
  }) as typeof fetch;

  const { closeDb, getDb } = await import("../lib/db");
  const db = getDb();
  const stamp = "2018-01-01T00:00:00.000Z";
  db.prepare(
    "INSERT INTO customers (name, billing_notes, created_at, updated_at) VALUES ('History Yard', '', ?, ?)",
  ).run(stamp, stamp);
  const customerId = Number((db.prepare("SELECT id FROM customers LIMIT 1").get() as { id: number }).id);
  const insert = db.prepare(
    `INSERT INTO loads (
       load_number, customer_id, origin, destination,
       pickup_start, pickup_end, delivery_start, delivery_end,
       commodity, rate, notes, status, created_at, updated_at
     ) VALUES (?, ?, 'Omaha, NE', 'Dallas, TX', ?, ?, ?, ?, 'Beef', 1200, '', ?, ?, ?)`,
  );
  const stop = db.prepare(
    `INSERT INTO load_stops (load_id, sequence, kind, name, city, state, window_start, window_end)
     VALUES (?, 1, 'delivery', 'Dock', 'Dallas', 'TX', ?, ?)`,
  );
  const seed = db.transaction(() => {
    for (let index = 0; index < HISTORY; index += 1) {
      const year = 2018 + (index % 7);
      const day = `${year}-06-15T17:00:00.000Z`;
      const start = `${year}-06-14T08:00:00.000Z`;
      const id = Number(
        insert.run(`HIST-${index}`, customerId, start, start, day, day, "completed", day, day).lastInsertRowid,
      );
      stop.run(id, day, day);
    }
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const live = new Date().toISOString();
    for (let index = 0; index < 12; index += 1) {
      const id = Number(
        insert.run(`LIVE-${index}`, customerId, live, live, live, live, "in_transit", live, live).lastInsertRowid,
      );
      stop.run(id, live, live);
    }
    insert.run("RECENT-1", customerId, recent, recent, recent, recent, "delivered", recent, recent);
  });
  seed();

  const before = (db.prepare("SELECT COUNT(*) AS n FROM loads WHERE status = 'completed'").get() as { n: number }).n;
  assert.equal(before, HISTORY);

  const { listLoads } = await import("../lib/queries");
  const scanStarted = Date.now();
  const scanned = listLoads({ status: "all" });
  const scanMs = Date.now() - scanStarted;
  console.log(`before full listLoads({ status: 'all' }) ${scanMs} ms rows ${scanned.length}`);

  const { buildBoardWorkingData } = await import("../lib/board-data");
  const started = Date.now();
  const built = buildBoardWorkingData(new Date());
  const elapsed = Date.now() - started;
  console.log(
    `board data ${elapsed} ms; loads ${built.loads.length}; exceptions ${built.inbox.items.length}; lanes ${built.lanes.size}`,
  );
  assert.ok(elapsed < BUDGET_MS, `board data build took ${elapsed} ms, budget ${BUDGET_MS} ms`);
  assert.equal(built.loads.length, 12);
  assert.equal(
    built.inbox.items.some((item) => item.loadNumber.startsWith("HIST-")),
    false,
    "old completed history stays out of the exception inbox",
  );
  const after = (db.prepare("SELECT COUNT(*) AS n FROM loads WHERE status = 'completed'").get() as { n: number }).n;
  assert.equal(after, before, "the build does not delete or rewrite historical loads");

  globalThis.fetch = originalFetch;
  closeDb();
  fs.rmSync(dbPath, { force: true });
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
  console.log("board perf ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
