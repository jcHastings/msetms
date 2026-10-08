/**
 * Build driver copies for rate confirmations already on file.
 * Dry run unless --apply. Copies are held for office review (not released).
 *
 *   npx tsx scripts/backfill-rate-con-redactions.ts
 *   npx tsx scripts/backfill-rate-con-redactions.ts --apply
 */
import { getDb } from "../lib/db";
import { redactStoredRateCon, shutdownDriverRateConOcr } from "../lib/rate-con-redact";
import { getRateConRedactionBySource, listRateConAttachmentIds } from "../lib/rate-con-redact-store";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  getDb();
  const rows = listRateConAttachmentIds();
  const pending = rows.filter((row) => !getRateConRedactionBySource(row.id)?.stored_name);
  console.log(`${pending.length} of ${rows.length} rate confirmation(s) need a driver copy.`);
  if (!apply) {
    for (const row of pending) {
      console.log(`would redact attachment ${row.id} on load ${row.load_id} (${row.original_name})`);
    }
    console.log("Dry run. Pass --apply to write copies and leave them in office review.");
    return;
  }
  for (const row of pending) {
    const saved = await redactStoredRateCon(row.id, { holdForOffice: true });
    console.log(
      `attachment ${row.id} load ${row.load_id} → ${saved?.status ?? "skipped"} ${saved?.reason ?? ""}`.trim(),
    );
  }
}

main()
  .then(async () => {
    await shutdownDriverRateConOcr();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
