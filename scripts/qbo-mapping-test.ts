/**
 * QuickBooks mapping: invoice lines use Accounting > QuickBooks > Map Pay Items (Line Haul = flat_rate),
 * then an exact item name, and never an arbitrary Service item. Bills need an explicit expense account.
 * OAuth redirects behind a tunnel never leak the internal :3000 port. No network: fetch is mocked.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-qbo-map-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.QBO_CLIENT_ID = "test-client";
process.env.QBO_CLIENT_SECRET = "test-secret";
process.env.QBO_SANDBOX = "true";
fs.writeFileSync(path.join(tmp, "qbo-refresh.json"), JSON.stringify({ refresh_token: "rt-test", realm_id: "4620000000000001" }));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Call = { url: string; method: string; body: Json };
const calls: Call[] = [];
const ITEMS = [
  { Id: "3", Name: "Concrete", Type: "Service" },
  { Id: "21", Name: "Freight Revenue", Type: "Service" },
  { Id: "22", Name: "Detention", Type: "Service" },
];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body;
  calls.push({ url, method, body });
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  assert.ok(url.startsWith("https://sandbox-quickbooks.api.intuit.com/") || url.startsWith("https://oauth.platform.intuit.com/"), `unexpected host ${url}`);
  if (url.includes("/tokens/bearer")) return json({ access_token: "at-test", refresh_token: "rt-test-2", expires_in: 3600 });
  if (url.includes("/query?")) {
    const q = decodeURIComponent(url.split("query=")[1].split("&")[0]);
    const byName = q.match(/from Item where Name = '(.+)'/);
    if (byName) return json({ QueryResponse: { Item: ITEMS.filter((i) => i.Name === byName[1].replace(/''/g, "'")) } });
    if (/from Vendor where DisplayName/.test(q)) return json({ QueryResponse: { Vendor: [{ Id: "60" }] } });
    return json({ QueryResponse: {} });
  }
  if (method === "POST" && url.includes("/invoice")) return json({ Invoice: { Id: "900", DocNumber: body.DocNumber } });
  if (method === "POST" && url.includes("/bill")) return json({ Bill: { Id: "901" } });
  return json({});
}) as typeof fetch;

async function main() {
  const { browserOrigin, browserUrl } = await import("../lib/http-origin");
  const tunnel = new Request("http://127.0.0.1:3000/api/integrations/quickbooks/callback", {
    headers: { host: "msetms.mandsloads.com", "x-forwarded-proto": "https" },
  });
  assert.equal(browserOrigin(tunnel), "https://msetms.mandsloads.com");
  assert.equal(browserUrl("/settings/quickbooks?connected=1", tunnel).href, "https://msetms.mandsloads.com/settings/quickbooks?connected=1");
  assert.equal(browserOrigin(new Request("http://127.0.0.1:3000/x", { headers: { host: "127.0.0.1:3000" } })), "http://127.0.0.1:3000");
  assert.equal(browserOrigin(new Request("http://0.0.0.0:3000/x")), "http://localhost:3000");

  const queries = await import("../lib/queries");
  const { getDb } = await import("../lib/db");
  const { addPayItem } = await import("../lib/pay-items");
  const { upsertQboItemMap } = await import("../lib/accounting-desk");
  const qbo = await import("../lib/integrations/quickbooks");
  const accounting = await import("../lib/accounting");
  const db = getDb();
  const customerId = queries.createCustomer({ name: "QBO Map Customer", billing_notes: "", contacts: [] });
  db.prepare("UPDATE customers SET qbo_customer_id = '58', qbo_status = 'mapped' WHERE id = ?").run(customerId);
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const loadId = queries.createLoad({
    customer_id: customerId, origin: "Hastings, NE", destination: "Omaha, NE",
    pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
    weight: 40000, commodity: "Frozen beef", rate: 2000, notes: "", special_instructions: "", appointment_notes: "",
    reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
    truck_id: null, driver_id: null, trailer_id: null, load_number: "QBOMAP1", oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(loadId);
  addPayItem(loadId, { side: "income", bill_to: "customer", payee: "", category: "detention", rate: 75, qty: 1, total: 75, notes: "" });
  addPayItem(loadId, { side: "income", bill_to: "customer", payee: "", category: "tonu", rate: 50, qty: 1, total: 50, notes: "" });

  const lines = qbo.buildInvoiceLines(queries.getLoad(loadId)!);
  assert.deepEqual(lines.map((l) => [l.category, l.name, l.amount]), [["flat_rate", "Line Haul", 2000], ["detention", "Detention", 75], ["tonu", "TONU", 50]]);

  // Unmapped "Line Haul" with no same-named item: refuse instead of using "Concrete".
  await assert.rejects(() => qbo.sendLoadToQuickbooks(loadId), /Map pay item "Line Haul"/);
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("quickbooks.api.intuit.com")), false, "no QBO writes when a line is unmapped");
  assert.equal(calls.some((c) => /Type%20%3D%20'Service'|Type = 'Service'/.test(decodeURIComponent(c.url))), false);

  upsertQboItemMap("flat_rate", "21", "Freight Revenue");
  upsertQboItemMap("tonu", "", ""); // blank map row (as saved on prod) must not count as mapped
  await assert.rejects(() => qbo.sendLoadToQuickbooks(loadId), /Map pay item "TONU"/);
  upsertQboItemMap("tonu", "21", "Freight Revenue");
  calls.length = 0;
  const sent = await qbo.sendLoadToQuickbooks(loadId);
  assert.equal(sent.invoiceId, "900");
  const invoice = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"))!;
  assert.equal(invoice.body.CustomerRef.value, "58");
  assert.deepEqual(invoice.body.Line.map((l: Json) => l.SalesItemLineDetail.ItemRef.value), ["21", "22", "21"], "map, exact name, map");

  // Bills: explicit expense account only.
  const billId = accounting.createBill({ vendor: "QBO Map Vendor", memo: "test", amount: 12.5, loadId });
  await assert.rejects(() => qbo.sendBillToQuickbooks(billId), /QBO_BILL_EXPENSE_ACCOUNT_ID/);
  process.env.QBO_BILL_EXPENSE_ACCOUNT_ID = "77";
  calls.length = 0;
  const bill = await qbo.sendBillToQuickbooks(billId);
  assert.equal(bill.billId, "901");
  const billCall = calls.find((c) => c.method === "POST" && c.url.includes("/bill"))!;
  assert.equal(billCall.body.Line[0].AccountBasedExpenseLineDetail.AccountRef.value, "77");
  assert.equal(calls.some((c) => /AccountType/.test(decodeURIComponent(c.url))), false);
  console.log("qbo-mapping-test: ok");
}

main().then(() => fs.rmSync(tmp, { recursive: true, force: true })).catch((error) => {
  console.error(error);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});
