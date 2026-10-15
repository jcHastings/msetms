/**
 * Merge duplicate locations.
 *
 * Dry-run is the default. It prints a JSON report and does not write.
 *   npm run locations:merge -- --db /path/to/tms.db
 *   npm run locations:merge -- --db /path/to/tms.db --report /tmp/location-merge.json
 *
 * Apply archives the copies in one transaction. It refuses unless --backup
 * points at an existing file modified in the last 60 minutes.
 *   npm run locations:merge -- --db /path/to/tms.db --apply --backup /path/to/tms.db.bak
 *
 * --groups is a JSON file of explicit keep/merge id pairs:
 *   [{ "keep": 1, "merge": [2, 3] }]
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
  if (!dbArg) {
    throw new Error("Pass --db /path/to/tms.db");
  }
  const dbPath = path.resolve(dbArg);
  const { applyLocationMerges, backupIsFresh, openMergeDb, parseExplicitGroups, planLocationMerges } = await import(
    "../lib/location-merge"
  );
  if (apply) {
    const backup = arg("backup") ?? "";
    const fresh = backupIsFresh(backup);
    if (!fresh.ok) throw new Error(fresh.error);
  }
  const groupsArg = arg("groups");
  const explicit = groupsArg ? parseExplicitGroups(fs.readFileSync(path.resolve(groupsArg), "utf8")) : undefined;
  const db = openMergeDb(dbPath, apply);
  try {
    const plan = planLocationMerges(db, explicit);
    const report = apply ? applyLocationMerges(db, plan) : plan;
    const json = JSON.stringify(report, null, 2);
    const reportPath = arg("report");
    if (reportPath) fs.writeFileSync(path.resolve(reportPath), `${json}\n`);
    process.stdout.write(`${json}\n`);
  } finally {
    db.close();
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("location-merge.ts") || entry.endsWith("location-merge.js")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
