import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detentionNoticeLead,
  detentionTermLines,
  mapRequirementRow,
  matchCustomerByName,
  reminderIsOverdue,
  requirementDueAt,
  resolveDetentionTerms,
  customerSlug,
} from "../lib/customer-contract-shared";

const dbPath = path.join(os.tmpdir(), `tms-contracts-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.TMS_DATA_DIR = path.join(os.tmpdir(), `tms-contracts-data-${process.pid}`);

const NOW = "2026-06-02T15:00:00.000Z";

function main() {
  const rateCon = {
    rate: 80,
    freeMinutes: 120,
    cap: 150,
    roundMinutes: 15,
    clause: "Rate confirmation detention clause.",
  };
  const contract = {
    ratePerHour: 48,
    freeHours: 3,
    billingIncrementMinutes: 30,
    capPerDay: 500,
    capPerStop: 250,
    noticeLeadMinutes: 45,
    conditions: "Contract conditions for the sample customer.",
  };

  const fromRateCon = resolveDetentionTerms(rateCon, contract);
  assert.equal(fromRateCon.rate.source, "rate_con");
  assert.equal(fromRateCon.rate.value, 80);
  assert.equal(fromRateCon.freeMinutes.source, "rate_con");
  assert.equal(fromRateCon.freeMinutes.value, 120);
  assert.equal(fromRateCon.billingIncrementMinutes.source, "rate_con");
  assert.equal(fromRateCon.billingIncrementMinutes.value, 15);
  assert.equal(fromRateCon.capPerStop.source, "rate_con");
  assert.equal(fromRateCon.capPerStop.value, 150);
  assert.equal(fromRateCon.capPerDay.source, "contract");
  assert.equal(fromRateCon.capPerDay.value, 500);
  assert.equal(fromRateCon.noticeLeadMinutes.source, "contract");
  assert.equal(fromRateCon.noticeLeadMinutes.value, 45);
  assert.equal(fromRateCon.conditions.source, "rate_con");

  const fromContract = resolveDetentionTerms(
    { rate: null, freeMinutes: null, cap: null, roundMinutes: null, clause: "  " },
    contract,
  );
  assert.equal(fromContract.rate.source, "contract");
  assert.equal(fromContract.rate.value, 48);
  assert.equal(fromContract.freeMinutes.value, 180);
  assert.equal(fromContract.freeMinutes.source, "contract");
  assert.equal(fromContract.billingIncrementMinutes.source, "contract");
  assert.equal(fromContract.capPerStop.source, "contract");
  assert.equal(fromContract.capPerStop.value, 250);
  assert.equal(fromContract.conditions.source, "contract");
  assert.equal(fromContract.conditions.value, "Contract conditions for the sample customer.");

  const missing = resolveDetentionTerms({}, {});
  for (const line of detentionTermLines(missing)) {
    assert.equal(line.source, "missing", line.key);
    assert.equal(line.text, "Missing, enter from rate con");
    assert.equal(line.sourceLabel, "");
  }
  assert.deepEqual(detentionNoticeLead(null), { minutes: null, source: "missing" });
  assert.deepEqual(detentionNoticeLead(45), { minutes: 45, source: "contract" });
  assert.deepEqual(detentionNoticeLead(0), { minutes: 0, source: "contract" });

  const mixed = detentionTermLines(fromContract);
  assert.equal(mixed.find((line) => line.key === "rate")?.sourceLabel, "Contract");
  assert.match(mixed.find((line) => line.key === "rate")?.text ?? "", /48\.00/);

  const anchors = {
    now: NOW,
    pickupAt: "2026-06-02T14:00:00.000Z",
    deliveryAt: "2026-06-03T18:00:00.000Z",
    rateConAt: "2026-06-01T12:00:00.000Z",
    detentionStartsAt: "2026-06-02T16:00:00.000Z",
  };
  assert.equal(
    requirementDueAt({ trigger: "after_pickup", deadlineHours: 24, timeOfDay: "" }, anchors).dueAt,
    "2026-06-03T14:00:00.000Z",
  );
  assert.equal(
    requirementDueAt({ trigger: "after_delivery", deadlineHours: 10, timeOfDay: "" }, anchors).dueAt,
    "2026-06-04T04:00:00.000Z",
  );
  assert.equal(
    requirementDueAt({ trigger: "before_detention", deadlineHours: 0.75, timeOfDay: "" }, anchors).dueAt,
    "2026-06-02T15:15:00.000Z",
  );
  assert.equal(
    requirementDueAt({ trigger: "on_ratecon", deadlineHours: 2, timeOfDay: "" }, anchors).dueAt,
    "2026-06-01T14:00:00.000Z",
  );
  assert.equal(
    requirementDueAt({ trigger: "invoice_cutoff", deadlineHours: 48, timeOfDay: "" }, anchors).dueAt,
    "2026-06-05T18:00:00.000Z",
  );
  const daily = requirementDueAt({ trigger: "daily_time", deadlineHours: null, timeOfDay: "08:00" }, anchors);
  assert.equal(daily.dueAt, "2026-06-02T13:00:00.000Z");
  assert.equal(
    reminderIsOverdue({ dueAt: daily.dueAt, now: NOW, status: "open" }),
    true,
    "08:00 Chicago is before 10:00 Chicago on the same day",
  );
  assert.equal(
    reminderIsOverdue({ dueAt: anchors.pickupAt, now: NOW, status: "snoozed", snoozeUntil: "2026-06-02T20:00:00.000Z" }),
    false,
  );
  assert.equal(reminderIsOverdue({ dueAt: anchors.pickupAt, now: NOW, status: "done" }), false);
  assert.equal(
    requirementDueAt({ trigger: "after_pickup", deadlineHours: 1, timeOfDay: "" }, { now: NOW }).waiting,
    "Waiting on pickup",
  );
  assert.equal(
    requirementDueAt({ trigger: "invoice_cutoff", deadlineHours: null, timeOfDay: "" }, anchors).waiting,
    "No invoice cutoff hours on the requirement",
  );
  assert.equal(
    requirementDueAt({ trigger: "on_ratecon", deadlineHours: 1, timeOfDay: "" }, { now: NOW }).waiting,
    "Waiting on the rate confirmation",
  );
  assert.equal(
    requirementDueAt({ trigger: "before_detention", deadlineHours: 1, timeOfDay: "" }, { now: NOW }).waiting,
    "Waiting on the detention clock",
  );

  const mapped = mapRequirementRow({
    type: "detention_notice",
    trigger: "other",
    deadline_hours: "-0.75",
    what_to_send: "Flag the desk",
    where: "desk",
    page: "p1",
    clause_quote: "Sample clause",
  });
  assert.equal(mapped.ok, true);
  if (mapped.ok) {
    assert.equal(mapped.value.trigger, "before_detention");
    assert.equal(mapped.value.deadlineHours, 0.75);
    assert.match(mapped.value.requirement, /Where: desk/);
  }
  const skipped = mapRequirementRow({ trigger: "other", what_to_send: "Nope", deadline_hours: "" });
  assert.equal(skipped.ok, false);

  assert.equal(customerSlug("Heartland Foods Co."), "heartland-foods-co");
  const matched = matchCustomerByName("heartland-foods-co", [{ id: 3, name: "Heartland Foods Co." }]);
  assert.equal(matched?.id, 3);
  assert.equal(matchCustomerByName("Unknown Pantry Co.", [{ id: 3, name: "Heartland Foods Co." }]), null);
}

async function database() {
  const { getDb } = await import("../lib/db");
  const db = getDb();
  const now = new Date().toISOString();
  const customerId = Number(
    db.prepare("INSERT INTO customers (name, billing_notes, created_at, updated_at) VALUES (?, '', ?, ?)").run(
      "Heartland Foods Co.",
      now,
      now,
    ).lastInsertRowid,
  );
  const loadId = Number(
    db
      .prepare(
        `INSERT INTO loads (
          load_number, customer_id, origin, destination, pickup_start, pickup_end, delivery_start, delivery_end,
          commodity, notes, status, created_at, updated_at
        ) VALUES ('MSE-TEST', ?, 'A', 'B', ?, ?, ?, ?, '', '', 'in_transit', ?, ?)`,
      )
      .run(customerId, "2026-06-02T12:00:00.000Z", "2026-06-02T14:00:00.000Z", "2026-06-03T16:00:00.000Z", "2026-06-03T18:00:00.000Z", now, now)
      .lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO load_stops (
      load_id, sequence, kind, name, city, state, window_start, schedule_type, arrived_at, departed_at
    ) VALUES (?, 1, 'delivery', 'Dock', 'Omaha', 'NE', '2026-06-02T14:00:00.000Z', 'appointment', ?, ?)`,
  ).run(loadId, "2026-06-02T14:00:00.000Z", "2026-06-02T18:00:00.000Z");

  const store = await import("../lib/customer-contracts");
  store.saveCustomerDetentionTerms(customerId, { freeHours: 2, noticeLeadMinutes: 45, ratePerHour: 48 });
  assert.deepEqual(store.detentionNoticeLeadForLoad(loadId), { minutes: 45, source: "contract" });
  db.prepare("UPDATE loads SET detention_rate = 80, detention_free_minutes = NULL, detention_terms_scanned = 1 WHERE id = ?").run(loadId);
  const detention = await import("../lib/detention-store");
  const terms = detention.readLoadDetentionTerms(loadId);
  const { resolveDetentionTerms: resolve } = await import("../lib/customer-contract-shared");
  const resolved = resolve(terms, store.readCustomerDetentionTerms(customerId));
  assert.equal(resolved.rate.source, "rate_con");
  assert.equal(resolved.rate.value, 80);
  assert.equal(resolved.freeMinutes.source, "contract");
  assert.equal(resolved.freeMinutes.value, 120);
  assert.equal(resolved.noticeLeadMinutes.source, "contract");

  store.saveCustomerRequirement(customerId, {
    trigger: "after_delivery",
    deadlineHours: 24,
    timeOfDay: "",
    requirement: "Send the signed delivery receipt to the desk",
    quotedClause: "Sample clause",
    page: "p2",
  });
  const reminders = store.listRemindersForLoad(loadId, NOW);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0]?.dueAt, "2026-06-03T18:00:00.000Z");
  assert.equal(reminders[0]?.overdue, false);
  store.setRequirementReminder({ loadId, requirementId: reminders[0]!.requirementId, op: "snooze", now: NOW });
  const snoozed = store.listRemindersForLoad(loadId, NOW);
  assert.equal(snoozed[0]?.status, "snoozed");
  assert.equal(snoozed[0]?.overdue, false);
  const later = store.listRemindersForLoad(loadId, "2026-06-04T20:00:00.000Z");
  assert.equal(later[0]?.overdue, true);
  store.setRequirementReminder({ loadId, requirementId: reminders[0]!.requirementId, op: "done", now: NOW });
  assert.equal(store.listDeskReminders(NOW).length, 0);
  assert.equal(store.listRemindersForLoad(loadId, NOW)[0]?.status, "done");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contract-import-"));
  const pdfDir = path.join(dir, "pdfs");
  fs.mkdirSync(pdfDir);
  fs.writeFileSync(path.join(pdfDir, "heartland-foods-co.pdf"), Buffer.from("%PDF-1.1\n%demo\n"));
  fs.copyFileSync(path.join(process.cwd(), "scripts/fixtures/customer-contracts/terms.csv"), path.join(dir, "terms.csv"));
  fs.copyFileSync(
    path.join(process.cwd(), "scripts/fixtures/customer-contracts/requirements.csv"),
    path.join(dir, "requirements.csv"),
  );
  const importer = await import("../lib/customer-contract-import");
  const dry = importer.importCustomerContracts({
    termsPath: path.join(dir, "terms.csv"),
    requirementsPath: path.join(dir, "requirements.csv"),
    pdfDir,
    apply: false,
  });
  assert.equal(dry.apply, false);
  assert.ok(dry.unmatched.includes("Unknown Pantry Co."));
  assert.ok(dry.unmatched.includes("no-such-pantry"));
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM customer_contracts").get() as { n: number }).n,
    0,
  );
  const applied = importer.importCustomerContracts({
    termsPath: path.join(dir, "terms.csv"),
    requirementsPath: path.join(dir, "requirements.csv"),
    pdfDir,
    apply: true,
  });
  assert.equal(applied.apply, true);
  assert.ok((db.prepare("SELECT COUNT(*) AS n FROM customer_contracts").get() as { n: number }).n >= 1);
  const notice = db.prepare("SELECT notice_lead_minutes FROM customer_detention_terms WHERE customer_id = ?").get(customerId) as {
    notice_lead_minutes: number;
  };
  assert.equal(notice.notice_lead_minutes, 45);
  const again = importer.importCustomerContracts({
    termsPath: path.join(dir, "terms.csv"),
    requirementsPath: path.join(dir, "requirements.csv"),
    pdfDir,
    apply: true,
  });
  const contractCount = (db.prepare("SELECT COUNT(*) AS n FROM customer_contracts").get() as { n: number }).n;
  assert.equal(again.apply, true);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM customer_contracts").get() as { n: number }).n, contractCount);

  const cli = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/import-customer-contracts.ts",
      "--terms",
      path.join(dir, "terms.csv"),
      "--requirements",
      path.join(dir, "requirements.csv"),
      "--pdfs",
      pdfDir,
      "--db",
      dbPath,
    ],
    { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, TMS_DB_PATH: dbPath, TMS_SKIP_SEED: "1" } },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Dry run/);
  assert.match(cli.stdout, /Unmatched customers/);
}

main();
database()
  .then(() => {
    console.log("customer contracts ok");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
