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
  assert.ok(
    url.startsWith("https://sandbox-quickbooks.api.intuit.com/") ||
      url.startsWith("https://oauth.platform.intuit.com/") ||
      url.startsWith("https://developer.api.intuit.com/v2/oauth2/tokens/revoke"),
    `unexpected host ${url}`,
  );
  if (url.includes("/tokens/revoke")) return new Response("", { status: 200 });
  if (url.includes("/invoice/") && method === "GET") {
    return new Response(JSON.stringify({ Fault: {} }), { status: 500, headers: { intuit_tid: "tid-test-123" } });
  }
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
  const { upsertQboItemMap, upsertQboVendorMap } = await import("../lib/accounting-desk");
  const qbo = await import("../lib/integrations/quickbooks");
  const accounting = await import("../lib/accounting");
  const db = getDb();
  // Live sends need the MS Express remit street and AR email (qbo-campaign.ts covers the block).
  db.prepare("UPDATE company_profile SET street = '100 Test Remit St', ar_email = 'billing@example.com' WHERE id = 1").run();
  assert.equal((db.prepare("SELECT changes() AS n").get() as { n: number }).n, 1);
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
  assert.equal(invoice.body.DocNumber, "QBOMAP1", "DocNumber is the MS Express load number");
  assert.equal(String(invoice.body.DocNumber).length <= 21, true);
  assert.deepEqual(invoice.body.Line.map((l: Json) => l.SalesItemLineDetail.ItemRef.value), ["21", "22", "21"], "map, exact name, map");

  // Unmapped customer: never query or create a QBO customer during invoice sync.
  const bareId = queries.createCustomer({ name: "Unmapped Broker", billing_notes: "", contacts: [] });
  const bareLoad = queries.createLoad({
    customer_id: bareId, origin: "Hastings, NE", destination: "Omaha, NE",
    pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
    weight: 1000, commodity: "Frozen beef", rate: 400, notes: "", special_instructions: "", appointment_notes: "",
    reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
    truck_id: null, driver_id: null, trailer_id: null, load_number: "QBOMAP2", oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(bareLoad);
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(bareLoad), /Map this customer first/);
  assert.equal(calls.some((c) => c.method === "POST" && /\/customer\?/.test(c.url)), false, "no customer create");
  assert.equal(calls.some((c) => /from Customer/.test(decodeURIComponent(c.url))), false, "no customer name lookup");

  // Duplicate TMS customers (M&S Loads 531 and 9) can share one QBO customer id.
  const dupId = queries.createCustomer({ name: "M&S Loads", billing_notes: "", contacts: [] });
  db.prepare("UPDATE customers SET qbo_customer_id = '58', qbo_status = 'mapped' WHERE id = ?").run(dupId);
  const dupLoad = queries.createLoad({
    customer_id: dupId, origin: "Hastings, NE", destination: "Omaha, NE",
    pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
    weight: 1000, commodity: "Frozen beef", rate: 900, notes: "", special_instructions: "", appointment_notes: "",
    reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
    truck_id: null, driver_id: null, trailer_id: null, load_number: "QBOMAP3", oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(dupLoad);
  calls.length = 0;
  const shared = await qbo.sendLoadToQuickbooks(dupLoad);
  assert.equal(shared.invoiceId, "900");
  const sharedInvoice = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"))!;
  assert.equal(sharedInvoice.body.CustomerRef.value, "58");
  const sharedCount = db.prepare("SELECT COUNT(*) AS n FROM customers WHERE qbo_customer_id = '58'").get() as { n: number };
  assert.equal(sharedCount.n, 2, "two TMS customers share one QBO customer");

  // Bills: explicit vendor map and expense account. Never create a vendor.
  const billId = accounting.createBill({ vendor: "QBO Map Vendor", memo: "test", amount: 12.5, loadId });
  calls.length = 0;
  await assert.rejects(() => qbo.sendBillToQuickbooks(billId), /Map this vendor first/);
  assert.equal(calls.some((c) => c.method === "POST" && /\/vendor\?/.test(c.url)), false, "no vendor create");
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("/bill")), false);
  upsertQboVendorMap("QBO Map Vendor", "61", "Mapped Vendor");
  await assert.rejects(() => qbo.sendBillToQuickbooks(billId), /QBO_BILL_EXPENSE_ACCOUNT_ID/);
  process.env.QBO_BILL_EXPENSE_ACCOUNT_ID = "77";
  calls.length = 0;
  const bill = await qbo.sendBillToQuickbooks(billId);
  assert.equal(bill.billId, "901");
  const billCall = calls.find((c) => c.method === "POST" && c.url.includes("/bill"))!;
  assert.equal(billCall.body.VendorRef.value, "61");
  assert.equal(billCall.body.Line[0].AccountBasedExpenseLineDetail.AccountRef.value, "77");
  assert.equal(calls.some((c) => /AccountType/.test(decodeURIComponent(c.url))), false);
  assert.equal(calls.some((c) => c.method === "POST" && /\/vendor\?/.test(c.url)), false);
  const qboSrc = fs.readFileSync(path.join(process.cwd(), "lib/integrations/quickbooks.ts"), "utf8");
  assert.doesNotMatch(qboSrc, /\/customer"|\/vendor"/);
  assert.doesNotMatch(qboSrc, /load_number\.slice\(0,\s*21\)/);
  assert.match(qboSrc, /quickbooksDocNumber/);
  const mapPage = fs.readFileSync(path.join(process.cwd(), "app/accounting/quickbooks/page.tsx"), "utf8");
  assert.match(mapPage, /htmlFor=\{selectId\}/);
  assert.match(mapPage, /No TMS customers to map yet/);
  assert.match(mapPage, /Several TMS customers can share one QuickBooks customer/);
  assert.match(mapPage, /Nothing here creates a customer in QuickBooks/);
  assert.match(mapPage, /Nothing here creates a vendor in QuickBooks/);
  // Re-sync reads the existing invoice first; an Intuit error carries intuit_tid and nothing is written.
  db.prepare("UPDATE loads SET qbo_source = 'quickbooks', qbo_invoice_id = '900' WHERE id = ?").run(dupLoad);
  calls.length = 0;
  const quiet = console.error;
  console.error = () => {};
  await assert.rejects(() => qbo.sendLoadToQuickbooks(dupLoad, { confirmResend: true }), /Intuit ref tid-test-123/);
  console.error = quiet;
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("/invoice")), false, "no write after a failed read");

  // Disconnect revokes the refresh token at Intuit, then deletes the local token file.
  calls.length = 0;
  const disconnected = await qbo.disconnectQuickbooks();
  assert.equal(disconnected.revoked, true);
  const revoke = calls.find((c) => c.url.includes("/tokens/revoke"));
  assert.ok(revoke && revoke.method === "POST", "revoke called");
  assert.equal(fs.existsSync(path.join(tmp, "qbo-refresh.json")), false, "token file removed");
  assert.equal(qbo.hasQuickbooksSession(), false);
  // Intuit production settings link to public /privacy and /terms: signed-out, DRAFT-marked, MS Express identity only.
  const { config: mwConfig } = await import("../middleware");
  const matcher = new RegExp(`^${mwConfig.matcher[0]}$`);
  for (const open of ["/privacy", "/terms", "/login", "/driver"]) assert.equal(matcher.test(open), false, `${open} is public`);
  for (const closed of ["/settings/quickbooks", "/accounting/quickbooks", "/privacy-admin", "/termsheet", "/"]) {
    assert.equal(matcher.test(closed), true, `${closed} needs sign-in`);
  }
  const shell = fs.readFileSync(path.join(process.cwd(), "components/shell-switch.tsx"), "utf8");
  assert.match(shell, /pathname === "\/privacy"/);
  assert.match(shell, /pathname === "\/terms"/);
  const legal = ["app/privacy/page.tsx", "app/terms/page.tsx", "components/legal-document.tsx"]
    .map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8"))
    .join("\n");
  assert.match(legal, /DRAFT/);
  assert.match(legal, /data-legal-draft/);
  assert.match(legal, /3062879/);
  assert.match(legal, /402-302-0097/);
  assert.match(legal, /State of Nebraska/);
  assert.match(legal, /ar@msloads\.com/);
  assert.match(legal, /10 years/);
  assert.match(legal, /backup retention: JC to confirm/);
  assert.doesNotMatch(legal, /M&S Loads LLC|M & S Loads|MC-970613|970613|jc@msloads\.com/i);
  console.log("qbo-mapping-test: ok");
}

main().then(() => fs.rmSync(tmp, { recursive: true, force: true })).catch((error) => {
  console.error(error);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});
