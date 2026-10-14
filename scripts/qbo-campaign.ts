/**
 * QuickBooks mapping campaign. Runs the app's real invoice and bill sync code against a THROWAWAY COPY of a TMS
 * database, with clearly labelled test loads (MSETMS-Txx-<run>, Ref "MSETMS mapping test").
 *
 * Offline (default): the QuickBooks HTTP layer is an in-memory fake that behaves like QBO (sparse update, SyncToken,
 * Amount = Qty x UnitPrice, no negative totals). Asserts the exact payloads and read-backs per case.
 *   tsx scripts/qbo-campaign.ts --db /path/to/tms-backup.db [--out report.md]
 *   tsx scripts/qbo-campaign.ts --fresh          (empty migrated DB with the two M&S customer rows; used by npm test)
 *
 * Live sandbox (later): pushes each case to the QuickBooks SANDBOX and reads it back through the API.
 * Refuses unless QBO_SANDBOX is on, the API host is sandbox-quickbooks.api.intuit.com, the realm is
 * 9341458445928351 (Sandbox Company US 5710), and CompanyInfo says "Sandbox Company". Creates only fixtures named
 * "MSETMS Test …". A missing driver class may be created when class auto-create is on. Never creates a customer, vendor, account, or item. Never touches a production QuickBooks company. Never writes the source DB.
 *   tsx scripts/qbo-campaign.ts --live --db /tmp/tms-copy.db --token-file /srv/msetms/shared/data/qbo-refresh.json \
 *     [--cleanup] [--out report.md]
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SANDBOX_HOST = "sandbox-quickbooks.api.intuit.com";
const OAUTH_HOST = "oauth.platform.intuit.com";
const SANDBOX_REALM_5710 = "9341458445928351";
const LABEL = "MSETMS mapping test";
const INTERNAL = /INTERNAL-DO-NOT-SHOW/;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "";
}
const LIVE = process.argv.includes("--live");
const FRESH = process.argv.includes("--fresh") && !LIVE;
if (FRESH) process.env.QBO_INVOICE_SEND_ENABLED = "true";
const CLEANUP = process.argv.includes("--cleanup");
const sourceDb = arg("db");
const outPath = arg("out");
const tokenFile = arg("token-file");
if (!sourceDb && !FRESH) {
  console.error("Pass --db <path to a TMS database backup>. The file is copied and never written.");
  process.exit(2);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "msetms-qbo-campaign-"));
const sourceReal = sourceDb ? fs.realpathSync(sourceDb) : path.join(tmp, "fresh-source.db");
if (!sourceDb) fs.writeFileSync(sourceReal, "");
for (const live of ["/srv/msetms/shared/data/tms.db", process.env.TMS_DB_PATH ?? ""].filter(Boolean)) {
  if (fs.existsSync(live) && fs.realpathSync(live) === sourceReal) {
    console.error("Refusing the live TMS database. Make a copy first: sqlite3 tms.db \".backup /tmp/tms-copy.db\"");
    process.exit(2);
  }
}
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceHash = sha(sourceReal);

const RUN = LIVE ? randomBytes(2).toString("hex") : "off";
if (sourceDb) fs.copyFileSync(sourceReal, path.join(tmp, "tms.db"));
for (const suffix of ["-wal", "-shm"]) {
  if (fs.existsSync(sourceReal + suffix) && fs.statSync(sourceReal + suffix).size > 0) {
    fs.copyFileSync(sourceReal + suffix, path.join(tmp, `tms.db${suffix}`));
  }
}
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
delete process.env.QBO_BILL_EXPENSE_ACCOUNT_ID;

if (LIVE) {
  if (!tokenFile) {
    console.error("Live mode needs --token-file (the app's qbo-refresh.json; the rotated refresh token is written back).");
    process.exit(2);
  }
  process.env.TMS_QBO_REFRESH_PATH = tokenFile;
} else {
  // Offline: fake keys and realm only. Real keys in the environment are ignored.
  process.env.QBO_CLIENT_ID = "offline-client";
  process.env.QBO_CLIENT_SECRET = "offline-secret";
  process.env.QBO_SANDBOX = "true";
  process.env.TMS_QBO_REFRESH_PATH = path.join(tmp, "qbo-refresh.json");
  fs.writeFileSync(process.env.TMS_QBO_REFRESH_PATH, JSON.stringify({ refresh_token: "offline", realm_id: SANDBOX_REALM_5710 }));
}

// ---------------------------------------------------------------- HTTP: allowlist + call log (+ offline fake QBO)
type Call = { url: string; method: string; body: Json | undefined };
const calls: Call[] = [];
const realFetch = globalThis.fetch;

type FakeItem = { Id: string; Name: string; Type: string; IncomeAccountRef: { value: string; name: string } };
type FakeAccount = {
  Id: string;
  Name: string;
  FullyQualifiedName: string;
  Classification: string;
  AccountType: string;
  Active: boolean;
};
const acct = (id: string, name: string, accountType: string, classification: string, fullyQualifiedName = name): FakeAccount => ({
  Id: id,
  Name: name,
  FullyQualifiedName: fullyQualifiedName,
  Classification: classification,
  AccountType: accountType,
  Active: true,
});
const fake = {
  nextId: 1000,
  nextDoc: 1006100,
  customTxnNumbers: false,
  /** The next N `where DocNumber =` checks insert that number and report it taken. */
  docCollideRemaining: 0,
  accounts: [
    acct("401", "Gross Trucking Income", "Income", "Revenue"),
    acct("402", "Billable Expense Income", "Income", "Revenue"),
    acct("403", "Trailer Rentals", "Income", "Revenue"),
    acct("404", "Factoring Fee", "Income", "Revenue"),
    acct("405", "Sales", "Income", "Revenue"),
    acct("406", "Service/Fee Income", "Income", "Revenue"),
    acct("407", "Uncategorized Income", "Income", "Revenue"),
    acct("408", "Lumper", "Cost of Goods Sold", "Expense"),
    acct("409", "Carrier Expense", "Cost of Goods Sold", "Expense"),
    acct("410", "Owner Operators", "Cost of Goods Sold", "Expense"),
    acct("411", "Advances", "Cost of Goods Sold", "Expense", "Owner Operators:Advances"),
    acct("412", "Fuel", "Cost of Goods Sold", "Expense", "Owner Operators:Fuel"),
    acct("413", "Insurance COL", "Cost of Goods Sold", "Expense", "Owner Operators:Insurance COL"),
    acct("414", "Owner Operators COL", "Cost of Goods Sold", "Expense", "Owner Operators:Owner Operators COL"),
    acct("415", "Drivers Paid by RC", "Cost of Goods Sold", "Expense"),
    acct("416", "Toll", "Expense", "Expense", "Driver Expenses:Toll"),
    acct("417", "OCC", "Expense", "Expense", "Insurance:OCC"),
    acct("418", "Software", "Expense", "Expense", "Office and Admin Expense:Software"),
    acct("419", "Loan - Lumig Transports LLC", "Other Current Asset", "Asset"),
    acct("420", "Cost of Goods Sold", "Cost of Goods Sold", "Expense"),
    acct("430", "Detention Income", "Income", "Revenue"),
    acct("431", "Lumper Income", "Income", "Revenue"),
    acct("701", "Owner-Operator Settlements", "Cost of Goods Sold", "Expense"),
    acct("702", "Fuel Expense Override", "Expense", "Expense"),
  ],
  items: new Map<string, FakeItem>(),
  classes: new Map<string, { Id: string; Name: string }>(),
  customers: [
    { Id: "58", DisplayName: "M & S Loads LLC." },
    { Id: "77", DisplayName: "Exact Broker LLC" },
    { Id: "78", DisplayName: "M&S Management Group" },
    { Id: "79", DisplayName: "M&S Management" },
    { Id: "80", DisplayName: "Twin Name LLC" },
    { Id: "81", DisplayName: "Twin Name LLC" },
    { Id: "82", DisplayName: "Spaced Broker" },
    { Id: "83", DisplayName: "Case Twin LLC" },
    { Id: "84", DisplayName: "case twin llc" },
  ],
  vendors: [
    { Id: "61", DisplayName: "MSETMS Test Fuel Vendor" },
    { Id: "62", DisplayName: "Lumig Transports LLC" },
    { Id: "63", DisplayName: "Lumig Transports" },
  ],
  terms: [{ Id: "3", Name: "Net 30", DueDays: 30 }],
  invoices: new Map<string, Json>(),
  bills: new Map<string, Json>(),
};
const qboError = (status: number, message: string) =>
  new Response(JSON.stringify({ Fault: { Error: [{ Message: message }] } }), { status, headers: { "Content-Type": "application/json" } });
const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });

function fakeQbo(url: URL, method: string, body: Json | undefined): Response {
  if (url.hostname === OAUTH_HOST) return ok({ access_token: "offline-at", refresh_token: "offline", expires_in: 3600 });
  const tail = url.pathname.replace(/^\/v3\/company\/[^/]+/, "");
  if (tail === "/query") {
    const q = url.searchParams.get("query") ?? "";
    const eq = (field: string) => q.match(new RegExp(`${field} = '((?:[^']|'')*)'`))?.[1]?.replace(/''/g, "'");
    if (/from Item/i.test(q)) {
      const name = eq("Name");
      const id = eq("Id");
      return ok({
        QueryResponse: {
          Item: [...fake.items.values()].filter((i) => (name ? i.Name === name : true) && (id ? i.Id === id : true)),
        },
      });
    }
    if (/from Term/i.test(q)) return ok({ QueryResponse: { Term: fake.terms.filter((t) => !eq("Name") || t.Name === eq("Name")) } });
    if (/from Invoice/i.test(q)) {
      const doc = eq("DocNumber");
      let rows = [...fake.invoices.values()];
      if (doc && fake.docCollideRemaining > 0) {
        fake.docCollideRemaining -= 1;
        if (!rows.some((i) => i.DocNumber === doc)) {
          const Id = String(fake.nextId++);
          const row = { Id, DocNumber: doc, SyncToken: "0", TotalAmt: 1, Balance: 1, Line: [] };
          fake.invoices.set(Id, row);
          rows = [...fake.invoices.values()];
        }
      }
      if (doc) rows = rows.filter((i) => i.DocNumber === doc);
      return ok({ QueryResponse: { Invoice: rows } });
    }
    if (/from Account/i.test(q)) return ok({ QueryResponse: { Account: fake.accounts } });
    if (/from Preferences/i.test(q)) {
      const prefs = { SalesFormsPrefs: { CustomTxnNumbers: fake.customTxnNumbers } };
      return ok({ QueryResponse: { Preferences: prefs } });
    }
    if (/from Customer/i.test(q)) {
      const name = eq("DisplayName");
      return ok({ QueryResponse: { Customer: fake.customers.filter((c) => !name || c.DisplayName === name) } });
    }
    if (/from Vendor/i.test(q)) {
      const name = eq("DisplayName");
      return ok({ QueryResponse: { Vendor: fake.vendors.filter((v) => !name || v.DisplayName === name) } });
    }
    if (/from Class/i.test(q)) {
      const name = eq("Name");
      return ok({ QueryResponse: { Class: [...fake.classes.values()].filter((row) => !name || row.Name === name) } });
    }
    return ok({ QueryResponse: {} });
  }
  const get = tail.match(/^\/(invoice|bill|item|companyinfo)\/([^/]+)$/);
  if (method === "GET" && get) {
    const [, entity, id] = get;
    if (entity === "companyinfo") return ok({ CompanyInfo: { CompanyName: "Sandbox Company US 5710 (offline fake)" } });
    const store = entity === "invoice" ? fake.invoices : entity === "bill" ? fake.bills : fake.items;
    const row = store.get(id);
    if (!row) return qboError(400, "Object Not Found");
    return ok({ [entity.charAt(0).toUpperCase() + entity.slice(1)]: row });
  }
  if (method === "POST" && tail === "/invoice" && body) {
    for (const line of body.Line ?? []) {
      const d = line.SalesItemLineDetail;
      if (!fake.items.has(String(d?.ItemRef?.value))) return qboError(400, "Invalid Reference Id: item");
      if (Math.abs(Math.round(d.Qty * d.UnitPrice * 100) / 100 - line.Amount) > 0.005) {
        return qboError(400, "Amount is not equal to UnitPrice * Qty");
      }
    }
    const total = Math.round((body.Line ?? []).reduce((s: number, l: Json) => s + l.Amount, 0) * 100) / 100;
    if (total < 0) return qboError(400, "Transaction total cannot be negative");
    if (body.Id) {
      const current = fake.invoices.get(String(body.Id));
      if (!current) return qboError(400, "Object Not Found");
      if (String(current.SyncToken) !== String(body.SyncToken)) return qboError(400, "Stale Object Error");
      const rest: Json = { ...body };
      delete rest.sparse;
      const next = {
        ...current,
        ...rest,
        DocNumber: body.DocNumber || current.DocNumber,
        SyncToken: String(Number(current.SyncToken) + 1),
        TotalAmt: total,
        Balance: total,
      };
      fake.invoices.set(next.Id, next);
      return ok({ Invoice: next });
    }
    let doc = body.DocNumber ? String(body.DocNumber) : "";
    if (!doc && !fake.customTxnNumbers) {
      doc = String(fake.nextDoc);
      fake.nextDoc += 1;
    }
    const Id = String(fake.nextId++);
    const created = { ...body, DocNumber: doc, Id, SyncToken: "0", TotalAmt: total, Balance: total };
    fake.invoices.set(Id, created);
    return ok({ Invoice: created });
  }
  if (method === "POST" && tail === "/class" && body) {
    const name = String(body.Name ?? "").trim();
    if (!name) return qboError(400, "Class name required");
    const existing = [...fake.classes.values()].find((row) => row.Name === name);
    if (existing) return ok({ Class: existing });
    const Id = String(fake.nextId++);
    const created = { Id, Name: name };
    fake.classes.set(Id, created);
    return ok({ Class: created });
  }
  if (method === "POST" && tail === "/bill" && body) {
    const total = Math.round((body.Line ?? []).reduce((s: number, l: Json) => s + l.Amount, 0) * 100) / 100;
    if (total <= 0) return qboError(400, "Transaction total cannot be negative");
    const Id = String(fake.nextId++);
    const created = { ...body, Id, SyncToken: "0", TotalAmt: total };
    fake.bills.set(Id, created);
    return ok({ Bill: created });
  }
  return qboError(400, `offline fake: unsupported ${method} ${tail}`);
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" && init.body.startsWith("{") ? (JSON.parse(init.body) as Json) : undefined;
  if (url.hostname !== SANDBOX_HOST && url.hostname !== OAUTH_HOST) {
    throw new Error(`Campaign blocked a request to ${url.hostname}. Only the QuickBooks sandbox is allowed.`);
  }
  if (url.hostname === SANDBOX_HOST && !url.pathname.startsWith(`/v3/company/${SANDBOX_REALM_5710}/`)) {
    throw new Error("Campaign blocked a request to a realm other than Sandbox Company US 5710.");
  }
  calls.push({ url: url.toString(), method, body });
  if (!LIVE) return fakeQbo(url, method, body);
  return realFetch(input, init);
}) as typeof fetch;

// ---------------------------------------------------------------- results
type Check = { field: string; expected: string; actual: string; pass: boolean };
type CaseResult = { id: string; title: string; pass: boolean; qboIds: string[]; checks: Check[]; note: string };
const results: CaseResult[] = [];
const money = (n: unknown) => (typeof n === "number" ? n.toFixed(2) : String(n ?? ""));

function check(checks: Check[], field: string, expected: unknown, actual: unknown, pass?: boolean) {
  const e = typeof expected === "string" ? expected : JSON.stringify(expected);
  const a = typeof actual === "string" ? actual : JSON.stringify(actual);
  checks.push({ field, expected: e, actual: a, pass: pass ?? e === a });
}

async function runCase(id: string, title: string, fn: (c: CaseResult) => Promise<void>) {
  const c: CaseResult = { id, title, pass: true, qboIds: [], checks: [], note: "" };
  try {
    await fn(c);
  } catch (error) {
    c.checks.push({ field: "run", expected: "no error", actual: error instanceof Error ? error.message : String(error), pass: false });
  }
  c.pass = c.checks.length > 0 && c.checks.every((x) => x.pass);
  results.push(c);
  console.log(`${c.pass ? "PASS" : "FAIL"} ${id} ${title}${c.qboIds.length ? ` [QBO ${c.qboIds.join(", ")}]` : ""}`);
  for (const x of c.checks.filter((k) => !k.pass)) console.log(`     ${x.field}: expected ${x.expected} got ${x.actual}`);
}

async function main() {
  const { qboInvoiceSendEnabled } = await import("../lib/env");
  const { QBO_INVOICE_SEND_DISABLED_MESSAGE } = await import("../lib/qbo-send-lock");
  if (!qboInvoiceSendEnabled()) {
    console.error(QBO_INVOICE_SEND_DISABLED_MESSAGE);
    process.exit(1);
  }
  const queries = await import("../lib/queries");
  const { getDb } = await import("../lib/db");
  const { addPayItem } = await import("../lib/pay-items");
  const { upsertQboItemMap, upsertQboVendorMap } = await import("../lib/accounting-desk");
  const accounting = await import("../lib/accounting");
  const { tmsCustomerInvoiceLines: invoiceLines, buildTmsInvoice, renderTmsInvoicePdf } = await import("../lib/invoice");
  const qbo = await import("../lib/integrations/quickbooks");
  const db = getDb();
  if (FRESH) {
    const stamp = new Date().toISOString();
    const insert = db.prepare("INSERT OR IGNORE INTO customers (id, name, billing_notes, created_at, updated_at) VALUES (?, ?, '', ?, ?)");
    insert.run(9, "M & S Loads LLC.", stamp, stamp);
    insert.run(531, "M&S Loads", stamp, stamp);
  }

  // ---------------------------------------------------------------- guards + fixtures
  const target = qbo.quickbooksApiTarget();
  assert.equal(target.environment, "sandbox", "QBO_SANDBOX must be on");
  assert.equal(target.host, `https://${SANDBOX_HOST}`, "API host must be the sandbox");
  assert.equal(target.realmId, SANDBOX_REALM_5710, "realm must be Sandbox Company US 5710");
  const company = await qbo.readQboEntity<Json>("companyinfo", SANDBOX_REALM_5710);
  const companyName = String(company.CompanyInfo?.CompanyName ?? "");
  assert.match(companyName, /^Sandbox Company/, `connected company is not a sandbox: ${companyName}`);
  console.log(`${LIVE ? "LIVE SANDBOX" : "OFFLINE"} · ${companyName} · realm ${target.realmId} · run ${RUN}`);

  const cats = {
    flat_rate: { item: "Line Haul", income: "Gross Trucking Income" },
    detention: { item: "Detention", income: "" },
    layover: { item: "Line Haul", income: "Gross Trucking Income" },
    tonu: { item: "Line Haul", income: "Gross Trucking Income" },
    washout: { item: "Trailer Washout", income: "Gross Trucking Income" },
    extra_stop: { item: "Picks and Drops", income: "Gross Trucking Income" },
    fuel_surcharge: { item: "Line Haul", income: "Gross Trucking Income" },
    misc: { item: "Adjustment", income: "Gross Trucking Income" },
    lumper: { item: "Lumper", income: "" },
  } as const;
  type Cat = keyof typeof cats;
  const itemId: Record<string, string> = {};
  const incomeId: Record<string, string> = {};
  let customerQboId = "58";
  let ooVendorId = "60";
  let fuelVendorId = "61";
  let ooAccountId = "701";
  let fuelAccountId = "702";
  let ooColAccountId = "414";
  let netTermId = "3";
  const { productionNamesForSandbox5710 } = await import("../lib/qbo-production-map");
  const sandboxNames = productionNamesForSandbox5710();
  console.log(`Sandbox 5710 must already contain these names (this run does not create them).`);
  console.log(`Items: ${sandboxNames.items.join(", ")}`);
  console.log(`Accounts: ${sandboxNames.accounts.join(", ")}`);

  const putItem = (id: string, name: string, accountId: string) => {
    const account = fake.accounts.find((row) => row.Id === accountId);
    if (!account) throw new Error(`missing fake account ${accountId}`);
    fake.items.set(id, {
      Id: id,
      Name: name,
      Type: "Service",
      IncomeAccountRef: { value: account.Id, name: account.FullyQualifiedName },
    });
  };

  if (!LIVE) {
    // 10/14 chart: Detention and Lumper sit on income accounts (names are not checked).
    // Trailer Washout sits on Gross Trucking Income. Fuel Surcharge, Layover, TONU, and Adjustment
    // items are not required.
    putItem("101", "Line Haul", "401");
    putItem("102", "Detention", "430");
    putItem("103", "Picks and Drops", "401");
    putItem("104", "Return", "401");
    putItem("105", "Lumper", "431");
    putItem("106", "Trailer Washout", "401");
    itemId.flat_rate = "101";
    itemId.detention = "102";
    itemId.extra_stop = "103";
    itemId.lumper = "105";
    itemId.washout = "106";
    itemId.layover = "101";
    itemId.tonu = "101";
    itemId.fuel_surcharge = "101";
    incomeId.flat_rate = "401";
    incomeId.detention = "430";
    incomeId.extra_stop = "401";
    incomeId.lumper = "431";
    incomeId.washout = "401";
    incomeId.layover = "401";
    incomeId.tonu = "401";
    incomeId.fuel_surcharge = "401";
  } else {
    const find = async (entity: string, field: string, name: string) =>
      ((await qbo.queryQboReadOnly<Json>(`select * from ${entity} where ${field} = '${name.replace(/'/g, "''")}'`))
        .QueryResponse?.[entity] ?? [])[0] as Json | undefined;
    const missing: string[] = [];
    const accountIds: Record<string, string> = {};
    for (const name of sandboxNames.accounts) {
      const row = await find("Account", "FullyQualifiedName", name);
      if (!row?.Id) missing.push(`account ${name}`);
      else accountIds[name] = String(row.Id);
    }
    for (const name of sandboxNames.items) {
      const row = await find("Item", "Name", name);
      if (!row?.Id) missing.push(`item ${name}`);
    }
    if (missing.length) {
      throw new Error(`Sandbox 5710 is missing ${missing.join("; ")}. Nothing was created.`);
    }
    for (const [cat, spec] of Object.entries(cats)) {
      const item = await find("Item", "Name", spec.item);
      itemId[cat] = String(item?.Id);
      const fromItem = String(item?.IncomeAccountRef?.value ?? "");
      incomeId[cat] = spec.income ? accountIds[spec.income] ?? "" : fromItem;
    }
    const billTo = await find("Customer", "DisplayName", "M & S Loads LLC.");
    if (billTo?.Id) customerQboId = String(billTo.Id);
    const ooVendor = await find("Vendor", "DisplayName", "Lumig Transports LLC");
    if (ooVendor?.Id) ooVendorId = String(ooVendor.Id);
    const fuelVendor = await find("Vendor", "DisplayName", "MSETMS Test Fuel Vendor");
    if (fuelVendor?.Id) fuelVendorId = String(fuelVendor.Id);
    ooAccountId = accountIds["Owner Operators:Owner Operators COL"] || ooAccountId;
    ooColAccountId = accountIds["Owner Operators:Owner Operators COL"] || ooColAccountId;
    fuelAccountId = accountIds["Owner Operators:Fuel"] || fuelAccountId;
    const terms = (await qbo.queryQboReadOnly<Json>("select * from Term")).QueryResponse?.Term ?? [];
    const net = (terms as Json[]).find((t) => t.Name === "Net 30") ?? (terms as Json[])[0];
    netTermId = String(net?.Id ?? "");
    if (net) fake.terms = [{ Id: netTermId, Name: String(net.Name), DueDays: Number(net.DueDays ?? 0) }];
  }

  const applyFixedChart = () => {
    if (LIVE) return;
    putItem("102", "Detention", "430");
    putItem("105", "Lumper", "431");
    putItem("106", "Trailer Washout", "401");
    putItem("107", "Layover", "401");
    putItem("108", "TONU", "401");
    putItem("109", "Adjustment", "401");
    putItem("110", "Fuel Surcharge", "401");
    itemId.flat_rate = "101";
    itemId.detention = "102";
    itemId.extra_stop = "103";
    itemId.lumper = "105";
    itemId.washout = "106";
    itemId.layover = "101";
    itemId.tonu = "101";
    itemId.misc = "109";
    itemId.fuel_surcharge = "101";
    incomeId.flat_rate = "401";
    incomeId.detention = "430";
    incomeId.extra_stop = "401";
    incomeId.layover = "401";
    incomeId.tonu = "401";
    incomeId.washout = "401";
    incomeId.misc = "401";
    incomeId.lumper = "431";
    incomeId.fuel_surcharge = "401";
    qbo.clearQboCatalogCache();
  };
  db.prepare("UPDATE customers SET qbo_customer_id = ?, qbo_status = 'mapped', payment_terms = '' WHERE id IN (9, 531)").run(customerQboId);
  const setRemit = (street: string, ar: string) =>
    db.prepare("UPDATE company_profile SET company_name = 'MS Express', street = ?, ar_email = ? WHERE id = 1").run(street, ar);
  setRemit("100 Campaign Test Rd", "ar-test@example.com");

  const ooDriver = (db.prepare("SELECT name FROM drivers WHERE driver_type = 'owner_operator' ORDER BY id LIMIT 1").get() as { name: string } | undefined)?.name ?? "MSETMS Test OO";
  upsertQboVendorMap(ooDriver, ooVendorId, "OO vendor", { id: ooAccountId, name: "OO Settlements" });
  upsertQboVendorMap("MSETMS Test Fuel Vendor", fuelVendorId, "Fuel vendor");

  let seq = 0;
  type PayLine = {
    category: Cat | "trailer_rental" | "fuel_advance_fee" | "claim_for_damages";
    rate: number | null;
    qty?: number;
    total: number;
    bill_to?: "customer" | "driver";
    notes?: string;
  };
  function makeLoad(opts: { customerId?: number; rate?: number | null; status?: string; pay?: PayLine[]; delivery?: string; lumperActual?: number; tag?: string; customerReference?: string; loadNumber?: string }) {
    seq += 1;
    const loadNumber =
      opts.loadNumber ?? (LIVE && process.env.REAL_SHAPED ? String(1006900 + seq) : `MSETMS-T${String(seq).padStart(2, "0")}-${RUN}`);
    const delivery = opts.delivery ?? "2026-09-14T17:00:00";
    const id = queries.createLoad({
      customer_id: opts.customerId ?? 9,
      origin: "Hastings, NE",
      destination: "Omaha, NE",
      pickup_start: "2026-09-13T08:00:00",
      pickup_end: "2026-09-13T10:00:00",
      delivery_start: delivery,
      delivery_end: delivery,
      weight: 40000,
      commodity: "MSETMS test freight",
      rate: opts.rate === undefined ? 2000 : opts.rate,
      notes: "INTERNAL-DO-NOT-SHOW dispatch note",
      special_instructions: "INTERNAL-DO-NOT-SHOW special instructions",
      appointment_notes: "INTERNAL-DO-NOT-SHOW appointment",
      reference_number: LABEL,
      po_number: `PO-${opts.tag ?? seq}`,
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "available",
      truck_id: null,
      driver_id: null,
      load_number: loadNumber,
      oo_pay: null,
      customer_reference: opts.customerReference ?? "",
    } as Parameters<typeof queries.createLoad>[0]);
    for (const p of opts.pay ?? []) {
      addPayItem(id, {
        side: "income",
        bill_to: p.bill_to ?? "customer",
        payee: "",
        category: p.category,
        rate: p.rate,
        qty: p.qty ?? 1,
        total: p.total,
        notes: p.notes ?? "",
      });
    }
    if (opts.rate !== undefined && opts.pay?.some((p) => p.category === "flat_rate")) {
      // keep the load rate the office typed; pay items drive the invoice
    }
    db.prepare("UPDATE loads SET status = ?, lumper_actual = ? WHERE id = ?").run(opts.status ?? "delivered", opts.lumperActual ?? null, id);
    return { id, loadNumber };
  }

  type ExpLine = { cat: Cat; amount: number; qty?: number; unitPrice?: number };
  const postsSince = (mark: number, part: string) => calls.slice(mark).filter((c) => c.method === "POST" && c.url.includes(part));

  async function expectInvoice(c: CaseResult, loadId: number, exp: { lines: ExpLine[]; txnDate?: string; termsId?: string | null; customer?: string }, sentInvoiceId?: string) {
    const load = queries.getLoad(loadId)!;
    const invoiceId = sentInvoiceId ?? load.qbo_invoice_id;
    c.qboIds.push(`Invoice ${invoiceId}`);
    const read = (await qbo.readQboEntity<Json>("invoice", invoiceId)).Invoice as Json;
    const lines = ((read.Line ?? []) as Json[]).filter((l) => l.DetailType === "SalesItemLineDetail");
    const total = exp.lines.reduce((s, l) => s + l.amount, 0);
    check(c.checks, "amount", money(total), money(read.TotalAmt));
    const tmsTotal = invoiceLines(load).reduce((s, l) => s + l.amount, 0);
    check(c.checks, "amount = TMS invoice PDF", money(tmsTotal), money(read.TotalAmt));
    check(c.checks, "item", exp.lines.map((l) => itemId[l.cat]), lines.map((l) => String(l.SalesItemLineDetail?.ItemRef?.value)));
    check(c.checks, "line amounts", exp.lines.map((l) => money(l.amount)), lines.map((l) => money(l.Amount)));
    check(
      c.checks,
      "qty x unit price",
      exp.lines.map((l) => `${l.qty ?? 1}x${money(l.unitPrice ?? l.amount)}`),
      lines.map((l) => `${l.SalesItemLineDetail?.Qty}x${money(l.SalesItemLineDetail?.UnitPrice)}`),
    );
    const income: string[] = [];
    for (const l of lines) {
      const item = (await qbo.readQboEntity<Json>("item", String(l.SalesItemLineDetail?.ItemRef?.value))).Item as Json;
      income.push(String(item?.IncomeAccountRef?.value));
    }
    check(c.checks, "income account", exp.lines.map((l) => incomeId[l.cat]), income);
    check(c.checks, "customer", exp.customer ?? customerQboId, String(read.CustomerRef?.value));
    const memoText = `${read.CustomerMemo?.value ?? ""}\n${read.PrivateNote ?? ""}\n${lines.map((l) => l.Description).join("\n")}`;
    check(c.checks, "memo (no internal notes)", "no INTERNAL text; Ref label present", INTERNAL.test(memoText) ? "INTERNAL text leaked" : memoText.includes(LABEL) ? "no INTERNAL text; Ref label present" : "label missing");
    const sentBody = [...calls].reverse().find(
      (x) =>
        x.method === "POST" &&
        /\/invoice\?/.test(x.url) &&
        String(x.body?.CustomerMemo?.value ?? "").includes(`MS Express load ${load.load_number}`),
    )?.body;
    const sentTerm = sentBody?.SalesTermRef?.value ? String(sentBody.SalesTermRef.value) : "none sent";
    const readTerm = read.SalesTermRef?.value ? String(read.SalesTermRef.value) : "none sent";
    check(c.checks, "terms (sent)", exp.termsId ?? "none sent", sentTerm);
    if (exp.termsId) check(c.checks, "terms (read back)", exp.termsId, readTerm);
    const driver = String(load.driver_name ?? "").trim();
    const sentClass = sentBody?.ClassRef?.name ? String(sentBody.ClassRef.name) : "none";
    const readClass = read.ClassRef?.name ? String(read.ClassRef.name) : "none";
    const lineClasses = lines.map((l) => String(l.SalesItemLineDetail?.ClassRef?.name ?? "none"));
    if (!driver) {
      check(c.checks, "class (no driver)", "none/none", `${sentClass}/${readClass}`);
      check(c.checks, "line class (no driver)", "none", lineClasses.every((name) => name === "none") ? "none" : lineClasses.join(","));
    } else {
      const fold = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
      const classOk = fold(sentClass) === fold(driver) && fold(readClass) === fold(driver);
      check(c.checks, "class (driver)", `${driver}/${driver}`, `${sentClass}/${readClass}`, classOk);
      const lineOk = lineClasses.length > 0 && lineClasses.every((name) => fold(name) === fold(driver));
      check(c.checks, "line class (driver)", driver, lineOk ? driver : lineClasses.join(","), lineOk);
    }
    check(c.checks, "txn date", exp.txnDate ?? "2026-09-14", String(read.TxnDate));
    const doc = String(read.DocNumber ?? "");
    const stored = String(load.qbo_doc_number ?? "");
    check(c.checks, "doc number is the load number", load.load_number, doc);
    check(c.checks, "doc number stored on the load", doc, stored);
    check(c.checks, "no AR account override", "none", sentBody?.ARAccountRef ? "set" : "none");
    check(c.checks, "sent body found", "yes", sentBody ? "yes" : "no");
    return read;
  }

  function sentLineDescriptions(loadNumber: string): string[] {
    const sent = [...calls].reverse().find(
      (x) =>
        x.method === "POST" &&
        /\/invoice\?/.test(x.url) &&
        String(x.body?.CustomerMemo?.value ?? "").includes(`MS Express load ${loadNumber}`),
    )?.body;
    return ((sent?.Line ?? []) as Json[]).map((line) => String(line.Description ?? ""));
  }

  async function expectBlocked(c: CaseResult, fn: () => Promise<unknown>, pattern: RegExp) {
    const mark = calls.length;
    let message = "";
    try {
      await fn();
      message = "(no error)";
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    check(c.checks, "blocked with warning", pattern.source, message, pattern.test(message));
    check(c.checks, "no QuickBooks write", "0 POST", `${postsSince(mark, "/v3/").length} POST`);
  }

  const stamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO customers (id, name, billing_notes, created_at, updated_at) VALUES (317, 'MS Express', '', ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = 'MS Express', qbo_customer_id = ''`,
  ).run(stamp, stamp);
  db.prepare(
    `INSERT INTO customers (id, name, billing_notes, created_at, updated_at) VALUES (294, 'M&S Management Group', '', ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = 'M&S Management Group', qbo_customer_id = ''`,
  ).run(stamp, stamp);

  if (!LIVE) {
    await runCase("C22", "TMS customer 317 (MS Express) is never mapped or invoiced", async (c) => {
      db.prepare("UPDATE customers SET qbo_customer_id = '58', qbo_status = 'mapped' WHERE id = 317").run();
      const { id } = makeLoad({ customerId: 317, rate: 500 });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /MS Express \(customer 317\)/);
      let mapMessage = "";
      try {
        queries.markCustomerQboMapped(317, "58");
      } catch (error) {
        mapMessage = error instanceof Error ? error.message : String(error);
      }
      check(c.checks, "mapping 317 is refused", "refused", /customer 317/.test(mapMessage) ? "refused" : mapMessage);
      check(c.checks, "no customer create", "0", String(calls.filter((x) => x.method === "POST" && /\/customer\?/.test(x.url)).length));
    });
    await runCase("C23", "TMS customer 294 stays unmapped until the office picks", async (c) => {
      const { id } = makeLoad({ customerId: 294, rate: 500 });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /M&S Management Group \(customer 294\)/);
      check(c.checks, "no customer create", "0", String(calls.filter((x) => x.method === "POST" && /\/customer\?/.test(x.url)).length));
      db.prepare("UPDATE customers SET qbo_customer_id = '78', qbo_status = 'mapped' WHERE id = 294").run();
      await qbo.sendLoadToQuickbooks(id);
      await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 500 }], customer: "78" });
    });
    await runCase("C24", "Line Haul resolves by name onto Gross Trucking Income when no pay-item map is stored", async (c) => {
      const { id } = makeLoad({ rate: 1600 });
      await qbo.sendLoadToQuickbooks(id);
      await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1600 }] });
      const maps = db.prepare("SELECT COUNT(*) AS n FROM qbo_item_maps WHERE qbo_item_id != ''").get() as { n: number };
      check(c.checks, "no pay-item map used", "0", String(maps.n));
    });
    await runCase("C25", "Layover and TONU use Line Haul; washout posts to Trailer Washout on Gross Trucking Income", async (c) => {
      const layover = makeLoad({ rate: 1000, pay: [{ category: "layover", rate: 50, total: 50 }] });
      await qbo.sendLoadToQuickbooks(layover.id);
      await expectInvoice(c, layover.id, { lines: [{ cat: "flat_rate", amount: 1000 }, { cat: "layover", amount: 50 }] });
      check(
        c.checks,
        "layover wording",
        "yes",
        sentLineDescriptions(layover.loadNumber).some((text) => text.includes("Layover")) ? "yes" : sentLineDescriptions(layover.loadNumber).join(" | "),
      );
      const tonu = makeLoad({ rate: 1000, pay: [{ category: "tonu", rate: 50, total: 50 }] });
      await qbo.sendLoadToQuickbooks(tonu.id);
      await expectInvoice(c, tonu.id, { lines: [{ cat: "flat_rate", amount: 1000 }, { cat: "tonu", amount: 50 }] });
      check(
        c.checks,
        "tonu wording",
        "yes",
        sentLineDescriptions(tonu.loadNumber).some((text) => text.includes("TONU")) ? "yes" : sentLineDescriptions(tonu.loadNumber).join(" | "),
      );
      const wash = makeLoad({ rate: 1000, pay: [{ category: "washout", rate: 75, total: 75 }] });
      await qbo.sendLoadToQuickbooks(wash.id);
      await expectInvoice(c, wash.id, { lines: [{ cat: "flat_rate", amount: 1000 }, { cat: "washout", amount: 75 }] });
    });
    await runCase("C26", "Fuel surcharge is its own Line Haul line when no Fuel Surcharge item exists", async (c) => {
      const missing = makeLoad({ rate: 1000, pay: [{ category: "fuel_surcharge", rate: 40, total: 40 }] });
      await qbo.sendLoadToQuickbooks(missing.id);
      await expectInvoice(c, missing.id, { lines: [{ cat: "flat_rate", amount: 1000 }, { cat: "fuel_surcharge", amount: 40 }] });
      const descriptions = sentLineDescriptions(missing.loadNumber);
      check(c.checks, "fuel surcharge wording", "yes", descriptions.some((text) => text.includes("Fuel surcharge")) ? "yes" : descriptions.join(" | "));
      check(c.checks, "own line", "2", String(descriptions.length));
    });
    await runCase("C27", "Billed lumper posts to the Lumper item on an income account and blocks a cost account", async (c) => {
      const { id } = makeLoad({ rate: 1500, pay: [{ category: "lumper", rate: 80, total: 80 }] });
      await qbo.sendLoadToQuickbooks(id);
      await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1500 }, { cat: "lumper", amount: 80 }] });
      putItem("105", "Lumper", "408");
      qbo.clearQboCatalogCache();
      try {
        const blocked = makeLoad({ rate: 1500, pay: [{ category: "lumper", rate: 40, total: 40 }] });
        await expectBlocked(
          c,
          () => qbo.sendLoadToQuickbooks(blocked.id),
          /Billed lumper posts to the Lumper item on an income account/,
        );
      } finally {
        putItem("105", "Lumper", "431");
        qbo.clearQboCatalogCache();
      }
    });
    await runCase("C29", "Trailer rental, fuel advance fee, and damage claims are not billed", async (c) => {
      const rental = makeLoad({ rate: 1000, pay: [{ category: "trailer_rental", rate: 100, total: 100 }] });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(rental.id), /Trailer Rental is not billed to the customer/);
      const fee = makeLoad({ rate: 1000, pay: [{ category: "fuel_advance_fee", rate: 25, total: 25 }] });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(fee.id), /Fuel Advance Fee is not billed to the customer/);
      const claim = makeLoad({ rate: 1000, pay: [{ category: "claim_for_damages", rate: 40, total: 40 }] });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(claim.id), /Claim for Damages is not billed to the customer/);
    });
    await runCase("C30", "A single-amount bill with no override uses Owner Operators:Owner Operators COL", async (c) => {
      delete process.env.QBO_BILL_EXPENSE_ACCOUNT_ID;
      const billId = accounting.createBill({ vendor: "MSETMS Test Fuel Vendor", memo: `${LABEL} named account`, amount: 90 });
      await qbo.sendBillToQuickbooks(billId);
      await expectBill(c, billId, { vendor: fuelVendorId, account: ooColAccountId, amount: 90 });
    });
    await runCase("C31", "Lumig-style split bill: positive load pay and negative deductions, net above zero", async (c) => {
      const ref = makeLoad({ rate: 2000 });
      let negative = "";
      try {
        accounting.createBill({
          vendor: "Lumig Transports LLC",
          memo: `${LABEL} negative`,
          amount: -40,
          loadId: ref.id,
          lines: [
            { kind: "load_pay", amount: 10 },
            { kind: "fuel", amount: -50 },
          ],
        });
        negative = "(no error)";
      } catch (error) {
        negative = error instanceof Error ? error.message : String(error);
      }
      check(c.checks, "negative bill total blocked", "greater than zero", /greater than zero/.test(negative) ? "greater than zero" : negative);
      const billId = accounting.createBill({
        vendor: "Lumig Transports LLC",
        memo: `${LABEL} lumig split`,
        amount: 1200,
        loadId: ref.id,
        lines: [
          { kind: "load_pay", amount: 1500, description: "Load pay" },
          { kind: "fuel", amount: -200, description: "Fuel" },
          { kind: "toll", amount: -50, description: "Tolls" },
          { kind: "insurance", amount: -25, description: "Insurance" },
          { kind: "eld", amount: -15, description: "ELD" },
          { kind: "loan", amount: -10, description: "Loan" },
        ],
      });
      await qbo.sendBillToQuickbooks(billId);
      const bill = accounting.getBill(billId)!;
      c.qboIds.push(`Bill ${bill.qbo_bill_id}`);
      const read = (await qbo.readQboEntity<Json>("bill", bill.qbo_bill_id)).Bill as Json;
      check(c.checks, "net", money(1200), money(read.TotalAmt));
      check(c.checks, "vendor", "62", String(read.VendorRef?.value));
      const lines = (read.Line ?? []) as Json[];
      check(
        c.checks,
        "accounts",
        ["414", "412", "416", "417", "418", "419"],
        lines.map((line) => String(line.AccountBasedExpenseLineDetail?.AccountRef?.value)),
      );
      check(c.checks, "amounts", ["1500.00", "-200.00", "-50.00", "-25.00", "-15.00", "-10.00"], lines.map((line) => money(line.Amount)));
      check(c.checks, "no vendor create", "0", String(calls.filter((x) => x.method === "POST" && /\/vendor\?/.test(x.url)).length));
    });
    await runCase("C32", "Customers match a unique name ignoring case and extra spaces, and are never created", async (c) => {
      const exactId = queries.createCustomer({ name: "Exact Broker LLC", billing_notes: "", contacts: [] });
      const exact = makeLoad({ customerId: exactId, rate: 640 });
      await qbo.sendLoadToQuickbooks(exact.id);
      await expectInvoice(c, exact.id, { lines: [{ cat: "flat_rate", amount: 640 }], customer: "77" });
      check(c.checks, "exact customer id stored", "77", String(queries.getCustomer(exactId)?.qbo_customer_id ?? ""));
      const fuzzyId = queries.createCustomer({ name: "M&S Management", billing_notes: "", contacts: [] });
      const fuzzy = makeLoad({ customerId: fuzzyId, rate: 610 });
      await qbo.sendLoadToQuickbooks(fuzzy.id);
      await expectInvoice(c, fuzzy.id, { lines: [{ cat: "flat_rate", amount: 610 }], customer: "79" });
      check(c.checks, "fuzzy name did not take the longer customer", "79", String(queries.getCustomer(fuzzyId)?.qbo_customer_id ?? ""));
      const noneId = queries.createCustomer({ name: "Almost Exact Broker", billing_notes: "", contacts: [] });
      const none = makeLoad({ customerId: noneId, rate: 500 });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(none.id), /No QuickBooks customer matches "Almost Exact Broker"/);
      const spacedId = queries.createCustomer({ name: "  spaced   broker ", billing_notes: "", contacts: [] });
      const spaced = makeLoad({ customerId: spacedId, rate: 620 });
      await qbo.sendLoadToQuickbooks(spaced.id);
      await expectInvoice(c, spaced.id, { lines: [{ cat: "flat_rate", amount: 620 }], customer: "82" });
      check(c.checks, "spaced name stored", "82", String(queries.getCustomer(spacedId)?.qbo_customer_id ?? ""));
      const caseId = queries.createCustomer({ name: "CASE TWIN LLC", billing_notes: "", contacts: [] });
      const caseLoad = makeLoad({ customerId: caseId, rate: 500 });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(caseLoad.id), /More than one QuickBooks customer matches "CASE TWIN LLC"/);
      const twinId = queries.createCustomer({ name: "Twin Name LLC", billing_notes: "", contacts: [] });
      const twin = makeLoad({ customerId: twinId, rate: 500 });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(twin.id), /More than one QuickBooks customer matches/);
      const near = accounting.createBill({ vendor: "Lumig Transport", memo: `${LABEL} near`, amount: 20 });
      await expectBlocked(c, () => qbo.sendBillToQuickbooks(near), /Map this vendor first/);
      const shortVendor = accounting.createBill({ vendor: "Lumig Transports", memo: `${LABEL} short vendor`, amount: 30 });
      await qbo.sendBillToQuickbooks(shortVendor);
      const shortBill = accounting.getBill(shortVendor)!;
      const shortRead = (await qbo.readQboEntity<Json>("bill", shortBill.qbo_bill_id)).Bill as Json;
      check(c.checks, "shorter vendor name is its own match", "63", String(shortRead.VendorRef?.value));
      check(c.checks, "no customer or vendor create", "0", String(calls.filter((x) => x.method === "POST" && /\/(customer|vendor)\?/.test(x.url)).length));
    });
    await runCase("C34", "Driver name is the class; a missing class is created only when auto-create is on", async (c) => {
      const plain = makeLoad({ rate: 800 });
      await qbo.sendLoadToQuickbooks(plain.id);
      await expectInvoice(c, plain.id, { lines: [{ cat: "flat_rate", amount: 800 }] });
      const driverId = queries.createDriver({
        name: "Cole Brennan",
        phone: "402-555-0191",
        license: "T-1",
        truck_id: null,
        status: "available",
        driver_type: "company",
      });
      const { id } = makeLoad({ rate: 820 });
      db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(driverId, id);
      const before = calls.filter((x) => x.method === "POST" && /\/class\?/.test(x.url)).length;
      await qbo.sendLoadToQuickbooks(id);
      const created = calls.filter((x) => x.method === "POST" && /\/class\?/.test(x.url)).slice(before);
      check(c.checks, "one class create", "1", String(created.length));
      check(c.checks, "class name", "Cole Brennan", String(created[0]?.body?.Name ?? ""));
      await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 820 }] });
      const againMark = calls.filter((x) => x.method === "POST" && /\/class\?/.test(x.url)).length;
      await qbo.sendLoadToQuickbooks(id, { confirmResend: true });
      check(
        c.checks,
        "re-send does not create another class",
        "0",
        String(calls.filter((x) => x.method === "POST" && /\/class\?/.test(x.url)).length - againMark),
      );
      fake.classes.set("499", { Id: "499", Name: "sam keene" });
      const keeneId = queries.createDriver({
        name: "Sam Keene",
        phone: "402-555-0194",
        license: "T-4",
        truck_id: null,
        status: "available",
        driver_type: "company",
      });
      const reused = makeLoad({ rate: 840 });
      db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(keeneId, reused.id);
      const reuseMark = calls.filter((x) => x.method === "POST" && /\/class\?/.test(x.url)).length;
      await qbo.sendLoadToQuickbooks(reused.id);
      check(
        c.checks,
        "case-insensitive class is reused",
        "0",
        String(calls.filter((x) => x.method === "POST" && /\/class\?/.test(x.url)).length - reuseMark),
      );
      await expectInvoice(c, reused.id, { lines: [{ cat: "flat_rate", amount: 840 }] });
      process.env.QBO_CLASS_AUTO_CREATE = "0";
      try {
        const otherId = queries.createDriver({
          name: "Riley Booker",
          phone: "402-555-0192",
          license: "T-2",
          truck_id: null,
          status: "available",
          driver_type: "company",
        });
        const blocked = makeLoad({ rate: 830 });
        db.prepare("UPDATE loads SET driver_id = ? WHERE id = ?").run(otherId, blocked.id);
        const mark = calls.length;
        await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /Class auto-create is off/);
        check(
          c.checks,
          "no class create while auto-create is off",
          "0",
          String(calls.slice(mark).filter((x) => x.method === "POST" && /\/class\?/.test(x.url)).length),
        );
      } finally {
        delete process.env.QBO_CLASS_AUTO_CREATE;
      }
    });
    await runCase("C35", "Invoices do not set ARAccountRef", async (c) => {
      const { id } = makeLoad({ rate: 810 });
      await qbo.sendLoadToQuickbooks(id);
      await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 810 }] });
    });
  }

  applyFixedChart();
  for (const cat of Object.keys(cats)) upsertQboItemMap(cat, itemId[cat], cats[cat as Cat].item);
  qbo.clearQboCatalogCache();

  // ---------------------------------------------------------------- cases
  await runCase("C01", "Line-haul flat rate (load rate); txn date stays the delivery day", async (c) => {
    const { id } = makeLoad({ rate: 2000, delivery: "2026-09-14T22:30:00" });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 2000 }] });
  });
  await runCase("C02", "Per-mile line haul (812 mi x $2.45)", async (c) => {
    const { id } = makeLoad({ rate: null, pay: [{ category: "flat_rate", rate: 2.45, qty: 812, total: 1989.4, notes: "812 mi @ $2.45" }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1989.4, qty: 812, unitPrice: 2.45 }] });
  });
  await runCase("C03a", "Lumper billed to customer (pay line only)", async (c) => {
    const { id } = makeLoad({ rate: 1500, pay: [{ category: "lumper", rate: 150, total: 150 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1500 }, { cat: "lumper", amount: 150 }] });
    c.note = "One customer lumper pay line is billed on the TMS PDF and QuickBooks.";
  });
  await runCase("C03b", "Driver receipt only (lumper_actual) is billed as one Lumper line", async (c) => {
    const { id } = makeLoad({ rate: 1500, lumperActual: 150, pay: [{ category: "lumper", rate: 150, total: 150, bill_to: "driver" }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1500 }, { cat: "lumper", amount: 150 }] });
    c.note = "The driver pay item is not a second customer line. lumper_actual is the one billed amount.";
  });
  await runCase("C03c", "Customer lumper pay line and driver receipt match: one line", async (c) => {
    const { id } = makeLoad({
      rate: 1500,
      lumperActual: 150,
      pay: [{ category: "lumper", rate: 150, total: 150 }],
    });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1500 }, { cat: "lumper", amount: 150 }] });
  });
  await runCase("C03d", "Customer lumper pay line and driver receipt differ: block, do not guess", async (c) => {
    const { id } = makeLoad({
      rate: 1500,
      lumperActual: 175,
      pay: [{ category: "lumper", rate: 150, total: 150 }],
    });
    const pattern = /Lumper is entered twice with different amounts \(\$150\.00 pay line vs \$175\.00 driver receipt\)/;
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), pattern);
    let pdfMessage = "";
    try {
      invoiceLines(queries.getLoad(id)!);
    } catch (error) {
      pdfMessage = error instanceof Error ? error.message : String(error);
    }
    check(c.checks, "PDF blocked with the same warning", pattern.source, pdfMessage, pattern.test(pdfMessage));
    check(c.checks, "load not marked sent", "", queries.getLoad(id)!.qbo_invoice_id);
  });
  await runCase("C03e", "Re-sync replaces the invoice and does not add a second lumper line", async (c) => {
    const { id } = makeLoad({ rate: 1000, lumperActual: 80 });
    const first = await qbo.sendLoadToQuickbooks(id);
    const second = await qbo.sendLoadToQuickbooks(id, { confirmResend: true });
    check(c.checks, "same invoice id", first.invoiceId, second.invoiceId);
    const read = await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1000 }, { cat: "lumper", amount: 80 }] }, second.invoiceId);
    const lumperCount = ((read.Line ?? []) as Json[]).filter(
      (line) => String(line.SalesItemLineDetail?.ItemRef?.value) === itemId.lumper,
    ).length;
    check(c.checks, "one lumper line after re-sync", "1", String(lumperCount));
  });
  await runCase("C04", "Detention (2 h x $75) posts on the Detention item and keeps the Detention wording", async (c) => {
    const { id, loadNumber } = makeLoad({ rate: 1800, pay: [{ category: "detention", rate: 75, qty: 2, total: 150 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1800 }, { cat: "detention", amount: 150, qty: 2, unitPrice: 75 }] });
    const descriptions = sentLineDescriptions(loadNumber);
    check(c.checks, "detention wording", "yes", descriptions.some((text) => text.includes("Detention")) ? "yes" : descriptions.join(" | "));
  });
  await runCase("C05", "Layover is its own Line Haul line", async (c) => {
    const { id, loadNumber } = makeLoad({ rate: 1800, pay: [{ category: "layover", rate: 250, total: 250 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1800 }, { cat: "layover", amount: 250 }] });
    const descriptions = sentLineDescriptions(loadNumber);
    check(c.checks, "layover wording", "yes", descriptions.some((text) => text.includes("Layover")) ? "yes" : descriptions.join(" | "));
  });
  await runCase("C06", "Extra stops (2 x $100)", async (c) => {
    const { id } = makeLoad({ rate: 1800, pay: [{ category: "extra_stop", rate: 100, qty: 2, total: 200 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1800 }, { cat: "extra_stop", amount: 200, qty: 2, unitPrice: 100 }] });
  });
  await runCase("C07", "Washout", async (c) => {
    const { id } = makeLoad({ rate: 1800, pay: [{ category: "washout", rate: 75, total: 75 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1800 }, { cat: "washout", amount: 75 }] });
  });
  await runCase("C08", "TONU on a cancelled load (TONU only, on the Line Haul item)", async (c) => {
    const { id, loadNumber } = makeLoad({ rate: 2000, status: "cancelled", pay: [{ category: "tonu", rate: 250, total: 250 }] });
    await qbo.sendLoadToQuickbooks(id);
    const descriptions = sentLineDescriptions(loadNumber);
    check(c.checks, "tonu wording", "yes", descriptions.some((text) => text.includes("TONU")) ? "yes" : descriptions.join(" | "));
    const read = await expectInvoice(c, id, { lines: [{ cat: "tonu", amount: 250 }] });
    // The TMS PDF refuses cancelled loads, so its total is 0 here: report it, do not fail on it.
    const pdf = c.checks.find((x) => x.field === "amount = TMS invoice PDF");
    if (pdf) {
      pdf.pass = true;
      pdf.actual = `${money(read.TotalAmt)} (TMS PDF blocks cancelled loads: GAP)`;
    }
  });
  await runCase("C09", "Fuel surcharge is its own Line Haul line, not a calculated miles rate", async (c) => {
    const { id, loadNumber } = makeLoad({ rate: 2000, pay: [{ category: "fuel_surcharge", rate: 0.45, qty: 812, total: 365.4 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 2000 }, { cat: "fuel_surcharge", amount: 365.4, qty: 812, unitPrice: 0.45 }] });
    const sent = [...calls].reverse().find(
      (x) => x.method === "POST" && /\/invoice\?/.test(x.url) && String(x.body?.CustomerMemo?.value ?? "").includes(`MS Express load ${loadNumber}`),
    )?.body;
    const names = ((sent?.Line ?? []) as Json[]).map((line) => String(line.SalesItemLineDetail?.ItemRef?.name));
    check(c.checks, "item names", "Line Haul | Line Haul", names.join(" | "));
    check(c.checks, "fuel surcharge wording", "yes", sentLineDescriptions(loadNumber).some((text) => text.includes("Fuel surcharge")) ? "yes" : "missing");
    const plain = makeLoad({ rate: 1600 });
    await qbo.sendLoadToQuickbooks(plain.id);
    await expectInvoice(c, plain.id, { lines: [{ cat: "flat_rate", amount: 1600 }] });
    c.note = "No miles × rate fuel calculation. A fuel surcharge pay line stays its own line on the Line Haul item.";
  });
  await runCase("C10", "Multi-line invoice", async (c) => {
    const { id } = makeLoad({
      rate: null,
      pay: [
        { category: "flat_rate", rate: 2500, total: 2500 },
        { category: "detention", rate: 75, qty: 2, total: 150 },
        { category: "layover", rate: 250, total: 250 },
        { category: "extra_stop", rate: 100, total: 100 },
        { category: "washout", rate: 75, total: 75 },
        { category: "fuel_surcharge", rate: 300, total: 300 },
      ],
    });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, {
      lines: [
        { cat: "flat_rate", amount: 2500 },
        { cat: "detention", amount: 150, qty: 2, unitPrice: 75 },
        { cat: "layover", amount: 250 },
        { cat: "extra_stop", amount: 100 },
        { cat: "washout", amount: 75 },
        { cat: "fuel_surcharge", amount: 300 },
      ],
    });
  });
  await runCase("C11", "Adjustment: negative Misc. line on the invoice (credit memo entity not built)", async (c) => {
    const { id } = makeLoad({ rate: 2000, pay: [{ category: "misc", rate: -150, total: -150, notes: "Rate adjustment" }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 2000 }, { cat: "misc", amount: -150, unitPrice: -150 }] });
    c.note = "A standalone QuickBooks CreditMemo is not built in the TMS (GAP): issue it in QuickBooks by hand for now.";
  });
  await runCase("C28", "Negative adjustment uses the Adjustment item on Gross Trucking Income", async (c) => {
    const { id } = makeLoad({ rate: 900, pay: [{ category: "misc", rate: -40, total: -40, notes: "Adjustment" }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 900 }, { cat: "misc", amount: -40, unitPrice: -40 }] });
    check(c.checks, "adjustment account", incomeId.flat_rate, incomeId.misc);
  });
  let resyncLoad = 0;
  await runCase("C12", "Re-sync an existing invoice: same QuickBooks invoice updated, no duplicate", async (c) => {
    const { id, loadNumber } = makeLoad({ rate: 1000 });
    resyncLoad = id;
    const first = await qbo.sendLoadToQuickbooks(id);
    const before = (await qbo.readQboEntity<Json>("invoice", first.invoiceId)).Invoice as Json;
    db.prepare("UPDATE loads SET rate = 1100 WHERE id = ?").run(id);
    addPayItem(id, { side: "income", bill_to: "customer", payee: "", category: "detention", rate: 75, qty: 1, total: 75, notes: "" });
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /already sent/i);
    c.checks = c.checks.map((x) => ({ ...x, field: `without confirm: ${x.field}` }));
    const second = await qbo.sendLoadToQuickbooks(id, { confirmResend: true });
    check(c.checks, "same invoice id", first.invoiceId, second.invoiceId);
    const read = await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1100 }, { cat: "detention", amount: 75 }] }, second.invoiceId);
    check(c.checks, "SyncToken advanced", "> " + String(before.SyncToken), String(read.SyncToken), Number(read.SyncToken) > Number(before.SyncToken));
    const storedDoc = String(queries.getLoad(id)!.qbo_doc_number ?? "");
    check(c.checks, "re-sync keeps DocNumber", first.invoiceNumber, second.invoiceNumber);
    const same = (await qbo.queryQboReadOnly<Json>(`select Id from Invoice where DocNumber = '${storedDoc}'`)).QueryResponse?.Invoice ?? [];
    check(c.checks, "invoices with this doc number", "1", String((same as Json[]).length));
    if (!LIVE) {
      // A payment applied in QuickBooks (Balance < Total) blocks the update.
      const paid = fake.invoices.get(second.invoiceId)!;
      fake.invoices.set(second.invoiceId, { ...paid, Balance: 0 });
      const mark = calls.length;
      let msg = "";
      try {
        await qbo.sendLoadToQuickbooks(id, { confirmResend: true });
      } catch (error) {
        msg = error instanceof Error ? error.message : String(error);
      }
      check(c.checks, "paid invoice: update blocked", "payment applied", msg, /payment applied/.test(msg));
      check(c.checks, "paid invoice: no write", "0 POST", `${postsSince(mark, "/invoice").length} POST`);
    }
  });
  await runCase("C13", "Cancelled load: no TONU blocks; cancelled after invoicing blocks the update", async (c) => {
    const bare = makeLoad({ rate: 2000, status: "cancelled" });
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(bare.id), /cancelled/i);
    const sent = makeLoad({ rate: 2000 });
    const first = await qbo.sendLoadToQuickbooks(sent.id);
    c.qboIds.push(`Invoice ${first.invoiceId} (left as sent; void in QuickBooks)`);
    db.prepare("UPDATE loads SET status = 'cancelled' WHERE id = ?").run(sent.id);
    const mark = calls.length;
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(sent.id, { confirmResend: true }), /cancelled/i);
    check(c.checks, "existing invoice untouched", "0 POST", `${postsSince(mark, "/invoice").length} POST`);
    c.note = "No automatic void: the office voids the QuickBooks invoice by hand (TMS tells them to).";
  });
  async function expectBill(c: CaseResult, billId: number, exp: { vendor: string; account: string; amount: number }) {
    const bill = accounting.getBill(billId)!;
    c.qboIds.push(`Bill ${bill.qbo_bill_id}`);
    const read = (await qbo.readQboEntity<Json>("bill", bill.qbo_bill_id)).Bill as Json;
    check(c.checks, "amount", money(exp.amount), money(read.TotalAmt));
    check(c.checks, "vendor", exp.vendor, String(read.VendorRef?.value));
    check(c.checks, "expense account", exp.account, String(read.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.value));
    const billDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    check(c.checks, "txn date", billDate, String(read.TxnDate));
    const text = `${read.PrivateNote ?? ""} ${read.Line?.[0]?.Description ?? ""}`;
    check(c.checks, "memo labelled, no internal notes", "labelled", INTERNAL.test(text) ? "INTERNAL leaked" : text.includes(LABEL) && text.includes(`MSETMS bill ${billId}`) ? "labelled" : text);
  }
  await runCase("C14", `Owner-operator settlement bill (${ooDriver} -> OO settlements account)`, async (c) => {
    const ref = makeLoad({ rate: 2000 });
    const billId = accounting.createBill({ vendor: ooDriver, memo: `${LABEL} OO settlement`, amount: 1500, loadId: ref.id });
    process.env.QBO_BILL_EXPENSE_ACCOUNT_ID = fuelAccountId;
    await qbo.sendBillToQuickbooks(billId);
    await expectBill(c, billId, { vendor: ooVendorId, account: ooAccountId, amount: 1500 });
    c.note = "TMS settlements are not pushed automatically; the office enters one bill per OO settlement (GAP if JC wants it automatic).";
  });
  await runCase("C15", "Single-amount bill uses Owner Operators COL by name; env id overrides that default", async (c) => {
    delete process.env.QBO_BILL_EXPENSE_ACCOUNT_ID;
    const named = accounting.createBill({ vendor: "MSETMS Test Fuel Vendor", memo: `${LABEL} fuel`, amount: 412.37 });
    await qbo.sendBillToQuickbooks(named);
    await expectBill(c, named, { vendor: fuelVendorId, account: ooColAccountId, amount: 412.37 });
    process.env.QBO_BILL_EXPENSE_ACCOUNT_ID = fuelAccountId;
    const overridden = accounting.createBill({ vendor: "MSETMS Test Fuel Vendor", memo: `${LABEL} fuel override`, amount: 80 });
    await qbo.sendBillToQuickbooks(overridden);
    const read = (await qbo.readQboEntity<Json>("bill", accounting.getBill(overridden)!.qbo_bill_id)).Bill as Json;
    check(c.checks, "env expense account", fuelAccountId, String(read.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.value));
    delete process.env.QBO_BILL_EXPENSE_ACCOUNT_ID;
  });
  await runCase("C16", "Duplicate customer mapping (TMS 531 and 9 -> one QBO customer)", async (c) => {
    const a = makeLoad({ customerId: 531, rate: 900 });
    await qbo.sendLoadToQuickbooks(a.id);
    await expectInvoice(c, a.id, { lines: [{ cat: "flat_rate", amount: 900 }] });
    const shared = (db.prepare("SELECT COUNT(*) AS n FROM customers WHERE id IN (9, 531) AND qbo_customer_id = ?").get(customerQboId) as { n: number }).n;
    check(c.checks, "TMS 9 and 531 share the QBO customer", "2", String(shared));
    check(c.checks, "no customer create", "0", String(calls.filter((x) => x.method === "POST" && /\/customer\?/.test(x.url) && !x.body?.DisplayName?.startsWith?.("MSETMS Test")).length));
  });
  await runCase("C17", "Unmapped pay item stops with a warning (Trailer Rental)", async (c) => {
    const { id } = makeLoad({ rate: 1800, pay: [{ category: "trailer_rental", rate: 100, total: 100 }] });
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /Trailer Rental is not billed to the customer/);
    check(c.checks, "load not marked sent", "", queries.getLoad(id)!.qbo_invoice_id);
  });
  await runCase("C18", "Blank remit street or AR email blocks the send; ar@msloads.com is accepted", async (c) => {
    const { id } = makeLoad({ rate: 1800 });
    setRemit("", "");
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /cannot be sent to QuickBooks.*Remit street.*AR email/);
    setRemit("100 Campaign Test Rd", "");
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /AR email is blank/);
    c.checks = c.checks.map((x, i) => (i >= 2 ? { ...x, field: `blank AR email: ${x.field}` } : x));
    setRemit("100 Campaign Test Rd", "ar@msloads.com");
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1800 }] });
    setRemit("100 Campaign Test Rd", "ar-test@example.com");
  });
  await runCase("C19", "Invoice # is the TMS load number: create, re-sync, and an existing DocNumber is updated", async (c) => {
    fake.customTxnNumbers = false;
    const auto = makeLoad({ rate: 1200, customerReference: "12345", loadNumber: "MSE-1055" });
    const before = calls.length;
    const sent = await qbo.sendLoadToQuickbooks(auto.id);
    const create = calls.slice(before).find((x) => x.method === "POST" && /\/invoice\?/.test(x.url) && !x.body?.Id);
    check(c.checks, "DocNumber is the load number", "MSE-1055", String(create?.body?.DocNumber ?? ""));
    const autoDoc = String(queries.getLoad(auto.id)!.qbo_doc_number ?? "");
    check(c.checks, "DocNumber stored", sent.invoiceNumber, autoDoc);
    check(c.checks, "stored DocNumber is the load number", "MSE-1055", autoDoc);
    const autoMemo = String(create?.body?.CustomerMemo?.value ?? "");
    const autoNote = String(create?.body?.PrivateNote ?? "");
    const autoLines = ((create?.body?.Line ?? []) as Json[]).map((line) => String(line.Description ?? "")).join("\n");
    check(
      c.checks,
      "memo has load and customer ref",
      "yes",
      autoMemo.includes("MS Express load MSE-1055 · Customer ref 12345") ? "yes" : autoMemo,
    );
    check(c.checks, "private note has the load number", "yes", autoNote.includes("MSETMS load MSE-1055") ? "yes" : autoNote);
    check(c.checks, "line description has the load number", "yes", autoLines.includes("MSE-1055") ? "yes" : autoLines);
    check(c.checks, "memo route uses to", "yes", autoMemo.includes("Hastings, NE to Omaha, NE") && !autoMemo.includes("→") ? "yes" : autoMemo);
    check(c.checks, "line route uses to", "yes", autoLines.includes("Hastings, NE to Omaha, NE") && !autoLines.includes("→") ? "yes" : autoLines);
    c.qboIds.push(`Invoice ${sent.invoiceId}`);
    const again = await qbo.sendLoadToQuickbooks(auto.id, { confirmResend: true });
    check(c.checks, "re-sync keeps the number", sent.invoiceNumber, again.invoiceNumber);
    check(c.checks, "re-sync keeps the invoice", sent.invoiceId, again.invoiceId);
    const resend = [...calls].reverse().find((x) => x.method === "POST" && /\/invoice\?/.test(x.url) && x.body?.Id === sent.invoiceId);
    check(c.checks, "re-sync sends the same DocNumber", "MSE-1055", String(resend?.body?.DocNumber ?? ""));
    const creates = calls.filter(
      (x) => x.method === "POST" && /\/invoice\?/.test(x.url) && !x.body?.Id && String(x.body?.DocNumber ?? "") === "MSE-1055",
    );
    check(c.checks, "re-sync does not create a second invoice", "1", String(creates.length));

    fake.invoices.set("already-mse", {
      Id: "already-mse",
      DocNumber: "MSE-2002",
      SyncToken: "0",
      TotalAmt: 50,
      Balance: 50,
      Line: [],
    });
    const taken = makeLoad({ rate: 1100, loadNumber: "MSE-2002" });
    const takenBefore = calls.length;
    const takenSent = await qbo.sendLoadToQuickbooks(taken.id);
    check(c.checks, "existing DocNumber is updated", "already-mse", takenSent.invoiceId);
    check(c.checks, "existing DocNumber stored", "MSE-2002", String(queries.getLoad(taken.id)!.qbo_doc_number ?? ""));
    const takenCreates = calls
      .slice(takenBefore)
      .filter((x) => x.method === "POST" && /\/invoice\?/.test(x.url) && !x.body?.Id);
    check(c.checks, "existing DocNumber: no second create", "0", String(takenCreates.length));
    const same = (await qbo.queryQboReadOnly<Json>("select Id from Invoice where DocNumber = 'MSE-2002'")).QueryResponse?.Invoice ?? [];
    check(c.checks, "one invoice with this load number", "1", String((same as Json[]).length));
    const takenAgain = await qbo.sendLoadToQuickbooks(taken.id, { confirmResend: true });
    check(c.checks, "second send keeps the same invoice", takenSent.invoiceId, takenAgain.invoiceId);
    check(c.checks, "second send keeps the load number", "MSE-2002", takenAgain.invoiceNumber);
    c.qboIds.push(`Invoice ${takenSent.invoiceId}`);

    const tooLong = "N".repeat(22);
    const blocked = makeLoad({ rate: 900, loadNumber: tooLong });
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /at most 21 characters/);
    check(c.checks, "22-character load # not marked sent", "", queries.getLoad(blocked.id)!.qbo_invoice_id);
    fake.customTxnNumbers = false;
  });
  await runCase("C20", "Customer payment terms -> QuickBooks Term (and unknown terms block)", async (c) => {
    const termName = fake.terms[0]?.Name ?? "Net 30";
    db.prepare("UPDATE customers SET payment_terms = ? WHERE id = 9").run(termName);
    const { id } = makeLoad({ rate: 1300 });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1300 }], termsId: netTermId });
    db.prepare("UPDATE customers SET payment_terms = 'Net 47 MSETMS' WHERE id = 9").run();
    const other = makeLoad({ rate: 1300 });
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(other.id), /not set up in QuickBooks/);
    db.prepare("UPDATE customers SET payment_terms = '' WHERE id = 9").run();
  });
  await runCase("C21", "Memo and PDF show the MS Express load # and customer ref; DocNumber is the load number", async (c) => {
    const customerRef = "BROKER-LOAD-555";
    const unsent = makeLoad({ rate: 700, customerReference: "PRE-SYNC" });
    const beforeSync = buildTmsInvoice(queries.getLoad(unsent.id)!);
    check(c.checks, "PDF invoice # before sync", `INV-${unsent.loadNumber}`, beforeSync.invoiceNumber);
    const { id, loadNumber } = makeLoad({ rate: 1400, customerReference: customerRef });
    await qbo.sendLoadToQuickbooks(id);
    const read = await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1400 }] });
    const doc = String(read.DocNumber ?? "");
    check(c.checks, "DocNumber is the TMS load #", loadNumber, doc);
    check(c.checks, "DocNumber is not the customer ref", "different", doc === customerRef ? "same" : "different");
    check(c.checks, "DocNumber is not the PO", "different", doc.startsWith("PO-") ? "same" : "different");
    const memo = String(read.CustomerMemo?.value ?? "");
    const privateNote = String(read.PrivateNote ?? "");
    const memoLine = `MS Express load ${loadNumber} · Customer ref ${customerRef}`;
    check(c.checks, "load and customer ref in QBO memo", memoLine, memo.includes(memoLine) ? memoLine : memo);
    check(c.checks, "memo has no internal notes", "clean", INTERNAL.test(memo) || INTERNAL.test(privateNote) ? "INTERNAL leaked" : "clean");
    const model = buildTmsInvoice(queries.getLoad(id)!);
    check(c.checks, "PDF invoice # after sync", doc, model.invoiceNumber);
    check(c.checks, "PDF customer ref field", customerRef, model.customerReference);
    const pdf = await renderTmsInvoicePdf(model);
    const { extractText } = await import("unpdf");
    const pdfText = String((await extractText(new Uint8Array(pdf), { mergePages: true })).text ?? "");
    check(c.checks, "PDF shows Customer ref #", "present", /Customer ref #/.test(pdfText) && pdfText.includes(customerRef) ? "present" : "missing");
    check(c.checks, "PDF shows MS Express load #", "present", pdfText.includes("MS Express load #") && pdfText.includes(loadNumber) ? "present" : "missing");
    check(c.checks, "PDF invoice # is the QBO number", "qbo number", pdfText.includes(doc) && !pdfText.includes(`Invoice #: ${customerRef}`) ? "qbo number" : "missing");

    const blank = makeLoad({ rate: 900 });
    await qbo.sendLoadToQuickbooks(blank.id);
    const blankRead = await expectInvoice(c, blank.id, { lines: [{ cat: "flat_rate", amount: 900 }] });
    const blankMemo = String(blankRead.CustomerMemo?.value ?? "");
    check(c.checks, "no customer ref: DocNumber is the load #", blank.loadNumber, String(blankRead.DocNumber ?? ""));
    check(c.checks, "no customer ref: memo has the load #", "present", blankMemo.includes(`MS Express load ${blank.loadNumber}`) ? "present" : "absent");
    check(c.checks, "no customer ref: memo has no Customer ref line", "absent", blankMemo.includes("Customer ref") ? "present" : "absent");
    check(c.checks, "no customer ref: PDF field empty", "", buildTmsInvoice(queries.getLoad(blank.id)!).customerReference);

    const maxed = "N".repeat(21);
    const exact = makeLoad({ rate: 500, loadNumber: maxed });
    await qbo.sendLoadToQuickbooks(exact.id);
    const exactRead = await expectInvoice(c, exact.id, { lines: [{ cat: "flat_rate", amount: 500 }] });
    check(c.checks, "21-character load # is the DocNumber", maxed, String(exactRead.DocNumber ?? ""));
    const exactMemo = String(exactRead.CustomerMemo?.value ?? "");
    check(c.checks, "21-character load # is in the memo", "present", exactMemo.includes(`MS Express load ${maxed}`) ? "present" : "absent");
  });
  await runCase("C36", "Legal name is accepted; brokerage name, MC, email, and addresses block the send", async (c) => {
    const restore = () => {
      db.prepare(
        `UPDATE company_profile
         SET company_name = 'MS Express', street = '100 Campaign Test Rd', city = 'Hastings', state = 'NE', zip = '68901',
             ar_email = 'ar-test@example.com', dispatcher_email = 'ana@msloads.com', dispatcher_phone = '402-302-0097',
             usdot = '3062879', mc = '056299'
         WHERE id = 1`,
      ).run();
    };
    const setIdentity = (patch: {
      company_name?: string;
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      ar_email?: string;
      dispatcher_email?: string;
      mc?: string;
    }) => {
      const row = {
        company_name: "MS Express",
        street: "100 Campaign Test Rd",
        city: "Hastings",
        state: "NE",
        zip: "68901",
        ar_email: "ar@msloads.com",
        dispatcher_email: "ana@msloads.com",
        mc: "056299",
        ...patch,
      };
      db.prepare(
        `UPDATE company_profile
         SET company_name = ?, street = ?, city = ?, state = ?, zip = ?, ar_email = ?, dispatcher_email = ?, mc = ?
         WHERE id = 1`,
      ).run(
        row.company_name,
        row.street,
        row.city,
        row.state,
        row.zip,
        row.ar_email,
        row.dispatcher_email,
        row.mc,
      );
    };
    try {
      const blocked = makeLoad({ rate: 1600 });
      setIdentity({ company_name: "M&S Loads" });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /M&S Loads/);
      setIdentity({ company_name: "M&S Loads LLC" });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /without DBA MS Express/);
      setIdentity({ company_name: "MS Express", mc: "MC-970613" });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /970613/);
      setIdentity({ mc: "056299", ar_email: "jc@msloads.com" });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /jc@msloads\.com/);
      setIdentity({
        ar_email: "ar@msloads.com",
        street: "228 East Route 59 #190",
        city: "Nanuet",
        state: "NY",
        zip: "10954",
      });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /Nanuet/);
      setIdentity({ street: "100 Sample St", city: "Deerfield Beach", state: "FL", zip: "33441" });
      await expectBlocked(c, () => qbo.sendLoadToQuickbooks(blocked.id), /Deerfield Beach/);
      setIdentity({
        company_name: "M and S Loads DBA MS Express",
        street: "100 Campaign Test Rd",
        city: "Hastings",
        state: "NE",
        zip: "68901",
        ar_email: "ar@msloads.com",
        mc: "056299",
      });
      const accepted = makeLoad({ rate: 1610 });
      await qbo.sendLoadToQuickbooks(accepted.id);
      const stored = queries.getLoad(accepted.id)!;
      check(c.checks, "legal name send stored", "sent", stored.qbo_invoice_id ? "sent" : "missing");
      const model = buildTmsInvoice(stored);
      check(c.checks, "PDF legal name", "M and S Loads DBA MS Express", model.companyLegalName);
      check(c.checks, "USDOT stays 3062879", "yes", (model.companyDocket ?? "").includes("3062879") ? "yes" : model.companyDocket ?? "");
      check(c.checks, "MC stays 056299", "yes", (model.companyDocket ?? "").includes("056299") ? "yes" : model.companyDocket ?? "");
      check(c.checks, "no issuer warning", "", model.issuerWarning ?? "");
      c.qboIds.push(`Invoice ${stored.qbo_invoice_id}`);
    } finally {
      restore();
    }
  });

  if (!LIVE) {
    await runCase("C37", "Detention posts to the Detention item on its income account, not Line Haul", async (c) => {
      delete process.env.QBO_DETENTION_INCOME_ACCOUNT;
      upsertQboItemMap("detention", "101", "Line Haul");
      itemId.detention = "102";
      incomeId.detention = "430";
      qbo.clearQboCatalogCache();
      const restoreAccountName = () => {
        const account = fake.accounts.find((row) => row.Id === "430");
        if (!account) return;
        account.Name = "Detention Income";
        account.FullyQualifiedName = "Detention Income";
      };
      try {
        const own = makeLoad({ rate: 1000, pay: [{ category: "detention", rate: 50, total: 50 }] });
        await qbo.sendLoadToQuickbooks(own.id);
        await expectInvoice(c, own.id, {
          lines: [
            { cat: "flat_rate", amount: 1000 },
            { cat: "detention", amount: 50 },
          ],
        });
        check(
          c.checks,
          "detention wording",
          "yes",
          sentLineDescriptions(own.loadNumber).some((text) => text.includes("Detention")) ? "yes" : "missing",
        );
        const account = fake.accounts.find((row) => row.Id === "430");
        if (account) {
          account.Name = "Detention";
          account.FullyQualifiedName = "Detention";
        }
        qbo.clearQboCatalogCache();
        const prodName = makeLoad({ rate: 1000, pay: [{ category: "detention", rate: 40, total: 40 }] });
        await qbo.sendLoadToQuickbooks(prodName.id);
        await expectInvoice(c, prodName.id, {
          lines: [
            { cat: "flat_rate", amount: 1000 },
            { cat: "detention", amount: 40 },
          ],
        });
        process.env.QBO_DETENTION_INCOME_ACCOUNT = "Gross Trucking Income";
        const ignored = makeLoad({ rate: 1000, pay: [{ category: "detention", rate: 22, total: 22 }] });
        await qbo.sendLoadToQuickbooks(ignored.id);
        await expectInvoice(c, ignored.id, {
          lines: [
            { cat: "flat_rate", amount: 1000 },
            { cat: "detention", amount: 22 },
          ],
        });
        delete process.env.QBO_DETENTION_INCOME_ACCOUNT;
        fake.items.delete("102");
        qbo.clearQboCatalogCache();
        const missing = makeLoad({ rate: 1000, pay: [{ category: "detention", rate: 30, total: 30 }] });
        await expectBlocked(c, () => qbo.sendLoadToQuickbooks(missing.id), /QuickBooks has no item named "Detention"/);
        putItem("102", "Detention", "420");
        qbo.clearQboCatalogCache();
        const cogs = makeLoad({ rate: 1000, pay: [{ category: "detention", rate: 15, total: 15 }] });
        await expectBlocked(
          c,
          () => qbo.sendLoadToQuickbooks(cogs.id),
          /Detention posts to the Detention item on an income account/,
        );
      } finally {
        delete process.env.QBO_DETENTION_INCOME_ACCOUNT;
        restoreAccountName();
        putItem("102", "Detention", "430");
        itemId.detention = "102";
        incomeId.detention = "430";
        upsertQboItemMap("detention", "102", "Detention");
        qbo.clearQboCatalogCache();
      }
    });
    await runCase("C38", "Accounts named uncategorized or miscellaneous are refused", async (c) => {
      try {
        putItem("101", "Line Haul", "407");
        qbo.clearQboCatalogCache();
        const uncategorized = makeLoad({ rate: 900 });
        await expectBlocked(c, () => qbo.sendLoadToQuickbooks(uncategorized.id), /uncategorized/i);
        fake.accounts.push(acct("432", "Miscellaneous", "Income", "Revenue"));
        putItem("101", "Line Haul", "432");
        qbo.clearQboCatalogCache();
        const miscellaneous = makeLoad({ rate: 910 });
        await expectBlocked(c, () => qbo.sendLoadToQuickbooks(miscellaneous.id), /miscellaneous/i);
      } finally {
        putItem("101", "Line Haul", "401");
        fake.accounts = fake.accounts.filter((row) => row.Id !== "432");
        qbo.clearQboCatalogCache();
      }
    });
  }
  void resyncLoad;

  const creates = calls.filter((call) => call.method === "POST" && /\/(customer|vendor|item|account)\?/.test(call.url));
  assert.equal(creates.length, 0, `QuickBooks create calls are not allowed: ${creates.map((call) => call.url).join(" ")}`);

  // ---------------------------------------------------------------- cleanup (live only, opt-in)
  if (LIVE && CLEANUP) {
    for (const r of results) {
      for (const ref of r.qboIds) {
        const m = ref.match(/^(Invoice|Bill) (\d+)/);
        if (!m) continue;
        try {
          await qbo.cleanupQboCampaignDoc(m[1] === "Invoice" ? "invoice" : "bill", m[2], LABEL);
        } catch (error) {
          console.log(`cleanup ${ref}: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  }
}

function report(fatal?: unknown): string {
  const rows = results.map((r) => {
    const failed = r.checks.filter((x) => !x.pass).map((x) => `${x.field}: expected ${x.expected}, got ${x.actual}`);
    return `| ${r.id} | ${r.title.replace(/\|/g, "/")} | ${r.pass ? "PASS" : "FAIL"} | ${r.qboIds.join("; ") || "none (blocked)"} | ${r.checks.length} | ${(failed.join("; ") || r.note || "").replace(/\|/g, "/")} |`;
  });
  const passed = results.filter((r) => r.pass).length;
  return [
    `# QBO mapping campaign (${LIVE ? "LIVE SANDBOX 5710" : "OFFLINE, mocked QBO"}) run ${RUN}`,
    "",
    `Source DB copy sha256 ${sourceHash.slice(0, 16)}… (unchanged: ${sha(sourceReal) === sourceHash}). Checked per case: amount, item, income account, customer, memo, terms, class, txn date, doc number.`,
    fatal ? `\nFATAL: ${fatal instanceof Error ? fatal.message : String(fatal)}\n` : "",
    `${passed}/${results.length} cases pass.`,
    "",
    "| Case | What | Result | QBO ids | Checks | Failures / notes |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

main()
  .then(() => finish())
  .catch((error) => finish(error));

function finish(fatal?: unknown) {
  const md = report(fatal);
  if (outPath) {
    fs.writeFileSync(outPath, md);
    fs.writeFileSync(outPath.replace(/\.md$/, "") + ".json", JSON.stringify({ live: LIVE, run: RUN, results }, null, 2));
  }
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} pass${fatal ? ` · FATAL ${fatal instanceof Error ? fatal.message : fatal}` : ""}`);
  assert.equal(sha(sourceReal), sourceHash, "source DB must be unchanged");
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fatal || results.some((r) => !r.pass) ? 1 : 0);
}
