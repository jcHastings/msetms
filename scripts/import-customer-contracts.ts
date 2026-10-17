/**
 * Import customer contract terms, requirements, and PDFs.
 *
 * Dry-run is the default. Nothing is written unless --apply is present.
 * Paths are required. This script does not read .env and does not ship customer files.
 *
 *   npx tsx scripts/import-customer-contracts.ts \
 *     --terms scripts/fixtures/customer-contracts/terms.csv \
 *     --requirements scripts/fixtures/customer-contracts/requirements.csv \
 *     --pdfs scripts/fixtures/customer-contracts/pdfs
 */
import { formatImportReport, importCustomerContracts } from "../lib/customer-contract-import";

type Flags = {
  terms?: string;
  requirements?: string;
  pdfs?: string;
  db?: string;
  apply: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { apply: false, help: false };
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
    const value = argv[index + 1];
    if (arg === "--terms" || arg === "--requirements" || arg === "--pdfs" || arg === "--db") {
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a path.`);
      if (arg === "--terms") flags.terms = value;
      if (arg === "--requirements") flags.requirements = value;
      if (arg === "--pdfs") flags.pdfs = value;
      if (arg === "--db") flags.db = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${arg}`);
  }
  return flags;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/import-customer-contracts.ts --terms <csv> --requirements <csv> --pdfs <folder> [--db <sqlite>] [--apply]",
    "Dry-run is the default. --apply writes terms, requirements, and PDFs.",
    "Customers match by name (and by the slug of that name). Unmatched names are reported.",
  ].join("\n");
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return;
  }
  if (!flags.terms || !flags.requirements || !flags.pdfs) {
    throw new Error(`${usage()}\n\n--terms, --requirements, and --pdfs are required.`);
  }
  if (flags.db) process.env.TMS_DB_PATH = flags.db;
  const report = importCustomerContracts({
    termsPath: flags.terms,
    requirementsPath: flags.requirements,
    pdfDir: flags.pdfs,
    apply: flags.apply,
  });
  console.log(formatImportReport(report));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
