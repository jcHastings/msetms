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
process.env.QBO_INVOICE_SEND_ENABLED = "true";
fs.writeFileSync(path.join(tmp, "qbo-refresh.json"), JSON.stringify({ refresh_token: "rt-test", realm_id: "4620000000000001" }));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Call = { url: string; method: string; body: Json };
const calls: Call[] = [];
const ITEMS = [
  { Id: "3", Name: "Concrete", Type: "Service", IncomeAccountRef: { value: "1", name: "Other" } },
  { Id: "21", Name: "Freight Revenue", Type: "Service", IncomeAccountRef: { value: "401", name: "Gross Trucking Income" } },
  { Id: "22", Name: "Detention", Type: "Service", IncomeAccountRef: { value: "401", name: "Gross Trucking Income" } },
];
const ACCOUNTS = [
  {
    Id: "401",
    Name: "Gross Trucking Income",
    FullyQualifiedName: "Gross Trucking Income",
    AccountType: "Income",
    Classification: "Revenue",
    Active: true,
  },
];
const CUSTOMERS: Array<{ Id: string; DisplayName: string }> = [];
const CLASSES: Array<{ Id: string; Name: string }> = [];
let nextClassId = 500;
let nextInvoiceId = 900;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body;
  calls.push({ url, method, body });
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  assert.ok(
    url.startsWith("https://sandbox-quickbooks.api.intuit.com/") ||
      url.startsWith("https://quickbooks.api.intuit.com/") ||
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
    const quoted = (field: string) => q.match(new RegExp(`${field} = '((?:[^']|'')*)'`))?.[1]?.replace(/''/g, "'");
    if (/from Item/i.test(q)) {
      const name = quoted("Name");
      const id = quoted("Id");
      return json({
        QueryResponse: {
          Item: ITEMS.filter((item) => (name ? item.Name === name : true) && (id ? item.Id === id : true)),
        },
      });
    }
    if (/from Account/i.test(q)) return json({ QueryResponse: { Account: ACCOUNTS } });
    if (/from Preferences/i.test(q)) {
      return json({ QueryResponse: { Preferences: { SalesFormsPrefs: { CustomTxnNumbers: false } } } });
    }
    if (/from Customer/i.test(q)) return json({ QueryResponse: { Customer: CUSTOMERS } });
    if (/from Class/i.test(q)) return json({ QueryResponse: { Class: CLASSES } });
    if (/from Vendor/i.test(q) || /from Invoice/i.test(q)) return json({ QueryResponse: {} });
    return json({ QueryResponse: {} });
  }
  if (method === "POST" && /\/class(\?|$)/.test(url)) {
    const created = { Id: String(nextClassId++), Name: String(body?.Name ?? "").trim() };
    CLASSES.push(created);
    return json({ Class: created });
  }
  if (method === "POST" && url.includes("/invoice")) {
    const lines = Array.isArray(body?.Line) ? body.Line : [];
    const totalAmt = Math.round(lines.reduce((sum: number, line: Json) => sum + (Number(line.Amount) || 0), 0) * 100) / 100;
    const id = body?.Id ? String(body.Id) : String(nextInvoiceId++);
    return json({ Invoice: { Id: id, DocNumber: body.DocNumber || "1006250", SyncToken: "0", TotalAmt: totalAmt } });
  }
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
  assert.match(lines[1].description, /Detention/);
  assert.match(lines[2].description, /TONU/);
  assert.match(lines[0].description, /QBOMAP1/);

  // Unmapped "Line Haul" with no same-named item: refuse instead of using "Concrete".
  await assert.rejects(() => qbo.sendLoadToQuickbooks(loadId), /QuickBooks has no item named "Line Haul"/);
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("quickbooks.api.intuit.com")), false, "no QBO writes when a line is unmapped");
  assert.equal(calls.some((c) => /Type%20%3D%20'Service'|Type = 'Service'/.test(decodeURIComponent(c.url))), false);

  ITEMS.push({ Id: "23", Name: "Line Haul", Type: "Service", IncomeAccountRef: { value: "401", name: "Gross Trucking Income" } });
  upsertQboItemMap("flat_rate", "21", "Freight Revenue");
  upsertQboItemMap("tonu", "", ""); // blank map row (as saved on prod) must not count as mapped
  calls.length = 0;
  const sent = await qbo.sendLoadToQuickbooks(loadId);
  assert.match(sent.invoiceId, /^\d+$/);
  const invoice = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"))!;
  assert.equal(invoice.body.CustomerRef.value, "58");
  assert.equal(invoice.body.DocNumber, "QBOMAP1", "DocNumber is the TMS load number");
  assert.equal(invoice.body.ARAccountRef, undefined);
  assert.equal(invoice.body.ClassRef, undefined, "a load with no driver has no class");
  assert.ok(
    invoice.body.Line.every((line: Json) => line.SalesItemLineDetail.ClassRef === undefined),
    "lines have no class when the load has no driver",
  );
  assert.equal(sent.invoiceNumber, "QBOMAP1");
  assert.equal(queries.getLoad(loadId)?.qbo_doc_number, "QBOMAP1");
  assert.equal(queries.getLoad(loadId)?.qbo_invoice_total, 2125);
  assert.equal(sent.totalAmt, 2125);
  assert.match(String(invoice.body.CustomerMemo.value), /MS Express load QBOMAP1/);
  assert.match(String(invoice.body.CustomerMemo.value), /Hastings, NE to Omaha, NE/);
  assert.doesNotMatch(String(invoice.body.CustomerMemo.value), /→/);
  assert.match(String(invoice.body.PrivateNote), /MSETMS load QBOMAP1/);
  assert.ok(
    invoice.body.Line.every((line: Json) => String(line.Description ?? "").includes("QBOMAP1")),
    "every line description keeps the load number",
  );
  assert.deepEqual(invoice.body.Line.map((l: Json) => l.SalesItemLineDetail.ItemRef.value), ["21", "22", "23"], "map, Detention, Line Haul");
  assert.match(String(invoice.body.Line[1].Description), /Detention/);
  assert.match(String(invoice.body.Line[2].Description), /TONU/);
  assert.equal(invoice.body.Line[1].SalesItemLineDetail.ItemRef.name, "Detention");
  assert.equal(invoice.body.Line[2].SalesItemLineDetail.ItemRef.name, "Line Haul");

  const longNumber = "N".repeat(22);
  const longLoad = queries.createLoad({
    customer_id: customerId, origin: "Hastings, NE", destination: "Omaha, NE",
    pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
    weight: 1000, commodity: "Frozen beef", rate: 100, notes: "", special_instructions: "", appointment_notes: "",
    reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
    truck_id: null, driver_id: null, trailer_id: null, load_number: longNumber, oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(longLoad);
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(longLoad), /at most 21 characters/);
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("/invoice")), false, "a long load number is not truncated or sent");
  assert.equal(queries.getLoad(longLoad)?.qbo_invoice_id ?? "", "");

  // Unmapped customer: case-insensitive unique name, and no create when it misses.
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
  await assert.rejects(
    () => qbo.sendLoadToQuickbooks(bareLoad),
    /No QuickBooks customer matches "Unmapped Broker"/,
  );
  assert.match(
    await qbo.sendLoadToQuickbooks(bareLoad).then(() => "", (error) => error instanceof Error ? error.message : String(error)),
    /create "Unmapped Broker" in QuickBooks yourself/,
  );
  assert.equal(calls.some((c) => c.method === "POST" && /\/customer\?/.test(c.url)), false, "no customer create");
  assert.equal(calls.some((c) => /from Customer/.test(decodeURIComponent(c.url))), true, "customer list lookup");

  CUSTOMERS.push({ Id: "88", DisplayName: "unmapped   broker" });
  const spacedId = queries.createCustomer({ name: "  Unmapped   Broker ", billing_notes: "", contacts: [] });
  const spacedLoad = queries.createLoad({
    customer_id: spacedId, origin: "Hastings, NE", destination: "Omaha, NE",
    pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
    weight: 1000, commodity: "Frozen beef", rate: 410, notes: "", special_instructions: "", appointment_notes: "",
    reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
    truck_id: null, driver_id: null, trailer_id: null, load_number: "QBOMAP2B", oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(spacedLoad);
  calls.length = 0;
  const spacedSent = await qbo.sendLoadToQuickbooks(spacedLoad);
  assert.match(spacedSent.invoiceId, /^\d+$/);
  const spacedInvoice = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"))!;
  assert.equal(spacedInvoice.body.CustomerRef.value, "88", "case and whitespace collapse to one customer");
  assert.equal(queries.getCustomer(spacedId)?.qbo_customer_id, "88");
  CUSTOMERS.push({ Id: "89", DisplayName: "Twin Broker" }, { Id: "90", DisplayName: "twin broker" });
  const twinId = queries.createCustomer({ name: "TWIN BROKER", billing_notes: "", contacts: [] });
  const twinLoad = queries.createLoad({
    customer_id: twinId, origin: "Hastings, NE", destination: "Omaha, NE",
    pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
    weight: 1000, commodity: "Frozen beef", rate: 420, notes: "", special_instructions: "", appointment_notes: "",
    reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
    truck_id: null, driver_id: null, trailer_id: null, load_number: "QBOMAP2C", oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(twinLoad);
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(twinLoad), /More than one QuickBooks customer matches "TWIN BROKER"/);
  assert.equal(calls.some((c) => c.method === "POST" && /\/customer\?/.test(c.url)), false, "a tie does not create a customer");

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
  assert.match(shared.invoiceId, /^\d+$/);
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
  await assert.rejects(
    () => qbo.sendBillToQuickbooks(billId),
    /QuickBooks account "Owner Operators:Owner Operators COL" is not in this company/,
  );
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
  assert.doesNotMatch(qboSrc, /nextSequenceDocNumber/);
  assert.match(qboSrc, /QBO_DOC_NUMBER_MAX = 21/);
  const mapPage = fs.readFileSync(path.join(process.cwd(), "app/accounting/quickbooks/page.tsx"), "utf8");
  assert.match(mapPage, /htmlFor=\{selectId\}/);
  assert.match(mapPage, /No TMS customers to map yet/);
  assert.match(mapPage, /Several TMS customers can share one QuickBooks customer/);
  assert.match(mapPage, /Nothing here creates a customer in QuickBooks/);
  assert.match(mapPage, /Nothing here creates a vendor in QuickBooks/);
  // Re-sync reads the existing invoice first; an Intuit error carries intuit_tid and nothing is written.
  db.prepare("UPDATE loads SET qbo_source = 'quickbooks' WHERE id = ?").run(dupLoad);
  calls.length = 0;
  const quiet = console.error;
  console.error = () => {};
  await assert.rejects(() => qbo.sendLoadToQuickbooks(dupLoad, { confirmResend: true }), /Intuit ref tid-test-123/);
  console.error = quiet;
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("/invoice")), false, "no write after a failed read");

  const { accountProblem, forbiddenAccountMessage, INVOICE_RULES } = await import("../lib/qbo-production-map");
  const { qboClassAutoCreateEnabled } = await import("../lib/env");
  assert.equal(INVOICE_RULES.fuel_surcharge.itemName, "Line Haul");
  assert.equal(INVOICE_RULES.fuel_surcharge.accountName, "Gross Trucking Income");
  assert.equal(INVOICE_RULES.fuel_surcharge.kind, "income");
  assert.equal(INVOICE_RULES.layover.itemName, "Line Haul");
  assert.equal(INVOICE_RULES.tonu.itemName, "Line Haul");
  assert.equal(INVOICE_RULES.lumper.itemName, "Lumper");
  assert.equal(INVOICE_RULES.lumper.accountName, "");
  assert.equal(INVOICE_RULES.lumper.kind, "income");
  assert.equal(INVOICE_RULES.layover.accountName, "Gross Trucking Income");
  assert.equal(INVOICE_RULES.tonu.accountName, "Gross Trucking Income");
  assert.equal(INVOICE_RULES.detention.itemName, "Detention");
  assert.equal(INVOICE_RULES.detention.accountName, "");
  assert.equal(INVOICE_RULES.detention.kind, "income");
  assert.equal(INVOICE_RULES.washout.itemName, "Trailer Washout");
  assert.equal(INVOICE_RULES.washout.accountName, "Gross Trucking Income");
  assert.equal(INVOICE_RULES.misc.itemName, "Adjustment", "Adjustment mapping is unchanged");
  assert.equal(INVOICE_RULES.misc.accountName, "Gross Trucking Income");
  assert.match(forbiddenAccountMessage("Uncategorized Income"), /uncategorized/);
  assert.match(forbiddenAccountMessage("Office:Miscellaneous"), /miscellaneous/);
  assert.equal(forbiddenAccountMessage("Gross Trucking Income"), "");
  assert.match(
    accountProblem(INVOICE_RULES.flat_rate, "Line Haul", {
      id: "407",
      fullyQualifiedName: "Uncategorized Income",
      accountType: "Income",
      classification: "Revenue",
    }),
    /uncategorized/i,
  );
  assert.equal(qboClassAutoCreateEnabled(), true, "sandbox defaults class auto-create on");
  process.env.QBO_CLASS_AUTO_CREATE = "off";
  assert.equal(qboClassAutoCreateEnabled(), false);
  delete process.env.QBO_CLASS_AUTO_CREATE;
  const savedSandbox = process.env.QBO_SANDBOX;
  process.env.QBO_SANDBOX = "false";
  assert.equal(qboClassAutoCreateEnabled(), false, "production defaults class auto-create off");
  process.env.QBO_CLASS_AUTO_CREATE = "true";
  assert.equal(qboClassAutoCreateEnabled(), true, "QBO_CLASS_AUTO_CREATE=true works in production");
  delete process.env.QBO_CLASS_AUTO_CREATE;
  process.env.QBO_SANDBOX = savedSandbox;

  const freight = ITEMS.find((item) => item.Id === "21");
  assert.ok(freight);
  const savedIncome = freight.IncomeAccountRef;
  ACCOUNTS.push({
    Id: "407",
    Name: "Uncategorized Income",
    FullyQualifiedName: "Uncategorized Income",
    AccountType: "Income",
    Classification: "Revenue",
    Active: true,
  });
  freight.IncomeAccountRef = { value: "407", name: "Uncategorized Income" };
  qbo.clearQboCatalogCache();
  const forbiddenLoad = queries.createLoad({
    customer_id: customerId, origin: "Hastings, NE", destination: "Omaha, NE",
    pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
    weight: 1000, commodity: "Frozen beef", rate: 700, notes: "", special_instructions: "", appointment_notes: "",
    reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
    truck_id: null, driver_id: null, trailer_id: null, load_number: "QBOMAP4", oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(forbiddenLoad);
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(forbiddenLoad), /uncategorized/i);
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("/invoice")), false, "a forbidden account is not posted");
  freight.IncomeAccountRef = savedIncome;
  ACCOUNTS.pop();
  qbo.clearQboCatalogCache();

  function delivered(loadNumber: string, rate: number, customer = customerId): number {
    const id = queries.createLoad({
      customer_id: customer, origin: "Hastings, NE", destination: "Omaha, NE",
      pickup_start: day, pickup_end: day, delivery_start: day, delivery_end: day,
      weight: 1000, commodity: "Frozen beef", rate, notes: "", special_instructions: "", appointment_notes: "",
      reference_number: "", po_number: "", reefer_setpoint_f: null, trailer_number: "", status: "available",
      truck_id: null, driver_id: null, trailer_id: null, load_number: loadNumber, oo_pay: null,
    } as Parameters<typeof queries.createLoad>[0]);
    db.prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(id);
    return id;
  }

  const accessorialId = delivered("QBOMAP5", 1000);
  addPayItem(accessorialId, { side: "income", bill_to: "customer", payee: "", category: "fuel_surcharge", rate: 40, qty: 1, total: 40, notes: "" });
  addPayItem(accessorialId, { side: "income", bill_to: "customer", payee: "", category: "layover", rate: 25, qty: 1, total: 25, notes: "" });
  calls.length = 0;
  await qbo.sendLoadToQuickbooks(accessorialId);
  const accessorial = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"))!;
  assert.deepEqual(
    accessorial.body.Line.map((line: Json) => line.SalesItemLineDetail.ItemRef.value),
    ["21", "23", "23"],
  );
  assert.match(String(accessorial.body.Line[1].Description), /Fuel surcharge/);
  assert.match(String(accessorial.body.Line[2].Description), /Layover/);
  assert.equal(accessorial.body.Line[2].SalesItemLineDetail.ItemRef.name, "Line Haul");
  assert.equal(accessorial.body.Line.length, 3, "fuel surcharge and layover stay on their own lines");

  const adjustmentId = delivered("QBOMAP6", 800);
  addPayItem(adjustmentId, { side: "income", bill_to: "customer", payee: "", category: "misc", rate: -15, qty: 1, total: -15, notes: "Rate adjustment" });
  upsertQboItemMap("misc", "", "");
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(adjustmentId), /QuickBooks has no item named "Adjustment"/);
  assert.equal(calls.some((c) => c.method === "POST" && c.url.includes("/invoice")), false, "a blank Adjustment map is not a mapped item");
  assert.equal(calls.some((c) => c.method === "POST" && /\/(item|account)(\?|$)/.test(c.url)), false, "a missing Adjustment item is not created");

  ACCOUNTS.push(
    {
      Id: "408",
      Name: "Lumper",
      FullyQualifiedName: "Lumper",
      AccountType: "Cost of Goods Sold",
      Classification: "Expense",
      Active: true,
    },
    {
      Id: "430",
      Name: "Detention Income",
      FullyQualifiedName: "Detention Income",
      AccountType: "Income",
      Classification: "Revenue",
      Active: true,
    },
    {
      Id: "431",
      Name: "Detention",
      FullyQualifiedName: "Detention",
      AccountType: "Income",
      Classification: "Revenue",
      Active: true,
    },
    {
      Id: "432",
      Name: "Lumper Income",
      FullyQualifiedName: "Lumper Income",
      AccountType: "Income",
      Classification: "Revenue",
      Active: true,
    },
  );
  ITEMS.push(
    { Id: "105", Name: "Lumper", Type: "Service", IncomeAccountRef: { value: "432", name: "Lumper Income" } },
    { Id: "106", Name: "Trailer Washout", Type: "Service", IncomeAccountRef: { value: "401", name: "Gross Trucking Income" } },
  );
  const detentionItem = ITEMS.find((item) => item.Id === "22");
  assert.ok(detentionItem);
  detentionItem.IncomeAccountRef = { value: "431", name: "Detention" };
  qbo.clearQboCatalogCache();

  function postedInvoice(): Json {
    const invoice = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"));
    assert.ok(invoice, "invoice was posted");
    return invoice.body;
  }

  // Lumper: the Lumper item on an income account. A cost account and a missing item both stop the send.
  const lumperId = delivered("QBOMAP7", 700);
  addPayItem(lumperId, { side: "income", bill_to: "customer", payee: "", category: "lumper", rate: 80, qty: 1, total: 80, notes: "" });
  calls.length = 0;
  const lumperSent = await qbo.sendLoadToQuickbooks(lumperId);
  assert.match(lumperSent.invoiceId, /^\d+$/);
  const lumperInvoice = postedInvoice();
  assert.equal(lumperInvoice.Line[1].SalesItemLineDetail.ItemRef.value, "105");
  assert.equal(lumperInvoice.Line[1].SalesItemLineDetail.ItemRef.name, "Lumper");
  const lumperItem = ITEMS.find((item) => item.Id === "105");
  assert.ok(lumperItem);
  lumperItem.IncomeAccountRef = { value: "408", name: "Lumper" };
  qbo.clearQboCatalogCache();
  const lumperCostId = delivered("QBOMAP7B", 710);
  addPayItem(lumperCostId, { side: "income", bill_to: "customer", payee: "", category: "lumper", rate: 80, qty: 1, total: 80, notes: "" });
  calls.length = 0;
  await assert.rejects(
    () => qbo.sendLoadToQuickbooks(lumperCostId),
    /Billed lumper posts to the Lumper item on an income account/,
  );
  assert.equal(calls.some((c) => c.method === "POST"), false, "lumper on a cost account posts nothing");
  const lumperIndex = ITEMS.findIndex((item) => item.Id === "105");
  const removedLumper = ITEMS.splice(lumperIndex, 1)[0];
  qbo.clearQboCatalogCache();
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(lumperCostId), /QuickBooks has no item named "Lumper"/);
  assert.equal(calls.some((c) => c.method === "POST" && /\/(item|account)(\?|$)/.test(c.url)), false, "a missing Lumper item is not created");
  ITEMS.push({ ...removedLumper, IncomeAccountRef: { value: "432", name: "Lumper Income" } });
  qbo.clearQboCatalogCache();

  // Detention: the Detention item. Production account "Detention" and sandbox account "Detention Income" both post.
  const detentionId = delivered("QBOMAP8", 600);
  addPayItem(detentionId, { side: "income", bill_to: "customer", payee: "", category: "detention", rate: 50, qty: 1, total: 50, notes: "" });
  upsertQboItemMap("detention", "23", "Line Haul");
  calls.length = 0;
  const detentionSent = await qbo.sendLoadToQuickbooks(detentionId);
  assert.match(detentionSent.invoiceId, /^\d+$/);
  const detentionInvoice = postedInvoice();
  assert.equal(detentionInvoice.Line[1].SalesItemLineDetail.ItemRef.value, "22", "a Line Haul map does not retarget detention");
  assert.equal(detentionInvoice.Line[1].SalesItemLineDetail.ItemRef.name, "Detention");
  assert.match(String(detentionInvoice.Line[1].Description), /Detention/);
  detentionItem.IncomeAccountRef = { value: "430", name: "Detention Income" };
  qbo.clearQboCatalogCache();
  const sandboxDetentionId = delivered("QBOMAP8B", 605);
  addPayItem(sandboxDetentionId, { side: "income", bill_to: "customer", payee: "", category: "detention", rate: 40, qty: 1, total: 40, notes: "" });
  calls.length = 0;
  const sandboxDetention = await qbo.sendLoadToQuickbooks(sandboxDetentionId);
  assert.match(sandboxDetention.invoiceId, /^\d+$/);
  assert.equal(postedInvoice().Line[1].SalesItemLineDetail.ItemRef.value, "22", "sandbox account name Detention Income still uses the Detention item");
  process.env.QBO_DETENTION_INCOME_ACCOUNT = "Gross Trucking Income";
  qbo.clearQboCatalogCache();
  const ignoredEnvId = delivered("QBOMAP8D", 608);
  addPayItem(ignoredEnvId, { side: "income", bill_to: "customer", payee: "", category: "detention", rate: 30, qty: 1, total: 30, notes: "" });
  calls.length = 0;
  const ignoredEnv = await qbo.sendLoadToQuickbooks(ignoredEnvId);
  assert.match(ignoredEnv.invoiceId, /^\d+$/);
  assert.equal(postedInvoice().Line[1].SalesItemLineDetail.ItemRef.name, "Detention", "QBO_DETENTION_INCOME_ACCOUNT does not route detention to Line Haul");
  delete process.env.QBO_DETENTION_INCOME_ACCOUNT;
  detentionItem.IncomeAccountRef = { value: "408", name: "Lumper" };
  qbo.clearQboCatalogCache();
  const cogsDetention = delivered("QBOMAP8C", 610);
  addPayItem(cogsDetention, { side: "income", bill_to: "customer", payee: "", category: "detention", rate: 20, qty: 1, total: 20, notes: "" });
  calls.length = 0;
  await assert.rejects(
    () => qbo.sendLoadToQuickbooks(cogsDetention),
    /Detention posts to the Detention item on an income account/,
  );
  assert.equal(calls.some((c) => c.method === "POST"), false, "detention never posts to a non-income account");
  const detentionIndex = ITEMS.findIndex((item) => item.Id === "22");
  const removedDetention = ITEMS.splice(detentionIndex, 1)[0];
  qbo.clearQboCatalogCache();
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(cogsDetention), /QuickBooks has no item named "Detention"/);
  assert.equal(calls.some((c) => c.method === "POST" && /\/(item|account)(\?|$)/.test(c.url)), false, "a missing Detention item is not created");
  ITEMS.push({ ...removedDetention, IncomeAccountRef: { value: "431", name: "Detention" } });
  upsertQboItemMap("detention", "", "");
  qbo.clearQboCatalogCache();

  // Trailer washout posts to Trailer Washout on Gross Trucking Income.
  const washId = delivered("QBOMAP9", 720);
  addPayItem(washId, { side: "income", bill_to: "customer", payee: "", category: "washout", rate: 75, qty: 1, total: 75, notes: "" });
  calls.length = 0;
  const washed = await qbo.sendLoadToQuickbooks(washId);
  assert.match(washed.invoiceId, /^\d+$/);
  const washedInvoice = postedInvoice();
  assert.equal(washedInvoice.Line[1].SalesItemLineDetail.ItemRef.value, "106");
  assert.equal(washedInvoice.Line[1].SalesItemLineDetail.ItemRef.name, "Trailer Washout");
  const washItem = ITEMS.find((item) => item.Id === "106");
  assert.ok(washItem);
  washItem.IncomeAccountRef = { value: "408", name: "Lumper" };
  qbo.clearQboCatalogCache();
  calls.length = 0;
  await assert.rejects(
    () => qbo.sendLoadToQuickbooks(washId, { confirmResend: true }),
    /QuickBooks item "Trailer Washout" is on "Lumper"\. It must be on "Gross Trucking Income"/,
  );
  assert.equal(calls.some((c) => c.method === "POST"), false, "washout on a cost account posts nothing");
  const washIndex = ITEMS.findIndex((item) => item.Id === "106");
  const removedWash = ITEMS.splice(washIndex, 1)[0];
  qbo.clearQboCatalogCache();
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(washId, { confirmResend: true }), /QuickBooks has no item named "Trailer Washout"/);
  assert.equal(calls.some((c) => c.method === "POST" && /\/(item|account)(\?|$)/.test(c.url)), false, "a missing washout item is not created");
  ITEMS.push({ ...removedWash, IncomeAccountRef: { value: "401", name: "Gross Trucking Income" } });
  qbo.clearQboCatalogCache();

  // Layover and TONU stay on Line Haul / Gross Trucking Income.
  const layoverId = delivered("QBOMAP10", 730);
  addPayItem(layoverId, { side: "income", bill_to: "customer", payee: "", category: "layover", rate: 25, qty: 1, total: 25, notes: "" });
  calls.length = 0;
  await qbo.sendLoadToQuickbooks(layoverId);
  const layoverInvoice = postedInvoice();
  assert.equal(layoverInvoice.Line[1].SalesItemLineDetail.ItemRef.value, "23");
  assert.equal(layoverInvoice.Line[1].SalesItemLineDetail.ItemRef.name, "Line Haul");
  assert.match(String(layoverInvoice.Line[1].Description), /Layover/);
  const tonuId = delivered("QBOMAP10B", 740);
  addPayItem(tonuId, { side: "income", bill_to: "customer", payee: "", category: "tonu", rate: 50, qty: 1, total: 50, notes: "" });
  calls.length = 0;
  await qbo.sendLoadToQuickbooks(tonuId);
  const tonuInvoice = postedInvoice();
  assert.equal(tonuInvoice.Line[1].SalesItemLineDetail.ItemRef.value, "23");
  assert.equal(tonuInvoice.Line[1].SalesItemLineDetail.ItemRef.name, "Line Haul");
  assert.match(String(tonuInvoice.Line[1].Description), /TONU/);

  process.env.QBO_INVOICE_SEND_ENABLED = "false";
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(tonuId, { confirmResend: true }), /QuickBooks sending is off/);
  assert.equal(calls.some((c) => c.method === "POST"), false, "the send gate still blocks a mapped invoice");
  process.env.QBO_INVOICE_SEND_ENABLED = "true";
  qbo.clearQboCatalogCache();

  const savedSandboxForClass = process.env.QBO_SANDBOX;
  process.env.QBO_SANDBOX = "false";
  process.env.QBO_CLASS_AUTO_CREATE = "true";
  qbo.clearQboCatalogCache();
  CLASSES.push({ Id: "510", Name: "alex rivera" });
  const alexId = queries.createDriver({
    name: "Alex Rivera",
    phone: "402-555-0101",
    license: "C-1",
    truck_id: null,
    status: "available",
    driver_type: "company",
  });
  const alexLoad = delivered("QBOMAP11", 640);
  db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(alexId, alexLoad);
  calls.length = 0;
  const alexSent = await qbo.sendLoadToQuickbooks(alexLoad);
  assert.match(alexSent.invoiceId, /^\d+$/);
  const alexInvoice = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"))!;
  assert.match(alexInvoice.url, /^https:\/\/quickbooks\.api\.intuit\.com\//);
  assert.equal(alexInvoice.body.ClassRef.value, "510");
  assert.equal(calls.filter((c) => c.method === "POST" && /\/class(\?|$)/.test(c.url)).length, 0, "existing class is reused");
  const jamieId = queries.createDriver({
    name: "Jamie Cole",
    phone: "402-555-0102",
    license: "C-2",
    truck_id: null,
    status: "available",
    driver_type: "company",
  });
  const jamieLoad = delivered("QBOMAP12", 650);
  db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(jamieId, jamieLoad);
  calls.length = 0;
  await qbo.sendLoadToQuickbooks(jamieLoad);
  const createdClasses = calls.filter((c) => c.method === "POST" && /\/class(\?|$)/.test(c.url));
  assert.equal(createdClasses.length, 1, "one class per driver");
  assert.equal(createdClasses[0]?.body?.Name, "Jamie Cole");
  assert.match(String(createdClasses[0]?.url), /^https:\/\/quickbooks\.api\.intuit\.com\//);
  const jamieLower = queries.createDriver({
    name: "jamie cole",
    phone: "402-555-0103",
    license: "C-3",
    truck_id: null,
    status: "available",
    driver_type: "company",
  });
  const lowerLoad = delivered("QBOMAP13", 660);
  db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(jamieLower, lowerLoad);
  const beforeLower = calls.filter((c) => c.method === "POST" && /\/class(\?|$)/.test(c.url)).length;
  const lowerSent = await qbo.sendLoadToQuickbooks(lowerLoad);
  assert.match(lowerSent.invoiceId, /^\d+$/);
  assert.equal(
    calls.filter((c) => c.method === "POST" && /\/class(\?|$)/.test(c.url)).length,
    beforeLower,
    "case-insensitive class name is reused",
  );
  const spacedDriver = queries.createDriver({
    name: "Jamie  Cole",
    phone: "402-555-0104",
    license: "C-4",
    truck_id: null,
    status: "available",
    driver_type: "company",
  });
  const spacedDriverLoad = delivered("QBOMAP14", 670);
  db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(spacedDriver, spacedDriverLoad);
  const beforeSpaced = calls.filter((c) => c.method === "POST" && /\/class(\?|$)/.test(c.url)).length;
  await qbo.sendLoadToQuickbooks(spacedDriverLoad);
  assert.equal(calls.filter((c) => c.method === "POST" && /\/class(\?|$)/.test(c.url)).length, beforeSpaced);
  CLASSES.push({ Id: "601", Name: "Pat Lee" }, { Id: "602", Name: "pat lee" });
  qbo.clearQboCatalogCache();
  const patId = queries.createDriver({
    name: "Pat Lee",
    phone: "402-555-0105",
    license: "C-5",
    truck_id: null,
    status: "available",
    driver_type: "company",
  });
  const patLoad = delivered("QBOMAP15", 680);
  db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(patId, patLoad);
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(patLoad), /More than one QuickBooks class matches "Pat Lee"/);
  assert.equal(calls.some((c) => c.method === "POST"), false);
  delete process.env.QBO_CLASS_AUTO_CREATE;
  qbo.clearQboCatalogCache();
  const noraId = queries.createDriver({
    name: "Nora Quinn",
    phone: "402-555-0106",
    license: "C-6",
    truck_id: null,
    status: "available",
    driver_type: "company",
  });
  const noraLoad = delivered("QBOMAP16", 690);
  db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(noraId, noraLoad);
  calls.length = 0;
  await assert.rejects(() => qbo.sendLoadToQuickbooks(noraLoad), /Class auto-create is off/);
  assert.equal(calls.some((c) => c.method === "POST" && /\/class(\?|$)/.test(c.url)), false);
  process.env.QBO_SANDBOX = savedSandboxForClass;

  // Disconnect revokes the refresh token at Intuit, then deletes the local token file.
  calls.length = 0;
  const disconnected = await qbo.disconnectQuickbooks();
  assert.equal(disconnected.revoked, true);
  const revoke = calls.find((c) => c.url.includes("/tokens/revoke"));
  assert.ok(revoke && revoke.method === "POST", "revoke called");
  assert.equal(fs.existsSync(path.join(tmp, "qbo-refresh.json")), false, "token file removed");
  assert.equal(qbo.hasQuickbooksSession(), false);
  // Intuit production settings link to public /privacy and /terms: signed-out, in effect, MS Express identity only.
  const { config: mwConfig } = await import("../middleware");
  const matcher = new RegExp(`^${mwConfig.matcher[0]}$`);
  for (const open of ["/privacy", "/terms", "/login", "/driver"]) assert.equal(matcher.test(open), false, `${open} is public`);
  for (const closed of ["/settings/quickbooks", "/accounting/quickbooks", "/privacy-admin", "/termsheet", "/"]) {
    assert.equal(matcher.test(closed), true, `${closed} needs sign-in`);
  }
  const shell = fs.readFileSync(path.join(process.cwd(), "components/shell-switch.tsx"), "utf8");
  assert.match(shell, /pathname === "\/privacy"/);
  assert.match(shell, /pathname === "\/terms"/);
  const login = fs.readFileSync(path.join(process.cwd(), "components/login-canvas.tsx"), "utf8");
  assert.match(login, /href="\/privacy"/);
  assert.match(login, /href="\/terms"/);
  const privacy = fs.readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8");
  const terms = fs.readFileSync(path.join(process.cwd(), "app/terms/page.tsx"), "utf8");
  const legal = [privacy, terms, fs.readFileSync(path.join(process.cwd(), "components/legal-document.tsx"), "utf8")].join("\n");
  const privacyIds = [
    "effective-date",
    "who-we-are",
    "quickbooks-data",
    "how-we-use-quickbooks",
    "storage-and-security",
    "no-sale",
    "subprocessors",
    "retention",
    "deletion",
    "disconnect",
    "after-disconnect",
    "children",
    "changes",
    "governing-law",
    "contact",
  ];
  const termsIds = [
    "effective-date",
    "parties",
    "license",
    "license-restrictions",
    "acceptable-use",
    "accounts",
    "third-party",
    "warranties",
    "liability",
    "indemnity",
    "termination",
    "data",
    "law",
    "contact",
  ];
  for (const id of privacyIds) assert.match(privacy, new RegExp(`id: "${id}"`), `privacy heading ${id}`);
  for (const id of termsIds) assert.match(terms, new RegExp(`id: "${id}"`), `terms heading ${id}`);
  assert.match(privacy, /alternates: \{ canonical: PRIVACY_URL \}/);
  assert.match(terms, /alternates: \{ canonical: TERMS_URL \}/);
  assert.doesNotMatch(legal, /data-legal-draft|Not yet in effect|\bDRAFT\b/);
  assert.match(legal, /is not encrypted at rest today/);
  assert.match(legal, /3062879/);
  assert.match(legal, /056299/);
  assert.match(legal, /402-302-0097/);
  assert.match(legal, /State of Nebraska/);
  assert.match(legal, /October 7, 2026/);
  assert.match(legal, /ar@msloads\.com/);
  assert.match(legal, /10 years/);
  assert.match(
    privacy,
    /Encrypted backups are kept for up to 10 years, then deleted, on the same schedule as business records\./,
  );
  assert.match(privacy, /Deletion requests are honored except where records must be retained by law\./);
  assert.doesNotMatch(legal, /JC to confirm|longer backup archive|backups are copies of those same records/);
  assert.match(legal, /us-east-1/);
  assert.doesNotMatch(legal, /M&S Loads LLC|M & S Loads|MC-970613|970613|jc@msloads\.com|Nanuet/i);
  console.log("qbo-mapping-test: ok");
}

main().then(() => fs.rmSync(tmp, { recursive: true, force: true })).catch((error) => {
  console.error(error);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});
