/**
 * Customer MC numbers, aliases, merge, undo, and the CSV dry-run.
 * Fixture names only. No QuickBooks calls.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-customer-merge-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.TMS_DATA_DIR = path.dirname(dbPath);

const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
const NOW = "2026-06-02T15:00:00.000Z";

type Sql = {
  prepare: (sql: string) => {
    run: (...args: unknown[]) => { lastInsertRowid: number | bigint };
    get: (...args: unknown[]) => unknown;
    all: (...args: unknown[]) => unknown[];
  };
  exec: (sql: string) => void;
};

function runCli(args: string[]) {
  return spawnSync(tsxBin, ["scripts/merge-customers.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function customerRow(db: Sql, id: number) {
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as {
    id: number;
    name: string;
    billing_notes: string;
    credit_hold: number;
    payment_terms: string;
    qbo_customer_id: string;
    main_email: string;
    billing_email: string;
    mc_number: string;
    dot_number: string;
    archived_at: string | null;
    merged_into: number | null;
  };
}

function countNamed(db: Sql, name: string): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM customers WHERE name = ?").get(name) as { n: number }).n);
}

async function main() {
  const mergeSource = fs.readFileSync(path.join(process.cwd(), "lib/customer-merge.ts"), "utf8");
  assert.doesNotMatch(mergeSource, /integrations\/quickbooks/);
  assert.doesNotMatch(mergeSource, /sendLoadToQuickbooks|sendBillToQuickbooks/);

  const merge = await import("../lib/customer-merge");
  const dbMod = await import("../lib/db");
  const queries = await import("../lib/queries");
  const actions = await import("../lib/actions");
  const mergeActions = await import("../lib/customer-merge-actions");
  const rateCon = await import("../lib/rate-con");
  const its = await import("../lib/its-import");
  const itsShared = await import("../lib/its-import-shared");
  const sheetShared = await import("../lib/load-import-shared");
  const contracts = await import("../lib/customer-contract-import");
  const names = await import("../lib/customer-name");
  const db = dbMod.getDb() as unknown as Sql;

  const columns = merge.customerIdColumns(db);
  assert.deepEqual(merge.missingCustomerFkTargets(columns), []);
  assert.deepEqual(merge.unknownCustomerFkTargets(columns), []);
  const fake = merge.missingCustomerFkTargets([...columns, { table: "future_widgets", column: "customer_id" }]);
  assert.deepEqual(fake, ["future_widgets.customer_id"]);
  db.exec("CREATE TABLE future_widgets (id INTEGER PRIMARY KEY, customer_id INTEGER)");
  assert.throws(() => merge.assertCustomerFkCoverage(db), /future_widgets\.customer_id/);
  db.exec("DROP TABLE future_widgets");
  merge.assertCustomerFkCoverage(db);

  const north = queries.createCustomer({
    name: "Fixture North Pantry",
    billing_notes: "",
    credit_hold: false,
    contacts: [],
  });
  const harbor = queries.createCustomer({
    name: "Fixture Harbor Pantry",
    billing_notes: "Fixture billing note",
    credit_hold: true,
    payment_terms: "Net 21",
    main_email: "harbor@example.com",
    mc_number: "MC-880001",
    dot_number: "770001",
    contacts: [{ name: "Harbor Desk", role: "billing", phone: "555-0101", email: "harbor-desk@example.com" }],
  });
  const maple = queries.createCustomer({
    name: "Fixture Maple Desk",
    billing_notes: "",
    contacts: [{ name: "Maple Desk", role: "", phone: "", email: "" }],
  });
  const cedar = queries.createCustomer({
    name: "Fixture Cedar Pantry",
    billing_notes: "",
    contacts: [],
  });
  const pine = queries.createCustomer({
    name: "Fixture Pine Desk",
    billing_notes: "",
    contacts: [],
  });
  const oak = queries.createCustomer({
    name: "Fixture Oak Desk",
    billing_notes: "",
    mc_number: "880002",
    contacts: [],
  });

  db.prepare("UPDATE customers SET qbo_customer_id = ? WHERE id = ?").run("QBO-KEEP", north);
  db.prepare("UPDATE customers SET qbo_customer_id = ? WHERE id = ?").run("QBO-MAPLE", maple);
  db.prepare("UPDATE customers SET qbo_customer_id = ? WHERE id = ?").run("QBO-PINE", pine);
  db.prepare(
    `INSERT INTO customer_detention_terms (
      customer_id, rate_per_hour, free_hours, billing_increment_minutes, cap_per_day, cap_per_stop,
      notice_lead_minutes, conditions, updated_at
    ) VALUES (?, NULL, 2, NULL, NULL, NULL, NULL, '', ?)`,
  ).run(north, NOW);
  db.prepare(
    `INSERT INTO customer_detention_terms (
      customer_id, rate_per_hour, free_hours, billing_increment_minutes, cap_per_day, cap_per_stop,
      notice_lead_minutes, conditions, updated_at
    ) VALUES (?, 50, NULL, NULL, NULL, NULL, NULL, '', ?)`,
  ).run(harbor, NOW);

  const load = db
    .prepare(
      `INSERT INTO loads (
        load_number, customer_id, origin, destination, pickup_start, pickup_end, delivery_start, delivery_end,
        created_at, updated_at, qbo_invoice_id, tms_invoice_number
      ) VALUES ('8800100', ?, 'Fixture Dock', 'Fixture Yard', ?, ?, ?, ?, ?, ?, 'FIX-INV-880001', 'TMS-880001')`,
    )
    .run(harbor, NOW, NOW, NOW, NOW, NOW, NOW).lastInsertRowid;
  const loadId = Number(load);
  db.prepare(
    `INSERT INTO attachments (load_id, kind, original_name, stored_name, mime_type, uploaded_by, created_at)
     VALUES (?, 'pod', 'fixture-pod.pdf', 'fixture-pod.pdf', 'application/pdf', 'script', ?)`,
  ).run(loadId, NOW);
  db.prepare(
    `INSERT INTO load_templates (name, customer_id, created_at) VALUES ('Fixture template', ?, ?)`,
  ).run(harbor, NOW);
  db.prepare(
    `INSERT INTO customer_contracts (customer_id, original_name, stored_name, mime_type, signed_on, source, created_at)
     VALUES (?, 'fixture-contract.pdf', 'fixture-contract.pdf', 'application/pdf', '2026-01-01', 'other', ?)`,
  ).run(harbor, NOW);
  const requirementId = Number(
    db
      .prepare(
        `INSERT INTO customer_requirements (
          customer_id, trigger, deadline_hours, time_of_day, requirement, quoted_clause, page, created_at, updated_at
        ) VALUES (?, 'after_pickup', 24, '', 'Fixture send the POD', '', '', ?, ?)`,
      )
      .run(harbor, NOW, NOW).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO load_requirement_reminders (load_id, requirement_id, status, snooze_until, done_at, updated_at)
     VALUES (?, ?, 'open', '', '', ?)`,
  ).run(loadId, requirementId, NOW);
  db.prepare(
    `INSERT INTO detention_requests (load_id, stop_id, status, created_at, updated_at)
     VALUES (?, 1, 'draft', ?, ?)`,
  ).run(loadId, NOW, NOW);

  const harborContact = Number(
    (db.prepare("SELECT id FROM contacts WHERE customer_id = ?").get(harbor) as { id: number }).id,
  );
  const mapleContact = Number(
    (db.prepare("SELECT id FROM contacts WHERE customer_id = ?").get(maple) as { id: number }).id,
  );
  const templateId = Number(
    (db.prepare("SELECT id FROM load_templates WHERE customer_id = ?").get(harbor) as { id: number }).id,
  );
  const contractId = Number(
    (db.prepare("SELECT id FROM customer_contracts WHERE customer_id = ?").get(harbor) as { id: number }).id,
  );

  assert.throws(
    () => merge.mergeCustomers({ keeperId: cedar, loserIds: [pine] }),
    /This merge does not call QuickBooks/,
  );
  const blocked = merge.planCustomerMerge({ keeperId: cedar, loserIds: [pine] });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /This merge does not call QuickBooks/);
  assert.equal(
    Number((db.prepare("SELECT COUNT(*) AS n FROM customer_merges").get() as { n: number }).n),
    0,
  );
  assert.equal(customerRow(db, pine).archived_at, null);
  assert.equal(customerRow(db, pine).qbo_customer_id, "QBO-PINE");

  process.env.TMS_SCRIPT_ACTOR_ROLE = "dispatcher";
  const denied = await mergeActions.previewCustomerMergeAction(north, [harbor]);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.error, /Only an Administrator can merge customers/);
  process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";
  const allowed = await mergeActions.previewCustomerMergeAction(north, [harbor, maple]);
  assert.equal(allowed.ok, true);
  delete process.env.TMS_SCRIPT_ACTOR_ROLE;

  const preview = merge.planCustomerMerge({ keeperId: north, loserIds: [harbor, maple] });
  assert.equal(preview.ok, true);
  if (!preview.ok) throw new Error(preview.error);
  assert.equal(preview.plan.counts.loads, 1);
  assert.equal(preview.plan.counts.contacts, 2);
  assert.equal(preview.plan.counts.documents, 1);
  assert.equal(preview.plan.counts.load_templates, 1);
  assert.equal(preview.plan.counts.contracts, 1);
  assert.equal(preview.plan.counts.detention_terms, 1);
  assert.equal(preview.plan.counts.requirements, 1);
  assert.equal(preview.plan.counts.reminders, 1);
  assert.equal(preview.plan.counts.detention_requests, 1);
  assert.equal(preview.plan.counts.invoices, 1);
  assert.equal(preview.plan.creditHoldAfter, 1);

  const beforeCount = countNamed(db, "Fixture Harbor Pantry");
  const merged = merge.mergeCustomers({ keeperId: north, loserIds: [harbor, maple], actor: "script" });
  const audit = merge.getCustomerMerge(merged.mergeId);
  assert.ok(audit);
  const repointed = new Set(audit!.snapshot.repointed.flatMap((row) => row.ids.map((id) => `${row.table}:${id}`)));
  for (const key of [
    `loads:${loadId}`,
    `contacts:${harborContact}`,
    `contacts:${mapleContact}`,
    `load_templates:${templateId}`,
    `customer_contracts:${contractId}`,
    `customer_requirements:${requirementId}`,
    `customer_detention_terms:${harbor}`,
  ]) {
    assert.ok(repointed.has(key), key);
  }

  for (const table of ["loads", "contacts", "load_templates", "customer_contracts", "customer_requirements"] as const) {
    const left = Number(
      (
        db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE customer_id IN (?, ?)`).get(harbor, maple) as { n: number }
      ).n,
    );
    assert.equal(left, 0, table);
  }
  assert.equal(
    Number((db.prepare("SELECT customer_id FROM loads WHERE id = ?").get(loadId) as { customer_id: number }).customer_id),
    north,
  );
  assert.equal(customerRow(db, harbor).merged_into, north);
  assert.ok(customerRow(db, harbor).archived_at);
  assert.equal(customerRow(db, maple).merged_into, north);
  const keeper = customerRow(db, north);
  assert.equal(keeper.credit_hold, 1);
  assert.equal(keeper.main_email, "harbor@example.com");
  assert.equal(keeper.payment_terms, "Net 21");
  assert.equal(keeper.billing_notes, "Fixture billing note");
  assert.equal(keeper.dot_number, "770001");
  assert.equal(keeper.mc_number, "MC-880001");
  assert.equal(keeper.qbo_customer_id, "QBO-KEEP");
  assert.equal(customerRow(db, maple).qbo_customer_id, "QBO-MAPLE");
  assert.equal(customerRow(db, harbor).qbo_customer_id, "");
  const terms = db.prepare("SELECT rate_per_hour, free_hours FROM customer_detention_terms WHERE customer_id = ?").get(north) as {
    rate_per_hour: number | null;
    free_hours: number | null;
  };
  assert.equal(terms.free_hours, 2);
  assert.equal(terms.rate_per_hour, 50);
  assert.equal(
    Number(
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM customer_aliases WHERE customer_id = ? AND name = ?")
          .get(north, "Fixture Harbor Pantry") as { n: number }
      ).n,
    ),
    1,
  );
  assert.equal(queries.listCustomers().some((row) => row.id === harbor || row.id === maple), false);
  assert.equal(queries.findOrCreateCustomer("Fixture Harbor Pantry"), north);
  assert.equal(queries.findOrCreateCustomer("Fixture Harbor Pantry LLC"), north);
  assert.equal(countNamed(db, "Fixture Harbor Pantry"), beforeCount);
  assert.equal(countNamed(db, "Fixture Harbor Pantry LLC"), 0);

  const parsed = rateCon.parseRateConText("Customer: Fixture Harbor Pantry\n", queries.listCustomers());
  assert.equal(parsed.customer_id, north);

  const itsSummary = its.importItsRecords(
    sheetShared.recordsFromLoadSheetText(
      [itsShared.ITS_ALL_LOADS_HEADERS.join(","), loadRow(itsShared.ITS_ALL_LOADS_HEADERS)].join("\n"),
    ),
    { apply: true, snapshot: "2026-10-07T23:59:59.999Z" },
  );
  assert.equal(itsSummary.added, 1, JSON.stringify(itsSummary.exception_items));
  const imported = db.prepare("SELECT customer_id FROM loads WHERE load_number = ?").get("8800101") as {
    customer_id: number;
  };
  assert.equal(imported.customer_id, north);
  assert.equal(countNamed(db, "Fixture Harbor Pantry"), beforeCount);

  const pdfDir = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-contracts-"));
  const termsPath = path.join(pdfDir, "terms.csv");
  const requirementsPath = path.join(pdfDir, "requirements.csv");
  fs.writeFileSync(
    termsPath,
    [
      "customer_name,rate_per_hour,free_hours,billing_increment_minutes,cap_per_day,cap_per_stop,notice_lead_minutes,conditions,signed_on,source,pdf_file",
      "Fixture Harbor Pantry,40,3,15,,,,Fixture terms,2026-01-01,other,",
    ].join("\n"),
  );
  fs.writeFileSync(
    requirementsPath,
    "customer_slug,type,trigger,deadline_hours,what_to_send,where,page,clause_quote,confidence\n",
  );
  const report = contracts.importCustomerContracts({
    termsPath,
    requirementsPath,
    pdfDir,
    apply: false,
  });
  assert.equal(report.unmatched.includes("Fixture Harbor Pantry"), false);
  assert.equal(report.lines.some((line) => line.file === "terms" && line.action === "upsert"), true);

  const listed = queries.listCustomers().find((row) => row.id === north);
  assert.ok(listed);
  assert.equal(names.customerMatchesLookup(listed!, "Fixture Harbor Pantry LLC"), true);
  assert.equal(names.customerMatchesLookup(listed!, "880001"), true);
  const byAlias = queries.searchCustomersDirectory({ q: "Fixture Harbor Pantry" });
  assert.deepEqual(
    byAlias.customers.map((row) => row.id),
    [north],
  );
  const byMc = queries.searchCustomersDirectory({ q: "880001" });
  assert.ok(byMc.customers.some((row) => row.id === north));
  assert.equal(byMc.customers.some((row) => row.id === harbor), false);

  merge.undoCustomerMerge(merged.mergeId, "script");
  const undone = merge.getCustomerMerge(merged.mergeId);
  assert.ok(undone?.undoneAt);
  assert.equal(
    Number((db.prepare("SELECT customer_id FROM loads WHERE id = ?").get(loadId) as { customer_id: number }).customer_id),
    harbor,
  );
  assert.equal(
    Number((db.prepare("SELECT customer_id FROM contacts WHERE id = ?").get(harborContact) as { customer_id: number }).customer_id),
    harbor,
  );
  assert.equal(
    Number((db.prepare("SELECT customer_id FROM contacts WHERE id = ?").get(mapleContact) as { customer_id: number }).customer_id),
    maple,
  );
  assert.equal(
    Number((db.prepare("SELECT customer_id FROM load_templates WHERE id = ?").get(templateId) as { customer_id: number }).customer_id),
    harbor,
  );
  assert.equal(
    Number(
      (db.prepare("SELECT customer_id FROM customer_contracts WHERE id = ?").get(contractId) as { customer_id: number }).customer_id,
    ),
    harbor,
  );
  assert.equal(
    Number(
      (db.prepare("SELECT customer_id FROM customer_requirements WHERE id = ?").get(requirementId) as { customer_id: number })
        .customer_id,
    ),
    harbor,
  );
  assert.equal(
    Number(
      (
        db.prepare("SELECT COUNT(*) AS n FROM customer_aliases WHERE name = ?").get("Fixture Harbor Pantry") as { n: number }
      ).n,
    ),
    0,
  );
  const restoredKeeperTerms = db
    .prepare("SELECT rate_per_hour, free_hours FROM customer_detention_terms WHERE customer_id = ?")
    .get(north) as { rate_per_hour: number | null; free_hours: number | null };
  const restoredLoserTerms = db
    .prepare("SELECT rate_per_hour, free_hours FROM customer_detention_terms WHERE customer_id = ?")
    .get(harbor) as { rate_per_hour: number | null; free_hours: number | null };
  assert.equal(restoredKeeperTerms.free_hours, 2);
  assert.equal(restoredKeeperTerms.rate_per_hour, null);
  assert.equal(restoredLoserTerms.rate_per_hour, 50);
  const restored = customerRow(db, north);
  assert.equal(restored.credit_hold, 0);
  assert.equal(restored.main_email, "");
  assert.equal(restored.payment_terms, "");
  assert.equal(restored.mc_number, "");
  assert.equal(restored.dot_number, "");
  assert.equal(restored.billing_notes, "");
  assert.equal(customerRow(db, harbor).archived_at, null);
  assert.equal(customerRow(db, harbor).merged_into, null);
  assert.equal(customerRow(db, maple).archived_at, null);
  assert.equal(queries.findOrCreateCustomer("Fixture Harbor Pantry"), harbor);

  queries.updateCustomer(maple, {
    name: "Fixture Maple Desk",
    billing_notes: "",
    mc_number: "MC-880002",
    contacts: [{ name: "Maple Desk", role: "", phone: "", email: "" }],
  });
  assert.equal(customerRow(db, maple).mc_number, "MC-880002");
  queries.updateCustomer(maple, {
    name: "Fixture Maple Desk",
    billing_notes: "",
    mc_number: "",
    contacts: [{ name: "Maple Desk", role: "", phone: "", email: "" }],
  });

  const warned = await actions.updateCustomerAction(
    cedar,
    null,
    form({
      name: "Fixture Cedar Pantry",
      billing_notes: "",
      mc_number: "880002",
      dot_number: "",
    }),
  );
  assert.equal(warned.ok, false);
  if (!warned.ok) {
    assert.equal(warned.duplicate, true);
    assert.match(warned.error, /Fixture Oak Desk/);
    assert.match(warned.error, /880002/);
  }
  assert.equal(customerRow(db, cedar).mc_number, "");
  const saved = await actions.updateCustomerAction(
    cedar,
    null,
    form({
      name: "Fixture Cedar Pantry",
      billing_notes: "",
      mc_number: "MC-880002",
      dot_number: "",
      confirm_duplicate_mc: "1",
      confirm_duplicate_mc_value: "880002",
    }),
  );
  assert.equal(saved.ok, true);
  assert.equal(customerRow(db, cedar).mc_number, "MC-880002");

  const csvDir = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-merge-csv-"));
  const badCsv = path.join(csvDir, "bad.csv");
  fs.writeFileSync(
    badCsv,
    `keeper_id,loser_id,mc_number\n${north},${harbor},880001\n${north},${maple},880002\n`,
  );
  const bad = runCli(["--db", dbPath, "--csv", badCsv, "--apply"]);
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stderr}`, /Nothing was written/);
  assert.equal(customerRow(db, harbor).archived_at, null);

  const csv = path.join(csvDir, "one.csv");
  fs.writeFileSync(csv, `keeper_id,loser_id,mc_number\n${north},${harbor},880001\n`);
  const dry = runCli(["--db", dbPath, "--csv", csv]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Dry run\. Nothing written\./);
  assert.equal(customerRow(db, harbor).archived_at, null);
  const applied = runCli(["--db", dbPath, "--csv", csv, "--apply"]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Applied\. Nothing was sent to QuickBooks\./);
  assert.ok(customerRow(db, harbor).archived_at);
  assert.equal(customerRow(db, north).mc_number, "880001");
  const cliMerge = Number(
    (db.prepare("SELECT id FROM customer_merges WHERE undone_at IS NULL ORDER BY id DESC LIMIT 1").get() as { id: number })
      .id,
  );
  merge.undoCustomerMerge(cliMerge, "script");
  assert.equal(customerRow(db, harbor).archived_at, null);
  assert.equal(customerRow(db, north).qbo_customer_id, "QBO-KEEP");

  fs.rmSync(dbPath, { force: true });
  for (const extra of [`${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(extra, { force: true });
  console.log("customer-merge-test ok");
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function loadRow(headers: readonly string[]): string {
  const values: Record<string, string> = {
    "Load #": "8800101",
    Status: "Invoiced",
    "Ship Date": "9/20/2026",
    "Del Date": "9/22/2026",
    Customer: "Fixture Harbor Pantry",
    Shipper: "Fixture Dock",
    "Shipper City": "Omaha",
    "Shipper St.": "NE",
    Consignee: "Fixture Yard",
    "Consignee City": "Lincoln",
    "Consignee St.": "NE",
    "(currency)": "USD",
    "Equipment Type": "53' Reefer",
  };
  return headers
    .map((header) => {
      const value = values[header] ?? "";
      return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(",");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
