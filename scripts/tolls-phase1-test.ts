import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const dbPath = path.join(os.tmpdir(), `tms-tolls-phase1-${Date.now()}.db`);
process.env.TMS_DB_PATH = dbPath;

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mdY(ymd: string): string {
  const [year, month, day] = ymd.split("-");
  return `${month}/${day}/${year}`;
}

async function main() {
  const { getDb, closeDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const tolls = await import("../lib/tolls-store");
  const { localWeekRange } = await import("../lib/fuel");

  const db = getDb();
  const trucks = queries.listTrucks();
  const drivers = queries.listDrivers();
  assert.ok(trucks.length > 0, "seed should create trucks");
  assert.ok(drivers.length > 0, "seed should create drivers");

  const truck = trucks[0];
  const driver = drivers.find((item) => item.truck_id === truck.id) ?? drivers[0];
  db.prepare("UPDATE trucks SET prepass_transponder_id = ? WHERE id = ?").run("PP-778899", truck.id);
  db.prepare("UPDATE drivers SET truck_id = ?, updated_at = ? WHERE id = ?").run(truck.id, new Date().toISOString(), driver.id);

  const now = new Date("2026-09-22T12:00:00Z");
  const week = localWeekRange(now).startYmd;
  const inWeekA = mdY(week);
  const inWeekB = mdY(addDays(week, 1));
  const inMonthOutsideWeek = "09/05/2026";

  const csv = [
    "Date,Time,Transponder ID,Unit,Driver Name,Plaza,State,Category,Amount,Invoice,Reference",
    `${inWeekA},08:00,PP-778899,${truck.unit_number},${driver.name},I-80 Plaza,NE,Toll,10.00,INV-1,REF-1`,
    `${inWeekB},09:00,PP-778899,${truck.unit_number},${driver.name},Bypass Gate,NE,Scale Bypass,5.00,INV-2,REF-2`,
    `${inMonthOutsideWeek},07:45,PP-778899,${truck.unit_number},${driver.name},Turnpike East,PA,Toll,7.00,INV-3,REF-3`,
    `${inWeekA},11:30,UNKNOWN-999,,,Unknown Plaza,KS,Toll,9.00,INV-4,REF-4`,
  ].join("\n");

  const imported = tolls.importTollsFromText(csv, "phase1-test.csv");
  assert.equal(imported.created, 3, "three rows should auto-match by transponder");
  assert.equal(imported.unmatched, 1, "unknown transponder row should stay unmatched");
  assert.equal(imported.errors?.length ?? 0, 0, "test import should parse cleanly");

  const allRows = tolls.listTollTransactions();
  assert.equal(allRows.length, 4, "all toll rows should be stored");

  const matched = allRows.find((row) => row.invoice_number === "INV-1");
  assert.ok(matched, "matched toll row exists");
  assert.equal(matched.driver_id, driver.id, "transponder should map toll row to driver");
  assert.equal(matched.truck_id, truck.id, "transponder should map toll row to truck");

  const unknown = allRows.find((row) => row.invoice_number === "INV-4");
  assert.ok(unknown, "unknown transponder row exists");
  assert.equal(unknown.driver_id, null, "unknown transponder stays unassigned");

  const scaleBypass = allRows.find((row) => row.invoice_number === "INV-2");
  assert.equal(scaleBypass?.category, "scale_bypass", "scale bypass category should persist separately");

  const weekView = tolls.loadTollPeriodView({ week, period: "week" }, now);
  assert.equal(Number(weekView.totals.toll.toFixed(2)), 19, "weekly toll totals should include toll rows in week");
  assert.equal(Number(weekView.totals.scale_bypass.toFixed(2)), 5, "weekly scale-bypass totals should include only scale-bypass rows");
  assert.equal(Number(weekView.totals.total.toFixed(2)), 24, "weekly total should sum toll + scale-bypass");

  const monthView = tolls.loadTollPeriodView({ week, period: "month" }, now);
  assert.equal(Number(monthView.totals.toll.toFixed(2)), 26, "monthly toll totals should include earlier month toll rows");
  assert.equal(Number(monthView.totals.scale_bypass.toFixed(2)), 5, "monthly scale-bypass totals should roll up correctly");
  assert.equal(Number(monthView.totals.total.toFixed(2)), 31, "monthly total should sum category totals");

  closeDb();
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  console.log("tolls-phase1-test: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
