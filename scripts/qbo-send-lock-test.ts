/**
 * QuickBooks sends stay off unless QBO_INVOICE_SEND_ENABLED is on.
 * A per-load claim blocks a second send, and a saved invoice id cannot be stored twice.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-qbo-lock-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.QBO_INVOICE_SEND_ENABLED = "false";
delete process.env.QBO_CLIENT_ID;
delete process.env.QBO_CLIENT_SECRET;
delete process.env.QBO_REFRESH_TOKEN;
delete process.env.QBO_REALM_ID;

const DISABLED = "QuickBooks sending is off; billing runs from the old system";

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

async function main(): Promise<void> {
  const { qboInvoiceSendEnabledFrom, QBO_INVOICE_SEND_DISABLED_MESSAGE, QBO_SEND_CLAIM_STALE_MS } = await import(
    "../lib/qbo-send-lock"
  );
  assert.equal(QBO_INVOICE_SEND_DISABLED_MESSAGE, DISABLED);
  assert.equal(qboInvoiceSendEnabledFrom(undefined), false);
  assert.equal(qboInvoiceSendEnabledFrom(""), false);
  assert.equal(qboInvoiceSendEnabledFrom("false"), false);
  assert.equal(qboInvoiceSendEnabledFrom("0"), false);
  assert.equal(qboInvoiceSendEnabledFrom("no"), false);
  assert.equal(qboInvoiceSendEnabledFrom("true"), true);
  assert.equal(qboInvoiceSendEnabledFrom(" YES "), true);
  assert.equal(qboInvoiceSendEnabledFrom("on"), true);
  assert.equal(qboInvoiceSendEnabledFrom("1"), true);
  assert.equal(QBO_SEND_CLAIM_STALE_MS, 2 * 60 * 1000);

  const { qboInvoiceSendEnabled } = await import("../lib/env");
  assert.equal(qboInvoiceSendEnabled(), false);

  const queries = await import("../lib/queries");
  const { getDb, closeDb, migrateQboInvoiceIdUnique } = await import("../lib/db");
  const { Database } = await import("../lib/sqlite");
  const qbo = await import("../lib/integrations/quickbooks");
  const accounting = await import("../lib/accounting");
  const { claimQboLoadSend, releaseQboLoadSend } = await import("../lib/qbo-send-claim");
  const payments = await import("../lib/integrations/qbo-payments");
  const { sendToQuickbooksAction } = await import("../lib/actions");
  const { sendBillToQuickbooksAction } = await import("../lib/dispatcher-actions");

  const db = getDb();
  const index = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_loads_qbo_invoice_id_unique'")
    .get() as { sql: string } | undefined;
  assert.ok(index?.sql);
  assert.match(index.sql, /UNIQUE/);
  assert.match(index.sql, /TRIM\(qbo_invoice_id\) != ''/);

  const customerId = queries.createCustomer({ name: "Lock Broker", billing_notes: "", contacts: [] });
  const day = "2026-10-01T12:00:00.000Z";
  function makeLoad(number: string, status: string): number {
    const id = queries.createLoad({
      customer_id: customerId,
      origin: "Hastings, NE",
      destination: "Omaha, NE",
      pickup_start: day,
      pickup_end: day,
      delivery_start: day,
      delivery_end: day,
      weight: 1000,
      commodity: "Frozen beef",
      rate: 500,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "available",
      truck_id: null,
      driver_id: null,
      trailer_id: null,
      load_number: number,
      oo_pay: null,
    } as Parameters<typeof queries.createLoad>[0]);
    db.prepare("UPDATE loads SET status = ? WHERE id = ?").run(status, id);
    return id;
  }

  const deliveredId = makeLoad("LOCK1", "delivered");
  const openId = makeLoad("LOCK2", "available");
  const billId = accounting.createBill({ vendor: "Lock Vendor", memo: "hold", amount: 40, loadId: deliveredId });

  await assert.rejects(() => qbo.sendLoadToQuickbooks(deliveredId), new RegExp(DISABLED));
  await assert.rejects(() => qbo.sendBillToQuickbooks(billId), new RegExp(DISABLED));
  assert.equal(
    (db.prepare("SELECT qbo_send_claimed_at AS claim FROM loads WHERE id = ?").get(deliveredId) as { claim: string }).claim,
    "",
  );
  assert.equal(queries.getLoad(deliveredId)?.qbo_invoice_id ?? "", "");
  assert.equal(accounting.getBill(billId)?.qbo_bill_id ?? "", "");

  const form = new FormData();
  form.set("load_id", String(deliveredId));
  const action = await sendToQuickbooksAction(null, form);
  assert.equal(action.ok, false);
  assert.equal(action.ok ? "" : action.error, DISABLED);
  const billForm = new FormData();
  billForm.set("bill_id", String(billId));
  const billAction = await sendBillToQuickbooksAction(billForm);
  assert.equal(billAction.ok, false);
  assert.equal(billAction.ok ? "" : billAction.error, DISABLED);

  const polled = await payments.syncQboPaymentsFromCdc();
  assert.equal(polled.saved, 0);
  assert.equal(polled.error, undefined);
  assert.doesNotMatch(read("lib/integrations/qbo-payments.ts"), /sendLoadToQuickbooks|sendBillToQuickbooks|qboInvoiceSendEnabled/);

  process.env.QBO_INVOICE_SEND_ENABLED = "true";
  const heldAt = new Date().toISOString();
  db.prepare("UPDATE loads SET qbo_send_claimed_at = ? WHERE id = ?").run(heldAt, deliveredId);
  await assert.rejects(() => qbo.sendLoadToQuickbooks(deliveredId), /already running for this load/);
  assert.equal(
    (db.prepare("SELECT qbo_send_claimed_at AS claim FROM loads WHERE id = ?").get(deliveredId) as { claim: string }).claim,
    heldAt,
  );

  const staleAt = new Date(Date.now() - QBO_SEND_CLAIM_STALE_MS - 1000).toISOString();
  db.prepare("UPDATE loads SET qbo_send_claimed_at = ? WHERE id = ?").run(staleAt, deliveredId);
  const sent = await qbo.sendLoadToQuickbooks(deliveredId);
  assert.match(sent.invoiceId, /^demo-LOCK1-/);
  assert.equal(
    (db.prepare("SELECT qbo_send_claimed_at AS claim FROM loads WHERE id = ?").get(deliveredId) as { claim: string }).claim,
    "",
  );

  await assert.rejects(() => qbo.sendLoadToQuickbooks(openId), /Delivered/);
  assert.equal(
    (db.prepare("SELECT qbo_send_claimed_at AS claim FROM loads WHERE id = ?").get(openId) as { claim: string }).claim,
    "",
  );

  const fresh = claimQboLoadSend(openId, new Date("2026-10-14T12:00:00.000Z"));
  assert.ok(fresh);
  assert.equal(claimQboLoadSend(openId, new Date("2026-10-14T12:01:00.000Z")), null);
  const takenOver = claimQboLoadSend(openId, new Date("2026-10-14T12:02:01.000Z"));
  assert.ok(takenOver);
  assert.notEqual(takenOver?.claimedAt, fresh?.claimedAt);
  releaseQboLoadSend(openId, fresh!.claimedAt);
  assert.equal(
    (db.prepare("SELECT qbo_send_claimed_at AS claim FROM loads WHERE id = ?").get(openId) as { claim: string }).claim,
    takenOver!.claimedAt,
    "releasing an old claim does not clear the send that took over",
  );
  releaseQboLoadSend(openId, takenOver!.claimedAt);
  assert.equal(
    (db.prepare("SELECT qbo_send_claimed_at AS claim FROM loads WHERE id = ?").get(openId) as { claim: string }).claim,
    "",
  );

  const otherId = makeLoad("LOCK3", "delivered");
  db.prepare("UPDATE loads SET qbo_invoice_id = ? WHERE id = ?").run(sent.invoiceId, deliveredId);
  assert.throws(
    () => db.prepare("UPDATE loads SET qbo_invoice_id = ? WHERE id = ?").run(` ${sent.invoiceId} `, otherId),
    /UNIQUE|constraint/i,
  );
  db.prepare("UPDATE loads SET qbo_invoice_id = '' WHERE id = ?").run(otherId);
  const blankTwin = makeLoad("LOCK4", "delivered");
  db.prepare("UPDATE loads SET qbo_invoice_id = '' WHERE id = ?").run(blankTwin);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM loads WHERE TRIM(qbo_invoice_id) = ''").get() as { n: number }).n >= 2,
    true,
  );

  const conflictPath = path.join(tmp, "conflicts.db");
  const conflictDb = new Database(conflictPath);
  conflictDb.exec(`
    CREATE TABLE loads (
      id INTEGER PRIMARY KEY,
      load_number TEXT NOT NULL,
      qbo_invoice_id TEXT NOT NULL DEFAULT ''
    );
  `);
  conflictDb.exec(`
    INSERT INTO loads (load_number, qbo_invoice_id) VALUES
      ('A', 'inv-shared'),
      ('B', ' inv-shared '),
      ('C', ''),
      ('D', '   ');
  `);
  const skipped = migrateQboInvoiceIdUnique(conflictDb);
  assert.equal(skipped.created, false);
  assert.equal(skipped.conflicts.length, 1);
  assert.equal(skipped.conflicts[0]?.qbo_invoice_id, "inv-shared");
  assert.match(skipped.conflicts[0]?.load_numbers ?? "", /A/);
  assert.match(skipped.conflicts[0]?.load_numbers ?? "", /B/);
  assert.equal(
    conflictDb.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_loads_qbo_invoice_id_unique'").get(),
    undefined,
  );
  conflictDb.exec("DELETE FROM loads WHERE load_number IN ('A', 'B')");
  const created = migrateQboInvoiceIdUnique(conflictDb);
  assert.equal(created.created, true);
  assert.equal(created.conflicts.length, 0);
  conflictDb.close();

  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { QboSendHold } = await import("../components/qbo-send-hold");
  for (const variant of ["button", "link", "menu"] as const) {
    const html = renderToStaticMarkup(createElement(QboSendHold, { label: "Send to QuickBooks", variant }));
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /type="button"/);
    assert.match(html, new RegExp(`aria-describedby="([^"]+)"[\\s\\S]*${DISABLED}|${DISABLED}[\\s\\S]*id="([^"]+)"`));
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
    assert.match(html, new RegExp(`id="${describedBy}"`));
    assert.match(html, new RegExp(DISABLED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(html.includes("title="), false);
  }

  const hold = read("components/qbo-send-hold.tsx");
  assert.match(hold, /aria-disabled="true"/);
  assert.match(hold, /aria-describedby/);
  assert.match(hold, /data-qbo-send-locked/);
  assert.match(hold, /QBO_INVOICE_SEND_DISABLED_MESSAGE/);
  assert.doesNotMatch(hold, /title=\{/);
  assert.match(read("components/quickbooks-invoice-panel.tsx"), /QboSendHold/);
  assert.match(read("components/invoice-row-actions.tsx"), /QboSendHold/);
  assert.match(read("components/accounting-hub.tsx"), /QboSendHold/);
  assert.match(read("components/accounting-hub.tsx"), /role="status"/);
  assert.match(read("components/send-to-accounting.tsx"), /QboSendHold/);
  assert.match(read("app/globals.css"), /qbo-send-hold-action\[aria-disabled="true"\]:focus-visible/);
  assert.match(read(".env.example"), /QBO_INVOICE_SEND_ENABLED=false/);
  assert.match(read("lib/integrations/quickbooks.ts"), /assertQboInvoiceSendEnabled\(\)/);
  assert.equal(read("lib/integrations/quickbooks.ts").match(/assertQboInvoiceSendEnabled\(\)/g)?.length, 3);

  closeDb();
  console.log("qbo send lock tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
