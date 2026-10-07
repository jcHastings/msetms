/**
 * Gusto read-only payroll: OAuth state, token privacy, mapping, sync, and driver access.
 * Uses mocked responses shaped like the documented Gusto payloads. No live calls.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-gusto-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.GUSTO_CLIENT_ID = "gusto-test-client";
process.env.GUSTO_CLIENT_SECRET = "gusto-test-secret";
process.env.GUSTO_ENV = "demo";
process.env.GUSTO_REDIRECT_URI = "https://msetms.mandsloads.com/api/integrations/gusto/callback";
process.env.SESSION_SECRET = "gusto-test-session-secret";
delete process.env.TMS_SCRIPT_ACTOR_ROLE;
delete process.env.TMS_SCRIPT_DRIVER_ID;

const COMPANY = "9aa93530-43d5-484e-b608-33214109420d";
const CASEY = "d7282d99-ab6b-42f5-ba45-f4a670e886a8";
const JORDAN = "187412e1-3dbe-491a-bb2f-2f40323a7067";
const PAT = "c1234567-89ab-cdef-0123-456789abcdef";
const NORTHLINE = "bc57832c-d8bc-43a7-ae99-3a03380ff037";
const PAYROLL = "b441a30b-2adb-489e-b7b7-9d094011a3f8";
const PAYMENT = "04552eb9-7829-4b18-ae96-6983552948df";
const ACCESS = "access-token-sentinel-not-for-client";
const REFRESH = "refresh-token-sentinel-not-for-client";
const ACCESS2 = "access-token-refreshed-sentinel";
const REFRESH2 = "refresh-token-refreshed-sentinel";

type Call = { method: string; url: string; body: string; auth: string };
const calls: Call[] = [];
let caseyNet = "1953.31";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function employee(input: { uuid: string; first: string; last: string; email: string }) {
  return {
    uuid: input.uuid,
    first_name: input.first,
    middle_initial: null,
    last_name: input.last,
    email: input.email,
    company_uuid: COMPANY,
    manager_uuid: null,
    version: "a5cec1f1c0135feb3e76ca6ea3c46176",
    terminated: false,
    onboarded: true,
    payment_method: "Direct Deposit",
    jobs: [],
  };
}

function payrollDetail() {
  return {
    uuid: PAYROLL,
    payroll_uuid: PAYROLL,
    company_uuid: COMPANY,
    off_cycle: false,
    processed: true,
    processed_date: "2025-06-16",
    check_date: "2025-06-13",
    pay_period: {
      start_date: "2025-05-25",
      end_date: "2025-06-09",
      pay_schedule_uuid: "40ff5990-0191-4796-9717-32f7dd3e94d5",
    },
    employee_compensations: [
      {
        employee_uuid: CASEY,
        excluded: false,
        first_name: "Casey",
        last_name: "Haul",
        gross_pay: "2791.25",
        net_pay: caseyNet,
        check_amount: caseyNet,
        payment_method: "Direct Deposit",
      },
      {
        employee_uuid: JORDAN,
        excluded: false,
        first_name: "Jordan",
        last_name: "Miles",
        gross_pay: "1800.00",
        net_pay: "1400.50",
        check_amount: "1400.50",
        payment_method: "Direct Deposit",
      },
      {
        employee_uuid: PAT,
        excluded: false,
        first_name: "Pat",
        last_name: "Unmatched",
        gross_pay: "1000.00",
        net_pay: "800.00",
        payment_method: "Check",
      },
      {
        employee_uuid: "skip-me",
        excluded: true,
        gross_pay: "9.00",
        net_pay: "8.00",
        payment_method: "Check",
      },
    ],
  };
}

function mockFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? init.body : "";
  const headers = new Headers(init?.headers);
  calls.push({ method, url, body, auth: headers.get("authorization") ?? "" });
  assert.notEqual(method, "PUT");
  assert.notEqual(method, "PATCH");
  assert.notEqual(method, "DELETE");
  const parsed = new URL(url);
  if (parsed.pathname === "/oauth/token") {
    assert.equal(method, "POST");
    const payload = JSON.parse(body) as { grant_type?: string };
    if (payload.grant_type === "refresh_token") {
      return Promise.resolve(json({ access_token: ACCESS2, refresh_token: REFRESH2, expires_in: 7200, token_type: "bearer" }));
    }
    return Promise.resolve(json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 7200, token_type: "bearer" }));
  }
  assert.equal(method, "GET");
  assert.doesNotMatch(parsed.pathname, /prepare|submit|cancel/);
  const page = Number(parsed.searchParams.get("page") ?? "1");
  if (parsed.pathname === "/v1/token_info") {
    return Promise.resolve(
      json({
        scope: "companies:read employees:read payrolls:read contractors:read pay_stubs:read",
        resource: { type: "Company", uuid: COMPANY },
        resource_owner: { type: "CompanyAdmin", uuid: "367871c2-3f70-4874-adc9-f1736647e8e1" },
      }),
    );
  }
  if (parsed.pathname === `/v1/companies/${COMPANY}/employees`) {
    return Promise.resolve(
      json(
        page > 1
          ? []
          : [
              employee({ uuid: CASEY, first: "Casey", last: "Haul", email: "casey.haul@msexpress.example" }),
              employee({ uuid: JORDAN, first: "Jordan", last: "Miles", email: "" }),
              employee({ uuid: PAT, first: "Pat", last: "Unmatched", email: "pat.unmatched@msexpress.example" }),
            ],
      ),
    );
  }
  if (parsed.pathname === `/v1/companies/${COMPANY}/contractors`) {
    return Promise.resolve(
      json([
        {
          uuid: NORTHLINE,
          company_uuid: COMPANY,
          type: "Business",
          first_name: null,
          last_name: null,
          business_name: "Northline Trucking",
          email: "ap@northline.example",
          is_active: true,
          wage_type: "Fixed",
        },
      ]),
    );
  }
  if (parsed.pathname === `/v1/companies/${COMPANY}/payrolls`) {
    return Promise.resolve(
      json([
        {
          payroll_uuid: PAYROLL,
          company_uuid: COMPANY,
          processed: true,
          check_date: "2025-06-13",
          pay_period: { start_date: "2025-05-25", end_date: "2025-06-09" },
        },
      ]),
    );
  }
  if (parsed.pathname === `/v1/companies/${COMPANY}/payrolls/${PAYROLL}`) {
    return Promise.resolve(json(payrollDetail()));
  }
  if (parsed.pathname === `/v1/companies/${COMPANY}/contractor_payments`) {
    return Promise.resolve(
      json({
        total: { reimbursements: "0.0", wages: "740.00" },
        contractor_payments: [
          {
            contractor_uuid: NORTHLINE,
            reimbursement_total: "0.0",
            wage_total: "740.00",
            payments: [
              {
                uuid: PAYMENT,
                contractor_uuid: NORTHLINE,
                bonus: "0.0",
                date: "2020-10-19",
                hours: "40.0",
                payment_method: "Direct Deposit",
                reimbursement: "0.0",
                hourly_rate: "18.50",
                may_cancel: false,
                status: "Funded",
                wage: "0.0",
                wage_type: "Hourly",
                wage_total: "740.00",
              },
            ],
          },
        ],
      }),
    );
  }
  if (parsed.pathname === `/v1/companies/${COMPANY}`) {
    return Promise.resolve(json({ uuid: COMPANY, name: "MS Express", trade_name: "MS Express" }));
  }
  if (parsed.pathname === `/v1/payrolls/${PAYROLL}/employees/${CASEY}/pay_stub`) {
    return Promise.resolve(new Response("%PDF-1.4 paystub", { status: 200, headers: { "content-type": "application/pdf" } }));
  }
  return Promise.resolve(json({ errors: [{ error_key: "request", category: "not_found", message: "missing" }] }, 404));
}

async function main(): Promise<void> {
  const read = await import("../lib/integrations/gusto-read");
  const gusto = await import("../lib/integrations/gusto");
  const actions = await import("../lib/gusto-actions");
  const dbMod = await import("../lib/db");
  const { VIEW_ONLY_WRITE_MESSAGE } = await import("../lib/settings-shared");
  gusto.setGustoFetchForTests(mockFetch as typeof fetch);

  const source = fs.readFileSync(path.join(process.cwd(), "lib/integrations/gusto.ts"), "utf8");
  assert.equal((source.match(/method:\s*"POST"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /method:\s*"PUT"|method:\s*"PATCH"|method:\s*"DELETE"/);

  const authorize = gusto.buildGustoAuthorizeUrl("state-token-csrf");
  const authorizeUrl = new URL(authorize);
  const scope = authorizeUrl.searchParams.get("scope") ?? "";
  assert.equal(authorizeUrl.host, "api.gusto-demo.com");
  assert.equal(read.authorizeUrlIsReadOnly(authorize), true);
  assert.doesNotMatch(authorize, /client_secret|gusto-test-secret/i);
  assert.match(scope, /employees:read/);
  assert.match(scope, /payrolls:read/);
  assert.match(scope, /pay_stubs:read/);
  assert.match(scope, /contractors:read/);
  assert.doesNotMatch(scope, /:write/);

  const ambiguous = read.planGustoMatches({
    drivers: [{ id: 1, name: "Sam Stone", email: "", companyName: "", driverType: "company_driver" }],
    people: [
      { uuid: "a", kind: "employee", email: "", name: "Sam Stone", matchNames: ["sam stone"], active: true },
      { uuid: "b", kind: "employee", email: "", name: "Sam Stone", matchNames: ["sam stone"], active: true },
    ],
    linkedDriverIds: [],
    linkedGustoUuids: [],
  });
  assert.equal(ambiguous.length, 0);

  await assert.rejects(
    () => gusto.finishGustoOAuth({ expectedState: "expected-state", actualState: "other-state", code: "nope" }),
    /state did not match/,
  );
  assert.equal(calls.length, 0);

  await gusto.finishGustoOAuth({
    expectedState: "expected-state",
    actualState: "expected-state",
    code: "51d5d63ae28783aecd59e7834be2c637a9ee260f241b191565aa10fe380471db",
  });
  const status = gusto.getGustoPublicStatus();
  const publicJson = JSON.stringify(status);
  assert.equal(publicJson.includes(ACCESS), false);
  assert.equal(publicJson.includes(REFRESH), false);
  assert.equal(publicJson.includes("gusto-test-secret"), false);
  assert.equal(status.connected, true);
  assert.equal(status.companyName, "MS Express");
  assert.equal(status.scopeReadOnly, true);
  assert.equal(status.paystubPdfRequiresEmbedded, true);
  const stored = dbMod
    .getDb()
    .prepare("SELECT access_token, refresh_token FROM gusto_connection WHERE id = 1")
    .get() as { access_token: string; refresh_token: string };
  assert.equal(stored.access_token, ACCESS);
  assert.equal(stored.refresh_token, REFRESH);

  const now = new Date().toISOString();
  const insert = dbMod
    .getDb()
    .prepare(
      `INSERT INTO drivers (name, email, driver_type, company_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
  const caseyId = Number(
    insert.run("Casey Haul", "Casey.Haul@MSExpress.example", "company_driver", "", now, now).lastInsertRowid,
  );
  const jordanId = Number(insert.run("Jordan Miles", "", "company_driver", "", now, now).lastInsertRowid);
  const patDriverId = Number(insert.run("Pat Local", "", "company_driver", "", now, now).lastInsertRowid);
  const ooId = Number(
    insert.run("Riley North", "riley@northline.example", "owner_operator", "Northline Trucking", now, now).lastInsertRowid,
  );

  const first = await gusto.syncGusto();
  assert.equal(first.lines, 3);
  const links = gusto.listGustoLinks();
  assert.equal(links.find((link) => link.driver_id === caseyId)?.match_source, "email");
  assert.equal(links.find((link) => link.driver_id === jordanId)?.match_source, "name");
  assert.equal(links.find((link) => link.driver_id === ooId)?.gusto_uuid, NORTHLINE);
  assert.equal(links.some((link) => link.driver_id === patDriverId), false);
  const unmatched = gusto.listGustoPeople().filter((person) => !links.some((link) => link.gusto_uuid === person.uuid));
  assert.equal(unmatched.some((person) => person.uuid === PAT), true);

  const caseyLine = gusto.listGustoPayLinesForDriver(caseyId)[0];
  assert.ok(caseyLine);
  assert.equal(caseyLine.gross_pay, "2791.25");
  assert.equal(caseyLine.net_pay, "1953.31");
  assert.equal(caseyLine.check_date, "2025-06-13");
  assert.equal(caseyLine.pay_period_start, "2025-05-25");
  assert.equal(caseyLine.pay_period_end, "2025-06-09");
  const ooLine = gusto.listGustoPayLinesForDriver(ooId)[0];
  assert.equal(ooLine?.gross_pay, "740.00");
  assert.equal(ooLine?.net_pay, "740.00");
  assert.equal(ooLine?.source, "contractor_payment");
  assert.equal(gusto.listGustoPayLinesForDriver(ooId).some((line) => line.source === "employee_payroll"), false);

  const count = () =>
    (dbMod.getDb().prepare("SELECT COUNT(*) AS count FROM gusto_pay_lines").get() as { count: number }).count;
  assert.equal(count(), 3);
  caseyNet = "2000.00";
  await gusto.syncGusto();
  assert.equal(count(), 3);
  assert.equal(gusto.listGustoPayLinesForDriver(caseyId)[0]?.net_pay, "2000.00");

  gusto.linkGustoDriver({ driverId: jordanId, gustoUuid: PAT });
  const overridden = gusto.listGustoLinks().find((link) => link.driver_id === jordanId);
  assert.equal(overridden?.gusto_uuid, PAT);
  assert.equal(overridden?.match_source, "manual");
  await gusto.syncGusto();
  assert.equal(gusto.listGustoLinks().find((link) => link.driver_id === jordanId)?.gusto_uuid, PAT);
  assert.equal(gusto.listGustoPayLinesForDriver(jordanId)[0]?.net_pay, "800.00");
  gusto.unlinkGustoDriver(patDriverId);
  assert.equal(gusto.listGustoLinks().some((link) => link.driver_id === patDriverId), false);

  process.env.TMS_SCRIPT_ACTOR_ROLE = "viewer";
  for (const fn of [actions.syncGustoAction, actions.disconnectGustoAction]) {
    await assert.rejects(fn, new RegExp(VIEW_ONLY_WRITE_MESSAGE.replace(/[.]/g, "\\.")));
  }
  const form = new FormData();
  form.set("driver_id", String(caseyId));
  form.set("gusto_uuid", CASEY);
  await assert.rejects(() => actions.linkGustoDriverAction(form), /View-only access/);
  await assert.rejects(() => actions.unlinkGustoDriverAction(form), /View-only access/);
  delete process.env.TMS_SCRIPT_ACTOR_ROLE;

  dbMod.getDb().prepare("UPDATE gusto_connection SET access_token_expires_at = ? WHERE id = 1").run("2000-01-01T00:00:00.000Z");
  const beforeRefresh = calls.filter((call) => call.body.includes("refresh_token")).length;
  await gusto.syncGusto();
  const refreshCalls = calls.filter((call) => call.method === "POST" && call.body.includes("refresh_token"));
  assert.equal(refreshCalls.length, beforeRefresh + 1);
  assert.ok(calls.some((call) => call.auth === `Bearer ${ACCESS2}`));

  const listRoute = await import("../app/api/driver/paystubs/route");
  const pdfRoute = await import("../app/api/driver/paystubs/[id]/pdf/route");
  process.env.TMS_SCRIPT_DRIVER_ID = String(caseyId);
  const ownList = await listRoute.GET(new Request("http://localhost/api/driver/paystubs"));
  const ownBody = await ownList.json();
  assert.equal(ownList.status, 200);
  assert.equal(JSON.stringify(ownBody).includes(ACCESS), false);
  assert.equal(JSON.stringify(ownBody).includes(ACCESS2), false);
  assert.equal(JSON.stringify(ownBody).includes(REFRESH), false);
  assert.ok(ownBody.paystubs.every((row: { id: number }) => row.id === caseyLine.id || row.id > 0));
  assert.equal(ownBody.paystubs.some((row: { netPay: string }) => row.netPay === "800.00"), false);

  const foreignList = await listRoute.GET(
    new Request(`http://localhost/api/driver/paystubs?driverId=${jordanId}`),
  );
  assert.equal(foreignList.status, 403);
  const jordanLine = gusto.listGustoPayLinesForDriver(jordanId)[0];
  assert.ok(jordanLine);
  const foreignPdf = await pdfRoute.GET(new Request("http://localhost/api/driver/paystubs/pdf"), {
    params: Promise.resolve({ id: String(jordanLine.id) }),
  });
  assert.equal(foreignPdf.status, 403);
  const ownPdf = await pdfRoute.GET(new Request("http://localhost/api/driver/paystubs/pdf"), {
    params: Promise.resolve({ id: String(gusto.listGustoPayLinesForDriver(caseyId)[0]?.id) }),
  });
  assert.equal(ownPdf.status, 200);
  assert.match(ownPdf.headers.get("content-type") ?? "", /pdf/);
  const pdfText = await ownPdf.text();
  assert.match(pdfText, /^%PDF/);
  assert.equal(pdfText.includes(ACCESS), false);
  assert.equal(pdfText.includes(ACCESS2), false);

  process.env.TMS_SCRIPT_DRIVER_ID = String(ooId);
  const ooPdf = await pdfRoute.GET(new Request("http://localhost/api/driver/paystubs/pdf"), {
    params: Promise.resolve({ id: String(ooLine?.id) }),
  });
  assert.equal(ooPdf.status, 404);

  const writeCalls = calls.filter((call) => call.method !== "GET" && !call.url.includes("/oauth/token"));
  assert.equal(writeCalls.length, 0);
  assert.equal(calls.some((call) => /prepare|\/submit|cancel/.test(call.url)), false);

  console.log(`gusto tests passed (${calls.length} mocked Gusto calls, no write endpoints)`);
}

main()
  .then(() => {
    fs.rmSync(dbPath, { force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
