/**
 * Point archived, merged location names at the kept row.
 *
 * Dry-run is the default. It prints a JSON report and does not write.
 *   npm run locations:alias-backfill -- --db /path/to/tms.db
 *
 * Apply inserts the missing aliases. It refuses unless --backup points at
 * an existing file modified in the last 60 minutes.
 *   npm run locations:alias-backfill -- --db /path/to/tms.db --apply --backup /path/to/tms.db.bak
 */
import fs from "node:fs";
import path from "node:path";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : "";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dbArg = arg("db") || process.env.TMS_DB_PATH || "";
  if (!dbArg) throw new Error("Pass --db /path/to/tms.db");
  const dbPath = path.resolve(dbArg);
  const { backupIsFresh, openMergeDb } = await import("../lib/location-merge");
  const { applyLocationAliasBackfill, planLocationAliasBackfill } = await import("../lib/location-alias");
  if (apply) {
    const backup = arg("backup") ?? "";
    const fresh = backupIsFresh(backup);
    if (!fresh.ok) throw new Error(fresh.error);
  }
  const db = openMergeDb(dbPath, apply);
  try {
    const plan = planLocationAliasBackfill(db);
    const report = apply ? applyLocationAliasBackfill(db, plan) : plan;
    const json = JSON.stringify(report, null, 2);
    const reportPath = arg("report");
    if (reportPath) fs.writeFileSync(path.resolve(reportPath), `${json}\n`);
    process.stdout.write(`${json}\n`);
  } finally {
    db.close();
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("location-alias-backfill.ts") || entry.endsWith("location-alias-backfill.js")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
