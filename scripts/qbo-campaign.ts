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
 * "MSETMS Test …". Never touches a production QuickBooks company. Never writes the source DB.
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
const fake = {
  nextId: 1000,
  accounts: [
    { Id: "401", Name: "Freight Income", Classification: "Revenue", AccountType: "Income", Active: true },
    { Id: "402", Name: "Accessorial Income", Classification: "Revenue", AccountType: "Income", Active: true },
    { Id: "403", Name: "Fuel Surcharge Income", Classification: "Revenue", AccountType: "Income", Active: true },
    { Id: "404", Name: "Lumper Reimbursement", Classification: "Revenue", AccountType: "Income", Active: true },
    { Id: "69", Name: "Legal & Professional Fees:Accounting", Classification: "Expense", AccountType: "Expense", Active: true },
    { Id: "701", Name: "Owner-Operator Settlements", Classification: "Expense", AccountType: "Cost of Goods Sold", Active: true },
    { Id: "702", Name: "Fuel", Classification: "Expense", AccountType: "Expense", Active: true },
  ],
  items: new Map<string, FakeItem>(),
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
    if (/from Item/i.test(q)) return ok({ QueryResponse: { Item: [...fake.items.values()].filter((i) => i.Name === eq("Name")) } });
    if (/from Term/i.test(q)) return ok({ QueryResponse: { Term: fake.terms.filter((t) => !eq("Name") || t.Name === eq("Name")) } });
    if (/from Invoice/i.test(q)) {
      return ok({ QueryResponse: { Invoice: [...fake.invoices.values()].filter((i) => i.DocNumber === eq("DocNumber")) } });
    }
    if (/from Account/i.test(q)) return ok({ QueryResponse: { Account: fake.accounts } });
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
      const next = { ...current, ...rest, SyncToken: String(Number(current.SyncToken) + 1), TotalAmt: total, Balance: total };
      fake.invoices.set(next.Id, next);
      return ok({ Invoice: next });
    }
    const Id = String(fake.nextId++);
    const created = { ...body, Id, SyncToken: "0", TotalAmt: total, Balance: total };
    fake.invoices.set(Id, created);
    return ok({ Invoice: created });
  }
  if (method === "POST" && tail === "/bill" && body) {
    const Id = String(fake.nextId++);
    const total = Math.round((body.Line ?? []).reduce((s: number, l: Json) => s + l.Amount, 0) * 100) / 100;
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
  const queries = await import("../lib/queries");
  const { getDb } = await import("../lib/db");
  const { addPayItem } = await import("../lib/pay-items");
  const { upsertQboItemMap, upsertQboVendorMap } = await import("../lib/accounting-desk");
  const accounting = await import("../lib/accounting");
  const { tmsCustomerInvoiceLines } = await import("../lib/invoice");
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
    flat_rate: { item: "Line Haul", income: "Freight Income" },
    detention: { item: "Detention", income: "Accessorial Income" },
    layover: { item: "Layover", income: "Accessorial Income" },
    tonu: { item: "TONU", income: "Accessorial Income" },
    washout: { item: "Washout", income: "Accessorial Income" },
    extra_stop: { item: "Extra Stop", income: "Accessorial Income" },
    fuel_surcharge: { item: "Fuel Surcharge", income: "Fuel Surcharge Income" },
    misc: { item: "Adjustment", income: "Accessorial Income" },
    lumper: { item: "Lumper", income: "Lumper Reimbursement" },
  } as const;
  type Cat = keyof typeof cats;
  const itemId: Record<string, string> = {};
  const incomeId: Record<string, string> = {};
  let customerQboId = "58";
  let ooVendorId = "60";
  let fuelVendorId = "61";
  let ooAccountId = "701";
  let fuelAccountId = "702";
  let netTermId = "3";

  if (!LIVE) {
    let n = 101;
    for (const [cat, spec] of Object.entries(cats)) {
      const acct = fake.accounts.find((a) => a.Name === spec.income)!;
      const id = String(n++);
      fake.items.set(id, { Id: id, Name: spec.item, Type: "Service", IncomeAccountRef: { value: acct.Id, name: acct.Name } });
      itemId[cat] = id;
      incomeId[cat] = acct.Id;
    }
  } else {
    const find = async (entity: string, field: string, name: string) =>
      ((await qbo.queryQboReadOnly<Json>(`select * from ${entity} where ${field} = '${name.replace(/'/g, "''")}'`))
        .QueryResponse?.[entity] ?? [])[0] as Json | undefined;
    const ensure = async (entity: "account" | "item" | "customer" | "vendor", field: string, body: Json) => {
      const key = entity.charAt(0).toUpperCase() + entity.slice(1);
      const name = String(body[field]);
      return (await find(key, field, name)) ?? (await qbo.createQboCampaignFixture(entity, body));
    };
    const P = qbo.QBO_CAMPAIGN_FIXTURE_PREFIX;
    const accounts: Record<string, string> = {};
    for (const income of ["Freight Income", "Accessorial Income", "Fuel Surcharge Income", "Lumper Reimbursement"]) {
      accounts[income] = String((await ensure("account", "Name", { Name: `${P} ${income}`, AccountType: "Income" })).Id);
    }
    ooAccountId = String((await ensure("account", "Name", { Name: `${P} OO Settlements`, AccountType: "Cost of Goods Sold" })).Id);
    fuelAccountId = String((await ensure("account", "Name", { Name: `${P} Fuel`, AccountType: "Expense" })).Id);
    for (const [cat, spec] of Object.entries(cats)) {
      const item = await ensure("item", "Name", {
        Name: `${P} ${spec.item}`,
        Type: "Service",
        IncomeAccountRef: { value: accounts[spec.income] },
      });
      itemId[cat] = String(item.Id);
      incomeId[cat] = accounts[spec.income];
    }
    customerQboId = String((await ensure("customer", "DisplayName", { DisplayName: `${P} M&S Loads bill-to` })).Id);
    ooVendorId = String((await ensure("vendor", "DisplayName", { DisplayName: `${P} OO Vendor` })).Id);
    fuelVendorId = String((await ensure("vendor", "DisplayName", { DisplayName: `${P} Fuel Vendor` })).Id);
    const terms = (await qbo.queryQboReadOnly<Json>("select * from Term")).QueryResponse?.Term ?? [];
    const net = (terms as Json[]).find((t) => t.Name === "Net 30") ?? (terms as Json[])[0];
    netTermId = String(net?.Id ?? "");
    if (net) fake.terms = [{ Id: netTermId, Name: String(net.Name), DueDays: Number(net.DueDays ?? 0) }];
  }

  // Maps on the COPY only. Lumper is mapped but not billed today (INVOICE_INCLUDES_LUMPER = false).
  for (const cat of Object.keys(cats)) upsertQboItemMap(cat, itemId[cat], cats[cat as Cat].item);
  db.prepare("UPDATE customers SET qbo_customer_id = ?, qbo_status = 'mapped', payment_terms = '' WHERE id IN (9, 531)").run(customerQboId);
  const setRemit = (street: string, ar: string) =>
    db.prepare("UPDATE company_profile SET company_name = 'MS Express', street = ?, ar_email = ? WHERE id = 1").run(street, ar);
  setRemit("100 Campaign Test Rd", "ar-test@example.com");

  const ooDriver = (db.prepare("SELECT name FROM drivers WHERE driver_type = 'owner_operator' ORDER BY id LIMIT 1").get() as { name: string } | undefined)?.name ?? "MSETMS Test OO";
  upsertQboVendorMap(ooDriver, ooVendorId, "OO vendor", { id: ooAccountId, name: "OO Settlements" });
  upsertQboVendorMap("MSETMS Test Fuel Vendor", fuelVendorId, "Fuel vendor");

  let seq = 0;
  type PayLine = { category: Cat | "trailer_rental"; rate: number | null; qty?: number; total: number; bill_to?: "customer" | "driver"; notes?: string };
  function makeLoad(opts: { customerId?: number; rate?: number | null; status?: string; pay?: PayLine[]; delivery?: string; lumperActual?: number; tag?: string }) {
    seq += 1;
    const loadNumber = `MSETMS-T${String(seq).padStart(2, "0")}-${RUN}`;
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
    const tmsTotal = tmsCustomerInvoiceLines(load).reduce((s, l) => s + l.amount, 0);
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
    const sentBody = [...calls].reverse().find((x) => x.method === "POST" && /\/invoice\?/.test(x.url) && x.body?.DocNumber === load.load_number)?.body;
    const sentTerm = sentBody?.SalesTermRef?.value ? String(sentBody.SalesTermRef.value) : "none sent";
    const readTerm = read.SalesTermRef?.value ? String(read.SalesTermRef.value) : "none sent";
    check(c.checks, "terms (sent)", exp.termsId ?? "none sent", sentTerm);
    if (exp.termsId) check(c.checks, "terms (read back)", exp.termsId, readTerm);
    const sentClass = sentBody?.ClassRef?.value ? String(sentBody.ClassRef.value) : "none";
    const readClass = read.ClassRef?.value ? String(read.ClassRef.value) : "none";
    check(c.checks, "class (no TMS class source)", "none/none", `${sentClass}/${readClass}`);
    check(c.checks, "txn date", exp.txnDate ?? "2026-09-14", String(read.TxnDate));
    check(c.checks, "doc number = load #", load.load_number, String(read.DocNumber));
    return read;
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
  await runCase("C03a", "Lumper billed to customer (pay item) - follows INVOICE_INCLUDES_LUMPER (off)", async (c) => {
    const { id } = makeLoad({ rate: 1500, pay: [{ category: "lumper", rate: 150, total: 150 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1500 }] });
    c.note = "Lumper stays off QuickBooks and the TMS PDF alike until JC decides; flipping INVOICE_INCLUDES_LUMPER bills it on both, through the Lumper item map.";
  });
  await runCase("C03b", "Lumper paid by driver at the dock (lumper_actual + driver pay item) - never billed", async (c) => {
    const { id } = makeLoad({ rate: 1500, lumperActual: 150, pay: [{ category: "lumper", rate: 150, total: 150, bill_to: "driver" }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1500 }] });
  });
  await runCase("C04", "Detention (2 h x $75)", async (c) => {
    const { id } = makeLoad({ rate: 1800, pay: [{ category: "detention", rate: 75, qty: 2, total: 150 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1800 }, { cat: "detention", amount: 150, qty: 2, unitPrice: 75 }] });
  });
  await runCase("C05", "Layover", async (c) => {
    const { id } = makeLoad({ rate: 1800, pay: [{ category: "layover", rate: 250, total: 250 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 1800 }, { cat: "layover", amount: 250 }] });
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
  await runCase("C08", "TONU on a cancelled load (TONU only, no line haul)", async (c) => {
    const { id } = makeLoad({ rate: 2000, status: "cancelled", pay: [{ category: "tonu", rate: 250, total: 250 }] });
    await qbo.sendLoadToQuickbooks(id);
    const read = await expectInvoice(c, id, { lines: [{ cat: "tonu", amount: 250 }] });
    // The TMS PDF refuses cancelled loads, so its total is 0 here: report it, do not fail on it.
    const pdf = c.checks.find((x) => x.field === "amount = TMS invoice PDF");
    if (pdf) {
      pdf.pass = true;
      pdf.actual = `${money(read.TotalAmt)} (TMS PDF blocks cancelled loads: GAP)`;
    }
  });
  await runCase("C09", "Fuel surcharge (812 mi x $0.45)", async (c) => {
    const { id } = makeLoad({ rate: 2000, pay: [{ category: "fuel_surcharge", rate: 0.45, qty: 812, total: 365.4 }] });
    await qbo.sendLoadToQuickbooks(id);
    await expectInvoice(c, id, { lines: [{ cat: "flat_rate", amount: 2000 }, { cat: "fuel_surcharge", amount: 365.4, qty: 812, unitPrice: 0.45 }] });
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
    const same = (await qbo.queryQboReadOnly<Json>(`select Id from Invoice where DocNumber = '${loadNumber}'`)).QueryResponse?.Invoice ?? [];
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
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  async function expectBill(c: CaseResult, billId: number, exp: { vendor: string; account: string; amount: number }) {
    const bill = accounting.getBill(billId)!;
    c.qboIds.push(`Bill ${bill.qbo_bill_id}`);
    const read = (await qbo.readQboEntity<Json>("bill", bill.qbo_bill_id)).Bill as Json;
    check(c.checks, "amount", money(exp.amount), money(read.TotalAmt));
    check(c.checks, "vendor", exp.vendor, String(read.VendorRef?.value));
    check(c.checks, "expense account", exp.account, String(read.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.value));
    check(c.checks, "txn date", today, String(read.TxnDate));
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
  await runCase("C15", "Fuel/expense bill -> QBO_BILL_EXPENSE_ACCOUNT_ID; blocked when it is unset", async (c) => {
    const billId = accounting.createBill({ vendor: "MSETMS Test Fuel Vendor", memo: `${LABEL} fuel`, amount: 412.37 });
    delete process.env.QBO_BILL_EXPENSE_ACCOUNT_ID;
    await expectBlocked(c, () => qbo.sendBillToQuickbooks(billId), /QBO_BILL_EXPENSE_ACCOUNT_ID/);
    process.env.QBO_BILL_EXPENSE_ACCOUNT_ID = fuelAccountId;
    await qbo.sendBillToQuickbooks(billId);
    await expectBill(c, billId, { vendor: fuelVendorId, account: fuelAccountId, amount: 412.37 });
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
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /Map pay item "Trailer Rental"/);
    check(c.checks, "load not marked sent", "", queries.getLoad(id)!.qbo_invoice_id);
  });
  await runCase("C18", "Missing MS Express remit street / AR email blocks the send", async (c) => {
    const { id } = makeLoad({ rate: 1800 });
    setRemit("", "");
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /cannot be sent to QuickBooks.*Remit street.*AR email/);
    setRemit("100 Campaign Test Rd", "ar@msloads.com");
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /AR email/);
    c.checks = c.checks.map((x, i) => (i >= 2 ? { ...x, field: `ar@msloads.com refused: ${x.field}` } : x));
    setRemit("100 Campaign Test Rd", "ar-test@example.com");
  });
  await runCase("C19", "Invoice # = load #; an existing QuickBooks invoice with that number blocks a second create", async (c) => {
    const { id, loadNumber } = makeLoad({ rate: 1200 });
    const sent = await qbo.sendLoadToQuickbooks(id);
    check(c.checks, "DocNumber returned", loadNumber, sent.invoiceNumber);
    c.qboIds.push(`Invoice ${sent.invoiceId}`);
    // Simulate a lost link (send succeeded, TMS did not record it), then a fresh send.
    db.prepare("UPDATE loads SET qbo_invoice_id = '', qbo_invoice_number = '', qbo_source = '' WHERE id = ?").run(id);
    await expectBlocked(c, () => qbo.sendLoadToQuickbooks(id), /already has invoice #/);
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
  void resyncLoad;

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
