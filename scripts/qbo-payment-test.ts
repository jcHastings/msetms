/**
 * QuickBooks payment sync. Synthetic ids only. No live Intuit calls.
 * Webhook signature, partial pay, multi-invoice, overpay, demo ignore,
 * unmatched inbox, void/delete, idempotent redelivery, CDC GET.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-qbo-pay-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.QBO_CLIENT_ID = "synthetic-client";
process.env.QBO_CLIENT_SECRET = "synthetic-secret";
process.env.QBO_REFRESH_TOKEN = "synthetic-refresh";
process.env.QBO_REALM_ID = "111";
process.env.QBO_SANDBOX = "true";
process.env.QBO_WEBHOOK_VERIFIER = "synthetic-verifier-token";
process.env.TMS_QBO_REFRESH_PATH = path.join(tmp, "qbo-refresh.json");
delete process.env.QBO_PAYMENT_AR_EMAIL;

const day = "2026-08-01T15:00:00.000Z";

function payment(over: {
  id: string;
  txnDate?: string;
  totalAmt?: number;
  unappliedAmt?: number;
  status?: "applied" | "voided" | "deleted";
  lines?: Array<{ invoiceId: string; amount: number }>;
  ambiguousAmt?: number;
}) {
  return {
    txnDate: "2026-10-01",
    totalAmt: 1000,
    unappliedAmt: 0,
    status: "applied" as const,
    lines: [] as Array<{ invoiceId: string; amount: number }>,
    ambiguousAmt: 0,
    lastUpdated: "2026-10-01T00:00:00-07:00",
    ...over,
  };
}

async function main() {
  const queries = await import("../lib/queries");
  const { getDb } = await import("../lib/db");
  const aging = await import("../lib/accounting-aging");
  const payments = await import("../lib/integrations/qbo-payments");
  const qbo = await import("../lib/integrations/quickbooks");
  const { listExceptionInbox } = await import("../lib/exceptions");
  const { canAccessAccounting } = await import("../lib/settings-shared");
  const { listDispatcherUsers } = await import("../lib/settings");
  qbo.resetQuickbooksForTests();

  assert.equal(payments.intuitSignaturesMatch("abc", "abcd"), false);
  assert.equal(payments.intuitSignaturesMatch("", "abc"), false);
  const sig = payments.intuitWebhookSignature("synthetic-verifier-token", "{\"a\":1}");
  assert.equal(payments.intuitSignaturesMatch(sig, sig), true);
  assert.equal(payments.intuitSignaturesMatch(sig, `${sig}x`), false);

  const db = getDb();
  db.prepare("UPDATE company_profile SET ar_email = 'billing@example.com' WHERE id = 1").run();
  db.prepare(
    `INSERT INTO dispatchers (name, pin, role, email, phone, active, permission_group, password_hash)
     VALUES ('Pay Acct', '', 'accounting', 'acct-pay@example.com', '', 1, 'billing', 'x')`,
  ).run();
  const customerId = queries.createCustomer({ name: "Pay Customer", billing_notes: "", contacts: [] });

  function makeLoad(number: string, rate: number, invoiceId: string, source: "quickbooks" | "demo") {
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
      rate,
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
    db.prepare("UPDATE loads SET status = 'accounting', accounting_desk = 'accounting' WHERE id = ?").run(id);
    queries.markQboInvoice(id, { invoiceId, invoiceNumber: number, source, sentAt: day });
    return id;
  }

  const fullId = makeLoad("PAY1001", 1000, "inv-full", "quickbooks");
  const partialId = makeLoad("PAY1002", 1000, "inv-part", "quickbooks");
  const otherId = makeLoad("PAY1003", 800, "inv-other", "quickbooks");
  const secondId = makeLoad("PAY1004", 600, "inv-second", "quickbooks");
  const demoId = makeLoad("PAY1005", 500, "inv-demo", "demo");
  const dupA = makeLoad("PAY1006", 400, "inv-dup", "quickbooks");
  const dupB = makeLoad("PAY1007", 400, "inv-dup", "quickbooks");
  const legacyId = makeLoad("PAY1008", 250, "inv-legacy", "quickbooks");
  queries.markInvoicePaid(legacyId, true);

  function noteCount(): number {
    return Number(
      (db.prepare("SELECT COUNT(*) AS n FROM user_notifications WHERE title = 'QuickBooks payment'").get() as { n: number }).n,
    );
  }
  const recipients = listDispatcherUsers(false).filter((user) => user.active && canAccessAccounting(user.role)).length;
  assert.ok(recipients >= 1);

  const full = payments.applyQboPayment(
    payment({
      id: "77",
      totalAmt: 1000,
      lines: [{ invoiceId: "inv-full", amount: 1000 }],
    }),
  );
  assert.equal(full.notified, true);
  assert.equal(full.emails.length, 0);
  const fullLoad = queries.getLoad(fullId)!;
  assert.equal(fullLoad.invoice_paid, 1);
  assert.equal(fullLoad.invoice_paid_amount, 1000);
  assert.equal(fullLoad.invoice_paid_at, "2026-10-01");
  assert.equal(fullLoad.qbo_payment_id, "77");
  assert.match(aging.invoicePaidLabel(fullLoad), /Paid/);
  assert.match(aging.invoicePaidLabel(fullLoad), /10\/01\/2026/);
  assert.match(aging.invoicePaidLabel(fullLoad), /QBO 77/);
  assert.equal(noteCount(), recipients);

  const again = payments.applyQboPayment(
    payment({
      id: "77",
      totalAmt: 1000,
      lines: [{ invoiceId: "inv-full", amount: 1000 }],
    }),
  );
  assert.equal(again.notified, false);
  assert.equal(queries.getLoad(fullId)!.invoice_paid_amount, 1000);
  assert.equal(noteCount(), recipients);

  payments.applyQboPayment(
    payment({
      id: "78",
      totalAmt: 400,
      unappliedAmt: 0,
      lines: [{ invoiceId: "inv-part", amount: 400 }],
    }),
  );
  const partialLoad = queries.getLoad(partialId)!;
  assert.equal(partialLoad.invoice_paid, 0);
  assert.equal(partialLoad.invoice_paid_amount, 400);
  const partialRow = aging.listArReportRows().find((row) => row.loadId === partialId)!;
  assert.equal(partialRow.total, 1000);
  assert.equal(partialRow.paid, 400);
  assert.equal(partialRow.balance, 600);
  assert.equal(partialRow.current + partialRow.aging0to29 + partialRow.aging30, 600);
  assert.match(
    (db.prepare("SELECT body FROM user_notifications WHERE body LIKE '%PAY1002%'").get() as { body: string }).body,
    /Remaining/,
  );

  payments.applyQboPayment(
    payment({
      id: "79",
      totalAmt: 1600,
      lines: [
        { invoiceId: "inv-part", amount: 600 },
        { invoiceId: "inv-second", amount: 600 },
      ],
    }),
  );
  assert.equal(queries.getLoad(partialId)!.invoice_paid, 1);
  assert.equal(queries.getLoad(partialId)!.invoice_paid_amount, 1000);
  assert.equal(queries.getLoad(secondId)!.invoice_paid, 1);
  assert.equal(queries.getLoad(secondId)!.invoice_paid_amount, 600);

  const beforeOther = queries.getLoad(otherId)!.invoice_paid_amount;
  const over = payments.applyQboPayment(
    payment({
      id: "80",
      totalAmt: 1500,
      lines: [{ invoiceId: "inv-other", amount: 1500 }],
    }),
  );
  assert.equal(queries.getLoad(otherId)!.invoice_paid_amount, 800);
  assert.equal(queries.getLoad(otherId)!.invoice_paid, 1);
  assert.equal(beforeOther, 0);
  assert.ok(over.unappliedAmt >= 700);
  const spilled = db
    .prepare("SELECT COALESCE(SUM(applied_amount), 0) AS amount FROM qbo_payment_applications WHERE qbo_payment_id = '80'")
    .get() as { amount: number };
  assert.equal(spilled.amount, 800);

  const demoNotes = noteCount();
  const unmatched = payments.applyQboPayment(
    payment({
      id: "81",
      totalAmt: 500,
      lines: [
        { invoiceId: "inv-demo", amount: 200 },
        { invoiceId: "inv-missing", amount: 300 },
      ],
    }),
  );
  assert.deepEqual(unmatched.loadIds, []);
  assert.equal(queries.getLoad(demoId)!.invoice_paid_amount, 0);
  assert.equal(queries.getLoad(demoId)!.invoice_paid, 0);
  assert.ok(unmatched.unmatchedInvoiceIds.includes("inv-demo"));
  assert.ok(unmatched.unmatchedInvoiceIds.includes("inv-missing"));
  const inbox = listExceptionInbox().items.filter((item) => item.kind === "qbo_payment");
  assert.ok(inbox.some((item) => item.detail.includes("inv-missing")));
  assert.ok(inbox.some((item) => item.detail.includes("inv-demo")));
  assert.equal(queries.getLoad(dupA)!.invoice_paid_amount, 0);
  payments.applyQboPayment(
    payment({
      id: "82",
      totalAmt: 400,
      lines: [{ invoiceId: "inv-dup", amount: 400 }],
    }),
  );
  assert.equal(queries.getLoad(dupA)!.invoice_paid_amount, 0);
  assert.equal(queries.getLoad(dupB)!.invoice_paid_amount, 0);
  assert.ok(listExceptionInbox().items.some((item) => item.kind === "qbo_payment" && item.detail.includes("more than one load")));
  assert.ok(noteCount() > demoNotes);

  const legacyRow = aging.listArReportRows().find((row) => row.loadId === legacyId)!;
  assert.equal(legacyRow.balance, 0);
  assert.equal(legacyRow.paid, 250);

  const voided = payments.applyQboPayment(
    payment({ id: "77", status: "voided", totalAmt: 0, lines: [] }),
  );
  assert.equal(voided.notified, true);
  const reopened = queries.getLoad(fullId)!;
  assert.equal(reopened.invoice_paid, 0);
  assert.equal(reopened.invoice_paid_amount, 0);
  assert.equal(reopened.qbo_payment_id, "");
  assert.match(
    (db.prepare("SELECT body FROM user_notifications WHERE body LIKE '%voided%' AND body LIKE '%PAY1001%'").get() as { body: string })
      .body,
    /open again/,
  );
  const voidAgain = payments.applyQboPayment(payment({ id: "77", status: "voided", totalAmt: 0, lines: [] }));
  assert.equal(voidAgain.notified, false);

  payments.applyQboPayment(
    payment({
      id: "83",
      totalAmt: 1000,
      lines: [{ invoiceId: "inv-full", amount: 1000 }],
    }),
  );
  assert.equal(queries.getLoad(fullId)!.invoice_paid, 1);
  payments.applyDeletedPayment("83");
  assert.equal(queries.getLoad(fullId)!.invoice_paid, 0);
  assert.match(
    (db.prepare("SELECT body FROM user_notifications WHERE body LIKE '%deleted%' AND body LIKE '%PAY1001%'").get() as { body: string })
      .body,
    /open again/,
  );

  let reads = 0;
  const raw = JSON.stringify({
    eventNotifications: [
      {
        realmId: "111",
        dataChangeEvent: {
          entities: [
            { name: "Payment", id: "90", operation: "Create" },
            { name: "Invoice", id: "1", operation: "Update" },
          ],
        },
      },
    ],
  });
  const bad = await payments.ingestQboWebhook({
    rawBody: raw,
    signature: "not-the-signature",
    realmId: "111",
    readPayment: async () => {
      reads += 1;
      return payment({ id: "90", lines: [{ invoiceId: "inv-full", amount: 1000 }] });
    },
  });
  assert.equal(bad.httpStatus, 401);
  assert.equal(bad.reason, "bad_signature");
  assert.equal(reads, 0);
  assert.equal(queries.getLoad(fullId)!.invoice_paid, 0);

  const good = await payments.ingestQboWebhook({
    rawBody: raw,
    signature: payments.intuitWebhookSignature("synthetic-verifier-token", raw),
    realmId: "111",
    readPayment: async (id) => {
      reads += 1;
      assert.equal(id, "90");
      return payment({ id, totalAmt: 1000, lines: [{ invoiceId: "inv-full", amount: 1000 }] });
    },
  });
  assert.equal(good.accepted, true);
  assert.equal(good.applied, 1);
  assert.equal(reads, 1);
  assert.equal(queries.getLoad(fullId)!.invoice_paid, 1);
  assert.equal(queries.getLoad(fullId)!.qbo_payment_id, "90");

  const missing = await payments.ingestQboWebhook({
    rawBody: raw,
    signature: payments.intuitWebhookSignature("synthetic-verifier-token", raw),
    verifier: "",
    realmId: "111",
  });
  assert.equal(missing.httpStatus, 401);
  assert.equal(missing.reason, "verifier_missing");

  const calls: Array<{ url: string; method: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    const host = new URL(url).host;
    if (host.endsWith("quickbooks.api.intuit.com")) assert.equal(method, "GET");
    if (url.includes("/tokens/bearer")) {
      return Response.json({ access_token: "synthetic-access", expires_in: 3600 });
    }
    if (url.includes("/cdc?")) {
      assert.match(url, /entities=Payment/);
      assert.match(url, /sandbox-quickbooks\.api\.intuit\.com/);
      return Response.json({
        time: "2026-10-09T12:00:00-07:00",
        CDCResponse: [
          {
            QueryResponse: [
              {
                Payment: [
                  {
                    Id: "91",
                    TxnDate: "2026-10-02",
                    TotalAmt: 1000,
                    UnappliedAmt: 0,
                    Line: [{ Amount: 1000, LinkedTxn: [{ TxnId: "inv-full", TxnType: "Invoice" }] }],
                  },
                  { Id: "90", status: "Deleted" },
                ],
              },
            ],
          },
        ],
      });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;

  qbo.resetQuickbooksForTests();
  const polled = await payments.syncQboPaymentsFromCdc();
  globalThis.fetch = previousFetch;
  assert.equal(polled.error, undefined);
  assert.equal(polled.saved, 2);
  assert.ok(calls.some((call) => call.method === "GET" && call.url.includes("/cdc?")));
  assert.equal(
    calls.some((call) => call.method !== "GET" && call.url.includes("quickbooks.api.intuit.com")),
    false,
  );
  assert.equal(queries.getLoad(fullId)!.invoice_paid, 1);
  assert.equal(queries.getLoad(fullId)!.qbo_payment_id, "91");
  const cursor = db.prepare("SELECT changed_since FROM qbo_sync_cursors WHERE entity = 'Payment'").get() as {
    changed_since: string;
  };
  assert.equal(cursor.changed_since, "2026-10-09T12:00:00-07:00");

  process.env.QBO_PAYMENT_AR_EMAIL = "1";
  const sent: string[] = [];
  const mailBody = JSON.stringify({
    eventNotifications: [
      {
        realmId: "111",
        dataChangeEvent: { entities: [{ name: "Payment", id: "92", operation: "Create" }] },
      },
    ],
  });
  await payments.ingestQboWebhook({
    rawBody: mailBody,
    signature: payments.intuitWebhookSignature("synthetic-verifier-token", mailBody),
    realmId: "111",
    readPayment: async () => payment({ id: "92", totalAmt: 600, lines: [{ invoiceId: "inv-second", amount: 600 }] }),
    sendMail: async (email) => {
      sent.push(email.to);
    },
  });
  delete process.env.QBO_PAYMENT_AR_EMAIL;
  assert.deepEqual(sent, ["billing@example.com"]);

  const route = fs.readFileSync(path.join(process.cwd(), "app/api/integrations/quickbooks/webhook/route.ts"), "utf8");
  assert.match(route, /intuit-signature/);
  const feed = fs.readFileSync(path.join(process.cwd(), "lib/feed-refresh.ts"), "utf8");
  assert.match(feed, /syncQboPaymentsFromCdc/);
  const reader = fs.readFileSync(path.join(process.cwd(), "lib/integrations/quickbooks.ts"), "utf8");
  const paymentRead = reader.slice(reader.indexOf("export async function readQboPayment"), reader.indexOf("export async function readQboPaymentCdc"));
  assert.match(paymentRead, /payment read/);
  assert.doesNotMatch(paymentRead, /method:\s*"POST"|method:\s*"PUT"/);
  const checklist = fs.readFileSync(path.join(process.cwd(), "docs/intuit-production-checklist.md"), "utf8");
  const privacy = fs.readFileSync(path.join(process.cwd(), "docs/privacy-and-terms.md"), "utf8");
  assert.match(checklist, /webhook/);
  assert.match(privacy, /webhook/);

  console.log("qbo-payment-test ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
