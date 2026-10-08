/**
 * ITS all-loads backfill / refresh.
 * Dry-run is the default. Nothing is written unless --apply is present.
 * Does not read .env. Does not call ITS or QuickBooks.
 */
import fs from "node:fs";
import path from "node:path";
import { ITS_IMPORT_USAGE } from "../lib/its-import-shared";

type Flags = {
  db?: string;
  apply: boolean;
  dryRun: boolean;
  msTrailerAlias: boolean;
  importRate: boolean;
  createInactiveUnits: boolean;
  files: string[];
  help: boolean;
};

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    apply: false,
    dryRun: false,
    msTrailerAlias: true,
    importRate: true,
    createInactiveUnits: false,
    files: [],
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
      continue;
    }
    if (arg === "--apply") {
      flags.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (arg === "--no-ms-trailer-alias") {
      flags.msTrailerAlias = false;
      continue;
    }
    if (arg === "--ms-trailer-alias") {
      flags.msTrailerAlias = true;
      continue;
    }
    if (arg === "--no-import-rate") {
      flags.importRate = false;
      continue;
    }
    if (arg === "--import-rate") {
      flags.importRate = true;
      continue;
    }
    if (arg === "--create-inactive-units") {
      flags.createInactiveUnits = true;
      continue;
    }
    if (arg === "--db") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--db needs a path.");
      }
      flags.db = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}.`);
    flags.files.push(arg);
  }
  return flags;
}

function printUsage(): void {
  console.log(ITS_IMPORT_USAGE);
  console.log("Default is --dry-run. --apply writes. ms-trailer-alias and import-rate default on.");
  console.log("create-inactive-units defaults off. A blank or Assign Later truck, trailer, or driver is left as-is.");
  console.log("With --create-inactive-units, a dry-run lists each inactive truck, driver, and trailer it would create, with a load count.");
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || flags.files.length === 0) {
    printUsage();
    process.exit(flags.help ? 0 : 2);
  }
  if (flags.apply && flags.dryRun) {
    console.error("Pass either --dry-run or --apply.");
    process.exit(2);
  }
  for (const filePath of flags.files) {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(2);
    }
  }
  if (flags.db) process.env.TMS_DB_PATH = path.resolve(flags.db);
  const { formatItsImportText, runItsImportFiles } = await import("../lib/its-import");
  const summary = runItsImportFiles(flags.files.map((filePath) => path.resolve(filePath)), {
    apply: flags.apply,
    msTrailerAlias: flags.msTrailerAlias,
    importRate: flags.importRate,
    createInactiveUnits: flags.createInactiveUnits,
  });
  console.log(formatItsImportText(summary));
  console.log("");
  console.log("ITS_IMPORT_JSON");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
