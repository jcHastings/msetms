/**
 * Apply fuel card aliases and truck assignments from a JSON file on this machine.
 * The file is not in git. Copy data/fuel-card-directory.example.json for the shape.
 *
 * Dry-run is the default. It does not write aliases or assignments.
 *   npm run fuel:card-directory -- --db /path/to/tms.db --file /path/on/box/fuel-card-directory.json
 *
 * Apply writes the file into that database.
 *   npm run fuel:card-directory -- --db /path/to/tms.db --file /path/on/box/fuel-card-directory.json --apply
 */
import path from "node:path";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : "";
}

async function main() {
  const fileArg = arg("file") || "";
  const dbArg = arg("db") || process.env.TMS_DB_PATH || "";
  if (!fileArg) throw new Error("Pass --file /path/on/box/fuel-card-directory.json");
  if (!dbArg) throw new Error("Pass --db /path/to/tms.db");
  const filePath = path.resolve(fileArg);
  const { readFuelCardDirectory, applyFuelCardDirectory } = await import("../lib/fuel-card-seed");
  const directory = readFuelCardDirectory(filePath);
  process.env.TMS_DB_PATH = path.resolve(dbArg);
  const { getDb } = await import("../lib/db");
  const result = applyFuelCardDirectory(getDb(), directory, { write: process.argv.includes("--apply") });
  process.stdout.write(`${JSON.stringify({ apply: process.argv.includes("--apply"), ...result }, null, 2)}\n`);
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("seed-fuel-card-directory.ts") || entry.endsWith("seed-fuel-card-directory.js")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
