/**
 * A brief SQLite lock after fuel rows commit must not fail the import.
 * Synthetic CSV is saved, busy_timeout is set on every connection, and a
 * thrown follow-up step comes back as a warning with the counts intact.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-fuel-lock-"));
const dbPath = path.join(tmp, "tms.db");
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";

function busyTimeoutMs(db: { pragma: (source: string) => unknown }): number {
  const rows = db.pragma("busy_timeout") as Array<{ timeout?: number }>;
  return Number(rows[0]?.timeout);
}

function syntheticFuelCsv(invoice: string, unit: string, gallons: string, total: string): string {
  return [
    "Date,Time,Driver Name,Unit,Location,Category,Gallons,Price,Total,Invoice",
    `10/01/2026,08:15,Pat Example,${unit},${unit} yard,Diesel,${gallons},3.50,${total},${invoice}`,
  ].join("\n");
}

async function main() {
  const { Database } = await import("../lib/sqlite");
  const { closeDb, getDb } = await import("../lib/db");
  const fuelStore = await import("../lib/fuel-store");
  const { importFuelFromUpload } = await import("../lib/fuel-import");

  const directPath = path.join(tmp, "direct.db");
  const direct = new Database(directPath);
  try {
    assert.equal(busyTimeoutMs(direct), 5000, "every Database connection waits 5s on SQLITE_BUSY");
  } finally {
    direct.close();
  }
  assert.equal(busyTimeoutMs(getDb()), 5000, "getDb connection waits 5s on SQLITE_BUSY");

  const saved = fuelStore.importFuelFromText(syntheticFuelCsv("SYN-LOCK-1", "210", "50", "175.00"), "synthetic-ok.csv");
  assert.equal(saved.created, 1);
  assert.equal(saved.skipped, 0);
  assert.equal(saved.unmatched, 0);
  assert.equal(saved.errors.length, 0);
  assert.equal(saved.warning, undefined);

  fuelStore.setFuelImportPostSaveStepForTests("rematchUnmatchedFuelTransactions", () => {
    throw new Error("database is locked");
  });
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const file = new File([syntheticFuelCsv("SYN-LOCK-2", "108", "22", "77.00")], "synthetic-lock.csv", { type: "text/csv" });
    const result = await importFuelFromUpload(file);
    assert.equal(result.ok, true, "a thrown follow-up step still succeeds the import");
    assert.equal(result.created, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.unmatched, 0);
    assert.deepEqual(result.errors ?? [], []);
    assert.match(result.warning ?? "", /Saved, but a follow-up step failed: database is locked/);
    assert.ok(
      logged.some(
        (args) =>
          args.some((arg) => String(arg).includes("Fuel import saved, but a follow-up step failed.")) &&
          args.some((arg) => arg instanceof Error && arg.message === "database is locked"),
      ),
      "follow-up failure is logged with console.error",
    );
  } finally {
    console.error = originalError;
    fuelStore.setFuelImportPostSaveStepForTests("rematchUnmatchedFuelTransactions", null);
  }

  const invoices = (
    getDb().prepare("SELECT invoice_number FROM fuel_transactions ORDER BY invoice_number").all() as Array<{
      invoice_number: string;
    }>
  ).map((row) => row.invoice_number);
  assert.deepEqual(invoices, ["SYN-LOCK-1", "SYN-LOCK-2"]);

  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("fuel-import-lock-test: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
