/**
 * QuickBooks disconnect route and the office Help / Support contact.
 * Unauthenticated GET goes to login. Non-admins do not get a 404.
 * Admin GET confirms and does not revoke. POST revokes through a mock.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfficeSupport } from "../components/office-support";

const ROOT = process.cwd();
const DISCONNECT = "http://localhost:3000/api/integrations/quickbooks/disconnect";

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function csrfFrom(response: Response, html: string): string {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const fromHeader = setCookies
    .map((cookie) => cookie.split(";")[0] ?? "")
    .find((cookie) => cookie.startsWith("tms_qbo_disconnect_csrf="));
  const headerToken = fromHeader?.slice("tms_qbo_disconnect_csrf=".length) ?? "";
  const match = html.match(/name="csrf" value="([a-f0-9]+)"/);
  const htmlToken = match?.[1] ?? "";
  assert.ok(headerToken, "confirm response sets a csrf cookie");
  assert.equal(headerToken, htmlToken, "csrf cookie matches the confirm form");
  return headerToken;
}

async function main(): Promise<void> {
  const source = read("app/api/integrations/quickbooks/disconnect/route.ts");
  assert.match(source, /disconnectQuickbooksAction/);
  assert.doesNotMatch(source, /console\.(log|debug|info|warn|error)/);
  const getFn = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));
  assert.doesNotMatch(getFn, /quickbooksRevoke|disconnectQuickbooks/);
  assert.match(source.slice(source.indexOf("export async function POST")), /quickbooksRevoke\.run/);

  delete process.env.TMS_SCRIPT_ACTOR_ROLE;
  const route = await import("../app/api/integrations/quickbooks/disconnect/route");
  let revokeCalls = 0;
  route.quickbooksRevoke.run = async () => {
    revokeCalls += 1;
  };

  const signedOut = await route.GET(new Request(DISCONNECT));
  assert.ok(signedOut.status >= 300 && signedOut.status < 400, `signed-out status ${signedOut.status}`);
  const loginLocation = signedOut.headers.get("location") ?? "";
  assert.match(loginLocation, /\/login/);
  assert.match(decodeURIComponent(loginLocation), /\/api\/integrations\/quickbooks\/disconnect/);
  assert.equal(revokeCalls, 0, "signed-out GET does not revoke");

  process.env.TMS_SCRIPT_ACTOR_ROLE = "accounting";
  const accounting = await route.GET(new Request(DISCONNECT));
  assert.notEqual(accounting.status, 404, "accounting must not 404");
  assert.equal(accounting.status, 403);
  const accountingHtml = await accounting.text();
  assert.match(accountingHtml, /do not have access/i);
  assert.equal(revokeCalls, 0, "non-admin GET does not revoke");

  process.env.TMS_SCRIPT_ACTOR_ROLE = "dispatcher";
  const dispatcher = await route.GET(new Request(DISCONNECT));
  assert.notEqual(dispatcher.status, 404, "dispatcher must not 404");
  assert.equal(dispatcher.status, 403);

  process.env.TMS_SCRIPT_ACTOR_ROLE = "viewer";
  const viewer = await route.GET(new Request(DISCONNECT));
  assert.notEqual(viewer.status, 404, "viewer must not 404");
  assert.equal(viewer.status, 403);

  process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";
  const confirm = await route.GET(new Request(DISCONNECT));
  assert.equal(confirm.status, 200);
  const confirmHtml = await confirm.text();
  assert.match(confirmHtml, /data-qbo-disconnect-confirm/);
  assert.match(confirmHtml, /Confirm disconnect/);
  assert.match(confirmHtml, /method="post"/);
  assert.equal(revokeCalls, 0, "admin GET confirms without revoking");
  const token = csrfFrom(confirm, confirmHtml);

  const missingCsrf = await route.POST(
    new Request(DISCONNECT, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: new URLSearchParams({ csrf: token }),
    }),
  );
  assert.equal(missingCsrf.status, 403);
  assert.equal(revokeCalls, 0, "POST without the csrf cookie does not revoke");

  const crossSite = await route.POST(
    new Request(DISCONNECT, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: `tms_qbo_disconnect_csrf=${token}`,
      },
      body: new URLSearchParams({ csrf: token }),
    }),
  );
  assert.equal(crossSite.status, 403);
  assert.equal(revokeCalls, 0, "cross-site POST does not revoke");

  const revoked = await route.POST(
    new Request(DISCONNECT, {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: `tms_qbo_disconnect_csrf=${token}`,
      },
      body: new URLSearchParams({ csrf: token }),
    }),
  );
  assert.equal(revokeCalls, 1, "same-origin POST revokes via the mock");
  assert.equal(revoked.status, 303);
  const landed = revoked.headers.get("location") ?? "";
  assert.match(landed, /\/settings\/quickbooks/);
  assert.match(landed, /disconnected=1/);

  const settings = read("app/settings/quickbooks/page.tsx");
  assert.match(settings, /Disconnected from QuickBooks/);
  assert.match(settings, /OfficeSupport/);
  const shell = read("components/app-shell.tsx");
  assert.match(shell, /<OfficeSupport/);

  for (const tone of ["sidebar", "page"] as const) {
    const html = renderToStaticMarkup(createElement(OfficeSupport, { tone }));
    assert.match(html, /data-office-support/);
    assert.match(html, /Help \/ Support/);
    assert.match(html, /MS Express/);
    assert.match(html, /href="tel:\+14023020097"/);
    assert.match(html, /402-302-0097/);
    assert.match(html, /href="mailto:info@msloads.com"/);
    assert.match(html, /info@msloads.com/);
    assert.doesNotMatch(html, /dispatch@/i);
    assert.doesNotMatch(html, /M&S Loads|brokerage|USDOT|MC 056299|ar@msloads\.com/i);
  }

  console.log("qbo disconnect and support contact ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
