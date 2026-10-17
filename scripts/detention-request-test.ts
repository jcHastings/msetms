import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-detention-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

const WINDOW = "2026-06-02T14:00:00.000Z";
const WINDOW_END = "2026-06-02T18:00:00.000Z";
const ARRIVE = "2026-06-02T14:00:00.000Z";
const DEPART = "2026-06-02T16:40:00.000Z";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function triggerInput(overrides: Record<string, unknown> = {}) {
  return {
    loadStatus: "dispatched",
    stopKind: "delivery",
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    scheduleType: "appointment",
    windowStart: WINDOW,
    windowEnd: "",
    freeMinutes: 120,
    roundMinutes: 15,
    pickupsEnabled: false,
    ...overrides,
  };
}

async function main() {
  const rules = await import("../lib/detention-request");
  const terms = await import("../lib/detention-terms");
  const { MS_EXPRESS_CARRIER } = await import("../lib/carrier-identity");

  const past = rules.detentionRequestTrigger(triggerInput());
  assert.equal(past.show, true);
  assert.equal(past.freeSource, "rate_con");
  assert.equal(past.billableMinutes, 45, "40 minutes past free time rounds up to a quarter hour");

  const appointmentEarly = rules.detentionRequestTrigger(
    triggerInput({
      arrivedAt: "2026-06-02T12:00:00.000Z",
      departedAt: "2026-06-02T16:30:00.000Z",
      roundMinutes: null,
    }),
  );
  assert.equal(appointmentEarly.show, true);
  assert.equal(appointmentEarly.billableMinutes, 30, "appointment clock starts at the window, not arrival");

  const fcfsEarly = rules.detentionRequestTrigger(
    triggerInput({
      scheduleType: "fcfs",
      windowEnd: WINDOW_END,
      arrivedAt: "2026-06-02T12:00:00.000Z",
      departedAt: "2026-06-02T17:00:00.000Z",
      freeMinutes: null,
      roundMinutes: null,
    }),
  );
  assert.equal(fcfsEarly.show, true);
  assert.equal(fcfsEarly.freeSource, "desk_clock");
  assert.equal(fcfsEarly.billableMinutes, 60, "early FCFS clock starts at the window");

  assert.equal(
    rules.detentionRequestTrigger(triggerInput({ arrivedAt: ARRIVE, departedAt: ARRIVE })).show,
    false,
    "arrive equal to depart stays hidden",
  );
  assert.equal(
    rules.detentionRequestTrigger(triggerInput({ departedAt: "2026-06-02T15:30:00.000Z", roundMinutes: null })).show,
    false,
    "dwell inside free time stays hidden",
  );
  assert.equal(rules.detentionRequestTrigger(triggerInput({ stopKind: "pickup" })).show, false);
  assert.equal(
    rules.detentionRequestTrigger(triggerInput({ stopKind: "pickup", pickupsEnabled: true })).show,
    true,
  );
  assert.equal(rules.detentionRequestTrigger(triggerInput({ loadStatus: "cancelled" })).show, false);
  assert.equal(rules.detentionRequestTrigger(triggerInput({ loadStatus: "delivered" })).show, true);

  const missing = terms.parseDetentionTerms("Detention applies after free time");
  assert.equal(missing.found, true);
  assert.equal(missing.rate, null);
  assert.equal(rules.detentionRateLabel(missing.rate), "missing, enter from rate con");
  const priced = terms.parseDetentionTerms(
    "Detention $75/hr after 2 hours free time, not to exceed $150, billed in quarter hour increments.",
  );
  assert.equal(priced.rate, 75);
  assert.equal(priced.freeMinutes, 120);
  assert.equal(priced.cap, 150);
  assert.equal(priced.roundMinutes, 15);
  assert.equal(rules.computeDetentionAmount(75, 180, 150), 150);
  assert.equal(rules.computeDetentionAmount(null, 180, null), null);

  const email = rules.composeDetentionApprovalEmail({
    loadNumber: "44021",
    po: "PO-44021",
    stopName: "Cedar Cold Storage",
    city: "Omaha",
    state: "NE",
    scheduleType: "appointment",
    windowStart: WINDOW,
    windowEnd: "",
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    arrivedGeofence: true,
    departedGeofence: false,
    dwellMinutes: 160,
    freeMinutes: 120,
    freeSource: "rate_con",
    billableMinutes: 45,
  });
  assert.equal(rules.approvalEmailHasDollarAmount(email.text), false);
  assert.equal(email.text.includes("88"), false);
  assert.match(email.text, /Load: 44021/);
  assert.match(email.text, /PO \/ reference: PO-44021/);
  assert.match(email.text, /Cedar Cold Storage/);
  assert.match(email.text, /Omaha, NE/);
  assert.match(email.text, /Arrived: .+ \(per GPS geofence\)/);
  assert.doesNotMatch(email.text, /Departed: .+ \(per GPS geofence\)/);
  assert.match(email.text, /Dwell:/);
  assert.match(email.text, /Free time:/);
  assert.match(email.text, /Billable time:/);
  assert.match(email.text, new RegExp(MS_EXPRESS_CARRIER.legalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(email.text, /402-302-0097/);
  assert.match(email.text, /MC 056299/);
  assert.match(email.text, /USDOT 3062879/);
  assert.equal(rules.signatureHasBrokerageIdentity(email.text), false);
  assert.equal(rules.signatureHasBrokerageIdentity("carrier 970613"), true);

  const queries = await import("../lib/queries");
  const stops = await import("../lib/stops");
  const store = await import("../lib/detention-store");
  const lock = await import("../lib/detention-lock");
  const { getDb } = await import("../lib/db");
  const { addAttachment } = await import("../lib/files");
  const { deletePayItem } = await import("../lib/pay-items");
  const db = getDb();

  assert.equal(store.getDetentionSettings().replyTo, "dispatch@msloads.com");
  assert.equal(store.getDetentionSettings().pickupsEnabled, false);

  const customerId = queries.createCustomer({
    name: "North Pier Logistics",
    billing_notes: "",
    main_email: "billing@example.test",
    contacts: [],
  });

  function makeLoad(number: string, status = "available") {
    return queries.createLoad({
      customer_id: customerId,
      origin: "Omaha, NE",
      destination: "Omaha, NE",
      pickup_start: WINDOW,
      pickup_end: WINDOW_END,
      delivery_start: WINDOW,
      delivery_end: WINDOW_END,
      weight: 20000,
      commodity: "Frozen goods",
      rate: 1800,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "PO-44021",
      reefer_setpoint_f: null,
      trailer_number: "",
      status,
      truck_id: null,
      driver_id: null,
      load_number: number,
    });
  }

  function delivery(loadId: number, kind: "delivery" | "pickup" = "delivery") {
    return stops.addStop(loadId, {
      kind,
      name: "Cedar Cold Storage",
      city: "Omaha",
      state: "NE",
      window_start: WINDOW,
      window_end: kind === "pickup" ? WINDOW_END : "",
      schedule_type: kind === "pickup" ? "fcfs" : "appointment",
      arrived_at: ARRIVE,
      departed_at: DEPART,
      reference: "PO-44021",
    });
  }

  const loadId = makeLoad("44021");
  db.prepare("UPDATE loads SET contact_email = ? WHERE id = ?").run("broker@example.test", loadId);
  const stopId = delivery(loadId);
  store.saveDetentionTermsFromText(
    loadId,
    "Detention $75/hr after 2 hours free time, not to exceed $150, billed in quarter hour increments.",
  );
  const saved = store.readLoadDetentionTerms(loadId);
  assert.equal(saved.rate, 75);
  assert.equal(saved.freeMinutes, 120);
  assert.match(saved.clause, /Detention/);

  db.prepare(
    `INSERT INTO samsara_webhook_events (event_id, event_type, event_time, outcome, stop_id, created_at)
     VALUES ('fixture-arrive-44021', 'geofence', ?, 'fixture', ?, ?)`,
  ).run(ARRIVE, stopId, ARRIVE);

  const pod = addAttachment({
    loadId,
    kind: "pod",
    originalName: "pod-44021.pdf",
    buffer: Buffer.from("pod fixture"),
    mimeType: "application/pdf",
    uploadedBy: "fixture",
  });
  const bol = addAttachment({
    loadId,
    kind: "bol",
    originalName: "bol-44021.pdf",
    buffer: Buffer.from("bol fixture"),
    mimeType: "application/pdf",
    uploadedBy: "fixture",
  });

  const draft = await store.buildDetentionDraft(loadId, stopId);
  assert.equal(draft.to, "broker@example.test");
  assert.equal(draft.replyTo, "dispatch@msloads.com");
  assert.equal(rules.approvalEmailHasDollarAmount(draft.body), false);
  assert.match(draft.body, /per GPS geofence/);
  assert.match(draft.clause, /\$75\/hr/);
  assert.equal(draft.rateLabel.includes("75.00"), true);
  assert.deepEqual(
    draft.attachments.map((file) => file.kind).sort(),
    ["bol", "pod"],
  );

  db.prepare("UPDATE loads SET contact_email = '' WHERE id = ?").run(loadId);
  const fallback = await store.buildDetentionDraft(loadId, stopId);
  assert.equal(fallback.to, "billing@example.test");
  db.prepare("UPDATE loads SET contact_email = ? WHERE id = ?").run("broker@example.test", loadId);

  await assert.rejects(
    () =>
      store.sendDetentionRequest({
        loadId,
        stopId,
        to: "broker@example.test",
        subject: "Detention request: Load 44021",
        body: "Please approve detention of $75.",
        attachmentIds: [pod.id, bol.id],
        actor: "Fixture Desk",
        send: async () => ({ messageId: "should-not-send" }),
      }),
    /dollar amount/,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM detention_requests WHERE load_id = ?").get(loadId) as { n: number }).n,
    0,
  );

  const captured: Array<{ replyTo?: string; fromName?: string; text: string; attachments?: Array<{ filename: string }> }> = [];
  const sent = await store.sendDetentionRequest({
    loadId,
    stopId,
    to: "broker@example.test",
    subject: draft.subject,
    body: draft.body,
    attachmentIds: [pod.id, bol.id],
    actor: "Fixture Desk",
    send: async (mail) => {
      captured.push(mail);
      return { messageId: "fixture-message-44021" };
    },
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.replyTo, "dispatch@msloads.com");
  assert.equal(captured[0]?.fromName, "M&S Loads DBA MS Express");
  assert.equal(rules.approvalEmailHasDollarAmount(captured[0]?.text ?? ""), false);
  assert.equal(captured[0]?.attachments?.length, 2);
  const row = db.prepare("SELECT status, amount, message_id, rate_source FROM detention_requests WHERE id = ?").get(sent.id) as {
    status: string;
    amount: number | null;
    message_id: string;
    rate_source: string;
  };
  assert.equal(row.status, "requested");
  assert.equal(row.amount, null);
  assert.equal(row.message_id, "fixture-message-44021");
  assert.equal(row.rate_source, "rate_con");
  const mailRow = db.prepare("SELECT kind, to_email FROM sent_mail WHERE id = ?").get(sent.sentMailId) as {
    kind: string;
    to_email: string;
  };
  assert.equal(mailRow.kind, "detention_request");
  assert.equal(mailRow.to_email, "broker@example.test");
  const sentAudit = db
    .prepare("SELECT new_value FROM load_audit WHERE load_id = ? AND action = 'detention_request_sent'")
    .get(loadId) as { new_value: string };
  assert.match(sentAudit.new_value, /no amount/);

  await assert.rejects(async () => store.addDetentionLine({ requestId: sent.id, actor: "Fixture Desk" }), /approves/);
  await assert.rejects(
    async () => store.setDetentionStatus({ requestId: sent.id, status: "paid", actor: "Fixture Desk" }),
    /approves/,
  );

  const beforeStatus = (db.prepare("SELECT status, tms_invoice_number, qbo_invoice_id, qbo_sent_at FROM loads WHERE id = ?").get(loadId) as {
    status: string;
  }).status;
  const approved = store.setDetentionStatus({
    requestId: sent.id,
    status: "approved",
    actor: "Fixture Desk",
    rate: 75,
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.amount, 56.25);
  assert.equal(
    (db.prepare("SELECT rate_source FROM detention_requests WHERE id = ?").get(sent.id) as { rate_source: string }).rate_source,
    "rate_con",
  );
  const added = store.addDetentionLine({ requestId: sent.id, actor: "Fixture Desk" });
  assert.equal(added.warning, "");
  const pay = db.prepare("SELECT side, bill_to, category, total FROM load_pay_items WHERE id = ?").get(added.payItemId) as {
    side: string;
    bill_to: string;
    category: string;
    total: number;
  };
  assert.equal(pay.side, "income");
  assert.equal(pay.bill_to, "customer");
  assert.equal(pay.category, "detention");
  assert.equal(pay.total, 56.25);
  assert.equal((db.prepare("SELECT status FROM loads WHERE id = ?").get(loadId) as { status: string }).status, beforeStatus);
  const lineAudit = db
    .prepare("SELECT new_value FROM load_audit WHERE load_id = ? AND action = 'detention_line'")
    .get(loadId) as { new_value: string };
  assert.match(lineAudit.new_value, /56\.25/);

  deletePayItem(added.payItemId);
  assert.equal(db.prepare("SELECT id FROM load_pay_items WHERE id = ?").get(added.payItemId), undefined);
  db.prepare("UPDATE detention_requests SET pay_item_id = NULL WHERE id = ?").run(sent.id);
  const relocked = store.addDetentionLine({ requestId: sent.id, actor: "Fixture Desk" });

  const oldMail = db
    .prepare(
      `INSERT INTO sent_mail (load_id, kind, to_email, subject, created_at)
       VALUES (?, 'customer_invoice', 'billing@example.test', 'Invoice', '2020-01-01T00:00:00.000Z')`,
    )
    .run(loadId);
  assert.equal(lock.detentionLineLockReason(relocked.payItemId), "");
  deletePayItem(relocked.payItemId);
  db.prepare("UPDATE sent_mail SET created_at = '2099-01-01T00:00:00.000Z' WHERE id = ?").run(oldMail.lastInsertRowid);
  db.prepare("UPDATE detention_requests SET pay_item_id = NULL WHERE id = ?").run(sent.id);
  const lockedLine = store.addDetentionLine({ requestId: sent.id, actor: "Fixture Desk" });
  assert.equal(lock.detentionLineLockReason(lockedLine.payItemId), rules.DETENTION_LINE_LOCKED);
  assert.throws(() => deletePayItem(lockedLine.payItemId), new RegExp(rules.DETENTION_LINE_LOCKED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  db.prepare("DELETE FROM sent_mail WHERE id = ?").run(oldMail.lastInsertRowid);
  assert.equal(lock.detentionLineLockReason(lockedLine.payItemId), "");
  db.prepare(
    `INSERT INTO settlements (driver_id, load_id, amount, status, paid_at, created_at)
     VALUES (0, ?, 10, 'paid', '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')`,
  ).run(loadId);
  assert.equal(lock.detentionLineLockReason(lockedLine.payItemId), rules.DETENTION_LINE_LOCKED);
  assert.ok(lock.lockedDetentionPayItemIds(loadId).includes(lockedLine.payItemId));

  db.prepare(
    `INSERT INTO qbo_payment_applications (qbo_payment_id, qbo_invoice_id, load_id, applied_amount)
     VALUES ('fixture-pay-44021', 'fixture-inv-44021', ?, 40)`,
  ).run(loadId);
  assert.match(store.detentionQboHint(loadId), /does not mark this detention paid/);
  assert.equal(
    (db.prepare("SELECT status FROM detention_requests WHERE id = ?").get(sent.id) as { status: string }).status,
    "approved",
  );

  const bareId = makeLoad("44022");
  const bareStop = delivery(bareId);
  store.saveDetentionTermsFromText(bareId, "Detention applies after free time");
  const bareTerms = store.readLoadDetentionTerms(bareId);
  assert.equal(bareTerms.rate, null);
  assert.equal(rules.detentionRateLabel(bareTerms.rate), "missing, enter from rate con");
  const bareDraft = await store.buildDetentionDraft(bareId, bareStop);
  assert.equal(bareDraft.rate, null);
  assert.match(bareDraft.rateLabel, /missing, enter from rate con/);
  assert.match(bareDraft.body, /desk clock; not stated on the rate confirmation/);
  assert.equal(rules.approvalEmailHasDollarAmount(bareDraft.body), false);
  const bareSent = await store.sendDetentionRequest({
    loadId: bareId,
    stopId: bareStop,
    to: "billing@example.test",
    subject: bareDraft.subject,
    body: bareDraft.body,
    attachmentIds: [],
    actor: "Fixture Desk",
    send: async () => ({ messageId: "fixture-message-44022" }),
  });
  await assert.rejects(
    async () => store.setDetentionStatus({ requestId: bareSent.id, status: "approved", actor: "Fixture Desk" }),
    /missing, enter from rate con/,
  );
  const edited = store.setDetentionStatus({
    requestId: bareSent.id,
    status: "approved",
    actor: "Fixture Desk",
    rate: 80,
    amount: 40,
  });
  assert.equal(edited.amount, 40);
  assert.equal(edited.rate, 80);
  db.prepare("UPDATE loads SET tms_invoice_number = 'INV-44022', status = 'delivered' WHERE id = ?").run(bareId);
  db.prepare("UPDATE load_stops SET delivered = 0 WHERE id = ?").run(bareStop);
  addAttachment({
    loadId: bareId,
    kind: "invoice",
    originalName: "invoice-44022.pdf",
    buffer: Buffer.from("invoice fixture"),
    mimeType: "application/pdf",
    uploadedBy: "fixture",
  });
  const invoiceCount = (db.prepare("SELECT COUNT(*) AS n FROM attachments WHERE load_id = ? AND kind = 'invoice'").get(bareId) as { n: number }).n;
  const qboBefore = db.prepare("SELECT qbo_invoice_id, qbo_sent_at, tms_invoice_number, status FROM loads WHERE id = ?").get(bareId);
  const warned = store.addDetentionLine({ requestId: bareSent.id, actor: "Fixture Desk" });
  assert.equal(warned.warning, "Invoice already sent, bill detention separately");
  assert.deepEqual(
    db.prepare("SELECT qbo_invoice_id, qbo_sent_at, tms_invoice_number, status FROM loads WHERE id = ?").get(bareId),
    qboBefore,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM attachments WHERE load_id = ? AND kind = 'invoice'").get(bareId) as { n: number }).n,
    invoiceCount,
  );
  assert.equal((db.prepare("SELECT delivered FROM load_stops WHERE id = ?").get(bareStop) as { delivered: number }).delivered, 0);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM sent_mail WHERE load_id = ? AND kind = 'customer_invoice'").get(bareId) as { n: number }).n,
    0,
  );

  const pickupId = makeLoad("44023");
  const pickupStop = delivery(pickupId, "pickup");
  store.saveDetentionTermsFromText(pickupId, "Detention $75/hr after 2 hours free time.");
  assert.equal(store.detentionDraftHref(pickupId, pickupStop), "");
  store.saveDetentionSettings({ replyTo: "desk@example.test", pickupsEnabled: true });
  assert.match(store.detentionDraftHref(pickupId, pickupStop), /detention=/);
  assert.equal(store.getDetentionSettings().pickupsEnabled, true);
  store.saveDetentionSettings({ replyTo: "dispatch@msloads.com", pickupsEnabled: false });

  const guarded = [
    "lib/detention-request.ts",
    "lib/detention-store.ts",
    "lib/detention-actions.ts",
    "lib/detention-lock.ts",
    "lib/detention-terms.ts",
    "components/detention-request-dialog.tsx",
  ];
  for (const file of guarded) {
    const source = read(file);
    assert.doesNotMatch(source, /from ["'][^"']*quickbooks/);
    assert.doesNotMatch(source, /createTmsInvoice|sendCustomerInvoiceMail|maybeAutoInvoice|updateLoadStatus|markInvoicePaid/);
  }
  assert.doesNotMatch(read("lib/auto-invoice.ts"), /detention_request/);
  const workspace = read("components/load-workspace.tsx");
  assert.match(workspace, /Draft detention request/);
  assert.doesNotMatch(workspace, /Request Detention email/);
  assert.match(read("components/load-stops-panel.tsx"), /data-detention-draft/);
  assert.match(read("components/mike-chat.tsx"), /payload\.href/);
  assert.doesNotMatch(read("components/mike-chat.tsx"), /detention_email" && proposal\.payload\.to/);

  const { proposeMikeWork, applyMikeProposal } = await import("../lib/mike-work");
  const mike = proposeMikeWork("Draft detention email for 44021");
  const proposal = mike.proposals.find((item) => item.kind === "detention_email");
  assert.ok(proposal);
  assert.equal(proposal?.title, "Draft detention request");
  assert.match(proposal?.payload.href ?? "", new RegExp(`/loads/${loadId}\\?tab=stops&detention=${stopId}`));
  assert.equal(proposal?.payload.to, undefined);
  const applied = applyMikeProposal(proposal?.payload ?? {}, "detention_email");
  assert.match(applied.message, /Nothing sends until you click Send/);
  assert.equal(applied.mailto, undefined);
  assert.match(applied.href ?? "", /detention=/);

  fs.rmSync(dbPath, { force: true });
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
