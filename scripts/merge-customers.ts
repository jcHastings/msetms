/**
 * Merge customers from a CSV. Dry-run is the default and writes nothing.
 *
 *   npx tsx scripts/merge-customers.ts --csv scripts/fixtures/customer-merges/example.csv
 *   npx tsx scripts/merge-customers.ts --db /path/to/tms.db --csv /path/to/merges.csv
 *   npx tsx scripts/merge-customers.ts --db /path/to/tms.db --csv /path/to/merges.csv --apply
 *
 * Columns: keeper_id, loser_id, mc_number. One row per loser. Rows that share a
 * keeper_id merge in one transaction. mc_number is optional. Two different MC
 * values for the same keeper are an error. The example file uses placeholder
 * ids and is not a real merge.
 *
 * Losers are archived, never deleted. Nothing is sent to QuickBooks. No .env.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "../lib/customer-contract-shared";
import { normalizeMcNumber } from "../lib/customer-name";

type CsvRow = { line: number; keeperId: number; loserId: number; mc: string };
type Group = { keeperId: number; loserIds: number[]; mcNumber: string };

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : "";
}

function rowsFromCsv(text: string): CsvRow[] {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const keeper = header.indexOf("keeper_id");
  const loser = header.indexOf("loser_id");
  const mc = header.indexOf("mc_number");
  if (keeper < 0 || loser < 0 || mc < 0) {
    throw new Error("CSV needs columns keeper_id, loser_id, mc_number.");
  }
  const rows: CsvRow[] = [];
  for (let index = 1; index < table.length; index += 1) {
    const line = table[index] ?? [];
    if (line.every((cell) => !String(cell).trim())) continue;
    const keeperId = Number(String(line[keeper] ?? "").trim());
    const loserId = Number(String(line[loser] ?? "").trim());
    rows.push({
      line: index + 1,
      keeperId,
      loserId,
      mc: String(line[mc] ?? "").trim(),
    });
  }
  if (!rows.length) throw new Error("The CSV has no merge rows.");
  return rows;
}

function groupsFromRows(rows: CsvRow[]): Group[] {
  const order: number[] = [];
  const grouped = new Map<number, { loserIds: number[]; mcs: string[] }>();
  for (const row of rows) {
    const current = grouped.get(row.keeperId) ?? { loserIds: [], mcs: [] };
    if (!grouped.has(row.keeperId)) order.push(row.keeperId);
    if (!current.loserIds.includes(row.loserId)) current.loserIds.push(row.loserId);
    if (row.mc) current.mcs.push(row.mc);
    grouped.set(row.keeperId, current);
  }
  return order.map((keeperId) => {
    const group = grouped.get(keeperId)!;
    const distinct = [...new Set(group.mcs.map((value) => normalizeMcNumber(value)).filter(Boolean))];
    if (distinct.length > 1) {
      throw new Error(
        `Keeper ${keeperId} has more than one MC in the file (${group.mcs.join(", ")}). Nothing was written.`,
      );
    }
    const mcNumber = group.mcs.find((value) => normalizeMcNumber(value)) ?? "";
    return { keeperId, loserIds: group.loserIds, mcNumber };
  });
}

async function main() {
  const csvArg = arg("csv");
  if (!csvArg) throw new Error("Pass --csv /path/to/merges.csv");
  const dbArg = arg("db");
  if (dbArg) process.env.TMS_DB_PATH = path.resolve(dbArg);
  const apply = process.argv.includes("--apply");
  const groups = groupsFromRows(rowsFromCsv(fs.readFileSync(path.resolve(csvArg), "utf8")));
  const { formatCustomerMergePlan, mergeCustomers, planCustomerMerge } = await import("../lib/customer-merge");
  const plans = groups.map((group) => ({
    group,
    planned: planCustomerMerge({
      keeperId: group.keeperId,
      loserIds: group.loserIds,
      mcNumber: group.mcNumber,
    }),
  }));
  const failed = plans.filter((item) => !item.planned.ok);
  if (failed.length) {
    for (const item of failed) {
      if (!item.planned.ok) {
        process.stderr.write(`Keeper ${item.group.keeperId}: ${item.planned.error}\n`);
      }
    }
    throw new Error("Nothing was written.");
  }
  const lines: string[] = [];
  for (const item of plans) {
    if (!item.planned.ok) continue;
    if (apply) {
      mergeCustomers({
        keeperId: item.group.keeperId,
        loserIds: item.group.loserIds,
        mcNumber: item.group.mcNumber,
        actor: "script",
      });
    }
    lines.push(formatCustomerMergePlan(item.planned.plan, !apply));
  }
  process.stdout.write(`${lines.join("\n\n")}\n`);
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("merge-customers.ts") || entry.endsWith("merge-customers.js")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
