import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-prepass-api-${Date.now()}.db`);
process.env.TMS_DB_PATH = dbPath;

function clearPrepassEnv(): void {
  delete process.env.PREPASS_CLIENT_ID;
  delete process.env.PREPASS_CLIENT_SECRET;
  delete process.env.PREPASS_ACCOUNT_NUMBER;
  delete process.env.PREPASS_API_KEY;
  delete process.env.PREPASS_TOKEN_URL;
  delete process.env.PREPASS_API_BASE;
  delete process.env.PREPASS_TRANSACTIONS_PATH;
  delete process.env.PREPASS_OAUTH_SCOPE;
}

function setReadyEnv(): void {
  process.env.PREPASS_CLIENT_ID = "test-client-id";
  process.env.PREPASS_CLIENT_SECRET = "test-client-secret-value";
  process.env.PREPASS_ACCOUNT_NUMBER = "445566";
}

const SAMPLE_TX = {
  tollId: 596569591,
  accountNumber: 123456,
  accountName: "Test Trucking Company - Butler, IN",
  postDateTime: "2024-12-01T02:21:01Z",
  invoiceDateTime: "2024-12-31T12:00:00Z",
  deviceNumber: "00409740958",
  vehicleNumber: "26",
  ppDeviceId: "1234567",
  tollAgencyName: "Ohio Turnpike Commission",
  tollAgencyState: "OH",
  exitDateTime: "2024-11-29T03:46:15Z",
  exitDateTimeUtc: "2024-11-29T08:46:15Z",
  exitPlazaName: "Eastgate",
  tollCharge: 8.25,
  tollCategory: "Normal",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function main() {
  clearPrepassEnv();
  const prepass = await import("../lib/prepass-client");

  const missingOauth = prepass.describePrepassPullStatus();
  assert.equal(missingOauth.ready, false);
  assert.match(missingOauth.message, /PREPASS_CLIENT_ID and PREPASS_CLIENT_SECRET are missing/);
  assert.doesNotMatch(missingOauth.message, /payload mapping is not finalized/);

  process.env.PREPASS_CLIENT_ID = "test-client-id";
  process.env.PREPASS_CLIENT_SECRET = "test-client-secret-value";
  const missingAccount = prepass.describePrepassPullStatus();
  assert.equal(missingAccount.ready, false);
  assert.equal(missingAccount.oauthReady, true);
  assert.match(missingAccount.message, /PREPASS_ACCOUNT_NUMBER/);
  assert.doesNotMatch(missingAccount.message, /payload mapping is not finalized/);

  const skipped = await prepass.pullPrepassTransactions();
  assert.equal(skipped.ok, true);
  if (skipped.ok) {
    assert.equal(skipped.rows.length, 0);
    assert.match(skipped.message, /PREPASS_ACCOUNT_NUMBER/);
  }

  setReadyEnv();
  const ready = prepass.describePrepassPullStatus();
  assert.equal(ready.ready, true);
  assert.equal(ready.tone, "ready");
  assert.match(ready.message, /last 14 days/);

  const now = new Date("2026-09-22T16:00:00Z");
  const window = prepass.defaultPostDateWindow(now);
  assert.equal(window.startPostDate, "2026-09-09");
  assert.equal(window.endPostDate, "2026-09-23");
  assert.equal(window.days, 14);
  const max = prepass.postDateWindowEndingOn(now, 90);
  assert.equal(max.days, 31);

  const mapped = prepass.mapPrepassTransaction(SAMPLE_TX);
  assert.ok(mapped);
  assert.equal(mapped?.transponder_id, "00409740958");
  assert.equal(mapped?.unit_number, "26");
  assert.equal(mapped?.plaza, "Eastgate");
  assert.equal(mapped?.state, "OH");
  assert.equal(mapped?.amount, 8.25);
  assert.equal(mapped?.category, "toll");
  assert.equal(mapped?.invoice_number, "596569591");
  assert.equal(mapped?.date, "2024-11-29");

  const bypass = prepass.mapPrepassTransaction({
    ...SAMPLE_TX,
    tollId: 99,
    tollCharge: "5.00",
    tollCategory: "Scale Bypass",
    exitPlazaName: "Weigh station 12",
  });
  assert.equal(bypass?.category, "scale_bypass");
  assert.equal(bypass?.amount, 5);

  const calls: string[] = [];
  const pulled = await prepass.pullPrepassTransactions({
    now,
    fetch: async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/auth/v1/token")) {
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers.client_id, "test-client-id");
        assert.equal(headers.client_secret, "test-client-secret-value");
        const body = String(init?.body ?? "");
        assert.match(body, /grant_type=client_credentials/);
        assert.match(body, /client_id=test-client-id/);
        assert.doesNotMatch(url, /test-client-secret-value/);
        return jsonResponse(200, { token_type: "Bearer", expires_in: 3599, access_token: "test-access-token" });
      }
      assert.match(url, /tolltransaction\/v1\/transactions/);
      assert.match(url, /startPostDate=2026-09-09/);
      assert.match(url, /endPostDate=2026-09-23/);
      assert.match(url, /accountNumbers=445566/);
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer test-access-token");
      return jsonResponse(200, {
        statusCode: 200,
        statusMessage: "OK",
        pageInfo: { pageNumber: 1, pageSize: 10000, totalRecords: 2, totalPages: 1 },
        transactions: [
          SAMPLE_TX,
          { ...SAMPLE_TX, tollId: 596738021, deviceNumber: "UNKNOWN-999", vehicleNumber: "", tollCharge: 9 },
        ],
      });
    },
  });
  assert.equal(pulled.ok, true);
  if (pulled.ok) {
    assert.equal(pulled.rows.length, 2);
    assert.match(pulled.message, /Pulled 2 PrePass rows/);
    assert.doesNotMatch(pulled.message, /test-client-secret-value|test-access-token/);
  }
  assert.equal(calls.length, 2);

  const { getDb, closeDb } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const tolls = await import("../lib/tolls-store");
  const db = getDb();
  const truck = queries.listTrucks()[0];
  const driver = queries.listDrivers().find((item) => item.truck_id === truck.id) ?? queries.listDrivers()[0];
  db.prepare("UPDATE trucks SET prepass_transponder_id = ? WHERE id = ?").run("00409740958", truck.id);
  db.prepare("UPDATE drivers SET truck_id = ?, updated_at = ? WHERE id = ?").run(
    truck.id,
    new Date().toISOString(),
    driver.id,
  );

  const { renderUtf8Csv } = await import("../lib/csv");
  const text = renderUtf8Csv(
    ["Date", "Time", "Transponder ID", "Unit", "Driver Name", "Plaza", "State", "Category", "Amount", "Invoice", "Reference"],
    (pulled.ok ? pulled.rows : []).map((row) => [
      row.date,
      row.time ?? "",
      row.transponder_id,
      row.unit_number ?? "",
      row.driver_name ?? "",
      row.plaza ?? "",
      row.state ?? "",
      row.category,
      String(row.amount),
      row.invoice_number ?? "",
      row.reference_number ?? "",
    ]),
  );
  const stored = tolls.importTollsFromText(text, "prepass-api-test.csv", { sourceKind: "api_pull", provider: "prepass" });
  assert.equal(stored.created, 1, "mapped transponder should assign");
  assert.equal(stored.unmatched, 1, "unknown transponder stays unmatched");
  const matched = tolls.listTollTransactions().find((row) => row.invoice_number === "596569591");
  assert.equal(matched?.driver_id, driver.id);
  assert.equal(matched?.truck_id, truck.id);

  const unauthorized = await prepass.pullPrepassTransactions({
    now,
    fetch: async () => jsonResponse(401, { error: "invalid_client", access_token: "should-not-leak" }),
  });
  assert.equal(unauthorized.ok, false);
  assert.match(unauthorized.error ?? "", /rejected the client credentials/);
  assert.doesNotMatch(JSON.stringify(unauthorized), /should-not-leak|test-client-secret-value/);

  closeDb();
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  console.log("prepass-api-pull-test: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
