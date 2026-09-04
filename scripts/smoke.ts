import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-smoke-${Date.now()}.db`);
process.env.TMS_DB_PATH = dbPath;

async function main() {
  assert.equal(fs.existsSync(path.join(process.cwd(), "SHIPPED.md")), true, "SHIPPED.md checklist");
  const navSource = fs.readFileSync(path.join(process.cwd(), "components/nav-links.tsx"), "utf8");
  assert.match(navSource, /Import loads/);
  assert.match(navSource, /\/loads\/import-sheet/);
  assert.match(navSource, /label: "Safety"/);
  assert.match(navSource, /\/safety/);
  assert.doesNotMatch(navSource, /CSA|hazmat|passport|FAST card/);
  assert.match(navSource, /href: "\/locations"/);
  assert.match(navSource, /label: "Locations"/);
  assert.match(navSource, /href: "\/search"/);
  assert.match(navSource, /label: "Search"/);
  assert.match(navSource, /label: "Workbench"/);
  assert.match(navSource, /href: "\/desk"/);
  assert.doesNotMatch(navSource, /label: "Dashboard"/);
  assert.match(navSource, /href: "\/control"/);
  assert.match(navSource, /Control Center/);
  assert.match(navSource, /title: "Accounting"/);
  assert.match(navSource, /href: "\/accounting"/);
  assert.match(navSource, /AR\/AP Report/);
  assert.match(navSource, /Invoices\/Bills/);
  assert.doesNotMatch(navSource, /Invoices \(AR\)|Bills \(AP\)/);
  assert.match(navSource, /Driver Pay Mgt/);
  assert.match(navSource, /href: "\/accounting\/pay"/);
  assert.match(navSource, /Commissions/);
  assert.match(navSource, /QuickBooks/);
  assert.match(navSource, /href: "\/compliance"/);
  assert.match(navSource, /href: "\/fuel"/);
  assert.match(navSource, /label: "Fuel"/);
  assert.match(navSource, /href: "\/ifta"/);
  assert.match(navSource, /label: "IFTA"/);
  assert.match(navSource, /href: "\/loads\/templates"/);
  assert.match(navSource, /href: "\/settings"/);
  assert.match(navSource, /href: "\/users"/);
  assert.match(navSource, /href: "\/claims"/);
  assert.doesNotMatch(navSource, /href: "\/reports", label: "Claims"|href: "\/claims".*\/reports/);
  assert.match(navSource, /data-nav-href=\{item\.href\}/);
  assert.match(navSource, /isDeskNavActive/);
  assert.match(navSource, /prefetch=\{item\.href === "\/claims"/);
  const { isDeskNavActive } = await import("../lib/desk-nav-shared");
  assert.equal(isDeskNavActive("/claims", "/claims"), true);
  assert.equal(isDeskNavActive("/claims", "/reports"), false);
  assert.equal(isDeskNavActive("/reports", "/reports"), true);
  assert.equal(isDeskNavActive("/reports", "/reports/manage"), false);
  assert.equal(isDeskNavActive("/reports", "/reports/statistics"), false);
  assert.equal(isDeskNavActive("/reports/manage", "/reports/manage"), true);
  assert.equal(isDeskNavActive("/reports/statistics", "/reports/statistics"), true);
  assert.equal(isDeskNavActive("/accounting/pay", "/accounting/pay"), true);
  assert.equal(isDeskNavActive("/accounting", "/accounting/pay"), false);
  const { DESK_NAV_ACCORDION, deskNavSectionForPath, nextDeskNavOpenSection } = await import("../lib/desk-nav-shared");
  assert.equal(DESK_NAV_ACCORDION, "single");
  let accordionOpen: string | null = null;
  for (const parent of ["Dispatch", "Fleet", "Customers", "Accounting", "Reports", "Settings"] as const) {
    accordionOpen = nextDeskNavOpenSection(accordionOpen, parent);
    assert.equal(accordionOpen, parent, "only the last clicked parent stays open");
  }
  accordionOpen = nextDeskNavOpenSection(accordionOpen, "Settings");
  assert.equal(accordionOpen, null, "clicking the open parent collapses all");
  assert.equal(
    deskNavSectionForPath("/accounting/pay", [
      { title: "Fleet", items: [{ href: "/fleet" }] },
      { title: "Accounting", items: [{ href: "/accounting/pay" }] },
    ]),
    "Accounting",
  );
  assert.equal(nextDeskNavOpenSection(null, "Accounting"), "Accounting");
  assert.equal(nextDeskNavOpenSection("Accounting", "Fleet"), "Fleet");
  assert.equal(nextDeskNavOpenSection("Accounting", "Accounting"), null);
  assert.equal(
    deskNavSectionForPath("/reports/manage", [
      { title: "Fleet", items: [{ href: "/fleet" }] },
      { title: "Reports", items: [{ href: "/reports" }, { href: "/reports/manage" }] },
    ]),
    "Reports",
  );
  assert.match(navSource, /nextDeskNavOpenSection/);
  assert.match(navSource, /DESK_NAV_ACCORDION/);
  assert.match(navSource, /aria-expanded/);
  assert.doesNotMatch(navSource, /Set<string>|openSections/);
  assert.match(navSource, /kind: "link"/);
  assert.match(navSource, /title: "Reports"/);
  assert.match(navSource, /title: "Settings"/);
  const reportsNavBlock = navSource.slice(navSource.indexOf('title: "Reports"'), navSource.indexOf('title: "Settings"'));
  assert.doesNotMatch(reportsNavBlock, /href: "\/users"/);
  assert.doesNotMatch(reportsNavBlock, /href: "\/settings"/);
  const settingsNavBlock = navSource.slice(navSource.indexOf('title: "Settings"'));
  assert.match(settingsNavBlock, /href: "\/settings"/);
  assert.match(settingsNavBlock, /href: "\/users"/);
  assert.match(settingsNavBlock, /href: "\/settings\/sign-in"/);
  assert.match(settingsNavBlock, /Sign-in log/);
  assert.equal(
    deskNavSectionForPath("/users", [
      { title: "Reports", items: [{ href: "/reports" }, { href: "/claims" }] },
      { title: "Settings", items: [{ href: "/settings" }, { href: "/users" }] },
    ]),
    "Settings",
  );
  assert.equal(
    deskNavSectionForPath("/settings/company", [
      { title: "Reports", items: [{ href: "/reports" }] },
      { title: "Settings", items: [{ href: "/settings" }, { href: "/users" }] },
    ]),
    "Settings",
  );
  assert.match(navSource, /\{open \?/);
  assert.doesNotMatch(navSource, /LTL Orders|Find New Shippers|EDI \/ Tenders|AscendAI Load/);
  const claimsPage = fs.readFileSync(path.join(process.cwd(), "app/claims/page.tsx"), "utf8");
  assert.match(claimsPage, /data-claims-desk/);
  assert.match(claimsPage, /Claims \/ OS&D/);
  assert.doesNotMatch(claimsPage, /redirect\(/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/claims/layout.tsx"), "utf8"), /canWriteDesk/);
  assert.match(navSource, /label: "Users"/);
  assert.match(navSource, /href: "\/audit"/);
  assert.match(navSource, /label: "Audit"/);
  assert.match(navSource, /href: "\/fleet\/samsara"/);
  assert.match(navSource, /label: "Samsara"/);
  assert.match(navSource, /href: "\/fleet\/orbcomm"/);
  assert.match(navSource, /label: "Orbcomm"/);
  assert.match(navSource, /href: "\/reports\/manage"/);
  assert.match(navSource, /href: "\/reports\/statistics"/);
  const { loadStatusBand, loadStatusBadgeClass, loadStatusRowClass } = await import("../lib/load-status-style");
  const { LOAD_STATUSES } = await import("../lib/types");
  assert.equal(loadStatusBand("available"), "needs_work");
  assert.equal(loadStatusBand("hold"), "needs_work");
  assert.equal(loadStatusBand("assigned"), "pipeline");
  assert.equal(loadStatusBand("in_transit"), "pipeline");
  assert.equal(loadStatusBand("delivered"), "done");
  assert.equal(loadStatusBand("cancelled"), "done");
  assert.equal(loadStatusBand("tonu"), "done");
  assert.match(loadStatusBadgeClass("available"), /status-tone-slate/);
  assert.doesNotMatch(loadStatusBadgeClass("assigned"), /status-tone-warning|amber/);
  assert.match(loadStatusBadgeClass("assigned"), /status-tone-navy/);
  assert.match(loadStatusBadgeClass("delivered"), /status-tone-success/);
  assert.match(loadStatusRowClass("available"), /inset_3px/);
  assert.match(loadStatusRowClass("in_transit"), /inset_3px/);
  assert.ok(LOAD_STATUSES.every((status) => loadStatusBadgeClass(status) && loadStatusRowClass(status)));
  assert.equal(LOAD_STATUSES.includes("tonu" as (typeof LOAD_STATUSES)[number]), false);
  const boardUi = fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8");
  const dashUiStatus = fs.readFileSync(path.join(process.cwd(), "app/desk/page.tsx"), "utf8");
  const {
    loadMatchesListQuery,
    parseLoadListTab,
    filtersForLoadListTab,
    listFiltersForBoardStatus,
    LOAD_LIST_TABS,
  } = await import("../lib/load-list-shared");
  assert.equal(parseLoadListTab(""), "active");
  assert.equal(parseLoadListTab("planning"), "planning");
  assert.equal(parseLoadListTab("accounting"), "accounting");
  assert.equal(parseLoadListTab("misc"), "misc");
  assert.equal(parseLoadListTab("mine"), "mine");
  assert.equal(parseLoadListTab("master"), "master");
  assert.equal(parseLoadListTab("all"), "all");
  assert.deepEqual(
    LOAD_LIST_TABS.map((tab) => tab.value),
    ["active", "planning", "accounting", "misc", "all", "mine", "master"],
  );
  assert.equal(filtersForLoadListTab("mine", { dispatcherId: 7 }).dispatcherId, 7);
  assert.equal(filtersForLoadListTab("mine", {}).dispatcherId, -1);
  assert.equal(filtersForLoadListTab("master").masterOnly, true);
  assert.equal(filtersForLoadListTab("accounting").status, "accounting");
  assert.equal(listFiltersForBoardStatus("in_transit").status, "in_transit");
  assert.equal(listFiltersForBoardStatus("available").status, "available");
  assert.equal(listFiltersForBoardStatus("planning").status, "planning");
  assert.equal(listFiltersForBoardStatus("").status, "active");
  assert.equal(
    loadMatchesListQuery(
      {
        load_number: "52309",
        customer_name: "NOAH'S ARK PROCESSORS",
        origin: "Hastings, NE",
        destination: "Bronx, NY",
        reference_number: "0817-19E SAMPLE",
      },
      "sample",
    ),
    true,
  );
  assert.equal(
    loadMatchesListQuery(
      { load_number: "1006149", customer_name: "M & S Loads", origin: "Avenel, NJ", destination: "Hastings, NE" },
      "bronx",
    ),
    false,
  );
  assert.match(boardUi, /data-load-search|BoardFilterRow|haystack/);
  assert.match(boardUi, /listLoads\(listFiltersForBoardStatus/);
  assert.match(boardUi, /getSignedInDispatcher/);
  assert.match(boardUi, /BoardWhenCell/);
  assert.match(boardUi, /formatBoardDateTime/);
  assert.match(boardUi, /board-when-cell/);
  assert.match(boardUi, /status === "accounting" \|\| loadShowsOnDispatchBoard/);
  assert.match(boardUi, /loadShowsOnDispatchBoard/);
  assert.match(boardUi, /data-dispatch-board/);
  assert.match(boardUi, /table-grid-board/);
  assert.match(boardUi, /board-edit-cell/);
  assert.match(boardUi, /Promise\.all\(\[getReeferSnapshots\(\), getSamsaraFleet\(\)\]\)/);
  assert.match(boardUi, /<Suspense/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/orbcomm/page.tsx"), "utf8"), /redirect\("\/fleet\/orbcomm"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/loading.tsx"), "utf8"), /data-board-loading/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /board-edit-cell/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-badges.tsx"), "utf8"), /board-place-line/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/fleet-badges.tsx"), "utf8"), /max-w-\[8\.5rem\]/);
  const trailerBadge = fs.readFileSync(path.join(process.cwd(), "components/fleet-badges.tsx"), "utf8");
  assert.match(trailerBadge, /board-place-with-pin/);
  assert.match(trailerBadge, /data-board-trailer-city/);
  assert.match(trailerBadge, /loadMapPinIconUrl/);
  assert.match(boardUi, /board-trailer-cell/);
  assert.match(boardUi, />Tractor</);
  assert.match(boardUi, />Trailer</);
  assert.match(boardUi, />HOS</);
  assert.match(boardUi, />Reefer</);
  assert.match(boardUi, /Change unit|Assign/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/search/page.tsx"), "utf8"), /criteriaFromSearchParams/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-search.tsx"), "utf8"), /initialCriteria/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/page.tsx"), "utf8"), /truckUnitForDriver/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map.ts"), "utf8"), /samsaraTruckPinStyle\(\{ speedMph: location\.speedMph, engineOn: location\.engineOn \}\)/);
  assert.doesNotMatch(boardUi, /Find New Shippers|EDI \/ Tenders|Post\/Search Load Boards/);
  const boardToolbar = fs.readFileSync(path.join(process.cwd(), "components/board-toolbar.tsx"), "utf8");
  assert.match(boardToolbar, /Search loads on this tab/);
  assert.match(boardToolbar, /LOAD_LIST_TABS/);
  assert.match(boardToolbar, /load-list-tabs/);
  assert.match(boardToolbar, /Load Manager tabs/);
  assert.doesNotMatch(boardToolbar, /AscendLTL|Externally Posted|AscendAI|Post Loads/);
  const loadListShared = fs.readFileSync(path.join(process.cwd(), "lib/load-list-shared.ts"), "utf8");
  assert.match(loadListShared, /Planning Loads/);
  assert.match(loadListShared, /Ready for Accounting Loads/);
  assert.match(loadListShared, /Misc\. Loads/);
  assert.match(loadListShared, /My Loads/);
  assert.match(loadListShared, /Master Loads/);
  assert.doesNotMatch(loadListShared, /AscendLTL|Externally Posted|Post Loads/);
  assert.match(boardUi, /loadStatusRowClass\(load\.status\)/);
  assert.match(dashUiStatus, /loadStatusRowClass\(load\.status\)/);
  const tabSource = fs.readFileSync(path.join(process.cwd(), "lib/load-tabs.ts"), "utf8");
  assert.match(tabSource, /basics/);
  assert.match(tabSource, /financials/);
  const { parseLoadTab, confirmationPacketForTab, confirmationDownloadLabel } = await import("../lib/load-tabs");
  assert.equal(parseLoadTab("history"), "log");
  assert.equal(parseLoadTab("timeline"), "log");
  assert.equal(parseLoadTab("documents"), "docs");
  assert.equal(parseLoadTab("carrier"), "assets");
  assert.equal(parseLoadTab("tracking"), "assets");
  assert.equal(parseLoadTab(""), "basics");
  assert.equal(confirmationPacketForTab("customer"), "customer");
  assert.equal(confirmationPacketForTab("financials"), "internal");
  assert.equal(confirmationPacketForTab("assets"), "internal");
  assert.equal(confirmationPacketForTab("basics"), "internal");
  assert.equal(confirmationPacketForTab("stops"), "internal");
  assert.equal(confirmationPacketForTab("log"), "internal");
  assert.equal(confirmationPacketForTab("docs"), "internal");
  assert.equal(
    confirmationDownloadLabel("MSE-1067", "internal"),
    "Download MSE-1067 driver confirmation",
  );
  assert.equal(
    confirmationDownloadLabel("MSE-1067", "customer"),
    "Download MSE-1067 customer confirmation",
  );
  assert.doesNotMatch(confirmationDownloadLabel("MSE-1067", "internal"), /106361|broker/);
  const confirmationLinkSource = fs.readFileSync(path.join(process.cwd(), "components/load-confirmation-link.tsx"), "utf8");
  assert.match(confirmationLinkSource, /confirmationPacketForTab/);
  assert.match(confirmationLinkSource, /confirmationDownloadLabel/);
  assert.match(confirmationLinkSource, /data-confirmation-packet/);
  assert.doesNotMatch(confirmationLinkSource, /customer_reference/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-workspace.tsx"), "utf8"), /header/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /header=\{/);
  const loadPage = fs.readFileSync(path.join(process.cwd(), "app/loads/[id]/page.tsx"), "utf8");
  assert.match(loadPage, /LoadEditor/);
  assert.match(loadPage, /searchParams/);
  const editorSource = fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8");
  assert.match(editorSource, /LoadWorkspace/);
  assert.match(editorSource, /LoadRelaysPanel/);
  const relayPanelSource = fs.readFileSync(path.join(process.cwd(), "components/load-relays-panel.tsx"), "utf8");
  assert.match(relayPanelSource, /\+ Add Relay/);
  assert.doesNotMatch(relayPanelSource, /Internal handoff|Not billed/);
  assert.match(relayPanelSource, /Driver A/);
  assert.match(relayPanelSource, /Driver B/);
  assert.match(relayPanelSource, /Relay point/);
  assert.doesNotMatch(relayPanelSource, /Save leg|Internal OO %|name="pickup"|blank waiting/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /\+1 relay|relayLabels/);
  const qboSettingsPage = fs.readFileSync(path.join(process.cwd(), "app/settings/quickbooks/page.tsx"), "utf8");
  assert.match(qboSettingsPage, /Connect QuickBooks/);
  assert.match(qboSettingsPage, /Not connected/);
  assert.doesNotMatch(qboSettingsPage, /QBO_CLIENT_ID|Setup steps|<code>\.env/);
  assert.doesNotMatch(qboSettingsPage, /Send to QuickBooks|Record demo invoice/);
  const qboAccountingPage = fs.readFileSync(path.join(process.cwd(), "app/accounting/quickbooks/page.tsx"), "utf8");
  assert.match(qboAccountingPage, /Needs QBO customer/);
  assert.match(qboAccountingPage, /Map Pay Items/);
  assert.match(qboAccountingPage, /Map Customers/);
  assert.match(qboAccountingPage, /Map Vendors/);
  assert.match(qboAccountingPage, /QuickBooks Online Connection Enabled/);
  assert.match(qboAccountingPage, /Disconnect From QuickBooks/);
  assert.match(qboAccountingPage, /QuickBooks Desktop/);
  assert.match(qboAccountingPage, /hubTabClass|hub-tab-active/);
  assert.doesNotMatch(qboAccountingPage, /Ready to invoice|Already sent/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /a\.hub-tab-active/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /acct-hub-tabs/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /table-grid-acct/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /color: #ffffff !important/);
  const invoicesHub = fs.readFileSync(path.join(process.cwd(), "app/accounting/invoices/page.tsx"), "utf8");
  assert.match(invoicesHub, /AccountingHub/);
  const attachmentRoute = fs.readFileSync(path.join(process.cwd(), "app/api/attachments/[id]/route.ts"), "utf8");
  assert.match(attachmentRoute, /regenerateMissingAttachment/);
  assert.match(attachmentRoute, /This file is no longer on this computer/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/regenerate-attachment.ts"), "utf8"), /buildTmsInvoice/);
  const invoiceExportRoute = fs.readFileSync(path.join(process.cwd(), "app/api/loads/[id]/invoice/route.ts"), "utf8");
  assert.match(invoiceExportRoute, /export async function GET/);
  assert.match(invoiceExportRoute, /export async function POST/);
  assert.doesNotMatch(invoiceExportRoute, /serveGeneratedInvoice/);
  const invoiceExportGet = invoiceExportRoute.slice(
    invoiceExportRoute.indexOf("export async function GET"),
    invoiceExportRoute.indexOf("export async function POST"),
  );
  const invoiceExportPost = invoiceExportRoute.slice(invoiceExportRoute.indexOf("export async function POST"));
  assert.match(invoiceExportGet, /listAttachments/);
  assert.match(invoiceExportGet, /kind === "invoice"/);
  assert.match(invoiceExportGet, /Create or Rebuild invoice first/);
  assert.doesNotMatch(invoiceExportGet, /createTmsInvoice/);
  assert.match(invoiceExportPost, /createTmsInvoice/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/loads/[id]/confirmation/route.ts"), "utf8"), /This file is no longer on this computer/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/fleet-docs/[id]/route.ts"), "utf8"), /This file is no longer on this computer/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/view-invoice-button.tsx"), "utf8"), /\/api\/loads\/\$\{loadId\}\/invoice/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/accounting-desk-shared.ts"), "utf8"), /Reconcile and Archive/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/accounting-desk-shared.ts"), "utf8"), /Search Archived Loads/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/accounting-desk-shared.ts"), "utf8"), /Driver Pay Mgmt/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/accounting-desk-shared.ts"), "utf8"), /Approve Load Pay Items for Driver Pay/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/accounting/bills/page.tsx"), "utf8"), /tab=bills/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/accounting-desk.ts"), "utf8"), /sendLoadToAccounting/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/accounting-desk.ts"), "utf8"), /status = 'accounting'/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/integrations/quickbooks/connect/route.ts"), "utf8"), /isQuickbooksOAuthReady/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/integrations/quickbooks/connect/route.ts"), "utf8"), /browserUrl/);
  const qboCallback = fs.readFileSync(path.join(process.cwd(), "app/api/integrations/quickbooks/callback/route.ts"), "utf8");
  assert.match(qboCallback, /browserUrl/);
  assert.doesNotMatch(qboCallback, /incoming\.origin/);
  assert.match(fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8"), /QBO_REDIRECT_URI=/);
  const { browserOrigin, browserUrl } = await import("../lib/http-origin");
  const listenRequest = new Request("http://0.0.0.0:3000/api/integrations/quickbooks/callback?connected=1");
  assert.equal(browserOrigin(listenRequest), "http://localhost:3000");
  assert.equal(browserUrl("/settings/quickbooks", listenRequest).href, "http://localhost:3000/settings/quickbooks");
  assert.doesNotMatch(browserUrl("/settings/quickbooks?connected=1", listenRequest).href, /0\.0\.0\.0/);
  const hostRequest = new Request("http://0.0.0.0:3000/api/integrations/quickbooks/callback", {
    headers: { host: "localhost:3000" },
  });
  assert.equal(browserOrigin(hostRequest), "http://localhost:3000");
  const forwarded = new Request("http://0.0.0.0:3000/api/integrations/quickbooks/callback", {
    headers: { "x-forwarded-host": "desk.local:3000", "x-forwarded-proto": "https" },
  });
  assert.equal(browserOrigin(forwarded), "https://desk.local:3000");
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "lib/env.ts"), "utf8"),
    /http:\/\/localhost:3000\/api\/integrations\/quickbooks\/callback/,
  );
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/security/page.tsx"), "utf8"), /2-step verification/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/totp-setup-panel.tsx"), "utf8"), /Set up 2-step/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/totp-setup-panel.tsx"), "utf8"), /Require 2-step for all dispatchers/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /email_code/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Sign-in code/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Resend code/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /name="password"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /name="email"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Sign in with email/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /No email on your user\? Sign in with your name/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /PasswordField/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Forgot password/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /remember_device/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Remember this device for 30 days/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /recovery_code|Authenticator code|name="pin"|Demo PIN/);
  const passwordField = fs.readFileSync(path.join(process.cwd(), "components/password-field.tsx"), "utf8");
  assert.match(passwordField, /Show password/);
  assert.match(passwordField, /Hide password/);
  assert.match(passwordField, /visible \? "Hide password" : "Show password"/);
  assert.match(passwordField, /type=\{visible \? "text" : "password"\}/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/driver-login-form.tsx"), "utf8"), /PasswordField|Show password|remember_device|Remember this device/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-reset-form.tsx"), "utf8"), /PasswordField/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-change-password-form.tsx"), "utf8"), /PasswordField/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /password-field-toggle/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /remember-device/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /\.field \.password-field input/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /password-field-toggle \{[\s\S]*min-height: 2\.75rem/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/shell-switch.tsx"), "utf8"), /pathname.startsWith\("\/login\/"\)/);
  const driverLoginPage = fs.readFileSync(path.join(process.cwd(), "app/driver/login/page.tsx"), "utf8");
  assert.doesNotMatch(driverLoginPage, /totp|authenticator|email_code/i);
  assert.doesNotMatch(driverLoginPage, /Demo PINs|Denise Ortega|1125|Marcus Hale/);
  assert.match(driverLoginPage, /listDriversForLogin/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-form.tsx"), "utf8"), /name="pin"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/format.ts"), "utf8"), /parseDriverPin/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/queries.ts"), "utf8"), /listDriversForLogin/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8"), /backfillDemoPins|backfillDemoDriverCompliance/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/seed.ts"), "utf8"), /driverCount > 0/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/totp-setup-panel.tsx"), "utf8"), /from \"@\/lib\/db\"|from \"@\/lib\/settings\"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/totp.ts"), "utf8"), /otpauth/);
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/ms-express-logo.png")), true, "default MS Express logo");
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/ms-express-logo-on-dark.png")), true, "transparent on-dark logo");
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/next.svg")), false);
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/vercel.svg")), false);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/brand-mark.tsx"), "utf8"), /MS Express TMS/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/brand-mark.tsx"), "utf8"), /ms-express-logo-on-dark\.png/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/brand-mark.tsx"), "utf8"), /rounded-md bg-white/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/login-canvas.tsx"), "utf8"), /BrandMark/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /LoginCanvas/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /email and password/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Forgot password/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /Ana G|Demo PIN|4020|4410/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/forgot/page.tsx"), "utf8"), /Forgot password/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/reset/page.tsx"), "utf8"), /Set password/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/app-shell.tsx"), "utf8"), /BrandMark/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-confirmation.ts"), "utf8"), /companyLogoPath/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /MSE Transport/);
  assert.match(tabSource, /Load Basics/);
  assert.match(tabSource, /Customer Info/);
  assert.match(tabSource, /Carrier and Driver Info/);
  assert.match(tabSource, /Edit Stops/);
  assert.match(tabSource, /Financials/);
  const workspaceSource = fs.readFileSync(path.join(process.cwd(), "components/load-workspace.tsx"), "utf8");
  assert.match(workspaceSource, /Close/);
  assert.match(workspaceSource, /data-load-overlay-close/);
  assert.match(workspaceSource, /closeLoadOverlay/);
  assert.match(workspaceSource, /event\.key !== "Escape"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-overlay.tsx"), "utf8"), /LoadOverlayFrame/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-overlay.tsx"), "utf8"), /LoadOverlayPortal/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-overlay-portal.tsx"), "utf8"), /createPortal/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-overlay-portal.tsx"), "utf8"), /document\.body/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-overlay-frame.tsx"), "utf8"), /ms-open-load/);
  assert.match(workspaceSource, /Load Actions/);
  assert.match(workspaceSource, /load-tabs/);
  assert.match(workspaceSource, /load-tab-active/);
  assert.match(workspaceSource, /load-actions/);
  assert.match(workspaceSource, /load-action-btn/);
  assert.match(workspaceSource, /load-action-menu/);
  assert.match(workspaceSource, /load-tab-back/);
  assert.match(workspaceSource, /load-workspace/);
  const cssSource = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(cssSource, /\.load-tabs/);
  assert.match(cssSource, /\.load-tab-active/);
  assert.match(cssSource, /\.load-actions/);
  assert.match(cssSource, /\.desk-sidebar/);
  assert.match(cssSource, /\.desk-nav-link-active/);
  assert.match(cssSource, /\.login-canvas/);
  assert.match(cssSource, /--r-xs: 2px/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map-shared.ts"), "utf8"), /M7 1\.2 L12\.6 12\.6 L7 10\.2 L1\.4 12\.6 Z/);
  assert.match(cssSource, /#07325a/);
  assert.match(cssSource, /#137cdd/);
  assert.doesNotMatch(cssSource, /#d4a017|#b8860b|#f3d27a|#f3e6b8/);
  assert.match(cssSource, /\[data-load-list-chrome\]/);
  assert.match(cssSource, /\.load-workspace \.field/);
  assert.match(cssSource, /\.load-workspace \.btn/);
  assert.match(cssSource, /\.stop-row-pickup/);
  assert.match(cssSource, /\.stop-chip-delivery/);
  assert.match(cssSource, /\.finance-income/);
  assert.match(cssSource, /\.finance-head/);
  assert.match(cssSource, /\[aria-disabled="true"\]/);
  assert.match(cssSource, /\.section-head/);
  assert.match(cssSource, /\.stop-row-delivery/);
  assert.match(cssSource, /\.note-public/);
  assert.match(cssSource, /\.note-private/);
  assert.match(cssSource, /\.load-docs-actions/);
  assert.match(navSource, /desk-nav-section/);
  assert.match(navSource, /desk-nav-link-active/);
  const shellSource = fs.readFileSync(path.join(process.cwd(), "components/app-shell.tsx"), "utf8");
  assert.match(shellSource, /desk-sidebar/);
  assert.match(shellSource, /w-60/);
  assert.match(shellSource, /overflow-x-hidden/);
  assert.match(shellSource, /desk-sidebar-user/);
  assert.match(shellSource, /desk-phone-bar/);
  assert.match(shellSource, /desk-phone-menu/);
  assert.match(shellSource, /desk-phone-signout/);
  assert.match(shellSource, /dispatcherLogoutAction/);
  assert.match(shellSource, /h-dvh/);
  assert.match(cssSource, /desk-phone-signout/);
  assert.match(cssSource, /max-height: 100dvh/);
  assert.match(cssSource, /min-width: 15rem/);
  assert.match(cssSource, /@media \(max-width: 47\.99rem\)/);
  assert.match(cssSource, /desk-phone-bar/);
  assert.match(cssSource, /translateX\(-100%\)/);
  assert.doesNotMatch(cssSource, /html,\s*body\s*\{[^}]*overflow-x:\s*hidden/);
  assert.doesNotMatch(shellSource, /w-\[4\.75rem\]/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8"), /width: "device-width"/);
  assert.doesNotMatch(shellSource, /Set up 2-step/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/mike-launcher.tsx"), "utf8"), /fixed right-6 bottom-6/);
  assert.match(navSource, /whitespace-nowrap/);
  assert.match(navSource, /\+ New/);
  assert.match(workspaceSource, /Load Log/);
  assert.match(workspaceSource, /Dispatch and Tracking/);
  assert.match(workspaceSource, /Load Documents/);
  assert.match(workspaceSource, /Copy \/ Cancel \/ Archive/);
  assert.match(workspaceSource, /Admin \/ Financials/);
  assert.match(workspaceSource, /pt-1/);
  assert.doesNotMatch(workspaceSource, /load-action-menu absolute z-20 mt-1/);
  assert.match(workspaceSource, /createHoverMenuCloser/);
  assert.match(workspaceSource, /data-hover-action-menu/);
  assert.match(workspaceSource, /data-hover-menu-bridge/);
  const hoverMenu = fs.readFileSync(path.join(process.cwd(), "lib/hover-menu.ts"), "utf8");
  assert.match(hoverMenu, /HOVER_MENU_CLOSE_DELAY_MS/);
  assert.match(hoverMenu, /createHoverMenuCloser/);
  const { createHoverMenuCloser, HOVER_MENU_CLOSE_DELAY_MS } = await import("../lib/hover-menu");
  assert.ok(HOVER_MENU_CLOSE_DELAY_MS >= 150, "hover menus must survive the button-to-menu gap");
  {
    const closer = createHoverMenuCloser(30);
    let closed = false;
    closer.schedule(() => {
      closed = true;
    });
    assert.equal(closed, false, "mouseleave must not close the menu immediately");
    closer.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closed, false, "re-entering the menu cancels the close");
    closer.schedule(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closed, true, "menu closes after the hover delay");
    closer.dispose();
  }
  const fastActionsUi = fs.readFileSync(path.join(process.cwd(), "components/load-card-fast-actions.tsx"), "utf8");
  assert.match(fastActionsUi, /Exception/);
  assert.match(fastActionsUi, /Set appointment/);
  assert.match(fastActionsUi, /Post update/);
  assert.match(fastActionsUi, /HoverActionMenu/);
  assert.match(boardUi, /LoadCardFastActions/);
  assert.match(boardUi, /AssignDialog/);
  assert.match(boardUi, />\s*Edit\s*</);
  assert.match(workspaceSource, /Log Check Call/);
  assert.match(workspaceSource, /View Load Log/);
  assert.match(workspaceSource, /Send Text Message/);
  assert.match(workspaceSource, /Text dispatch to driver/);
  assert.match(workspaceSource, /data-text-dispatch/);
  assert.match(workspaceSource, /tab !== "docs"/);
  assert.match(workspaceSource, /Assign a driver first/);
  assert.match(workspaceSource, /The assigned driver needs a mobile number/);
  assert.match(workspaceSource, /Send text/);
  assert.doesNotMatch(workspaceSource, /window\.confirm\(`Text dispatch/);
  assert.doesNotMatch(workspaceSource, /Text Load Information/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"),
    /Text dispatch to driver/,
  );
  assert.match(workspaceSource, /Upload a Document/);
  assert.match(workspaceSource, /Request Documents From Driver/);
  const sendBooksUi = fs.readFileSync(path.join(process.cwd(), "components/send-to-accounting.tsx"), "utf8");
  assert.match(sendBooksUi, /Send to Accounting Management/);
  assert.match(sendBooksUi, /Send to Accounting Manager/);
  assert.match(sendBooksUi, /data-accounting-menu-send/);
  assert.match(sendBooksUi, /data-qbo-menu-send/);
  assert.match(sendBooksUi, /Send to QuickBooks/);
  assert.match(sendBooksUi, /variant !== "menu"/);
  assert.match(sendBooksUi, /createPortal/);
  assert.match(sendBooksUi, /data-accounting-send-overlay/);
  assert.match(sendBooksUi, /data-accounting-send-close/);
  assert.match(sendBooksUi, /ms-go/);
  assert.match(sendBooksUi, /\/accounting\/invoices/);
  assert.match(sendBooksUi, /goToAccountingManagement/);
  assert.match(sendBooksUi, /data-accounting-sent/);
  assert.match(sendBooksUi, /Manage Invoices/);
  assert.match(sendBooksUi, /Manage Bills/);
  assert.match(sendBooksUi, /setSentHere\(true\)/);
  assert.match(sendBooksUi, /router\.refresh\(\)/);
  assert.doesNotMatch(sendBooksUi, /ms-close-load/);
  assert.doesNotMatch(sendBooksUi, /returnAfterAccounting/);
  assert.doesNotMatch(sendBooksUi, /router\.push\("\/"\)/);
  assert.doesNotMatch(sendBooksUi, /href="\/"(?:\s|>)/);
  const sendActionSource = fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8");
  const sendActionChunk = sendActionSource.slice(
    sendActionSource.indexOf("export async function sendToAccountingAction"),
    sendActionSource.indexOf("export async function returnLoadToOperationsAction"),
  );
  assert.match(sendActionChunk, /revalidatePath\(`\/loads\/\$\{load\.id\}`\)/);
  assert.doesNotMatch(sendActionChunk, /refresh\(\)|revalidatePath\("\/", "layout"\)/);
  assert.doesNotMatch(workspaceSource, /Release to invoicing/);
  assert.match(workspaceSource, /Request POD/);
  assert.match(workspaceSource, /Request Detention email/);
  assert.match(workspaceSource, /Email invoice/);
  assert.match(workspaceSource, /data-email-invoice-action/);
  assert.match(workspaceSource, /setTab\("financials", "email-invoice"\)/);
  assert.match(workspaceSource, /LoadMailMenuItems/);
  assert.match(workspaceSource, /EmailCustomerUpdateButton/);
  assert.doesNotMatch(workspaceSource, /SendToAccountingControls/);
  assert.match(workspaceSource, /Spanish/);
  assert.match(workspaceSource, /driver-locale|driverLocale/);
  const mailPanelSource = fs.readFileSync(path.join(process.cwd(), "components/load-mail-panel.tsx"), "utf8");
  assert.match(mailPanelSource, /data-load-mail/);
  assert.match(mailPanelSource, /Email customer update/);
  assert.match(mailPanelSource, /EmailCustomerUpdateButton/);
  assert.match(mailPanelSource, /data-email-customer-update/);
  assert.match(mailPanelSource, /Send load information/);
  assert.doesNotMatch(workspaceSource, /SMTP_HOST|SENDGRID_API_KEY|SMTP_PASS/);
  assert.doesNotMatch(mailPanelSource, /SMTP_HOST|SENDGRID_API_KEY|SMTP_PASS/);
  assert.match(workspaceSource, /View Accountability Log/);
  assert.match(workspaceSource, /Copy This Load/);
  assert.match(workspaceSource, /Archive This Load/);
  assert.match(workspaceSource, /Cancel This Load/);
  assert.doesNotMatch(workspaceSource, /AscendTracker/);
  assert.doesNotMatch(workspaceSource, /Search Load Boards/);
  assert.doesNotMatch(workspaceSource, /Customer Portal/);
  assert.match(workspaceSource, /form=\{formId\}/);
  assert.match(workspaceSource, /beforeunload/);
  assert.match(workspaceSource, /data-ignore-dirty/);
  assert.match(workspaceSource, /onMouseEnter/);
  assert.match(workspaceSource, /onMouseLeave/);
  assert.match(workspaceSource, /openMenu === label/);
  assert.match(workspaceSource, /setOpenMenu\(label\)/);
  assert.match(workspaceSource, /setOpenMenu\(null\)/);
  assert.match(workspaceSource, /useDismissable/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-dismissable.ts"), "utf8"), /Escape/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-dismissable.ts"), "utf8"), /pointerdown/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-dismissable.ts"), "utf8"), /claimOverflowMenu/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-dismissable.ts"), "utf8"), /swallowNextClick/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-dismissable.ts"), "utf8"), /shouldIgnoreRowClick/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-dismissable.ts"), "utf8"), /isMenuControl\(target\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/clickable-row.tsx"), "utf8"), /shouldIgnoreRowClick/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /data-row-overflow-menu/);
  assert.match(workspaceSource, /history\.replaceState/);
  assert.doesNotMatch(workspaceSource, /tabNeedsServerPaint/);
  assert.doesNotMatch(workspaceSource, /router\.replace/);
  assert.doesNotMatch(workspaceSource, /<details/);
  assert.doesNotMatch(workspaceSource, /Delete This Load/);
  const loadFormSource = fs.readFileSync(path.join(process.cwd(), "components/load-form.tsx"), "utf8");
  const basicsChunk = fs.readFileSync(path.join(process.cwd(), "components/load-basics-screen.tsx"), "utf8");
  const customerChunk = fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8");
  const assetsChunk = fs.readFileSync(path.join(process.cwd(), "components/load-carrier-screen.tsx"), "utf8");
  const rateFieldsSource = fs.readFileSync(path.join(process.cwd(), "components/load-rate-fields.tsx"), "utf8");
  const payItemsSource = fs.readFileSync(path.join(process.cwd(), "components/load-pay-items.tsx"), "utf8");
  assert.match(loadFormSource, /LoadBasicsScreen/);
  assert.match(loadFormSource, /LoadCustomerScreen/);
  assert.match(loadFormSource, /LoadCarrierScreen/);
  assert.match(loadFormSource, /data-assign-fields/);
  assert.match(loadFormSource, /hidden=\{resolvedScreen !== "assets"/);
  assert.match(loadFormSource, /data-load-screen="customer"/);
  assert.match(loadFormSource, /data-load-screen="assets"/);
  assert.match(loadFormSource, /stay_on_load/);
  assert.match(loadFormSource, /preventDefault/);
  assert.match(loadFormSource, /startTransition/);
  assert.doesNotMatch(loadFormSource, /<form[^>]*action=\{formAction\}/);
  assert.match(loadFormSource, /\/loads\/\$\{load\.id\}/);
  const actionsSource = fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8");
  assert.match(actionsSource, /redirect\(`\/loads\/\$\{id\}`\)/);
  assert.match(actionsSource, /Existing-load Save must stay on this load/);
  assert.match(actionsSource, /skip_route_refresh/);
  assert.doesNotMatch(
    actionsSource,
    /redirect\(safeReturnTo\(formData.get\("return_to"\), `\/loads\/\$\{id\}`\)\)/,
  );
  assert.doesNotMatch(loadFormSource, /name="origin"|name="destination"|name="pickup_start"|hidden leftover/);
  assert.match(basicsChunk, /data-load-tab="basics"/);
  assert.match(basicsChunk, /Required temp/);
  assert.match(basicsChunk, /Reefer mode/);
  assert.match(basicsChunk, /Equipment Type/);
  assert.match(basicsChunk, /useLoadAssignPersist/);
  assert.match(basicsChunk, /handleAssign/);
  assert.match(basicsChunk, /data-load-status/);
  assert.match(basicsChunk, /data-truck-status/);
  assert.match(basicsChunk, /htmlFor="load_status"/);
  assert.match(basicsChunk, /htmlFor="load_truck_status"/);
  assert.doesNotMatch(basicsChunk, /htmlFor="status"|id="status"|id="truck_status"/);
  assert.match(basicsChunk, /truckStatusOptions/);
  assert.match(basicsChunk, /data-autosave/);
  assert.match(basicsChunk, /blurPersist/);
  assert.match(basicsChunk, /LoadRateFields/);
  assert.match(basicsChunk, /\{!load \|\| defaults\.rate != null \? \(/);
  assert.doesNotMatch(basicsChunk, /htmlFor="rate"|id="rate"/);
  assert.match(rateFieldsSource, /htmlFor="rate"/);
  assert.match(rateFieldsSource, /Customer rate/);
  assert.match(rateFieldsSource, /data-create-rate-note/);
  assert.match(rateFieldsSource, /This becomes the customer rate on Income \/ Budget/);
  assert.match(rateFieldsSource, /data-income-customer-rate/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/pay-items.ts"), "utf8"), /importCreateRateToFinancials/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/queries.ts"), "utf8"), /importCreateRateToFinancials/);
  assert.match(rateFieldsSource, /name="oo_percent"/);
  assert.match(rateFieldsSource, /name="oo_pay"/);
  assert.match(rateFieldsSource, /data-oo-percent/);
  assert.match(rateFieldsSource, /data-oo-pay/);
  assert.match(rateFieldsSource, /data-oo-pay-pair/);
  assert.match(rateFieldsSource, /data-expense-oo-pay/);
  assert.match(rateFieldsSource, /impliedOwnerOperatorPercent/);
  assert.match(rateFieldsSource, /Dollars/);
  assert.match(rateFieldsSource, /Percent of customer rate/);
  assert.match(rateFieldsSource, /Owner-operator rate/);
  assert.match(payItemsSource, /CustomerRateField/);
  assert.match(payItemsSource, /OwnerOperatorPayFields/);
  assert.match(payItemsSource, /data-empty-move/);
  assert.doesNotMatch(payItemsSource, /OO pay/);
  assert.doesNotMatch(rateFieldsSource, /Income lines below are extras/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-form.tsx"), "utf8"), /load\?\.oo_percent \?\? driver\.pay_percent/);
  assert.match(basicsChunk, /data-critical-save/);
  assert.match(basicsChunk, /continuous/);
  assert.match(basicsChunk, /Load Status/);
  assert.match(basicsChunk, /Truck Status/);
  assert.match(basicsChunk, /Load Reference ID/);
  assert.doesNotMatch(basicsChunk, /Equipment Length|Reefer setpoint|Required low|Required high/);
  assert.doesNotMatch(basicsChunk, /htmlFor="branch"|New\/Used|Lower temp threshold|Upper temp threshold|Temp time tolerance|Container #|Last free day/);
  assert.match(loadFormSource, /RateConStopFields/);
  assert.match(loadFormSource, /\$\{prefix\}_stop_name/);
  assert.match(loadFormSource, /\$\{prefix\}_stop_street/);
  assert.match(loadFormSource, /extra_stops_json/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-stops-panel.tsx"), "utf8"), /applyLocationToStop/);
  assert.doesNotMatch(basicsChunk, /Shipper location|Consignee location|Pickup window|Delivery window|htmlFor="origin"|htmlFor="destination"/);
  assert.match(customerChunk, /data-load-tab="customer"/);
  assert.match(customerChunk, /data-critical-save/);
  assert.match(customerChunk, /blurPersist/);
  assert.match(customerChunk, /useLoadAssignPersist/);
  assert.match(customerChunk, /Customer reference/);
  assert.match(customerChunk, /load\?\.customer_reference/);
  assert.doesNotMatch(customerChunk, /load\?\.po_number|load\?\.reference_number/);
  assert.doesNotMatch(customerChunk, /defaults\.load_number_hint/);
  assert.doesNotMatch(customerChunk, /credit_hold|MC#|EDI/);
  assert.match(assetsChunk, /Company driver/);
  assert.match(assetsChunk, /Owner-operator/);
  assert.match(assetsChunk, /name="driver_id"/);
  assert.match(assetsChunk, /name="truck_id"/);
  assert.match(assetsChunk, /name="trailer_id"/);
  assert.match(assetsChunk, /useLoadAssignPersist/);
  assert.match(assetsChunk, /handleAssign/);
  const persistHook = fs.readFileSync(path.join(process.cwd(), "components/use-load-assign-persist.ts"), "utf8");
  assert.match(persistHook, /stay_on_load/);
  assert.match(persistHook, /isAssignEdit/);
  assert.match(persistHook, /isLoadAutosaveField/);
  assert.match(persistHook, /isLoadCriticalField/);
  assert.match(persistHook, /skip_route_refresh/);
  assert.match(persistHook, /updateLoadStatusAction/);
  assert.match(persistHook, /updateLoadTruckStatusAction/);
  assert.doesNotMatch(persistHook, /clearDirty\(\)/);
  assert.match(workspaceSource, /flushEverydayFields/);
  assert.match(workspaceSource, /skip_route_refresh/);
  assert.match(workspaceSource, /setTabState\(next\)/);
  assert.doesNotMatch(workspaceSource, /await flushEverydayFields/);
  assert.doesNotMatch(workspaceSource, /void \(async \(\) => \{/);
  assert.match(workspaceSource, /data-autosave/);
  const autosaveShared = fs.readFileSync(path.join(process.cwd(), "lib/load-autosave-shared.ts"), "utf8");
  assert.match(autosaveShared, /commodity/);
  assert.match(autosaveShared, /temperature_f/);
  assert.match(autosaveShared, /reefer_mode/);
  assert.match(autosaveShared, /customer_id/);
  assert.match(autosaveShared, /declared_value/);
  const { isLoadAutosaveField, isLoadCriticalField, everydayFieldsFromForm, formControlValue } = await import("../lib/load-autosave-shared");
  assert.equal(isLoadAutosaveField("commodity"), true);
  assert.equal(isLoadAutosaveField("weight"), true);
  assert.equal(isLoadAutosaveField("notes"), true);
  assert.equal(isLoadAutosaveField("reefer_mode"), true);
  assert.equal(isLoadAutosaveField("status"), true);
  assert.equal(isLoadAutosaveField("truck_status"), true);
  assert.equal(isLoadCriticalField("status"), false);
  assert.equal(isLoadCriticalField("truck_status"), false);
  assert.equal(isLoadAutosaveField("rate"), false);
  assert.equal(isLoadAutosaveField("customer_id"), false);
  assert.equal(isLoadAutosaveField("declared_value"), false);
  assert.equal(isLoadCriticalField("customer_id"), true);
  assert.equal(isLoadCriticalField("rate"), true);
  assert.equal(isLoadCriticalField("shipper_location_id"), true);
  assert.equal(isLoadCriticalField("commodity"), false);
  assert.deepEqual(
    everydayFieldsFromForm({
      elements: {
        namedItem: (name: string) => (name === "commodity" ? { value: "Berries" } : name === "rate" ? { value: "999" } : null),
      },
    } as Pick<HTMLFormElement, "elements">),
    { commodity: "Berries" },
  );
  const statusList = Object.assign([{ id: "status", name: "", value: "" }, { name: "status", value: "in_transit" }], {
    value: "",
    item(index: number) {
      return this[index] ?? null;
    },
  });
  assert.equal(
    formControlValue(
      { elements: { namedItem: (name: string) => (name === "status" ? statusList : null) } } as Pick<
        HTMLFormElement,
        "elements"
      >,
      "status",
    ),
    "in_transit",
    "Close flush must read the named status field, not a colliding select id",
  );
  assert.deepEqual(
    everydayFieldsFromForm({
      elements: {
        namedItem: (name: string) =>
          name === "status"
            ? { name: "status", value: "in_transit" }
            : name === "truck_status"
              ? { name: "truck_status", value: "dispatched" }
              : name === "weight"
                ? { name: "weight", value: "40000" }
                : null,
      },
    } as Pick<HTMLFormElement, "elements">),
    { status: "in_transit", truck_status: "dispatched", weight: "40000" },
    "tab leave must flush Load Status and Truck Status with other everyday fields",
  );
  assert.doesNotMatch(assetsChunk, /Assigned truck|Trailer #|MC#|DOT|insurance|Reefer setpoint/);
  assert.match(workspaceSource, /Watch this load/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tab-panel.tsx"), "utf8"), /keepMounted/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tab-panel.tsx"), "utf8"), /if \(!visible && !keepMounted\) return null/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /keepMounted/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /when=\{\["basics", "customer", "assets"\]\}/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /LoadFinancialsRate/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /LoadPayItems/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /LoadMoneyBox|LoadMailPanel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /LoadLogLiveCards/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /Suspense/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /Opening stops/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-tabs.ts"), "utf8"), /isSaveTab/);
  const paySource = fs.readFileSync(path.join(process.cwd(), "components/load-pay-items.tsx"), "utf8");
  assert.match(paySource, /\+ Add Line Item/);
  assert.match(paySource, /Save Pay Item/);
  assert.match(paySource, /Income \/ Budget/);
  assert.match(paySource, /Expenses/);
  assert.match(paySource, /Owner-operator \/ lumper/);
  assert.doesNotMatch(paySource, /not a company driver|QBO invoices customer/);
  assert.match(paySource, /Payable to/);
  assert.match(paySource, />Lumper</);
  assert.match(paySource, /ownerOperators/);
  assert.match(paySource, /Other payee/);
  assert.match(paySource, /Total income/);
  assert.match(paySource, /Gross profit/);
  assert.match(paySource, /officeSharePercent/);
  assert.match(paySource, /data-oo-office-percent/);
  const { officeSharePercent, officeSharePercentForOoLoad, impliedOwnerOperatorPercent: impliedOoPercentFromPay } =
    await import("../lib/settlement");
  assert.equal(officeSharePercent(85), 15);
  assert.equal(officeSharePercent(75), 25);
  assert.equal(officeSharePercent(null), null);
  const mse1059Income = 5869;
  const mse1059Expenses = 4989;
  const mse1059Profit = mse1059Income - mse1059Expenses;
  assert.equal(mse1059Profit, 880);
  assert.equal(officeSharePercentForOoLoad({ ownerOperator: true, ooPercent: 85 }), 15);
  assert.equal(
    officeSharePercentForOoLoad({
      ownerOperator: true,
      ooPercent: null,
      ooPay: mse1059Expenses,
      billedRate: mse1059Income,
    }),
    15,
  );
  assert.equal(impliedOoPercentFromPay(mse1059Expenses, mse1059Income), 85);
  assert.equal(officeSharePercentForOoLoad({ ownerOperator: false, ooPercent: 85 }), null);
  assert.match(paySource, /officeSharePercentForOoLoad/);
  assert.doesNotMatch(paySource, /ViewInvoiceButton/);
  assert.doesNotMatch(paySource, /View Customer Confirmation/);
  assert.doesNotMatch(paySource, /View Carrier Confirmation/);
  const confirmationPoSource = fs.readFileSync(path.join(process.cwd(), "lib/load-confirmation.ts"), "utf8");
  assert.match(confirmationPoSource, /driverFacingStopPo/);
  assert.match(confirmationPoSource, /driverFacingStopConfirmation/);
  assert.doesNotMatch(confirmationPoSource, /stop\?\.confirmation\.trim\(\) \|\| load\.reference_number/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8"), /driverFacingStopPo/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8"),
    /load\.reference_number, load\.po_number/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"),
    /refs: \[load\.reference_number, load\.po_number, load\.customer_reference\]/,
  );
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/load-confirmation-link.tsx"), "utf8"),
    /\/api\/loads\/\$\{loadId\}\/confirmation/,
  );
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/load-confirmation-link.tsx"), "utf8"),
    /packet=internal/,
  );
  const confirmationRouteSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/loads/[id]/confirmation/route.ts"),
    "utf8",
  );
  assert.match(confirmationRouteSource, /packet === "internal"/);
  assert.match(confirmationRouteSource, /dispatcher && !wantInternal \? "customer" : "internal"/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8"),
    /confirmation\?packet=internal/,
  );
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "app/driver/page.tsx"), "utf8"),
    /confirmation\?packet=internal/,
  );
  const confirmationLibSource = fs.readFileSync(path.join(process.cwd(), "lib/load-confirmation.ts"), "utf8");
  assert.match(confirmationLibSource, /Customer Confirmation/);
  assert.match(confirmationLibSource, /tmsCustomerInvoiceLines/);
  assert.match(confirmationLibSource, /drawCustomerBlock/);
  assert.match(confirmationLibSource, /drawCustomerRate/);
  assert.match(confirmationLibSource, /isAppointmentSchedule/);
  assert.match(confirmationLibSource, /isFcfsSchedule/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/view-invoice-button.tsx"), "utf8"), /View Invoice/);
  assert.match(paySource, /data-financials-totals/);
  assert.match(paySource, /finance-income/);
  assert.match(paySource, /finance-expense/);
  assert.match(paySource, /finance-head/);
  assert.doesNotMatch(paySource, /defaultPayee=\{driverName/);
  assert.doesNotMatch(paySource, /waiting row|blank row/);
  const stopsSource = fs.readFileSync(path.join(process.cwd(), "components/load-stops-panel.tsx"), "utf8");
  assert.match(stopsSource, /\+ Add Pickup/);
  assert.match(stopsSource, /\+ Add Delivery/);
  assert.match(stopsSource, /data-stops-grid/);
  assert.match(stopsSource, /stop-chip-pickup/);
  assert.match(stopsSource, /stop-chip-delivery/);
  assert.match(stopsSource, /data-leg-miles/);
  assert.match(stopsSource, /milesForStopGap/);
  assert.match(stopsSource, /applyLocationToStop/);
  assert.doesNotMatch(stopsSource, /stopoff|bobtail|container|maps\.google\.com|liftgate|inside pickup/i);
  assert.match(stopsSource, /locationRuleLabels/);
  assert.match(stopsSource, /LocationPicker/);
  assert.match(stopsSource, /data-stop-window/);
  assert.match(stopsSource, /data-stop-front/);
  assert.match(stopsSource, /stop-front-window/);
  assert.match(stopsSource, /formatStopWindow/);
  assert.match(stopsSource, /formatLocationAddress/);
  assert.match(stopsSource, /formatStopRowAddress/);
  assert.match(stopsSource, /stop-front-actions/);
  assert.match(stopsSource, /nyBoroughStateError/);
  assert.match(stopsSource, /stopTypeNumber/);
  assert.match(stopsSource, /stopTypeLabel/);
  assert.match(stopsSource, /data-stop-kind/);
  assert.match(stopsSource, /data-stop-delivered/);
  assert.match(stopsSource, /type="checkbox"/);
  assert.match(stopsSource, /markStopDeliveredAction/);
  assert.match(stopsSource, /Picked up/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops-shared.ts"), "utf8"), /export function stopIsDelivered/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops.ts"), "utf8"), /export function setStopDelivered/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /export async function markStopDeliveredAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /The load was picked up/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /The load was delivered/);
  assert.match(stopsSource, /value=\{draft\.kind\}/);
  assert.match(stopsSource, /formData\.set\("kind", draft\.kind\)/);
  assert.match(stopsSource, /event\.preventDefault\(\)/);
  assert.doesNotMatch(stopsSource, /action=\{onSubmit\}/);
  assert.doesNotMatch(stopsSource, /defaultValue=\{draft\.kind\}/);
  assert.doesNotMatch(stopsSource, /name="kind" value=\{kind\}/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops-shared.ts"), "utf8"), /export function stopTypeNumber/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops-shared.ts"), "utf8"), /Delivery" : "Pickup"/);
  assert.match(stopsSource, /datetime-local/);
  assert.match(stopsSource, /onBlur/);
  assert.match(stopsSource, /commitTime/);
  assert.match(stopsSource, /stopPrivateNotes/);
  assert.doesNotMatch(stopsSource, /#\{index\}/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /stop-front/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /table-grid-stops/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /min-width: 10\.5rem/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /stop-time-input/);
  assert.match(stopsSource, /data-stop-autosave/);
  assert.match(stopsSource, /persistStop/);
  assert.match(stopsSource, /isFirstAssign/);
  assert.match(stopsSource, /isAssignEdit/);
  assert.match(stopsSource, /clearDirty/);
  assert.match(stopsSource, /updateStopAction/);
  assert.match(stopsSource, /Save to keep this location change/);
  assert.match(stopsSource, /data-add-stop-dialog/);
  assert.match(stopsSource, /reorderStopsAction/);
  assert.match(stopsSource, /draggable/);
  assert.doesNotMatch(stopsSource, /Add Stop opens a popup|Appointment time stays on the list/);
  assert.doesNotMatch(stopsSource, /<select[^>]*name="location_id"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops.ts"), "utf8"), /export function reorderStops/);
  const laneSource = fs.readFileSync(path.join(process.cwd(), "components/load-lane-fields.tsx"), "utf8");
  assert.match(laneSource, /Pickup and delivery windows/);
  assert.doesNotMatch(laneSource, /LocationPicker|useLoadAssignPersist|Lane from rate con/);
  assert.doesNotMatch(laneSource, /<select[^>]*name="shipper_location_id"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/rate-con-location-review.tsx"), "utf8"), /LocationPicker/);
  const pickerSource = fs.readFileSync(path.join(process.cwd(), "components/location-picker.tsx"), "utf8");
  assert.match(pickerSource, /data-location-picker/);
  assert.match(pickerSource, /filterLocationsForPicker/);
  assert.match(pickerSource, /formatLocationAddress/);
  assert.match(pickerSource, /Type any name or address/);
  assert.doesNotMatch(pickerSource, /locations\.map\(\(location\) =>/);
  assert.doesNotMatch(pickerSource, /Tyson|Nebraska Cold|Heartland|Westside/);
  const locLibSource = fs.readFileSync(path.join(process.cwd(), "lib/locations.ts"), "utf8");
  assert.doesNotMatch(locLibSource, /Tyson|Nebraska Cold|Heartland|Westside/);
  const rateConReviewSource = fs.readFileSync(path.join(process.cwd(), "components/rate-con-location-review.tsx"), "utf8");
  assert.match(rateConReviewSource, /LocationPicker/);
  assert.match(rateConReviewSource, /Type any name or address/);
  assert.match(rateConReviewSource, /extra_stops/);
  assert.match(rateConReviewSource, /data-extra-stop/);
  assert.doesNotMatch(rateConReviewSource, /Change the dropdown/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tracking-panel.tsx"), "utf8"), /Load map/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/load-tracking-panel.tsx"), "utf8"), /This load only|Check calls and stored GPS/);
  const mapCanvasSource = fs.readFileSync(path.join(process.cwd(), "components/load-map-canvas.tsx"), "utf8");
  assert.match(mapCanvasSource, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.doesNotMatch(mapCanvasSource, /maps\.google\.com\/maps\?/);
  assert.doesNotMatch(mapCanvasSource, /AIza[0-9A-Za-z_-]+/);
  assert.match(mapCanvasSource, /point\.href/);
  assert.match(mapCanvasSource, /Polyline/);
  assert.match(mapCanvasSource, /markerText/);
  assert.match(mapCanvasSource, /labelOrigin/);
  assert.match(mapCanvasSource, /point\.labelOrigin/);
  assert.match(mapCanvasSource, /loadMapIconLayout|LOAD_MAP_PIN_TIP_X|LOAD_MAP_PIN_TIP_Y/);
  assert.match(mapCanvasSource, /gestureHandling: "greedy"/);
  assert.match(mapCanvasSource, /defaultLoadMapLabelOrigin/);
  assert.match(mapCanvasSource, /loadMapPinIconUrl/);
  assert.doesNotMatch(mapCanvasSource, /SymbolPath|FORWARD_CLOSED_ARROW/);
  assert.match(mapCanvasSource, /featureType: "poi"/);
  assert.match(mapCanvasSource, /gm_authFailure|data-map-off/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map.ts"), "utf8"), /stopTypeLabel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map.ts"), "utf8"), /stopMapMarkerText/);
  const stopsMapUi = fs.readFileSync(path.join(process.cwd(), "components/load-stops-map.tsx"), "utf8");
  assert.match(stopsMapUi, /data-stops-map/);
  assert.match(stopsMapUi, /Map is off/);
  assert.match(stopsMapUi, /No map yet/);
  assert.doesNotMatch(stopsMapUi, /maps\.google\.com|GOOGLE_MAPS_API_KEY|Official IFTA|<code>\.env/);
  const stopsPanelUi = fs.readFileSync(path.join(process.cwd(), "components/load-stops-panel.tsx"), "utf8");
  assert.match(stopsPanelUi, /draggable/);
  assert.match(stopsPanelUi, /APPT/);
  assert.match(stopsPanelUi, /FCFS/);
  assert.match(stopsPanelUi, /Appointment time/);
  assert.match(stopsPanelUi, /isAppointmentSchedule/);
  assert.match(stopsPanelUi, /data-detention-mark/);
  assert.match(stopsPanelUi, /detentionTwoHourMark/);
  const detentionClockSrc = fs.readFileSync(path.join(process.cwd(), "lib/detention-clock.ts"), "utf8");
  assert.match(detentionClockSrc, /windowStart && arrived\.getTime\(\) < windowStart\.getTime\(\)/);
  assert.match(detentionClockSrc, /schedule === "appointment"/);
  assert.match(detentionClockSrc, /return arrived/);
  assert.match(detentionClockSrc, /start\.getTime\(\) \+ DETENTION_FREE_MS/);
  assert.doesNotMatch(detentionClockSrc, /8 AM|10 AM|12 PM|T10:00:00|T12:00:00/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/geofence.ts"), "utf8"), /AND \$\{field\} = ''/);
  assert.match(stopsPanelUi, /Add Pickup/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/geofence.ts"), "utf8"), /GEOFENCE_MILES = 2/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/queries.ts"), "utf8"), /applyGeofenceArrivalsForTruck/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops.ts"), "utf8"), /applyGeofenceArrivals\(loadId\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/geofence.ts"), "utf8"), /departed_at/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /scheduleLoadOpenWork/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-open-work.ts"), "utf8"), /isOfficialDrivingRoute/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-open-work.ts"), "utf8"), /after\(/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-open-work.ts"), "utf8"), /applyGeofenceArrivalsWithGeocode/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-open-work.ts"), "utf8"), /refreshLoadRouteQuiet/);
  const mapLibSource = fs.readFileSync(path.join(process.cwd(), "lib/load-map.ts"), "utf8");
  assert.match(mapLibSource, /persistedTruckLocation/);
  assert.match(mapLibSource, /geocodeAddress/);
  assert.doesNotMatch(mapLibSource, /demo-112|32\.7767/);
  const fleetMapSource = fs.readFileSync(path.join(process.cwd(), "lib/fleet-map.ts"), "utf8");
  assert.match(fleetMapSource, /getSamsaraFleet/);
  assert.match(fleetMapSource, /persistedTruckLocation/);
  assert.match(fleetMapSource, /getReeferSnapshots/);
  assert.match(fleetMapSource, /persistedTrailerLocation/);
  assert.match(fleetMapSource, /active !== 0/);
  assert.match(fleetMapSource, /type === "reefer"/);
  assert.doesNotMatch(fleetMapSource, /withDemoTrailerLocation|demoCoordsForTrailer/);
  assert.doesNotMatch(fleetMapSource, /AIza[0-9A-Za-z_-]+/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /buildSamsaraFleetMap|buildOrbcommFleetMap|FleetMapView/);
  const fleetMapView = fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8");
  assert.doesNotMatch(fleetMapView, /from ["']@\/lib\/(db|env|settings|places)["']/);
  assert.match(fleetMapView, /fleetMapDisplayPoints/);
  assert.match(fleetMapView, /Map is off/);
  assert.doesNotMatch(fleetMapView, /GOOGLE_MAPS_API_KEY|<code>\.env/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/samsara/page.tsx"), "utf8"), /buildSamsaraFleetMap/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/orbcomm/page.tsx"), "utf8"), /buildOrbcommFleetMap/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/loads/templates/page.tsx"), "utf8"), /Picks/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/loads/templates/page.tsx"), "utf8"), /Book from template/);
  const payPageSource = fs.readFileSync(path.join(process.cwd(), "app/accounting/pay/page.tsx"), "utf8");
  assert.match(payPageSource, /AccountingHub/);
  assert.match(payPageSource, /tab="pay"/);
  assert.doesNotMatch(payPageSource, /redirect\(/);
  const hubSource = fs.readFileSync(path.join(process.cwd(), "components/accounting-hub.tsx"), "utf8");
  assert.match(hubSource, /hubTabClass/);
  assert.match(hubSource, /acct-hub-tabs/);
  assert.match(hubSource, /InvoicesAcctTable/);
  assert.match(hubSource, /acct-page/);
  assert.match(hubSource, /hrefForAccountingHubTab/);
  assert.match(hubSource, /action="\/accounting\/pay"/);
  assert.doesNotMatch(hubSource, /Export bill to QBO/);
  assert.doesNotMatch(hubSource, /\/api\/attachments\/\$\{invoice\.id\}/);
  assert.match(hubSource, /Close period/);
  assert.match(hubSource, /Download Excel/);
  assert.match(hubSource, /overflow-x-auto/);
  assert.match(hubSource, /min-w-max/);
  assert.match(hubSource, /sticky right-0/);
  const invoicesTableUi = fs.readFileSync(path.join(process.cwd(), "components/invoices-acct-table.tsx"), "utf8");
  assert.match(invoicesTableUi, /\/api\/loads\/\$\{row\.id\}\/invoice/);
  assert.match(invoicesTableUi, /title="Send back to Load Management"/);
  assert.match(invoicesTableUi, /Invoice Exported|Unsent/);
  assert.match(invoicesTableUi, /QboInvoiceSendButton/);
  assert.match(invoicesTableUi, /EmailInvoiceButton/);
  assert.match(invoicesTableUi, /variant="link"/);
  assert.doesNotMatch(invoicesTableUi, /Email History/);
  assert.doesNotMatch(invoicesTableUi, /mailto:/);
  assert.match(invoicesTableUi, /acct-expand-grid/);
  const emailInvoiceUi = fs.readFileSync(path.join(process.cwd(), "components/email-invoice-button.tsx"), "utf8");
  assert.match(emailInvoiceUi, /Email invoice/);
  assert.match(emailInvoiceUi, /anchorId/);
  assert.match(emailInvoiceUi, /id=\{anchorId\}/);
  assert.match(emailInvoiceUi, /ar@msloads\.com/);
  assert.match(emailInvoiceUi, /sendCustomerInvoiceMailAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /invoiceMailTo/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /resolveInvoiceCustomerEmail/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /Enter an email to send this invoice/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/customer-form.tsx"), "utf8"), /Main email/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/customer-form.tsx"), "utf8"), /Billing email/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8"), /Per-load email/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8"), /Per-load phone/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8"), /data-per-load-phone/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8"), /data-per-load-ext/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-contact.ts"), "utf8"), /resolveLoadCustomerPhone/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/invoice.ts"), "utf8"), /resolveCustomerMainPhone/);
  for (const file of [
    "lib/rate-con-shared.ts",
    "lib/rate-con-ai.ts",
    "lib/rate-con.ts",
    "lib/load-mail.ts",
    "lib/load-contact.ts",
    "components/load-customer-screen.tsx",
    "components/customer-form.tsx",
    "components/rate-con-apply.tsx",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /Gerard Borne|Caitlyn Will|GBorne@|CWill@/i, `${file} must not hardcode example contacts`);
    assert.doesNotMatch(source, /800-580-3101|36765942|36817888/, `${file} must not hardcode example phones or PO#s`);
    assert.doesNotMatch(source, /@tql\.com/i, `${file} must not assume a broker domain`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/env.ts"), "utf8"), /SMTP_FROM\s*=\s*["']ar@/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /formData\.get\("to"\)/);
  assert.match(emailInvoiceUi, /extra_id/);
  assert.match(emailInvoiceUi, /name="body"/);
  assert.match(emailInvoiceUi, /Email body/);
  assert.match(emailInvoiceUi, /Send to/);
  assert.match(emailInvoiceUi, /data-email-invoice-to-input/);
  assert.match(emailInvoiceUi, /Enter an email to send this invoice/);
  assert.doesNotMatch(emailInvoiceUi, /This load has no customer email/);
  assert.match(emailInvoiceUi, /Attach load documents/);
  assert.match(emailInvoiceUi, /Attach all/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/invoice-email/page.tsx"), "utf8"), /invoice_email_body/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/settings-shared.ts"), "utf8"), /\/settings\/invoice-email/);
  const deskShared = fs.readFileSync(path.join(process.cwd(), "lib/accounting-desk-shared.ts"), "utf8");
  assert.match(deskShared, /Driver Pay Mgmt/);
  assert.match(deskShared, /hrefForAccountingHubTab/);
  const { hrefForAccountingHubTab } = await import("../lib/accounting-desk-shared");
  assert.equal(hrefForAccountingHubTab("pay"), "/accounting/pay");
  assert.equal(hrefForAccountingHubTab("invoices"), "/accounting/invoices?tab=invoices");
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/accounting/pay/export/route.ts"), "utf8"), /driver-pay\.xlsx/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tracking-panel.tsx"), "utf8"), /Recent events/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-log-section.tsx"), "utf8"), /Save check call/);
  const documentsPage = fs.readFileSync(path.join(process.cwd(), "app/settings/documents/page.tsx"), "utf8");
  assert.match(documentsPage, /SETTINGS_DOCUMENT_EDITORS/);
  assert.match(documentsPage, /Font for generated documents/);
  assert.match(documentsPage, /DocumentFontForm/);
  assert.match(documentsPage, /DocumentTagHints/);
  assert.doesNotMatch(documentsPage, /Skip LTL|3rd-party BOL|company-truck paperwork|Only an Administrator can change these defaults/);
  assert.doesNotMatch(documentsPage, /Powered by Ascend|Legal Center/i);
  const documentCopy = fs.readFileSync(path.join(process.cwd(), "lib/document-copy.ts"), "utf8");
  assert.match(documentCopy, /Driver confirmation/);
  assert.match(documentCopy, /Customer confirmation/);
  assert.match(documentCopy, /Bill of Lading/);
  assert.doesNotMatch(
    documentCopy.slice(documentCopy.indexOf("SETTINGS_DOCUMENT_EDITORS")),
    /TriumphPay|3rd-party BOL|LTL quote|No owner-operator|No driver greeting/,
  );
  const printedTerms = await import("../lib/document-copy");
  assert.doesNotMatch(printedTerms.DRIVER_CONFIRMATION_TERMS, /TriumphPay/);
  assert.doesNotMatch(printedTerms.CUSTOMER_CONFIRMATION_TERMS, /TriumphPay/);
  assert.doesNotMatch(printedTerms.BOL_TERMS, /TriumphPay/);
  const workflowPage = fs.readFileSync(path.join(process.cwd(), "app/settings/workflow/page.tsx"), "utf8");
  assert.match(workflowPage, /Automated Workflow/);
  assert.match(workflowPage, /Heads up/);
  assert.match(workflowPage, /WorkflowEngine/);
  const workflowUi = fs.readFileSync(path.join(process.cwd(), "components/workflow-engine.tsx"), "utf8");
  assert.match(workflowUi, /Prevent a driver, truck, or trailer/);
  assert.match(workflowUi, /arrive and depart/);
  assert.match(workflowUi, /Late Pickups or Deliveries/);
  assert.match(workflowUi, /Save assignment block rules/);
  assert.match(workflowUi, /Save late stop rules/);
  assert.match(workflowUi, /auto_assign_dispatcher/);
  assert.doesNotMatch(workflowUi, /Setup Packet Sent To Carrier|MyCarrierPortal|Incoming EDI 214/i);
  assert.doesNotMatch(workflowPage, /Setup Packet Sent To Carrier|MyCarrierPortal/i);
  const alertsPage = fs.readFileSync(path.join(process.cwd(), "app/settings/alerts/page.tsx"), "utf8");
  assert.match(alertsPage, /GPS quiet window/);
  assert.match(alertsPage, /Automated Alerting/);
  const alertsUi = fs.readFileSync(path.join(process.cwd(), "components/alert-rules-panel.tsx"), "utf8");
  assert.match(alertsUi, /\+ Add Alert/);
  assert.match(alertsUi, /Create New Alert/);
  assert.match(alertsUi, /Add a rule to get started/);
  assert.match(alertsUi, /Alert On/);
  assert.match(alertsUi, /Alert People/);
  assert.doesNotMatch(alertsUi, /hazmat|TWIC|Convoy|Incoming 810|tender/i);
  const alertCatalog = fs.readFileSync(path.join(process.cwd(), "lib/alert-rules-shared.ts"), "utf8");
  assert.match(alertCatalog, /driver_license/);
  assert.match(alertCatalog, /driver_insurance/);
  assert.match(alertCatalog, /driver_medical/);
  assert.match(alertCatalog, /driver_drug_test/);
  assert.match(alertCatalog, /truck_registration/);
  assert.match(alertCatalog, /truck_dot/);
  assert.match(alertCatalog, /trailer_registration/);
  assert.match(alertCatalog, /trailer_dot/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "components/location-form.tsx"), "utf8"),
    /liftgate|inside pickup/i,
  );
  const routingUi = fs.readFileSync(path.join(process.cwd(), "components/load-routing-guide.tsx"), "utf8");
  assert.match(routingUi, /Refresh route/);
  assert.match(routingUi, /IFTA estimate/);
  assert.match(routingUi, /Manual miles/);
  assert.doesNotMatch(routingUi, /maps\.google\.com/);
  const routingLib = fs.readFileSync(path.join(process.cwd(), "lib/routing.ts"), "utf8");
  assert.match(routingLib, /maps\.googleapis\.com\/maps\/api\/directions/);
  assert.doesNotMatch(routingLib, /maps\.google\.com/);
  assert.match(routingLib, /clearUnofficialRouteMiles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/routing-shared.ts"), "utf8"), /isOfficialDrivingRoute/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/routing-shared.ts"), "utf8"), /isDrivingPolyline/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/routing-shared.ts"), "utf8"), /estimateStateMiles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/us-state-lookup.ts"), "utf8"), /NE_IA_RIVER/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-open-work.ts"), "utf8"), /stopCount/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/routing-shared.ts"), "utf8"), /officialEmptyMiles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /OverlayOpenLink/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /assignableTrucks/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /PageOverlayHost/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/overlay-open-link.tsx"), "utf8"), /Opening/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/overlay-open-link.tsx"), "utf8"), /requestLoadOverlay/);
  const overlayHost = fs.readFileSync(path.join(process.cwd(), "components/page-overlay-host.tsx"), "utf8");
  assert.match(overlayHost, /ms-open-load/);
  assert.match(overlayHost, /ms-go/);
  assert.match(overlayHost, /\/accounting/);
  assert.match(overlayHost, /data-overlay-close/);
  assert.match(overlayHost, /load-overlay-frame/);
  assert.match(overlayHost, /LoadOverlayPortal/);
  assert.doesNotMatch(overlayHost, /min-h-\[80vh\]/);
  assert.match(overlayHost, /closeLoadOverlay\(returnTo\)/);
  assert.match(overlayHost, /\/loads\/\$\{frameId\}/);
  assert.match(overlayHost, /path.startsWith\("\/api\/"\)/);
  assert.match(overlayHost, /protocol === "blob:"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/overlay-open-link.tsx"), "utf8"), /createPortal/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-overlay.tsx"), "utf8"), /Suspense/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8"), /compress:\s*false/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/pdf-response.ts"), "utf8"), /Content-Encoding.*identity/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/pdf-response.ts"), "utf8"), /no-transform/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "instrumentation.ts"), "utf8"), /defaultMaxListeners/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/rate-con-shared.ts"), "utf8"), /customerRefFromRateCon/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/rate-con-apply.tsx"), "utf8"), /customer_reference/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/rate-con-apply.tsx"), "utf8"), /rateConApplyContactFields/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "components/rate-con-apply.tsx"), "utf8"),
    /parsed\.contact_name\s*\|\|\s*load\.contact_name/,
  );
  const rateConCreateUi = fs.readFileSync(path.join(process.cwd(), "components/rate-con-import.tsx"), "utf8");
  assert.match(rateConCreateUi, /rateConApplyContactFields/);
  assert.doesNotMatch(rateConCreateUi, /parsed\.contact_name\s*\|\|\s*/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8"), /createLoadAction[\s\S]*rateConApplyContactFields/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/rate-con-shared.ts"), "utf8"), /leftoverCarrierPersonLine/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/rate-con-shared.ts"), "utf8"), /carrierRoleWindow/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /customerFacingLoadNumber/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-summary.ts"), "utf8"), /driverFacingLoadNumber/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /customerMailStops/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"), /cityStateFromAddress/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/env.ts"), "utf8"), /MAIL_FROM_DEFAULT/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /officialEmptyMiles/);
  const dbMigrateSource = fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8");
  const fromColAt = dbMigrateSource.indexOf('ensureColumn(db, "load_relays", "from_driver_id"');
  const fromIdxAt = dbMigrateSource.indexOf("idx_load_relays_from_driver");
  assert.ok(fromColAt >= 0 && fromIdxAt > fromColAt, "add from_driver_id before indexing it");
  const parentColAt = dbMigrateSource.indexOf('ensureColumn(db, "loads", "parent_load_id"');
  const parentIdxAt = dbMigrateSource.indexOf("idx_loads_parent");
  assert.ok(parentColAt >= 0 && parentIdxAt > parentColAt, "add parent_load_id before indexing it");
  const masterPanelSource = fs.readFileSync(path.join(process.cwd(), "components/master-load-panel.tsx"), "utf8");
  assert.match(masterPanelSource, /Use multiple customers \(Master Load\)/);
  assert.match(masterPanelSource, /stop_ids/);
  assert.match(masterPanelSource, /data-master-opt-in/);
  assert.match(masterPanelSource, /data-master-customers/);
  assert.match(masterPanelSource, /setMasterLoadAction/);
  assert.doesNotMatch(masterPanelSource, /One trip, more than one customer|same as Ascend|Bill and paperwork live on the child|Dispatch stays on the master/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-workspace.tsx"), "utf8"), /Use multiple customers \(Master Load\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8"), /is_master/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/page-overlay-host.tsx"), "utf8"), /ms-open-load/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/master-load.ts"), "utf8"), /createMasterChild/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/master-load.ts"), "utf8"), /setLoadIsMaster/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /setMasterLoadAction/);
  const { childLoadNumber, nextChildSuffix, sortMasterFamilies } = await import("../lib/master-load-shared");
  assert.equal(childLoadNumber("MSE-12345", "a"), "MSE-12345-A");
  assert.equal(nextChildSuffix(["A", "b"]), "C");
  assert.equal(
    sortMasterFamilies([
      { id: 2, load_number: "MSE-12345-B", parent_load_id: 1 },
      { id: 1, load_number: "MSE-12345", parent_load_id: null },
      { id: 3, load_number: "MSE-12345-A", parent_load_id: 1 },
    ]).map((row) => row.load_number).join(","),
    "MSE-12345,MSE-12345-A,MSE-12345-B",
  );
  assert.doesNotMatch(basicsChunk, /Routing guide|Refresh route|route_miles/);
  assert.doesNotMatch(paySource, /Routing guide|Refresh route|route_miles/);
  const docsPage = fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8");
  assert.match(docsPage, /AttachmentsPanel/);
  assert.match(docsPage, /when="docs"/);
  const docsTabAt = docsPage.indexOf('when="docs"');
  const docsTab = docsTabAt >= 0 ? docsPage.slice(docsTabAt) : "";
  assert.doesNotMatch(docsTab, /QuickbooksInvoicePanel|Send to QuickBooks|Record demo invoice/);
  const financialsAt = docsPage.indexOf('when="financials"');
  const financialsTab = financialsAt >= 0 ? docsPage.slice(financialsAt, docsTabAt > financialsAt ? docsTabAt : undefined) : "";
  assert.match(financialsTab, /QuickbooksInvoicePanel/);
  assert.match(financialsTab, /loadIsOnAccountingDesk/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/quickbooks-invoice-panel.tsx"), "utf8"), /data-qbo-invoice/);
  const invoicesHubUi = fs.readFileSync(path.join(process.cwd(), "components/accounting-hub.tsx"), "utf8");
  assert.match(invoicesHubUi, /InvoicesAcctTable/);
  assert.match(invoicesHubUi, /Send to QuickBooks/);
  assert.match(invoicesHubUi, /Record demo invoice/);
  assert.match(invoicesHubUi, /qboInvoiceExportStatus/);
  assert.doesNotMatch(invoicesHubUi, /Export to QBO|Resend QBO/);
  assert.doesNotMatch(invoicesHubUi, /sendToQuickbooksFormAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/arap-report.tsx"), "utf8"), /Accounts Receivable/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/arap-report.tsx"), "utf8"), /0-29 Days Past Due/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/accounting/page.tsx"), "utf8"), /ArapReport/);
  const qboSendButtonUi = fs.readFileSync(path.join(process.cwd(), "components/qbo-invoice-send-button.tsx"), "utf8");
  assert.match(qboSendButtonUi, /data-qbo-send-notice/);
  assert.match(qboSendButtonUi, /confirm_resend/);
  assert.match(qboSendButtonUi, /Invoice sent again to QuickBooks/);
  const qboActionsSrc = fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8");
  const qboFormSrc = qboActionsSrc.slice(
    qboActionsSrc.indexOf("export async function sendToQuickbooksFormAction"),
    qboActionsSrc.indexOf("export async function sendToQuickbooksAction"),
  );
  assert.match(qboFormSrc, /await sendToQuickbooksAction/);
  assert.doesNotMatch(qboFormSrc, /throw new Error/);
  assert.match(qboActionsSrc, /Invoice sent again to QuickBooks/);
  assert.doesNotMatch(docsPage, /LoadWatchRow|CustomerSnapshot/);
  assert.match(docsPage, /when=\{\["basics", "customer", "assets"\]\}/);
  assert.match(docsPage, /when="assets"/);
  assert.match(docsPage, /LoadRelaysPanel/);
  assert.doesNotMatch(docsPage, /relays.length > 0 \?/);
  assert.match(docsPage, /LoadExtraDetails/);
  assert.match(docsPage, /when="log"/);
  assert.match(docsPage, /LoadRoutingGuide/);
  assert.match(docsPage, /when="stops"/);
  assert.match(docsPage, /LoadStopsMap/);

  const { closeDb, getDb, migrate } = await import("../lib/db");
  const queries = await import("../lib/queries");
  const { Database } = await import("../lib/sqlite");
  const oldRelayPath = path.join(os.tmpdir(), `tms-old-relays-${Date.now()}.db`);
  const oldRelayDb = new Database(oldRelayPath);
  oldRelayDb.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE load_relays (
      id INTEGER PRIMARY KEY,
      load_id INTEGER,
      sequence INTEGER,
      pickup TEXT,
      delivery TEXT,
      driver_id INTEGER,
      truck_id INTEGER,
      trailer_id INTEGER,
      oo_percent REAL,
      oo_pay REAL,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  migrate(oldRelayDb);
  const relayCols = oldRelayDb.prepare("PRAGMA table_info(load_relays)").all() as Array<{ name: string }>;
  assert.ok(relayCols.some((col) => col.name === "from_driver_id"), "existing DBs must gain from_driver_id");
  oldRelayDb.close();

  getDb();
  const seeded = queries.getDashboardStats();
  assert.ok(seeded.openLoads >= 1, "seed should create open loads");
  assert.ok(seeded.unassignedLoads >= 1, "seed should create unassigned loads");
  assert.ok(seeded.availableTrucks >= 1, "seed should create available trucks");
  assert.ok(queries.listLoads({ status: "in_transit" }).length >= 1, "seed should include in-transit loads");
  assert.ok(queries.listCustomers().length >= 1, "seed should include customers");
  const driverCountAfterSeed = queries.listDrivers().length;
  assert.ok(driverCountAfterSeed >= 1, "empty-dev seed may create demo drivers");
  (await import("../lib/seed")).seedDatabase(getDb());
  assert.equal(queries.listDrivers().length, driverCountAfterSeed, "never insert demo drivers when a roster exists");

  const { listenAddress } = await import("../scripts/listen-address.mjs");
  const noBind = { ...process.env, HOSTNAME: "cursor", HOST: undefined, LISTEN_HOST: undefined, BIND_HOST: undefined };
  assert.equal(listenAddress(noBind), "0.0.0.0", "OS HOSTNAME must not become the bind address");
  assert.equal(listenAddress({ ...noBind, HOST: "127.0.0.1" }), "127.0.0.1");
  assert.equal(listenAddress({ ...noBind, LISTEN_HOST: "10.0.0.8" }), "10.0.0.8");

  const { isSupportedNodeVersion, resolveNodeExecutable, windowsNodeInstalls } =
    await import("../scripts/node-binary.mjs");
  assert.equal(isSupportedNodeVersion("20.10.0"), false);
  assert.equal(isSupportedNodeVersion("22.12.0"), false);
  assert.equal(isSupportedNodeVersion("22.13.0"), true);
  assert.equal(isSupportedNodeVersion("24.5.0"), true);
  const currentNode = resolveNodeExecutable({
    execPath: "/current/node",
    version: "24.1.0",
    platform: "win32",
  });
  assert.equal(currentNode.execPath, "/current/node", "prefer process.execPath when version is new enough");
  assert.equal(currentNode.switched, false);
  const programFiles = windowsNodeInstalls({ ProgramFiles: "C:\\Program Files" })[0];
  assert.match(programFiles, /nodejs/);
  const fromOldPath = resolveNodeExecutable({
    execPath: "C:\\old\\node.exe",
    version: "20.10.0",
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files" },
    exists: (file) => file === programFiles,
    readVersion: (file) => (file === programFiles ? "24.4.0" : null),
  });
  assert.equal(fromOldPath.execPath, programFiles);
  assert.equal(fromOldPath.version, "24.4.0");
  assert.equal(fromOldPath.switched, true);

  const { copyStandaloneWebAssets, mirrorIntoStandalone } = await import("../scripts/standalone-link.mjs");
  const linkRoot = path.join(os.tmpdir(), `tms-link-${Date.now()}`);
  const projectData = path.join(linkRoot, "data");
  const standaloneData = path.join(linkRoot, "standalone", "data");
  const envFile = path.join(linkRoot, ".env");
  const standaloneEnv = path.join(linkRoot, "standalone", ".env");
  fs.mkdirSync(projectData, { recursive: true });
  fs.writeFileSync(path.join(projectData, "tms.db"), "db");
  fs.writeFileSync(envFile, "PLACEHOLDER=1\n");
  const winData = mirrorIntoStandalone(projectData, standaloneData, { platform: "win32" });
  const winEnv = mirrorIntoStandalone(envFile, standaloneEnv, { platform: "win32" });
  assert.equal(winData.method, "copy", "win32 must not symlink data (EPERM / Developer Mode)");
  assert.equal(winEnv.method, "copy", "win32 must not symlink .env");
  assert.equal(fs.lstatSync(standaloneData).isSymbolicLink(), false);
  assert.equal(fs.lstatSync(standaloneEnv).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(standaloneData, "tms.db"), "utf8"), "db");
  assert.equal(fs.readFileSync(standaloneEnv, "utf8"), "PLACEHOLDER=1\n");
  fs.rmSync(linkRoot, { recursive: true, force: true });

  const assetRoot = path.join(os.tmpdir(), `tms-web-assets-${Date.now()}`);
  const publicDir = path.join(assetRoot, "public");
  const staticDir = path.join(assetRoot, ".next", "static", "chunks");
  const standaloneDir = path.join(assetRoot, ".next", "standalone");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(staticDir, { recursive: true });
  fs.mkdirSync(standaloneDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "logo.png"), "logo");
  fs.writeFileSync(path.join(staticDir, "app.css"), "body{color:red}");
  const copiedAssets = copyStandaloneWebAssets(assetRoot, { platform: "win32" });
  assert.equal(copiedAssets.public.method, "copy", "public must be copied into standalone (no symlink)");
  assert.equal(copiedAssets.static.method, "copy", ".next/static must be copied into standalone (no symlink)");
  assert.equal(fs.readFileSync(path.join(standaloneDir, "public", "logo.png"), "utf8"), "logo");
  assert.equal(
    fs.readFileSync(path.join(standaloneDir, ".next", "static", "chunks", "app.css"), "utf8"),
    "body{color:red}",
  );
  assert.equal(fs.existsSync(path.join(standaloneDir, "public", "public")), false, "must not nest public/public");
  assert.equal(
    fs.existsSync(path.join(standaloneDir, ".next", "static", "static")),
    false,
    "must not nest static/static",
  );
  assert.equal(fs.lstatSync(path.join(standaloneDir, "public")).isSymbolicLink(), false);
  assert.equal(fs.lstatSync(path.join(standaloneDir, ".next", "static")).isSymbolicLink(), false);
  fs.rmSync(assetRoot, { recursive: true, force: true });
  const missingStandalone = copyStandaloneWebAssets(path.join(os.tmpdir(), `tms-no-standalone-${Date.now()}`), {
    platform: "win32",
  });
  assert.equal(missingStandalone.public.method, "skip");
  assert.equal(missingStandalone.static.method, "skip");

  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { findProjectRoot, loadProjectEnv } = require("../scripts/project-env.cjs") as {
    findProjectRoot: (startDir?: string) => string;
    loadProjectEnv: (options?: {
      cwd?: string;
      processEnv?: Record<string, string | undefined>;
    }) => { root: string; loadedFrom: string[]; quiet: true };
  };
  const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tms-env-"));
  const smokeToken = "tok_smoke_not_a_real_secret";
  fs.writeFileSync(path.join(envRoot, "package.json"), JSON.stringify({ name: "tms-env-fixture" }));
  fs.writeFileSync(path.join(envRoot, "next.config.ts"), "export default {};\n");
  fs.writeFileSync(path.join(envRoot, ".env"), `SAMSARA_API_TOKEN=${smokeToken}\nTMS_FIXTURE_FROM_ENV=env\n`);
  fs.writeFileSync(path.join(envRoot, ".env.local"), "TMS_FIXTURE_FROM_ENV=local\nTMS_FIXTURE_LOCAL=1\n");
  const standaloneCwd = path.join(envRoot, ".next", "standalone");
  fs.mkdirSync(standaloneCwd, { recursive: true });
  fs.writeFileSync(path.join(standaloneCwd, "server.js"), "console.log('standalone');\n");
  fs.writeFileSync(path.join(standaloneCwd, "package.json"), JSON.stringify({ name: "standalone" }));
  assert.equal(findProjectRoot(standaloneCwd), envRoot);
  assert.equal(findProjectRoot(envRoot), envRoot);
  const bag: Record<string, string | undefined> = {};
  const loaded = loadProjectEnv({ cwd: standaloneCwd, processEnv: bag });
  assert.equal(loaded.root, envRoot);
  assert.equal(loaded.quiet, true);
  assert.equal(bag.SAMSARA_API_TOKEN, smokeToken);
  assert.equal(bag.TMS_FIXTURE_FROM_ENV, "local");
  assert.equal(bag.TMS_FIXTURE_LOCAL, "1");
  assert.equal(bag.DOTENV_CONFIG_QUIET, "true");
  assert.ok(loaded.loadedFrom.some((file) => file.endsWith(".env")));
  assert.ok(loaded.loadedFrom.some((file) => file.endsWith(".env.local")));
  const { findProjectRoot: findTsRoot, loadLocalEnv } = await import("../lib/env");
  assert.equal(findTsRoot(standaloneCwd), envRoot);
  const tsBag: Record<string, string | undefined> = {};
  const tsLoaded = loadLocalEnv({ cwd: standaloneCwd, processEnv: tsBag });
  assert.equal(tsLoaded.quiet, true);
  assert.equal(tsBag.SAMSARA_API_TOKEN, smokeToken);
  fs.writeFileSync(path.join(standaloneCwd, ".env"), "OPENAI_API_KEY=sk-smoke-standalone-key\n");
  const emptyFirst: Record<string, string | undefined> = { OPENAI_API_KEY: "", SAMSARA_API_TOKEN: "" };
  const fromStandalone = loadLocalEnv({ cwd: standaloneCwd, processEnv: emptyFirst, force: true });
  assert.ok(fromStandalone.loadedFrom.some((file) => file.replace(/\\/g, "/").includes(".next/standalone/.env")));
  assert.equal(emptyFirst.OPENAI_API_KEY, "sk-smoke-standalone-key");
  assert.ok(emptyFirst.OPENAI_API_KEY.startsWith("sk-"), "sk- keys count as set");
  assert.equal(emptyFirst.SAMSARA_API_TOKEN, smokeToken);

  const {
    runtimeEnvFiles,
    readRuntimeSecret,
    isOpenAiKeySet,
    cleanSecretValue,
    loadRuntimeEnv,
  } = await import("../lib/env");
  const runtimeFiles = runtimeEnvFiles(standaloneCwd).map((file) => file.replace(/\\/g, "/"));
  assert.ok(runtimeFiles.some((file) => file === `${envRoot.replace(/\\/g, "/")}/.env`));
  assert.ok(runtimeFiles.some((file) => file === `${standaloneCwd.replace(/\\/g, "/")}/.env`));
  assert.ok(runtimeFiles.some((file) => file.includes(".next/standalone/.env")));
  assert.equal(cleanSecretValue('  "sk-quoted-key"  '), "sk-quoted-key");
  assert.ok(isOpenAiKeySet("sk-proj-smoke"));
  assert.ok(isOpenAiKeySet("  sk-smoke  "));
  fs.writeFileSync(path.join(standaloneCwd, ".env"), 'OPENAI_API_KEY="sk-quoted-standalone"\n');
  const quotedBag: Record<string, string | undefined> = { OPENAI_API_KEY: "", SAMSARA_API_TOKEN: "" };
  assert.equal(
    readRuntimeSecret("OPENAI_API_KEY", { cwd: standaloneCwd, processEnv: quotedBag, force: true }),
    "sk-quoted-standalone",
  );
  assert.equal(
    readRuntimeSecret("SAMSARA_API_TOKEN", { cwd: standaloneCwd, processEnv: quotedBag, force: true }),
    smokeToken,
  );
  fs.writeFileSync(path.join(standaloneCwd, ".env"), Buffer.from("\uFEFFOPENAI_API_KEY=sk-bom-standalone\n", "utf8"));
  const bomBag: Record<string, string | undefined> = { OPENAI_API_KEY: "", SAMSARA_API_TOKEN: "" };
  assert.equal(
    readRuntimeSecret("OPENAI_API_KEY", { cwd: standaloneCwd, processEnv: bomBag, force: true }),
    "sk-bom-standalone",
  );
  const runtimeLoaded = await loadRuntimeEnv();
  assert.equal(runtimeLoaded.quiet, true);
  fs.rmSync(envRoot, { recursive: true, force: true });

  const envTs = fs.readFileSync(path.join(process.cwd(), "lib/env.ts"), "utf8");
  assert.match(envTs, /findProjectRoot/);
  assert.match(envTs, /envFileCandidates|\.next\/standalone/);
  assert.match(envTs, /dotenv\.parse|parse\(/);
  assert.doesNotMatch(envTs, /console\.log\([^)]*SAMSARA/);
  assert.doesNotMatch(envTs, /console\.log\([^)]*process\.env/);
  const projectEnvSrc = fs.readFileSync(path.join(process.cwd(), "scripts/project-env.cjs"), "utf8");
  assert.match(projectEnvSrc, /parse\(/);
  assert.doesNotMatch(projectEnvSrc, /console\.log/);
  const startSrc = fs.readFileSync(path.join(process.cwd(), "scripts/start-standalone.mjs"), "utf8");
  assert.match(startSrc, /loadProjectEnv/);
  assert.match(startSrc, /DOTENV_CONFIG_QUIET/);
  assert.match(startSrc, /copyStandaloneWebAssets/);
  assert.match(startSrc, /\["--require", preload, serverJs\]/);
  assert.doesNotMatch(startSrc, /NODE_OPTIONS: nodeOptions/);
  assert.doesNotMatch(startSrc, /`--require \$\{preload\}`/);
  assert.doesNotMatch(startSrc, /symlinkSync/);
  const stageSrc = fs.readFileSync(path.join(process.cwd(), "scripts/stage-standalone-assets.mjs"), "utf8");
  assert.match(stageSrc, /copyStandaloneWebAssets/);
  const pkgScripts = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    scripts: { build: string; start: string };
  };
  assert.match(pkgScripts.scripts.build, /stage-standalone-assets/);
  assert.match(pkgScripts.scripts.start, /start-standalone/);
  const runNextSrc = fs.readFileSync(path.join(process.cwd(), "scripts/run-next.mjs"), "utf8");
  assert.match(runNextSrc, /start-standalone/);
  assert.match(runNextSrc, /loadProjectEnv/);
  assert.match(runNextSrc, /\["--require", preload, \.\.\.childArgs\]/);
  assert.doesNotMatch(runNextSrc, /NODE_OPTIONS: nodeOptions/);
  assert.doesNotMatch(runNextSrc, /`--require \$\{preload\}`/);
  const keepAliveSrc = fs.readFileSync(path.join(process.cwd(), "scripts/next-keep-alive.cjs"), "utf8");
  assert.match(keepAliveSrc, /loadProjectEnv/);
  const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  assert.match(readme, /JC should start production with `npm start`/);
  assert.match(readme, /Do \*\*not\*\* run `next start`/);
  assert.match(readme, /styles must load on standalone/);
  assert.match(readme, /unstyled raw HTML/);
  assert.match(readme, /Import from Samsara/);
  assert.match(readme, /Import from Orbcomm/);
  assert.match(readme, /never logged/);
  const shipped = fs.readFileSync(path.join(process.cwd(), "SHIPPED.md"), "utf8");
  assert.match(shipped, /npm start/);
  assert.match(shipped, /injected env \(0\)/);
  assert.match(shipped, /styles must load on standalone/);
  assert.match(shipped, /unstyled raw HTML/);
  assert.match(shipped, /Import from Samsara/);
  assert.match(shipped, /Import from Orbcomm/);
  assert.match(shipped, /every dispatcher page/);

  const envExample = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(envExample, /npm start/);
  assert.match(envExample, /GOOGLE_MAPS_API_KEY=/);
  assert.match(envExample, /TWILIO_WHATSAPP_FROM=/);
  assert.doesNotMatch(envExample, /whatsapp:\+1\d{10}/);
  assert.doesNotMatch(envExample, /WHATSAPP_ACCESS_TOKEN|graph\.facebook|web\.whatsapp|contentSid|ContentSid/);
  assert.match(envExample, /SMTP_HOST=/);
  assert.match(envExample, /SMTP_FROM=dispatch@msloads.com/);
  assert.match(envExample, /SMTP_USER=dispatch@msloads.com/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/mail-shared.ts"), "utf8"), /MAIL_FROM_DEFAULT = "dispatch@msloads.com"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/mail-shared.ts"), "utf8"), /MAIL_INVOICE_FROM = "ar@msloads.com"/);
  assert.match(envExample, /SENDGRID_API_KEY=/);
  for (const file of [
    "app/fleet/layout.tsx",
    "app/fleet/trucks/new/page.tsx",
    "app/fleet/trucks/[id]/page.tsx",
    "app/fleet/trailers/new/page.tsx",
    "app/fleet/trailers/[id]/page.tsx",
    "app/fleet/drivers/new/page.tsx",
    "app/fleet/drivers/[id]/page.tsx",
    "app/fleet/samsara/page.tsx",
    "app/fleet/orbcomm/page.tsx",
    "app/t/[token]/page.tsx",
    "app/locations/new/page.tsx",
    "app/customers/new/page.tsx",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.match(source, /export const dynamic = "force-dynamic"/, `${file} must stay dynamic for standalone`);
  }
  for (const file of [
    "app/fleet/trucks/new/page.tsx",
    "app/fleet/trucks/[id]/page.tsx",
    "app/fleet/trailers/new/page.tsx",
    "app/fleet/trailers/[id]/page.tsx",
    "app/fleet/drivers/new/page.tsx",
    "app/fleet/drivers/[id]/page.tsx",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /\.bind\(/, `${file} must not pass bound server actions to client forms`);
    assert.doesNotMatch(source, /action=\{/, `${file} must not pass server actions as client props`);
  }
  for (const file of ["components/truck-form.tsx", "components/trailer-form.tsx", "components/driver-form.tsx"]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.match(source, /["']use client["']/);
    assert.match(source, /from ["']@\/lib\/actions["']/, `${file} must import server actions itself`);
    assert.match(source, /name="id"/);
  }
  const driverFormSrc = fs.readFileSync(path.join(process.cwd(), "components/driver-form.tsx"), "utf8");
  assert.match(driverFormSrc, /Driver Type/);
  assert.match(driverFormSrc, /DRIVER_TYPES/);
  assert.match(driverFormSrc, /normalizeDriverKind/);
  assert.match(driverFormSrc, /type="radio"/);
  assert.match(driverFormSrc, /name="driver_type"/);
  assert.match(driverFormSrc, /name="division"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/truck-form.tsx"), "utf8"), /name="division"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/trailer-form.tsx"), "utf8"), /name="division"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/assign-dialog.tsx"), "utf8"), /fleetDivisionOf/);
  assert.match(driverFormSrc, /type\.label/);
  assert.doesNotMatch(driverFormSrc, /driver_type \?\? "single"/);
  assert.doesNotMatch(driverFormSrc, />Single</);
  assert.match(driverFormSrc, /Name \*/);
  assert.match(driverFormSrc, /Telephone \*/);
  assert.match(driverFormSrc, /Alt - Tel#/);
  assert.match(driverFormSrc, /Cell Phone/);
  assert.match(driverFormSrc, /Pager#/);
  assert.match(driverFormSrc, /Email Address/);
  assert.match(driverFormSrc, /Country \*/);
  assert.match(driverFormSrc, /State \*/);
  assert.match(driverFormSrc, /City \*/);
  assert.match(driverFormSrc, /Postal\/Zip/);
  assert.match(driverFormSrc, /Date of Birth/);
  assert.match(driverFormSrc, /Date of Hire/);
  assert.match(driverFormSrc, /License No\./);
  assert.match(driverFormSrc, /Exp\. Date/);
  assert.match(driverFormSrc, /Last Medical/);
  assert.match(driverFormSrc, /Next Medical/);
  assert.match(driverFormSrc, /Last Drug Test/);
  assert.match(driverFormSrc, /Next Drug Test/);
  assert.match(driverFormSrc, /Termination Date/);
  assert.match(driverFormSrc, /Internal Notes/);
  assert.match(driverFormSrc, />\s*Cancel\s*</);
  assert.match(driverFormSrc, />\s*Files\s*</);
  assert.match(driverFormSrc, /submitLabel = "Save"/);
  assert.match(driverFormSrc, /pending \? "Saving…" : submitLabel/);
  assert.match(driverFormSrc, /data-cdl-endorsements/);
  assert.match(driverFormSrc, /CDL_ENDORSEMENTS/);
  assert.doesNotMatch(driverFormSrc, /Passport Expiry|Fast Card|passport_expiry|fast_card|hazmat_expiry/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/types.ts"), "utf8"), /Hazmat \(H\)/);
  assert.doesNotMatch(driverFormSrc, /Recur \+|Recur -/);
  assert.doesNotMatch(driverFormSrc, /Default settlement|Pay\/Recur|payroll tab/);
  assert.match(driverFormSrc, /name="pay_percent"/);
  assert.match(driverFormSrc, /name="company_name"/);
  assert.match(driverFormSrc, /data-oo-company/);
  assert.match(driverFormSrc, /data-oo-percent/);
  assert.match(driverFormSrc, /owner_operator/);
  const driverTypesSrc = fs.readFileSync(path.join(process.cwd(), "lib/types.ts"), "utf8");
  assert.match(driverTypesSrc, /value: "company_driver"/);
  assert.match(driverTypesSrc, /label: "Company driver"/);
  assert.match(driverTypesSrc, /value: "owner_operator"/);
  assert.match(driverTypesSrc, /label: "Owner-operator"/);
  assert.match(driverTypesSrc, /function isOwnerOperator/);
  assert.match(driverTypesSrc, /function normalizeDriverKind/);
  assert.doesNotMatch(driverTypesSrc, /label: "Single"/);
  const driversListSrc = fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/page.tsx"), "utf8");
  assert.match(driversListSrc, /Driver type/);
  assert.match(driversListSrc, /DriverKindBadge/);
  assert.match(driversListSrc, /isOwnerOperator/);
  for (const file of [
    "components/samsara-truck-import.tsx",
    "components/orbcomm-trailer-import.tsx",
    "components/driver-import.tsx",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.match(source, /["']use client["']/);
    assert.match(source, /from ["']@\/lib\/actions["']/, `${file} must import server actions itself`);
    assert.doesNotMatch(source, /from ["']@\/lib\/(db|env|settings|places)["']/, `${file} must stay client-safe`);
    assert.doesNotMatch(source, /console\.log/);
  }
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/page.tsx"), "utf8"), /SamsaraTruckImport/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/page.tsx"), "utf8"), /Import from Samsara|SamsaraTruckImport/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/page.tsx"), "utf8"), /LocationBadge/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/page.tsx"), "utf8"), /HosBadge/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/page.tsx"), "utf8"), />Driver</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /\/fleet\/hos\/clocks/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /staticAssignedDriver|mapHosCurrentVehicleDrivers/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/[id]/page.tsx"), "utf8"), /LocationBadge/);
  const deskPage = fs.readFileSync(path.join(process.cwd(), "app/desk/page.tsx"), "utf8");
  assert.match(deskPage, /On the road/);
  assert.match(deskPage, /LocationBadge/);
  assert.match(deskPage, /ExceptionInboxCard/);
  assert.doesNotMatch(deskPage, /variant="workbench"/);
  assert.doesNotMatch(deskPage, /data-workbench-cards/);
  const workbenchHome = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
  assert.match(workbenchHome, /listWorkbenchInbox/);
  assert.match(workbenchHome, /Workbench/);
  assert.match(workbenchHome, /variant="workbench"/);
  assert.doesNotMatch(workbenchHome, /On the road/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /redirect\("\/"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /samsaraGpsEmptyState/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /samsaraGpsEmptyState/);
  const matchFn =
    fs
      .readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8")
      .split("export function matchTruckForSamsara")[1]
      ?.split("export function")[0] ?? "";
  assert.ok(matchFn.includes('matchBy: "vin"') && matchFn.includes('matchBy: "unit_number"') && matchFn.includes('matchBy: "plate"'));
  assert.ok(
    matchFn.indexOf('matchBy: "vin"') < matchFn.indexOf('matchBy: "unit_number"') &&
      matchFn.indexOf('matchBy: "unit_number"') < matchFn.indexOf('matchBy: "plate"'),
    "Samsara rematch must be VIN, then unit number, then plate — never list index",
  );
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /No Samsara ID on this truck/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-badges.tsx"), "utf8"), /isLiveSamsaraGps/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-badges.tsx"), "utf8"), /shortPlaceLabel|gpsMotionLabel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /table-grid-board/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/format.ts"), "utf8"), /export function shortPlaceLabel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/format.ts"), "utf8"), /export function gpsMotionLabel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/page.tsx"), "utf8"), /OrbcommTrailerImport/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/page.tsx"), "utf8"), /DriverImport/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-import.tsx"), "utf8"), /Import drivers/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-import.tsx"), "utf8"), /Driver spreadsheet/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/driver-import.tsx"), "utf8"), /Show Pay|Passport Expiry|Ascend|FAST|hazmat|team-2/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/driver-import-shared.ts"), "utf8"), /Christopher Howell/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/driver-import-shared.ts"), "utf8"), /passport|fast card|hazmat|show pay/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/page.tsx"), "utf8"), /Last GPS/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/page.tsx"), "utf8"), /TrailerLocationBadge/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/orbcomm-trailer-import.tsx"), "utf8"), /Last city \/ lat-lng/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/orbcomm-trailer-import.tsx"), "utf8"), /Device serial/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /device serial number/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /=== "asset id"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /findOrbcommHeader/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/samsara-truck-import.tsx"), "utf8"), /Import from Samsara/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/samsara-truck-import.tsx"), "utf8"), /preview\.warning/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/samsara-truck-import.tsx"), "utf8"), /Confirm import/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/samsara-truck-import.tsx"), "utf8"), /Re-import from Samsara/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/samsara-truck-import.tsx"), "utf8"), /TMS unit/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/samsara-truck-import.tsx"), "utf8"),
    /Fetch Samsara vehicles/,
  );
  const unit36Copy = /unit 36|including 36|Unit 36|JC.?s unit \*\*36/i;
  const unit28Copy = /unit 28|including 28|Unit 28|JC.?s unit \*\*28/i;
  const unit38Copy = /unit 38|including 38|Unit 38|old truck 38/i;
  for (const file of [
    "components/samsara-truck-import.tsx",
    "components/truck-form.tsx",
    "app/fleet/trucks/page.tsx",
    "lib/fleet-import-shared.ts",
    "lib/fleet-import.ts",
    "lib/integrations/samsara.ts",
    "lib/fleet-map.ts",
    "app/fleet/samsara/page.tsx",
    "app/fleet/orbcomm/page.tsx",
    "README.md",
    "SHIPPED.md",
  ]) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(process.cwd(), file), "utf8"),
      unit36Copy,
      `${file} must not hardcode unit 36 — match every Samsara vehicle the same way`,
    );
    assert.doesNotMatch(
      fs.readFileSync(path.join(process.cwd(), file), "utf8"),
      unit28Copy,
      `${file} must not hardcode unit 28 — match every Samsara vehicle the same way`,
    );
    assert.doesNotMatch(
      fs.readFileSync(path.join(process.cwd(), file), "utf8"),
      unit38Copy,
      `${file} must not hardcode a historical unit — skip inactive Samsara vehicles the same way`,
    );
  }
  const rowActions = fs.readFileSync(path.join(process.cwd(), "components/fleet-row-actions.tsx"), "utf8");
  assert.match(rowActions, /["']use client["']/);
  assert.match(rowActions, /from ["']@\/lib\/actions["']/);
  assert.match(rowActions, /useDismissable/);
  assert.match(rowActions, /claimOverflowMenu/);
  assert.match(rowActions, /createPortal/);
  assert.match(rowActions, /data-row-overflow-menu/);
  assert.match(rowActions, /data-row-overflow-trigger/);
  assert.doesNotMatch(rowActions, /<details/);
  assert.match(rowActions, /Edit/);
  assert.match(rowActions, /Update/);
  assert.match(rowActions, /Delete/);
  assert.doesNotMatch(rowActions, /from ["']@\/lib\/(db|env|settings|places)["']/);
  for (const file of ["app/fleet/trucks/page.tsx", "app/fleet/drivers/page.tsx", "app/fleet/trailers/page.tsx"]) {
    assert.match(fs.readFileSync(path.join(process.cwd(), file), "utf8"), /FleetRowActions/);
  }
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8"), /samsaraUnmatchedUnitsWarning/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8"), /samsaraOmittedVehiclesWarning/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /fleetUnitTokens/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /unionSamsaraVehicles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /unionActiveSamsaraVehicles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /keepActiveSamsaraVehicles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /samsaraRecordIsActive/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /matchTruckForSamsaraLive/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /matchTruckForSamsaraLive/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/samsara-truck-import.tsx"), "utf8"), /Fetch Samsara vehicles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8"), /resetSamsaraCache/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/orbcomm-trailer-import.tsx"), "utf8"), /Import from Orbcomm/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/orbcomm-trailer-import.tsx"), "utf8"), /Trailer spreadsheet/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /\/fleet\/vehicles/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /console\.log/);
  const orbcommAuth = fs.readFileSync(path.join(process.cwd(), "lib/integrations/orbcomm.ts"), "utf8");
  assert.doesNotMatch(orbcommAuth, /console\.log/);
  assert.match(orbcommAuth, /userName/);
  assert.match(orbcommAuth, /orgKey/);
  assert.match(orbcommAuth, /data\?\.accessToken|data\.accessToken/);
  assert.doesNotMatch(orbcommAuth, /accountId:/);
  assert.match(orbcommAuth, /getAssetStatus/);
  assert.match(orbcommAuth, /assetNames/);
  assert.match(orbcommAuth, /snapshotsFromLiveAssets/);
  assert.match(orbcommAuth, /returnTemp/);
  assert.match(orbcommAuth, /setpointTemp/);
  assert.match(orbcommAuth, /Authorization: token/);
  assert.doesNotMatch(orbcommAuth, /Bearer \$\{token\}/);
  const trailerShareUi = fs.readFileSync(path.join(process.cwd(), "components/trailer-share-link.tsx"), "utf8");
  assert.match(trailerShareUi, /Create customer link/);
  assert.match(trailerShareUi, /Copy link/);
  assert.match(trailerShareUi, /datetime-local/);
  assert.match(trailerShareUi, /name="expires_at"/);
  assert.match(trailerShareUi, /data-trailer-share-expires-input/);
  assert.doesNotMatch(trailerShareUi, /sendMail|mailto:|Email customer/);
  assert.doesNotMatch(trailerShareUi, /You send this link|Pins start when you create it/);
  assert.match(trailerShareUi, /if \(compact\)/);
  const compactShareStart = trailerShareUi.indexOf("if (compact)");
  const compactShareReturn = trailerShareUi.indexOf("return (", compactShareStart);
  const deskShareReturn = trailerShareUi.indexOf("return (", compactShareReturn + 1);
  const compactShareUi = trailerShareUi.slice(compactShareStart, deskShareReturn);
  assert.match(compactShareUi, /trailer-share-compact-row/);
  assert.match(compactShareUi, /Create link/);
  assert.match(compactShareUi, /linkState === "expired" \? "New link" : linkState === "live" \? "New" : "Create link"/);
  assert.match(compactShareUi, /"Copied" : "Copy"/);
  assert.match(compactShareUi, /formatCompactShareExpiry/);
  assert.match(compactShareUi, /compactTrailerShareState/);
  assert.match(compactShareUi, /Active · Exp/);
  assert.match(compactShareUi, /Expired \{expiryLabel\}/);
  assert.match(compactShareUi, /data-trailer-share-view/);
  assert.match(compactShareUi, /data-trailer-share-popover/);
  assert.match(compactShareUi, /absoluteShareUrl\(sharePath\)/);
  assert.doesNotMatch(compactShareUi, /title=\{sharePath\}/);
  assert.doesNotMatch(compactShareUi, /trailer-share-compact-path|text-overflow/);
  assert.doesNotMatch(compactShareUi, /space-y-2|break-all|Expires \{formatDateTime/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /trailer-share-compact-row,\s*\.trailer-share-compact-form \{\s*display:\s*flex;\s*align-items:\s*center;\s*gap:\s*6px;/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /trailer-share-compact-chip-live \{[\s\S]*background:\s*#e8eef6;[\s\S]*color:\s*#07325a;/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /trailer-share-compact-chip-expired \{[\s\S]*var\(--warning\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /trailer-share-compact-chip \{[\s\S]*border-radius:\s*var\(--r-xs\);/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /trailer-share-compact-path \{[\s\S]*text-overflow:\s*ellipsis;/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /\[data-orbcomm-status-table\] td \{[\s\S]*vertical-align:\s*middle;/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /trailer-share-compact-cell/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/shell-switch.tsx"), "utf8"), /pathname\.startsWith\("\/t\/"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/t/[token]/page.tsx"), "utf8"), /This link has expired/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/t/[token]/page.tsx"), "utf8"), /data-trailer-share-expired/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/t/[token]/page.tsx"), "utf8"), /Trailer location is no longer available/);
  const trailerSharePage = fs.readFileSync(path.join(process.cwd(), "app/t/[token]/page.tsx"), "utf8");
  assert.match(trailerSharePage, /data-trailer-share-temp/);
  assert.match(trailerSharePage, /data-trailer-share-location/);
  assert.match(trailerSharePage, /LoadMapCanvas/);
  assert.doesNotMatch(trailerSharePage, /data-trailer-share-pins|<ol |Setpoint|Last update/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/[id]/page.tsx"), "utf8"), /TrailerShareLinkPanel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /Customer link/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/trailer-share.ts"), "utf8"), /randomBytes/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/trailer-share.ts"), "utf8"), /fromOfficeDateTime/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/trailer-share.ts"), "utf8"), /lastKnownOrbcommSnapshot/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/trailer-share.ts"), "utf8"), /snapshot_latitude/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/shell-switch.tsx"), "utf8"), /pathname\.startsWith\("\/l\/"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/l/[token]/page.tsx"), "utf8"), /data-load-share-timeline/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/l/[token]/page.tsx"), "utf8"), /data-load-share-expired/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/l/[token]/page.tsx"), "utf8"), /sendMail|mailto:/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/t/[token]/page.tsx"), "utf8"), /data-trailer-share-live/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map.ts"), "utf8"), /samsaraTruckPinStyle/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map.ts"), "utf8"), /orbcommMapPinFromReading/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/trailer-share.ts"), "utf8"), /orbcommMapPinFromReading/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/control-center.ts"), "utf8"), /orbcommMapPinFromReading/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/control-center.ts"), "utf8"), /samsaraTruckPinStyle/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-share.ts"), "utf8"), /trailerPinColor/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/l/[token]/page.tsx"), "utf8"), /pinColor: view.trailerPinColor/);
  for (const file of [
    "app/t/[token]/page.tsx",
    "app/l/[token]/page.tsx",
    "app/driver/loads/[id]/trailer/page.tsx",
    "components/fleet-map-view.tsx",
    "components/control-center-view.tsx",
    "components/load-tracking-panel.tsx",
    "components/load-stops-map.tsx",
  ]) {
    assert.match(fs.readFileSync(path.join(process.cwd(), file), "utf8"), /LoadMapCanvas/, `${file} must use the shared teardrop pin map`);
  }
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-map-canvas.tsx"), "utf8"), /clusterLoadMapPoints/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/control-center-view.tsx"), "utf8"), /data-control-filter-strip/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/control-center-view.tsx"), "utf8"), /Orders/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/control-center-view.tsx"), "utf8"), /Resources/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-chat-panel.tsx"), "utf8"), /data-load-chat/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-share-link.tsx"), "utf8"), /data-load-share-create/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/load-share-link.tsx"), "utf8"), /sendMail|mailto:/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/auto-invoice.ts"), "utf8"), /maybeAutoInvoiceLoad/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/auto-invoice.ts"), "utf8"), /resolveInvoiceCustomerEmail/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-overlay.tsx"), "utf8"), /data-load-overlay/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/status-badge.tsx"), "utf8"), /loadStatusBadgeClass/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/driver-trailer.ts"), "utf8"), /driverLoadHasAssignedTrailer/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8"), /LoadChatPanel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-share.ts"), "utf8"), /invoice_sent/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "SHIPPED.md"), "utf8"), /Approved spec \(2026-09-02\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/format.ts"), "utf8"), /fromOfficeDateTime/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "scripts/start-standalone.mjs"), "utf8"), /copyStandaloneWebAssets/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-form-shared.ts"), "utf8"), /driverFormValues/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/fleet-form-shared.ts"), "utf8"), /\bpin\b/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/new/page.tsx"), "utf8"), /driverOption/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/[id]/page.tsx"), "utf8"), /truckFormValues/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/app-shell.tsx"), "utf8"), /MikeLauncher/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/mike-launcher.tsx"), "utf8"), />\s*Mike\s*</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8"), /force-dynamic/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8"), /MikeLauncher|mikeConfigured/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /MikeChat/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/driver/page.tsx"), "utf8"), /MikeChat|MikeLauncher/);
  for (const file of ["components/mike-chat.tsx", "components/mike-launcher.tsx", "components/app-shell.tsx"]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /from ["']@\/lib\/(db|env|settings|places)["']/, `${file} must stay client-safe`);
    assert.doesNotMatch(source, /tie-sheet-fixtures/, `${file} must not import test fixtures`);
    assert.doesNotMatch(source, /from ["']@\/lib\/tie-sheet["']/, `${file} must not import server tie-sheet`);
  }
  const mikeChatUi = fs.readFileSync(path.join(process.cwd(), "components/mike-chat.tsx"), "utf8");
  assert.match(mikeChatUi, /data-tie-sheet-image/);
  assert.match(mikeChatUi, /accept="image\/\*"/);
  assert.match(mikeChatUi, /data-tie-sheet-discard/);
  assert.match(mikeChatUi, /build_tie_sheet/);
  assert.match(mikeChatUi, /Confirm saves the load\. Discard does not/);
  assert.match(mikeChatUi, /imageFileFromDataTransfer/);
  assert.match(mikeChatUi, /addEventListener\("paste"/);
  assert.match(mikeChatUi, /data-mike-composer/);
  assert.doesNotMatch(mikeChatUi, /paste the truck|markdown paste|From Tie Sheet/);
  assert.doesNotMatch(mikeChatUi, /Grok Bot|Google Sheet|file watcher|shared folder/);
  const { imageFileFromDataTransfer, namedTieSheetImage } = await import("../lib/mike-shared");
  const phoneSnap = new File([Uint8Array.from([1, 2, 3, 4])], "IMG_2041.PNG", { type: "image/png" });
  assert.equal(imageFileFromDataTransfer({ files: [phoneSnap], items: [] })?.name, "IMG_2041.PNG");
  assert.equal(
    imageFileFromDataTransfer({
      files: [],
      items: [{ kind: "file", type: "image/jpeg", getAsFile: () => phoneSnap }],
    })?.name,
    "IMG_2041.PNG",
  );
  assert.equal(
    imageFileFromDataTransfer({
      files: [],
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    }),
    null,
  );
  const clipboardBlob = new File([Uint8Array.from([9, 8, 7])], "", { type: "image/png" });
  assert.equal(namedTieSheetImage(clipboardBlob).name, "tie-sheet.png");
  assert.equal(namedTieSheetImage(clipboardBlob).type, "image/png");
  const newLoadNoTieSheetPaste = fs.readFileSync(path.join(process.cwd(), "app/loads/new/page.tsx"), "utf8");
  assert.doesNotMatch(newLoadNoTieSheetPaste, /From Tie Sheet|tie.sheet paste|paste a Tie Sheet/);
  const tieSheetAiSrc = fs.readFileSync(path.join(process.cwd(), "lib/tie-sheet-ai.ts"), "utf8");
  assert.match(tieSheetAiSrc, /MIKE_OPENAI_MODEL/);
  assert.match(tieSheetAiSrc, /redactTieSheetSecrets/);
  assert.doesNotMatch(tieSheetAiSrc, /console\.log/);
  assert.doesNotMatch(tieSheetAiSrc, /Grok Bot|googleusercontent|spreadsheets/);
  const tieSheetSharedSrc = fs.readFileSync(path.join(process.cwd(), "lib/tie-sheet-shared.ts"), "utf8");
  assert.match(tieSheetSharedSrc, /Nebraska Cold Storage Inc/);
  assert.match(tieSheetSharedSrc, /M&S Loads/);
  assert.match(tieSheetSharedSrc, /groupTieSheetOrdersByDock/);
  assert.match(tieSheetSharedSrc, /tieSheetSameDockFamily/);
  assert.match(tieSheetSharedSrc, /Never group by city alone/);
  assert.match(tieSheetSharedSrc, /western-kosher-heartland/);
  assert.match(tieSheetSharedSrc, /fillAmbiguousTieSheetFields/);
  const fixtureSrc = fs.readFileSync(path.join(process.cwd(), "lib/tie-sheet-fixtures.ts"), "utf8");
  assert.match(fixtureSrc, /THREE drops/);
  assert.match(fixtureSrc, /not a happy-path same-drop/);
  assert.match(fixtureSrc, /0824-10E Bozzutos/);
  assert.match(fixtureSrc, /Ignore unnumbered 0831- PFG/);
  assert.doesNotMatch(fixtureSrc, /googleusercontent|Drive auto-pull|Grok Bot/);
  assert.match(tieSheetAiSrc, /do not group by city/);
  assert.match(tieSheetAiSrc, /Heartland Kosher and Western Kosher/);
  assert.match(fixtureSrc, /tie-sheet-0824-14M\.png/);
  assert.match(fixtureSrc, /green load-ID cell/);
  assert.match(fixtureSrc, /often no header/);
  assert.match(fixtureSrc, /no TOTAL line/);
  assert.match(tieSheetAiSrc, /often NO header row/);
  assert.match(tieSheetAiSrc, /green load-ID cell/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/tie-sheet-ai.ts"), "utf8"), /Order# \/ Control#/);
  assert.doesNotMatch(tieSheetSharedSrc, /Liftgate|Inside Pickup|Inside Delivery/);
  assert.doesNotMatch(tieSheetSharedSrc, /one drop per truck/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/tie-sheet.ts"), "utf8"), /console\.log/);
  const mikeSrc = fs.readFileSync(path.join(process.cwd(), "lib/mike.ts"), "utf8");
  assert.match(mikeSrc, /Never invent GPS|hasPosition/);
  assert.match(mikeSrc, /emptyDrivers/);
  assert.match(mikeSrc, /goingEmptySoon/);
  assert.match(mikeSrc, /closestToCity/);
  assert.match(mikeSrc, /skippedNoPing/);
  assert.match(mikeSrc, /mikeGpsPointsFromFleet/);
  assert.match(mikeSrc, /buildMikeGpsContext/);
  assert.match(mikeSrc, /attachMikeFleetTelemetry/);
  assert.match(mikeSrc, /lastGps/);
  assert.match(mikeSrc, /resetSamsaraCache\(\)/);
  assert.match(mikeSrc, /Do not say you have no GPS when any lastGps.hasPosition is true/);
  assert.match(mikeSrc, /formatClosestCityReply/);
  assert.match(mikeSrc, /resolveClosestCityRanking/);
  assert.match(mikeSrc, /geocodeAddress/);
  assert.match(mikeSrc, /isClosestCityQuestion/);
  assert.match(mikeSrc, /Never say no trucks ranked closest/);
  assert.match(mikeSrc, /tmsStats/);
  assert.match(mikeSrc, /answerMikeTmsQuestion/);
  assert.match(mikeSrc, /answerMikeReeferFromOrbcomm/);
  assert.match(mikeSrc, /loadStopSummaries/);
  assert.match(mikeSrc, /await geocode\(asked\)/);
  const cityCoordsSrc = fs.readFileSync(path.join(process.cwd(), "lib/city-coords-shared.ts"), "utf8");
  assert.match(cityCoordsSrc, /Des Moines/);
  assert.match(cityCoordsSrc, /formatClosestCityReply/);
  assert.match(cityCoordsSrc, /isClosestCityQuestion/);
  assert.match(cityCoordsSrc, /rankTrucksToCoords/);
  assert.doesNotMatch(cityCoordsSrc, /no trucks ranked/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import-shared.ts"), "utf8"), /matchLinkedSamsaraVehicle/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /extractSamsaraGps/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"),
    /export function resetSamsaraCache/,
  );
  assert.match(mikeSrc, /MIKE_OPENAI_MODEL/);
  assert.match(mikeSrc, /MIKE_MISSING_KEY_MESSAGE/);
  assert.doesNotMatch(mikeSrc, /board only/);
  assert.doesNotMatch(mikeSrc, /console\.log/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/mike-actions.ts"), "utf8"), /loadRuntimeEnv/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/mike/route.ts"), "utf8"), /loadRuntimeEnv/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/mike/route.ts"), "utf8"), /force-dynamic/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8"), /loadRuntimeEnv/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "instrumentation.ts"), "utf8"), /loadLocalEnv/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/mike.ts"), "utf8"), /loadRuntimeEnv/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /loadRuntimeEnv/);
  assert.match(readme, /every dispatcher page/);
  assert.match(readme, /process\.cwd\(\)\/\.env/);
  assert.match(readme, /\.next\/standalone\/\.env/);
  const envSrc = fs.readFileSync(path.join(process.cwd(), "lib/env.ts"), "utf8");
  assert.match(envSrc, /getOpenAiApiKey/);
  assert.match(envSrc, /runtimeEnvFiles/);
  assert.match(envSrc, /readRuntimeSecret/);
  assert.match(envSrc, /loadRuntimeEnv/);
  assert.match(envSrc, /cleanSecretValue/);
  assert.match(envSrc, /gpt-4o-mini/);
  assert.doesNotMatch(envSrc, /gpt-4o"/);
  assert.doesNotMatch(envSrc, /console\.log/);
  assert.match(envExample, /OPENAI_API_KEY=/);
  assert.doesNotMatch(envExample, /OPENAI_MODEL=/);
  assert.match(envExample, /GOOGLE_PLACES_API_KEY/);
  assert.match(envExample, /HTTP referrer/);
  const placeSearchSource = fs.readFileSync(path.join(process.cwd(), "components/place-search.tsx"), "utf8");
  assert.match(placeSearchSource, /Search is off/);
  assert.doesNotMatch(placeSearchSource, /from ["']@\/lib\/places["']/);
  assert.doesNotMatch(placeSearchSource, /from ["']@\/lib\/env["']/);
  const locationFormSource = fs.readFileSync(path.join(process.cwd(), "components/location-form.tsx"), "utf8");
  assert.doesNotMatch(locationFormSource, /place\.street \|\| place\.formatted/);
  assert.match(locationFormSource, /if \(place\.street\) setStreet\(place\.street\)/);
  const locationPickerSource = fs.readFileSync(path.join(process.cwd(), "components/location-picker.tsx"), "utf8");
  assert.match(locationPickerSource, /searchPlacesAction/);
  assert.match(locationPickerSource, /onPlacePick/);
  assert.doesNotMatch(locationPickerSource, /from ["']@\/lib\/places["']/);
  const stopsPanelSource = fs.readFileSync(path.join(process.cwd(), "components/load-stops-panel.tsx"), "utf8");
  assert.match(stopsPanelSource, /placesEnabled/);
  assert.match(stopsPanelSource, /htmlFor="stop-street"/);
  for (const file of [
    "components/rate-con-import.tsx",
    "components/rate-con-apply.tsx",
    "components/rate-con-location-review.tsx",
    "components/rate-con-review.tsx",
    "components/load-form.tsx",
    "components/load-basics-screen.tsx",
    "components/load-rate-fields.tsx",
    "components/load-pay-items.tsx",
    "components/load-customer-screen.tsx",
    "components/load-carrier-screen.tsx",
    "components/load-lane-fields.tsx",
    "lib/rate-con-shared.ts",
    "lib/reefer-shared.ts",
    "components/make-bol-button.tsx",
    "components/defaulted-documents.tsx",
    "components/document-preview.tsx",
    "components/open-attachment-link.tsx",
    "lib/load-documents-shared.ts",
    "components/master-load-panel.tsx",
    "lib/master-load-shared.ts",
    "lib/owner-operator-shared.ts",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /from ["']@\/lib\/rate-con["']/, `${file} must not import server rate-con`);
    assert.doesNotMatch(source, /from ["']@\/lib\/rate-con-ai["']/, `${file} must not import server rate-con AI`);
    assert.doesNotMatch(source, /from ["']@\/lib\/(db|env|settings|places|bol)["']/, `${file} must stay client-safe`);
  }
  const bolFormSource = fs.readFileSync(path.join(process.cwd(), "components/make-bol-button.tsx"), "utf8");
  assert.match(bolFormSource, /ITEMS/);
  assert.match(bolFormSource, /BOL Items/);
  assert.match(bolFormSource, /Freight Charges/);
  assert.match(bolFormSource, /Print BOL/);
  assert.match(bolFormSource, /Reefer setpoint/);
  assert.match(bolFormSource, /bol_trailer/);
  assert.match(bolFormSource, /name=["']bol_seal["']/);
  assert.match(bolFormSource, /Add seal/);
  assert.match(bolFormSource, /from ["']@\/lib\/bol-shared["']/);
  assert.match(bolFormSource, /data-ignore-dirty/);
  assert.match(bolFormSource, /data-bol-print-view/);
  assert.match(bolFormSource, /OpenAttachmentLink/);
  assert.match(bolFormSource, /type="button"/);
  assert.doesNotMatch(bolFormSource, /<a[^>]+href=\{`\/api\/attachments/);
  const defaultedUi = fs.readFileSync(path.join(process.cwd(), "components/defaulted-documents.tsx"), "utf8");
  assert.match(defaultedUi, /Your defaulted documents/);
  assert.match(defaultedUi, /data-defaulted-documents/);
  assert.match(defaultedUi, /Generate missing/);
  assert.match(defaultedUi, /master BOL with every stop/);
  assert.match(defaultedUi, /cities only/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/document-preview.tsx"), "utf8"), /Document Preview \/ Edit/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/document-preview.tsx"), "utf8"), /data-document-preview/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-workspace.tsx"), "utf8"), /DocumentPreviewProvider/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-workspace.tsx"), "utf8"), /Your defaulted documents/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /DefaultedDocuments/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/open-attachment-link.tsx"), "utf8"), /useDocumentPreview/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-documents-shared.ts"), "utf8"), /bol_third_party/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-documents-shared.ts"), "utf8"), /BOL-master/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-documents-shared.ts"), "utf8"), /isCustomerRateDocument/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-documents.ts"), "utf8"), /generateDefaultedDocument/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-documents.ts"), "utf8"), /buildAscendBolModel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/bol-ascend.ts"), "utf8"), /BILL OF LADING/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/loads/[id]/documents/route.ts"), "utf8"), /generateDefaultedDocument/);
  const { cityStateOnly } = await import("../lib/load-documents-shared");
  assert.equal(cityStateOnly("275 Blair rd, Avenel, NJ 07001"), "Avenel, NJ 07001");
  const { matchLocationForPlace } = await import("../lib/places-shared");
  const matchedId = matchLocationForPlace(
    [
      {
        id: 9,
        name: "Lineage Logistics - Avenel",
        street: "275 Blair rd",
        city: "Avenel",
        state: "NJ",
        zip: "07001",
      },
    ],
    {
      placeId: "place-lineage",
      name: "Lineage Logistics - Avenel",
      street: "275 Blair rd",
      city: "Avenel",
      state: "NJ",
      zip: "07001",
      formatted: "275 Blair rd, Avenel, NJ 07001",
      latitude: 40.57,
      longitude: -74.28,
    },
  );
  assert.equal(matchedId, 9);
  assert.equal(
    matchLocationForPlace([], {
      placeId: "",
      name: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      formatted: "",
      latitude: null,
      longitude: null,
    }),
    null,
  );
  const placesShared = await import("../lib/places-shared");
  assert.equal(placesShared.nyBoroughStateError("Bronx", "NJ"), "Bronx is in New York. Use NY, not NJ.");
  assert.equal(placesShared.nyBoroughStateError("Brooklyn", "NY"), null);
  assert.equal(placesShared.nyBoroughStateError("Hastings", "NE"), null);
  assert.equal(placesShared.applyNyBoroughState("Bronx", "NJ"), "NY");
  const locFormat = await import("../lib/locations");
  assert.equal(
    locFormat.formatLoadLaneFromStops(
      [
        { kind: "pickup", city: "Hastings", state: "NE" },
        { kind: "delivery", city: "Brooklyn", state: "NY" },
        { kind: "delivery", city: "Bayonne", state: "NJ" },
      ],
    ),
    "Hastings, NE → Bayonne, NJ",
  );
  assert.equal(
    locFormat.formatStopRowAddress(
      { street: "", city: "Hastings", state: "NE", zip: "68901" },
      { street: "4100 Industrial Rd", city: "Hastings", state: "NE", zip: "68901" },
    ),
    "4100 Industrial Rd, Hastings, NE 68901",
  );
  const { stopMapMarkerText } = await import("../lib/stops-shared");
  assert.equal(stopMapMarkerText("pickup", 1), "P1");
  assert.equal(stopMapMarkerText("delivery", 2), "D2");
  const savedMapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const savedPlacesKey = process.env.GOOGLE_PLACES_API_KEY;
  const { searchPlaces } = await import("../lib/places");
  process.env.GOOGLE_MAPS_API_KEY = "";
  process.env.GOOGLE_PLACES_API_KEY = "";
  assert.deepEqual(await searchPlaces("Avenel NJ"), [], "missing key must not call Google");
  if (savedMapsKey == null) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = savedMapsKey;
  if (savedPlacesKey == null) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = savedPlacesKey;

  const { getDataDir } = await import("../lib/db");
  const previousDataDir = process.env.TMS_DATA_DIR;
  process.env.TMS_DATA_DIR = projectData;
  assert.equal(getDataDir(), projectData);
  if (previousDataDir == null) delete process.env.TMS_DATA_DIR;
  else process.env.TMS_DATA_DIR = previousDataDir;

  const { listExceptionInbox } = await import("../lib/exceptions");
  const inbox = listExceptionInbox();
  assert.ok(inbox.attentionCount >= 1, "seed exception inbox should not be empty");
  assert.ok(inbox.items.length >= 1);
  const kinds = new Set(inbox.items.map((item) => item.kind));
  assert.ok(kinds.has("reefer"), "seed reefer vs setpoint");
  assert.ok(kinds.has("late"), "seed late vs window");
  assert.ok(kinds.has("missing_pod"), "seed missing POD");
  assert.ok(kinds.has("compliance"), "seed compliance");
  assert.ok(kinds.has("unassigned"), "seed unassigned");
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  assert.equal(inbox.items[0].severity, "CRITICAL");
  for (let index = 1; index < inbox.items.length; index += 1) {
    assert.ok(
      rank[inbox.items[index].severity] >= rank[inbox.items[index - 1].severity],
      "inbox must be ranked CRITICAL → LOW",
    );
  }
  const quiet = queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1050");
  assert.ok(quiet);
  assert.equal(
    inbox.items.some((item) => item.loadId === quiet.id),
    false,
    "future unassigned load stays off the inbox",
  );
  assert.ok(inbox.fineCount >= 1, "some open loads should be fine");
  const { groupInboxExceptions } = await import("../lib/exceptions");
  const sameLoadIssues = inbox.items.filter((item) => item.loadId === inbox.items[0]?.loadId);
  if (sameLoadIssues.length > 1) {
    const groupedSame = groupInboxExceptions(sameLoadIssues);
    assert.equal(groupedSame.length, 1);
    assert.equal(groupedSame[0]?.items.length, sameLoadIssues.length);
  }
  const triple = groupInboxExceptions([
    {
      id: "1055:late",
      loadId: 1055,
      loadNumber: "MSE-1055",
      customerName: "M & S Loads LLC.",
      origin: "Hastings, NE",
      destination: "Harlan, IA",
      kind: "late",
      severity: "HIGH",
      title: "Late to pickup",
      detail: "Pickup window ended",
      demo: false,
    },
    {
      id: "1055:reefer",
      loadId: 1055,
      loadNumber: "MSE-1055",
      customerName: "M & S Loads LLC.",
      origin: "Hastings, NE",
      destination: "Harlan, IA",
      kind: "reefer",
      severity: "MEDIUM",
      title: "Reefer off setpoint",
      detail: "23.9°F · set 26°F",
      demo: false,
    },
    {
      id: "1055:unassigned",
      loadId: 1055,
      loadNumber: "MSE-1055",
      customerName: "M & S Loads LLC.",
      origin: "Hastings, NE",
      destination: "Harlan, IA",
      kind: "unassigned",
      severity: "MEDIUM",
      title: "Unassigned — window passed",
      detail: "Still needs a unit.",
      demo: false,
    },
  ]);
  assert.equal(triple.length, 1, "one card per load");
  assert.equal(triple[0]?.loadNumber, "MSE-1055");
  assert.equal(triple[0]?.items.length, 3);
  assert.equal(new Set(triple.map((group) => group.loadNumber)).size, triple.length);
  const reeferOnly = groupInboxExceptions(triple[0].items.filter((item) => item.kind === "reefer"));
  assert.equal(reeferOnly.length, 1);
  assert.equal(reeferOnly[0]?.items.length, 1);
  assert.equal(reeferOnly[0]?.items[0]?.kind, "reefer");
  const inboxUi = fs.readFileSync(path.join(process.cwd(), "components/exception-inbox.tsx"), "utf8");
  const workbenchCardUi = fs.readFileSync(path.join(process.cwd(), "components/workbench-load-card.tsx"), "utf8");
  const issueLineUi = fs.readFileSync(path.join(process.cwd(), "components/exception-issue-line.tsx"), "utf8");
  assert.match(inboxUi, /groupInboxExceptions/);
  assert.match(inboxUi, /data-attention-load/);
  assert.match(inboxUi, /variant === "workbench"/);
  assert.match(inboxUi, /WorkbenchLoadCard/);
  assert.match(inboxUi, /data-workbench-cards/);
  assert.match(inboxUi, /items-stretch/);
  assert.match(inboxUi, /md:grid-cols-2/);
  assert.match(inboxUi, /xl:grid-cols-3/);
  assert.doesNotMatch(inboxUi, /items-start gap-3 md:grid-cols-2/);
  assert.doesNotMatch(inboxUi, /grid gap-6/);
  assert.doesNotMatch(inboxUi, /inbox\.items\.map\(\(item\)/);
  assert.match(issueLineUi, /data-attention-issue/);
  assert.match(issueLineUi, /Snooze 4h/);
  assert.match(issueLineUi, /if \(compact\)/);
  const compactStart = issueLineUi.indexOf("if (compact)");
  const compactReturn = issueLineUi.indexOf("return (", compactStart);
  const deskReturn = issueLineUi.indexOf("return (", compactReturn + 1);
  assert.doesNotMatch(issueLineUi.slice(compactStart, deskReturn), /Snooze 4h|exceptionAction/);
  assert.match(workbenchCardUi, /LoadMapCanvas/);
  assert.match(workbenchCardUi, /buildStopsMapModel/);
  assert.match(workbenchCardUi, /data-workbench-card/);
  assert.match(workbenchCardUi, /data-workbench-map-thumb/);
  assert.match(workbenchCardUi, /workbench-card-issues/);
  assert.match(workbenchCardUi, /No open issues/);
  assert.match(workbenchCardUi, /h-20 w-20/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /min-height: 11\.5rem/);
  assert.match(workbenchCardUi, /mapsBrowserKey/);
  assert.match(workbenchCardUi, /data-workbench-lane-sketch/);
  assert.match(workbenchCardUi, /LoadCardFastActions/);
  assert.doesNotMatch(workbenchCardUi, /exceptionAction|Snooze 4h/);
  assert.match(workbenchCardUi, /listStopAppointmentTargets/);
  assert.match(workbenchCardUi, /findCityCenter/);
  assert.match(workbenchCardUi, /compact/);
  assert.doesNotMatch(workbenchCardUi, /h-56/);
  assert.doesNotMatch(workbenchCardUi, /min-h-\[14rem\]/);
  assert.doesNotMatch(workbenchCardUi, /md:grid-cols-\[minmax/);
  assert.doesNotMatch(workbenchCardUi, /maps\.google\.com\/maps\?/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-map-canvas.tsx"), "utf8"), /maps\.googleapis\.com\/maps\/api\/js/);
  const { isOutOfToleranceException } = await import("../lib/exceptions");
  assert.equal(isOutOfToleranceException({ kind: "late", severity: "MEDIUM" }), false);
  assert.equal(isOutOfToleranceException({ kind: "late", severity: "HIGH" }), true);
  assert.equal(isOutOfToleranceException({ kind: "late", severity: "CRITICAL" }), true);
  assert.equal(isOutOfToleranceException({ kind: "detention", severity: "HIGH" }), true);
  assert.equal(isOutOfToleranceException({ kind: "reefer", severity: "MEDIUM" }), true);
  assert.equal(isOutOfToleranceException({ kind: "missing_contact", severity: "CRITICAL" }), true);
  assert.equal(isOutOfToleranceException({ kind: "unassigned", severity: "MEDIUM" }), false);
  assert.equal(isOutOfToleranceException({ kind: "missing_pod", severity: "HIGH" }), false);
  assert.equal(isOutOfToleranceException({ kind: "compliance", severity: "HIGH" }), false);
  const workbenchUi = fs.readFileSync(path.join(process.cwd(), "components/load-log-section.tsx"), "utf8");
  assert.match(workbenchUi, /listLoadTimeline/);
  assert.match(workbenchUi, /Load Timeline/);
  assert.match(workbenchUi, /data-timeline-newest-first/);

  const customerId = queries.createCustomer({
    name: "Smoke Test Shipper",
    billing_notes: "Net 15",
    contacts: [{ name: "Pat Dispatcher", role: "Shipping", phone: "555-0100", email: "pat@example.com" }],
  });
  const truckId = queries.createTruck({
    unit_number: "999",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
  });
  const driverId = queries.createDriver({
    name: "Riley Smoke",
    phone: "555-0199",
    license: "TN-CDL-SMOKE",
    pin: "4321",
    truck_id: truckId,
    status: "available",
  });
  const otherDriverId = queries.createDriver({
    name: "Casey Relay",
    phone: "555-0111",
    license: "AL-CDL-RELAY",
    pin: "2222",
    truck_id: null,
    status: "available",
  });
  assert.equal(queries.getDriver(driverId)?.division || "MSE", "MSE");
  assert.equal(queries.getTruck(truckId)?.division || "MSE", "MSE");
  queries.updateDriver(driverId, {
    ...queries.getDriver(driverId)!,
    license: queries.getDriver(driverId)!.license,
    truck_id: truckId,
    status: "available",
    division: "MSX",
  });
  queries.updateTruck(truckId, {
    unit_number: "999",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
    division: "MSX",
  });
  const msxTrailerId = queries.createTrailer({ unit_number: "DIV-MSX", type: "reefer", division: "MSX" });
  assert.equal(queries.getDriver(driverId)?.division, "MSX");
  assert.equal(queries.getTruck(truckId)?.division, "MSX");
  assert.equal(queries.getTrailer(msxTrailerId)?.division, "MSX");
  queries.updateDriver(driverId, {
    ...queries.getDriver(driverId)!,
    license: queries.getDriver(driverId)!.license,
    truck_id: truckId,
    status: "available",
    division: "MSE",
  });
  queries.updateTruck(truckId, {
    unit_number: "999",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
    division: "MSE",
  });

  const pickup = new Date();
  pickup.setDate(pickup.getDate() + 1);
  pickup.setHours(8, 0, 0, 0);
  const pickupEnd = new Date(pickup);
  pickupEnd.setHours(12, 0, 0, 0);
  const delivery = new Date(pickup);
  delivery.setDate(delivery.getDate() + 1);
  const deliveryEnd = new Date(delivery);
  deliveryEnd.setHours(16, 0, 0, 0);

  const loadId = queries.createLoad({
    customer_id: customerId,
    origin: "Jackson, MS",
    destination: "Birmingham, AL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 32000,
    commodity: "Paper rolls",
    rate: 1400,
    notes: "Smoke-test load",
    special_instructions: "Call receiver 30 minutes out. Driver assist.",
    appointment_notes: "Dock 2",
    reference_number: "RC-SMOKE",
    po_number: "PO-SMOKE",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });

  const created = queries.getLoad(loadId);
  assert.ok(created);
  assert.equal(created.status, "available");
  assert.match(created.load_number, /^MSE-\d+$/);

  const { listLoadTimeline } = await import("../lib/load-timeline");
  const { runWithAuditActor, recordLoadAudit } = await import("../lib/audit");
  const { listWorkbenchInbox, setExceptionState } = await import("../lib/desk");
  const stopsMod = await import("../lib/stops");
  assert.deepEqual(listLoadTimeline(-1), [], "timeline must not invent events that are not in the system");
  assert.equal(
    listLoadTimeline(loadId).some((row) => row.source === "samsara" || row.source === "orbcomm"),
    false,
    "create audit is real; Samsara/Orbcomm stay off until arrive/depart or a material reefer event",
  );
  const arriveAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const departAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const pingAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const missAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const statusAt = new Date().toISOString();
  stopsMod.ensureDefaultStops(loadId);
  const pickupStop = getDb()
    .prepare("SELECT id FROM load_stops WHERE load_id = ? AND kind = 'pickup' ORDER BY id LIMIT 1")
    .get(loadId) as { id: number } | undefined;
  if (pickupStop) {
    getDb()
      .prepare("UPDATE load_stops SET arrived_at = ?, departed_at = ? WHERE id = ?")
      .run(arriveAt, departAt, pickupStop.id);
  }
  getDb()
    .prepare(
      `INSERT INTO reefer_readings (
        load_id, truck_id, trailer_id, setpoint_f, temperature_f, door_open, alarm, source, recorded_at
      ) VALUES (?, NULL, '', 34, 34.2, 0, '', 'orbcomm', ?)`,
    )
    .run(loadId, pingAt);
  getDb()
    .prepare(
      `INSERT INTO reefer_readings (
        load_id, truck_id, trailer_id, setpoint_f, temperature_f, door_open, alarm, source, recorded_at
      ) VALUES (?, NULL, '', 34, 48.6, 0, 'HIGH TEMP', 'orbcomm', ?)`,
    )
    .run(loadId, missAt);
  runWithAuditActor({ name: "Pat Desk", kind: "dispatcher" }, () => {
    recordLoadAudit({
      loadId,
      action: "status",
      field: "status",
      oldValue: "available",
      newValue: "assigned",
    });
  });
  const timeline = listLoadTimeline(loadId);
  assert.ok(timeline.length >= 3, "timeline shows real arrive/depart, reefer miss, and dispatcher action");
  const times = timeline.map((row) => new Date(row.at).getTime());
  for (let index = 1; index < times.length; index += 1) {
    assert.ok(times[index] <= times[index - 1], "timeline is newest first");
  }
  assert.ok(timeline.some((row) => row.source === "samsara" && /Arrived/.test(row.title)));
  assert.ok(timeline.some((row) => row.source === "samsara" && /Departed/.test(row.title)));
  assert.ok(timeline.some((row) => row.source === "orbcomm" && /HIGH TEMP/.test(row.detail)));
  assert.ok(timeline.some((row) => row.source === "dispatcher" && row.actor === "Pat Desk"));
  assert.equal(
    timeline.some((row) => row.at === pingAt && row.source === "orbcomm"),
    false,
    "Orbcomm pings that are in tolerance stay off the timeline",
  );
  getDb().prepare("DELETE FROM reefer_readings WHERE load_id = ?").run(loadId);
  if (pickupStop) {
    getDb().prepare("UPDATE load_stops SET arrived_at = '', departed_at = '' WHERE id = ?").run(pickupStop.id);
  }
  getDb()
    .prepare("UPDATE loads SET contact_name = ?, contact_phone = ? WHERE id = ?")
    .run("Pat Broker", "", loadId);
  const namedNoPhone = listWorkbenchInbox().items.filter((item) => item.loadId === loadId);
  assert.ok(
    namedNoPhone.some((item) => item.kind === "missing_contact"),
    "blank rate-con phone is out of tolerance",
  );
  getDb()
    .prepare("UPDATE loads SET contact_name = ?, contact_phone = ? WHERE id = ?")
    .run("", "314-555-0100", loadId);
  const phoneNoName = (await import("../lib/exceptions"))
    .listExceptionInbox()
    .items.filter((item) => item.loadId === loadId && item.kind === "missing_contact");
  assert.equal(phoneNoName.length, 0, "blank name with a phone is in tolerance");
  getDb()
    .prepare("UPDATE loads SET contact_name = ?, contact_phone = ? WHERE id = ?")
    .run("Pat Broker", "", loadId);
  const beforeResolve = listWorkbenchInbox().items.filter((item) => item.loadId === loadId);
  assert.ok(beforeResolve.length >= 1, "workbench lists the out-of-tolerance load");
  for (const item of beforeResolve) {
    setExceptionState(item.id, "resolved", "back in tolerance");
  }
  assert.equal(
    listWorkbenchInbox().items.some((item) => item.loadId === loadId),
    false,
    "a load leaves the workbench when it is back in tolerance",
  );
  getDb()
    .prepare("UPDATE loads SET contact_name = ?, contact_phone = ? WHERE id = ?")
    .run("", "", loadId);

  const jamesId = queries.createDriver({
    name: "James Whitaker Smoke",
    phone: "555-0109",
    license: "MO-CDL-SMOKE-J",
    pin: "3311",
    truck_id: null,
    status: "available",
    driver_type: "company_driver",
    country: "USA",
    city: "St Louis",
    state: "MO",
  });
  const yoelId = queries.createDriver({
    name: "Yoel Feder Smoke",
    phone: "555-0110",
    license: "FL-CDL-SMOKE-Y",
    pin: "3312",
    truck_id: null,
    status: "available",
    driver_type: "company_driver",
    country: "USA",
    city: "Miami",
    state: "FL",
  });
  const persistLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Bronx, NY",
    destination: "Oklahoma City, OK",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Produce",
    rate: 2200,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "MSE-ASSIGN",
    po_number: "",
    reefer_setpoint_f: 34,
    reefer_mode: "continuous",
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: jamesId,
  });
  assert.equal(queries.getLoad(persistLoadId)?.driver_id, jamesId, "available load keeps the assigned driver");
  const persistBase = queries.getLoad(persistLoadId);
  assert.ok(persistBase);
  queries.updateLoad(persistLoadId, {
    customer_id: persistBase.customer_id,
    origin: persistBase.origin,
    destination: persistBase.destination,
    pickup_start: persistBase.pickup_start,
    pickup_end: persistBase.pickup_end,
    delivery_start: persistBase.delivery_start,
    delivery_end: persistBase.delivery_end,
    weight: persistBase.weight,
    commodity: persistBase.commodity,
    rate: persistBase.rate,
    notes: persistBase.notes,
    special_instructions: persistBase.special_instructions,
    appointment_notes: persistBase.appointment_notes,
    reference_number: persistBase.reference_number,
    po_number: persistBase.po_number,
    reefer_setpoint_f: persistBase.reefer_setpoint_f,
    reefer_mode: persistBase.reefer_mode,
    trailer_number: persistBase.trailer_number,
    trailer_id: persistBase.trailer_id,
    shipper_location_id: persistBase.shipper_location_id,
    consignee_location_id: persistBase.consignee_location_id,
    status: persistBase.status,
    truck_id: persistBase.truck_id,
    driver_id: yoelId,
  });
  assert.equal(queries.getLoad(persistLoadId)?.driver_id, yoelId, "driver assignment persists on save");
  const { parseLoadInput } = await import("../lib/load-input");
  const persistAfter = queries.getLoad(persistLoadId);
  assert.ok(persistAfter);
  const basicsOnly = new FormData();
  basicsOnly.set("status", "dispatched");
  basicsOnly.set("commodity", "Berries");
  basicsOnly.set("equipment", "reefer_53");
  const mergedBasics = parseLoadInput(basicsOnly, true, persistAfter);
  assert.equal(mergedBasics.customer_id, persistAfter.customer_id, "basics save keeps customer");
  assert.equal(mergedBasics.driver_id, persistAfter.driver_id, "basics save keeps assigned driver");
  assert.equal(mergedBasics.origin, persistAfter.origin, "basics save keeps origin");
  const firstDriverOnly = new FormData();
  firstDriverOnly.set("driver_id", String(jamesId));
  const firstDriverMerged = parseLoadInput(firstDriverOnly, true, { ...persistAfter, driver_id: null });
  assert.equal(firstDriverMerged.driver_id, jamesId, "first driver pick parses onto the existing load");
  assert.equal(firstDriverMerged.customer_id, persistAfter.customer_id);
  queries.updateLoad(persistLoadId, firstDriverMerged);
  assert.equal(queries.getLoad(persistLoadId)?.driver_id, jamesId, "first driver pick writes driver_id to sqlite");
  assert.equal(mergedBasics.commodity, "Berries");
  assert.equal(mergedBasics.status, "dispatched");
  const autoBasics = new FormData();
  autoBasics.set("commodity", "Lettuce");
  autoBasics.set("weight", "22000");
  autoBasics.set("temperature_f", "34");
  autoBasics.set("notes", "Call the dock");
  autoBasics.set("reefer_mode", "continuous");
  const autoMerged = parseLoadInput(autoBasics, true, persistAfter);
  assert.equal(autoMerged.commodity, "Lettuce");
  assert.equal(autoMerged.weight, 22000);
  assert.equal(autoMerged.temperature_f, 34);
  assert.equal(autoMerged.notes, "Call the dock");
  assert.equal(autoMerged.rate, persistAfter.rate, "everyday persist must not rewrite billed rate");
  assert.equal(autoMerged.customer_id, persistAfter.customer_id, "everyday persist must not rewrite customer");
  assert.equal(autoMerged.origin, persistAfter.origin, "everyday persist must not rewrite shipper lane");
  const customerOnly = new FormData();
  customerOnly.set("customer_id", String(persistAfter.customer_id));
  customerOnly.set("contact_name", "Pat");
  const mergedCustomer = parseLoadInput(customerOnly, true, persistAfter);
  assert.equal(mergedCustomer.commodity, persistAfter.commodity, "customer save keeps commodity");
  assert.equal(mergedCustomer.driver_id, persistAfter.driver_id, "customer save keeps driver");
  assert.equal(mergedCustomer.contact_name, "Pat");
  assert.throws(() => parseLoadInput(new FormData()), /Pick a customer/);

  const unassignedSaveId = queries.createLoad({
    customer_id: customerId,
    origin: "Dallas, TX",
    destination: "Houston, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 10000,
    commodity: "Dry",
    rate: 900,
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
  });
  const unassignedBase = queries.getLoad(unassignedSaveId);
  assert.ok(unassignedBase);
  queries.updateLoad(unassignedSaveId, {
    customer_id: unassignedBase.customer_id,
    origin: unassignedBase.origin,
    destination: unassignedBase.destination,
    pickup_start: unassignedBase.pickup_start,
    pickup_end: unassignedBase.pickup_end,
    delivery_start: unassignedBase.delivery_start,
    delivery_end: unassignedBase.delivery_end,
    weight: unassignedBase.weight,
    commodity: unassignedBase.commodity,
    rate: unassignedBase.rate,
    notes: unassignedBase.notes,
    special_instructions: unassignedBase.special_instructions,
    appointment_notes: unassignedBase.appointment_notes,
    reference_number: unassignedBase.reference_number,
    po_number: unassignedBase.po_number,
    reefer_setpoint_f: unassignedBase.reefer_setpoint_f,
    trailer_number: unassignedBase.trailer_number,
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  const savedUnassigned = queries.getLoad(unassignedSaveId);
  assert.equal(savedUnassigned?.status, "dispatched");
  assert.equal(savedUnassigned?.truck_id, null);
  assert.equal(savedUnassigned?.driver_id, null);

  const { truckStatusOptions } = await import("../lib/load-page-shared");
  assert.ok(truckStatusOptions("IN TRANSIT").some((item) => item.value === "IN TRANSIT"));
  assert.equal(
    truckStatusOptions("IN TRANSIT").some((item) => item.value === "rolling"),
    false,
    "do not invent a truck status",
  );
  const mse1055Id = queries.createLoad({
    load_number: "MSE-1055-REPRO",
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Harlan, IA",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Frozen",
    rate: 1800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_status: "IN TRANSIT",
    truck_id: null,
    driver_id: null,
  });
  const mse1055 = queries.getLoad(mse1055Id);
  assert.ok(mse1055);
  assert.equal(mse1055.status, "available");
  assert.equal(mse1055.truck_status, "IN TRANSIT");
  queries.updateLoadStatus(mse1055Id, "in_transit");
  assert.equal(queries.getLoad(mse1055Id)?.status, "in_transit");
  assert.equal(queries.getLoad(mse1055Id)?.truck_status, "IN TRANSIT", "Load Status write must leave Truck Status");
  queries.updateLoadTruckStatus(mse1055Id, "dispatched");
  assert.equal(queries.getLoad(mse1055Id)?.status, "in_transit", "Truck Status write must leave Load Status");
  assert.equal(queries.getLoad(mse1055Id)?.truck_status, "dispatched");
  const statusSave = new FormData();
  statusSave.set("status", "in_transit");
  statusSave.set("truck_status", "dispatched");
  const statusMerged = parseLoadInput(statusSave, true, mse1055);
  assert.equal(statusMerged.status, "in_transit");
  assert.equal(statusMerged.truck_status, "dispatched");
  assert.equal(statusMerged.rate, mse1055.rate, "status save must not invent a rate");
  queries.updateLoad(mse1055Id, statusMerged);
  const mse1055Saved = queries.getLoad(mse1055Id);
  assert.equal(mse1055Saved?.load_number, "MSE-1055-REPRO");
  assert.equal(mse1055Saved?.status, "in_transit", "Available → In Transit must persist on Save");
  assert.equal(mse1055Saved?.truck_status, "dispatched", "IN TRANSIT → Dispatched must persist on Save");
  const statusAgain = parseLoadInput(new FormData(), true, mse1055Saved);
  assert.equal(statusAgain.status, "in_transit", "a later save must not revert Load Status");
  assert.equal(statusAgain.truck_status, "dispatched", "a later save must not revert Truck Status");

  const cancelBoardId = queries.createLoad({
    customer_id: customerId,
    origin: "Memphis, TN",
    destination: "Nashville, TN",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 8000,
    commodity: "Mixed",
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
  });
  assert.equal(queries.listLoads({ status: "active" }).some((load) => load.id === cancelBoardId), true);
  queries.updateLoadStatus(cancelBoardId, "cancelled");
  assert.equal(queries.getLoad(cancelBoardId)?.status, "cancelled");
  assert.equal(
    queries.listLoads({ status: "active" }).some((load) => load.id === cancelBoardId),
    false,
    "cancel removes the load from the board list",
  );
  const planningIds = queries.listLoads({ status: "planning" }).map((load) => load.id);
  const planningStatuses = new Set(queries.listLoads({ status: "planning" }).map((load) => load.status));
  assert.ok(planningIds.length >= 1);
  assert.ok([...planningStatuses].every((status) => status === "available" || status === "hold"));
  assert.equal(planningIds.includes(cancelBoardId), false);
  const miscLoads = queries.listLoads({ status: "misc" });
  assert.ok(miscLoads.some((load) => load.id === cancelBoardId));
  assert.ok(miscLoads.every((load) => load.status === "cancelled" || load.status === "completed"));
  const masterOnlyLoads = queries.listLoads({ status: "all", masterOnly: true });
  assert.ok(masterOnlyLoads.every((load) => load.is_master || load.parent_load_id));
  const mineNone = queries.listLoads({ status: "all", dispatcherId: -1 });
  assert.equal(mineNone.length, 0);
  const sampleRefLoad = queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1042");
  assert.ok(sampleRefLoad);
  assert.ok(
    queries.listLoads({ status: "all", q: sampleRefLoad.customer_name.split(" ")[0] ?? "Heartland" }).some(
      (load) => load.id === sampleRefLoad.id,
    ),
  );

  const { addPayItem, billedCustomerRate, listPayItems } = await import("../lib/pay-items");
  const masterOtherCustomerId = queries.createCustomer({
    name: "Master Split Receiver",
    billing_notes: "",
    contacts: [],
  });
  const masterTripId = queries.createLoad({
    customer_id: customerId,
    load_number: "MSE-88801",
    origin: "Hastings, NE",
    destination: "Chicago, IL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "FRESH BEEF",
    rate: 2400,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 26,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const masterStops = (await import("../lib/stops")).ensureDefaultStops(masterTripId);
  const { createMasterChild, listChildLoads, listMasterFamily, setLoadIsMaster } = await import("../lib/master-load");
  assert.equal(queries.getLoad(masterTripId)?.is_master, 0, "new load should not start as a master");
  setLoadIsMaster(masterTripId, true);
  assert.equal(queries.getLoad(masterTripId)?.is_master, 1, "checkbox should mark the load as a master");
  setLoadIsMaster(masterTripId, false);
  assert.equal(queries.getLoad(masterTripId)?.is_master, 0, "unchecking should return the load to regular");
  const splitA = createMasterChild({
    parentId: masterTripId,
    customerId,
    stopIds: masterStops.map((stop) => stop.id),
    rate: 2400,
    copyFinancials: true,
  });
  assert.equal(splitA.load_number, "MSE-88801-A");
  assert.equal(splitA.parent_load_id, masterTripId);
  assert.equal(splitA.master_suffix, "A");
  assert.equal(queries.getLoad(masterTripId)?.is_master, 1, "adding a customer should mark the parent as a master");
  try {
    setLoadIsMaster(masterTripId, false);
    assert.fail("should not turn off a master that still has customer splits");
  } catch (error) {
    assert.match(String(error instanceof Error ? error.message : error), /customer splits/);
  }
  const masterDropStops = masterStops.filter((stop) => stop.kind === "delivery");
  const splitB = createMasterChild({
    parentId: masterTripId,
    customerId: masterOtherCustomerId,
    stopIds: (masterDropStops.length ? masterDropStops : masterStops).map((stop) => stop.id),
    rate: 800,
  });
  assert.equal(splitB.load_number, "MSE-88801-B");
  assert.equal(splitB.customer_name, "Master Split Receiver");
  assert.equal(listChildLoads(masterTripId).length, 2);
  assert.equal(listMasterFamily(splitB.id)[0]?.load_number, "MSE-88801");
  assert.ok((await import("../lib/stops")).listStops(splitB.id).length >= 1);
  try {
    (await import("../lib/invoice")).buildTmsInvoice(queries.getLoad(masterTripId)!);
    assert.fail("master trip should not invoice");
  } catch (error) {
    assert.match(String(error instanceof Error ? error.message : error), /customer splits|MSE-88801-A/);
  }
  const payLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Atlanta, GA",
    destination: "Macon, GA",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 12000,
    commodity: "Food",
    rate: 1100,
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
  });
  assert.equal(queries.getLoad(payLoadId)?.rate, 1100, "new-load rate becomes Financials customer rate");
  assert.equal(listPayItems(payLoadId).length, 0, "create rate does not also add a flat-rate pay line");
  assert.equal(billedCustomerRate(queries.getLoad(payLoadId)!), 1100);
  addPayItem(payLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Smoke Test Shipper",
    category: "flat_rate",
    rate: 1100,
    qty: 1,
    total: 1100,
    notes: "",
  });
  addPayItem(payLoadId, {
    side: "expense",
    bill_to: "driver",
    payee: "Yoel Feder Smoke",
    category: "lumper",
    rate: 150,
    qty: 1,
    total: 150,
    notes: "",
  });
  const payRows = listPayItems(payLoadId);
  assert.equal(payRows.length, 2, "add line item appends without a blank row");
  assert.equal(payRows.filter((item) => item.bill_to === "customer").length, 1);
  assert.equal(payRows.filter((item) => item.bill_to === "driver").length, 1);
  assert.equal(queries.getLoad(payLoadId)?.rate, 1100);

  queries.assignLoad(loadId, truckId, driverId);
  const assigned = queries.getLoad(loadId);
  assert.ok(assigned);
  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.truck_id, truckId);
  assert.equal(assigned.driver_id, driverId);
  assert.equal(queries.getTruck(truckId)?.status, "in_use");
  assert.equal(queries.getDriver(driverId)?.status, "on_duty");

  queries.assignLoad(loadId, truckId, otherDriverId);
  assert.equal(queries.getLoad(loadId)?.driver_id, otherDriverId);
  assert.equal(queries.listLoadsForDriver(driverId).some((load) => load.id === loadId), false);
  assert.equal(queries.listLoadsForDriver(otherDriverId).some((load) => load.id === loadId), true);

  queries.updateDriverProgress(loadId, otherDriverId, "en_route_pickup");
  assert.equal(queries.getLoad(loadId)?.status, "in_transit");
  queries.updateDriverProgress(loadId, otherDriverId, "loaded");
  queries.updateDriverProgress(loadId, otherDriverId, "en_route_delivery");
  queries.updateDriverProgress(loadId, otherDriverId, "delivered");
  assert.equal(queries.getLoad(loadId)?.status, "delivered");

  const { addAttachment, addFleetDocument, getAttachment, getAttachmentPath, listAttachments, listFleetDocuments } =
    await import("../lib/files");
  addAttachment({
    loadId,
    kind: "pod",
    originalName: "pod-smoke.pdf",
    buffer: Buffer.from("%PDF-1.4 smoke"),
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  assert.equal(listAttachments(loadId).some((file) => file.kind === "pod"), true);

  const { imagesToPdf, pdfFileName } = await import("../lib/image-pdf");
  // 1×1 PNG so the camera→PDF path can be tested without a phone.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000101000118dd8db00000000049454e44ae426082",
    "hex",
  );
  const cameraPdf = Buffer.from(await imagesToPdf([{ bytes: new Uint8Array(png), format: "png" }]));
  assert.equal(cameraPdf.subarray(0, 4).toString(), "%PDF");
  assert.match(pdfFileName("pod", "MSE-1045"), /^pod-MSE-1045-\d{4}-\d{2}-\d{2}\.pdf$/);
  const cameraAttachment = addAttachment({
    loadId,
    kind: "pod",
    originalName: pdfFileName("pod", "MSE-SMOKE"),
    buffer: cameraPdf,
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  const storedCamera = getAttachment(cameraAttachment.id);
  assert.ok(storedCamera);
  assert.equal(storedCamera.mime_type, "application/pdf");
  assert.equal(storedCamera.uploaded_by, "driver");
  assert.equal(fs.readFileSync(getAttachmentPath(storedCamera)).subarray(0, 4).toString(), "%PDF");
  const audit = await import("../lib/audit");
  const seedLoad = queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1042");
  assert.ok(seedLoad);
  assert.equal(audit.listLoadAudit(seedLoad.id).length, 0, "existing loads are not backfilled");
  const afterDelivery = queries.getLoad(loadId);
  assert.ok(afterDelivery);
  audit.runWithAuditActor({ name: "MS Test", kind: "dispatcher" }, () => {
    queries.updateLoad(loadId, {
      customer_id: afterDelivery.customer_id,
      origin: afterDelivery.origin,
      destination: afterDelivery.destination,
      pickup_start: afterDelivery.pickup_start,
      pickup_end: afterDelivery.pickup_end,
      delivery_start: afterDelivery.delivery_start,
      delivery_end: afterDelivery.delivery_end,
      weight: afterDelivery.weight,
      commodity: afterDelivery.commodity,
      rate: afterDelivery.rate,
      notes: afterDelivery.notes,
      special_instructions: "Hold at dock 4. Call receiver.",
      appointment_notes: afterDelivery.appointment_notes,
      reference_number: afterDelivery.reference_number,
      po_number: afterDelivery.po_number,
      reefer_setpoint_f: afterDelivery.reefer_setpoint_f,
      trailer_number: afterDelivery.trailer_number,
      trailer_id: afterDelivery.trailer_id,
      shipper_location_id: afterDelivery.shipper_location_id,
      consignee_location_id: afterDelivery.consignee_location_id,
      oo_percent: afterDelivery.oo_percent,
      oo_pay: afterDelivery.oo_pay,
      status: afterDelivery.status,
      truck_id: afterDelivery.truck_id,
      driver_id: afterDelivery.driver_id,
    });
  });
  addAttachment({
    loadId,
    kind: "rate_con",
    originalName: "rate-con-smoke.pdf",
    buffer: Buffer.from("%PDF-1.4 rate"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const { deleteAttachment, isPdfOrImage, replaceAttachment } = await import("../lib/files");
  const { labelForAttachmentKind } = await import("../lib/types");
  assert.equal(labelForAttachmentKind("rate_con"), "Rate confirmation");
  assert.equal(labelForAttachmentKind("invoice"), "Invoice (customer)");
  assert.equal(labelForAttachmentKind("carrier_invoice"), "Bill / carrier invoice");
  assert.equal(isPdfOrImage({ name: "invoice.pdf", type: "" }), true);
  assert.equal(isPdfOrImage({ name: "notes.txt", type: "text/plain" }), false);
  const customerInvoice = addAttachment({
    loadId,
    kind: "invoice",
    originalName: "customer-invoice.pdf",
    buffer: Buffer.from("%PDF-1.4 invoice-v1"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  addAttachment({
    loadId,
    kind: "invoice",
    originalName: "customer-invoice-revised.pdf",
    buffer: Buffer.from("%PDF-1.4 invoice-v1b"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  addAttachment({
    loadId,
    kind: "carrier_invoice",
    originalName: "carrier-bill.pdf",
    buffer: Buffer.from("%PDF-1.4 bill"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const oldInvoicePath = getAttachmentPath(customerInvoice);
  const replacedInvoice = replaceAttachment(customerInvoice.id, {
    originalName: "customer-invoice-v2.pdf",
    buffer: Buffer.from("%PDF-1.4 invoice-v2"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  assert.equal(replacedInvoice.original_name, "customer-invoice-v2.pdf");
  assert.equal(replacedInvoice.kind, "invoice");
  assert.equal(fs.existsSync(oldInvoicePath), false);
  assert.equal(fs.readFileSync(getAttachmentPath(replacedInvoice), "utf8").includes("invoice-v2"), true);
  assert.equal(listAttachments(loadId).filter((file) => file.kind === "invoice").length, 2);
  assert.equal(listAttachments(loadId).some((file) => file.kind === "rate_con"), true);
  const docsPanel = fs.readFileSync(path.join(process.cwd(), "components/attachments-panel.tsx"), "utf8");
  assert.match(docsPanel, /LOAD_DOCUMENT_KINDS/);
  assert.match(docsPanel, /download=1/);
  assert.match(docsPanel, /OpenAttachmentLink/);
  assert.match(docsPanel, /Replace/);
  assert.match(docsPanel, /Load documents/);
  assert.doesNotMatch(docsPanel, /<a[^>]+href=\{`\/api\/attachments/);
  const kindsSource = fs.readFileSync(path.join(process.cwd(), "lib/types.ts"), "utf8");
  assert.match(kindsSource, /Invoice \(customer\)/);
  assert.match(kindsSource, /Bill \/ carrier invoice/);
  deleteAttachment(cameraAttachment.id);
  const history = audit.listLoadAudit(loadId);
  assert.ok(history.some((row) => row.action === "create" && row.field === "load"));
  assert.ok(history.some((row) => row.action === "assign" && row.field === "driver"));
  assert.ok(history.some((row) => row.action === "status" && row.new_value === "delivered"));
  assert.ok(
    history.some(
      (row) =>
        row.action === "update" &&
        row.field === "special_instructions" &&
        row.new_value.includes("Hold at dock 4") &&
        row.actor === "MS Test",
    ),
  );
  assert.ok(history.some((row) => row.action === "rate_con" && row.new_value === "rate-con-smoke.pdf"));
  assert.ok(history.some((row) => row.action === "attachment" && row.old_value.includes("pod-MSE-SMOKE")));
  const { formatLoadSummary } = await import("../lib/load-summary");
  const companySummary = formatLoadSummary({
    load_number: "MSE-TEST",
    origin: "A",
    destination: "B",
    pickup_start: "2026-08-23T12:00:00.000Z",
    pickup_end: "2026-08-23T14:00:00.000Z",
    delivery_start: "2026-08-24T12:00:00.000Z",
    delivery_end: "2026-08-24T16:00:00.000Z",
    commodity: "Frozen",
    reefer_setpoint_f: 34,
    special_instructions: "Call ahead",
    appointment_notes: "",
    driver_name: "Priya Shah",
    driver_phone: "555-0100",
    driver_type: "company_driver",
    rate: 2150,
    oo_pay: null,
  });
  assert.match(companySummary, /MSE-TEST/);
  assert.match(companySummary, /Shipper\nA\nPickup /);
  assert.match(companySummary, /Receiver\nB\nDelivery /);
  assert.match(companySummary, /34\s*°F|34°F/);
  assert.match(companySummary, /Continuous/);
  assert.doesNotMatch(companySummary, /localhost|Driver app:/);
  assert.doesNotMatch(companySummary, /2150|\$2/);
  assert.match(companySummary, /\n\nShipper\n/);
  assert.match(companySummary, /\n\nReceiver\n/);
  const ooSummary = formatLoadSummary({
    ...{
      load_number: "MSE-OO",
      origin: "A",
      destination: "B",
      pickup_start: "2026-08-23T12:00:00.000Z",
      pickup_end: "2026-08-23T14:00:00.000Z",
      delivery_start: "2026-08-24T12:00:00.000Z",
      delivery_end: "2026-08-24T16:00:00.000Z",
      commodity: "Frozen",
      reefer_setpoint_f: null,
      special_instructions: "",
      appointment_notes: "",
      driver_name: "Cole",
      driver_phone: "555-0101",
      driver_type: "owner_operator",
      rate: 2000,
      oo_pay: 1500,
    },
  });
  assert.match(ooSummary, /1,500|1500/);
  const dispatchSummary = formatLoadSummary({
    load_number: "MSE-DISPATCH",
    origin: "Nashville, TN",
    destination: "Dallas, TX",
    pickup_start: "2026-08-23T12:00:00.000Z",
    pickup_end: "2026-08-23T14:00:00.000Z",
    delivery_start: "2026-08-24T12:00:00.000Z",
    delivery_end: "2026-08-24T16:00:00.000Z",
    commodity: "Chilled dairy",
    reefer_setpoint_f: 34,
    reefer_mode: "continuous",
    special_instructions: "Call receiver.",
    appointment_notes: "",
    public_notes: "Scale ticket in the door.",
    notes: "INTERNAL do not print",
    driver_name: "Denise Ortega",
    driver_phone: "555-0100",
    driver_type: "company_driver",
    rate: 3100,
    oo_pay: null,
    truck_unit: "112",
    trailer_number: "TR-7742",
    your_leg: "Nashville, TN → Memphis, TN",
  });
  assert.match(dispatchSummary, /Truck 112 · Trailer TR-7742/);
  assert.match(dispatchSummary, /34°F/);
  assert.match(dispatchSummary, /Continuous/);
  assert.match(dispatchSummary, /Your leg: Nashville, TN → Memphis, TN/);
  assert.match(dispatchSummary, /Scale ticket/);
  assert.doesNotMatch(dispatchSummary, /INTERNAL/);
  assert.doesNotMatch(dispatchSummary, /3100|\$3/);
  const { driverFacingLoadNumber } = await import("../lib/load-summary");
  assert.equal(driverFacingLoadNumber({ load_number: "MSE-1042", customer_reference: "1006153" }), "MSE-1042");
  assert.equal(driverFacingLoadNumber({ load_number: "1006153", customer_reference: "1006153" }), "");
  assert.equal(driverFacingLoadNumber({ load_number: "1006153" }), "");
  const phoneSms = formatLoadSummary({
    load_number: "MSE-1042",
    customer_reference: "1006153",
    po_number: "1006153",
    origin: "Hastings, NE",
    destination: "Bronx, NY",
    pickup_start: "2026-08-23T08:00:00.000-04:00",
    pickup_end: "2026-08-23T17:00:00.000-04:00",
    delivery_start: "2026-08-25T08:00:00.000-04:00",
    delivery_end: "2026-08-25T17:00:00.000-04:00",
    commodity: "Beef",
    reefer_setpoint_f: 26,
    reefer_mode: "continuous",
    special_instructions: "",
    appointment_notes: "",
    driver_name: "Denise Ortega",
    driver_phone: "555-0100",
    driver_type: "company_driver",
    rate: 3100,
    oo_pay: null,
    truck_unit: "26",
    trailer_number: "MS1519",
    stops: [
      {
        kind: "pickup",
        city: "Hastings",
        state: "NE",
        window_start: "2026-08-23T08:00:00.000-04:00",
        window_end: "2026-08-23T17:00:00.000-04:00",
        schedule_type: "fcfs",
      },
      {
        kind: "delivery",
        city: "Bronx",
        state: "NY",
        window_start: "2026-08-25T08:00:00.000-04:00",
        window_end: "2026-08-25T17:00:00.000-04:00",
        schedule_type: "fcfs",
      },
    ],
  });
  assert.equal(
    phoneSms,
    [
      "Load MSE-1042",
      "Shipper\nHastings, NE\nPickup 08/23 8:00 AM–5:00 PM",
      "Receiver\nBronx, NY\nDelivery 08/25 8:00 AM–5:00 PM",
      "Truck 26 · Trailer MS1519\nReefer 26°F Continuous",
    ].join("\n\n"),
  );
  assert.doesNotMatch(phoneSms, /1006153|localhost|Do not reply|M & S Loads LLC/);
  const { driverLoadGreeting, formatDriverDispatchText } = await import("../lib/load-summary");
  assert.equal(
    driverLoadGreeting({ locale: "en", driverName: "Jose Ortega", now: new Date("2026-08-29T14:00:00.000Z") }),
    "Good morning, Jose. Hope you're having a great day.",
  );
  assert.equal(
    driverLoadGreeting({ locale: "en", driverName: "Chris", now: new Date("2026-08-29T18:00:00.000Z") }),
    "Good afternoon, Chris. Hope you're having a great day.",
  );
  assert.equal(
    driverLoadGreeting({ locale: "es", driverName: "Jose Ortega", now: new Date("2026-08-29T14:00:00.000Z") }),
    "Buenos días, Jose. Espero que estés teniendo un buen día.",
  );
  assert.equal(
    driverLoadGreeting({ locale: "en", driverName: "Chris", now: new Date("2026-08-30T01:00:00.000Z") }),
    "Good evening, Chris. Hope you're having a great day.",
  );
  assert.equal(
    driverLoadGreeting({ locale: "es", driverName: "Jose", now: new Date("2026-08-30T01:00:00.000Z") }),
    "Buenas noches, Jose. Espero que estés teniendo un buen día.",
  );
  assert.match(driverLoadGreeting({ locale: "en", driverName: "", now: new Date("2026-08-29T14:00:00.000Z") }), /^Good morning\./);
  assert.doesNotMatch(driverLoadGreeting({ locale: "en", driverName: "" }), /driver/i);
  const spanishSms = formatDriverDispatchText(
    {
      load_number: "MSE-1042",
      customer_reference: "1006153",
      origin: "Hastings, NE",
      destination: "Bronx, NY",
      pickup_start: "2026-08-23T08:00:00.000-04:00",
      pickup_end: "2026-08-23T17:00:00.000-04:00",
      delivery_start: "2026-08-25T08:00:00.000-04:00",
      delivery_end: "2026-08-25T17:00:00.000-04:00",
      commodity: "Beef",
      reefer_setpoint_f: 26,
      reefer_mode: "continuous",
      special_instructions: "",
      appointment_notes: "",
      driver_name: "Jose Ortega",
      driver_phone: "555-0100",
      driver_type: "company_driver",
      rate: 3100,
      oo_pay: null,
      truck_unit: "26",
      trailer_number: "MS1519",
      stops: [
        {
          kind: "pickup",
          city: "Hastings",
          state: "NE",
          window_start: "2026-08-23T08:00:00.000-04:00",
          window_end: "2026-08-23T17:00:00.000-04:00",
          schedule_type: "fcfs",
        },
        {
          kind: "delivery",
          city: "Bronx",
          state: "NY",
          window_start: "2026-08-25T08:00:00.000-04:00",
          window_end: "2026-08-25T17:00:00.000-04:00",
          schedule_type: "fcfs",
        },
      ],
    },
    { locale: "es", now: new Date("2026-08-29T14:00:00.000Z") },
  );
  assert.match(spanishSms, /^Buenos días, Jose\./);
  assert.match(spanishSms, /\n\nCarga MSE-1042\n\nRemitente\nHastings, NE\nRecogida /);
  assert.match(spanishSms, /Receptor\nBronx, NY\nEntrega /);
  assert.match(spanishSms, /Camión 26 · Remolque MS1519/);
  assert.match(spanishSms, /Reefer 26°F Continuous/);
  assert.doesNotMatch(spanishSms, /1006153|Shipper|Pickup |Load MSE/);
  assert.doesNotMatch(spanishSms, /402-302-0097|Do not reply|No responda|M & S Loads LLC/);
  const apptSms = formatLoadSummary({
    load_number: "MSE-1043",
    origin: "Hastings, NE",
    destination: "Bronx, NY",
    pickup_start: "2026-08-23T08:00:00.000-04:00",
    pickup_end: "2026-08-23T17:00:00.000-04:00",
    delivery_start: "2026-08-25T08:00:00.000-04:00",
    delivery_end: "2026-08-25T17:00:00.000-04:00",
    commodity: "Beef",
    reefer_setpoint_f: 26,
    special_instructions: "",
    appointment_notes: "",
    driver_name: "Denise Ortega",
    driver_phone: "555-0100",
    driver_type: "company_driver",
    rate: 0,
    oo_pay: null,
    stops: [
      {
        kind: "pickup",
        city: "Hastings",
        state: "NE",
        window_start: "2026-08-23T08:00:00.000-04:00",
        window_end: "2026-08-23T17:00:00.000-04:00",
        schedule_type: "appointment",
      },
      {
        kind: "delivery",
        city: "Bronx",
        state: "NY",
        window_start: "2026-08-25T08:00:00.000-04:00",
        window_end: "",
        schedule_type: "appointment",
      },
    ],
  });
  assert.match(apptSms, /Pickup 08\/23 8:00 AM(?:\n|$)/);
  assert.match(apptSms, /Delivery 08\/25 8:00 AM(?:\n|$)/);
  assert.doesNotMatch(apptSms, /8:00 AM–5:00 PM/);
  const multiSms = formatLoadSummary({
    load_number: "MSE-1044",
    origin: "Hastings, NE",
    destination: "Bronx, NY",
    pickup_start: "2026-08-23T08:00:00.000-04:00",
    pickup_end: "2026-08-23T17:00:00.000-04:00",
    delivery_start: "2026-08-25T08:00:00.000-04:00",
    delivery_end: "2026-08-25T17:00:00.000-04:00",
    commodity: "Beef",
    reefer_setpoint_f: null,
    special_instructions: "",
    appointment_notes: "",
    driver_name: "Denise Ortega",
    driver_phone: "555-0100",
    driver_type: "company_driver",
    rate: 0,
    oo_pay: null,
    stops: [
      { kind: "pickup", city: "Hastings", state: "NE", window_start: "2026-08-23T08:00:00.000-04:00", window_end: "2026-08-23T17:00:00.000-04:00", schedule_type: "fcfs" },
      { kind: "delivery", city: "Bronx", state: "NY", window_start: "2026-08-25T08:00:00.000-04:00", window_end: "2026-08-25T17:00:00.000-04:00", schedule_type: "fcfs" },
      { kind: "delivery", city: "Bayonne", state: "NJ", window_start: "2026-08-26T09:00:00.000-04:00", window_end: "", schedule_type: "appointment" },
    ],
  });
  assert.match(multiSms, /Receiver\nBronx, NY\nDelivery 08\/25 8:00 AM–5:00 PM\n\nReceiver\nBayonne, NJ\nDelivery 08\/26 9:00 AM/);
  const summarySrc = fs.readFileSync(path.join(process.cwd(), "lib/load-summary.ts"), "utf8");
  assert.match(summarySrc, /driverFacingLoadNumber/);
  assert.match(summarySrc, /formatSmsStopWindow/);
  assert.match(summarySrc, /blocks\.join\("\\n\\n"\)/);
  assert.doesNotMatch(summarySrc, /localhost:3000\/driver|shop LAN/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/format.ts"), "utf8"), /formatSmsStopWindow/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /stops: listStops\(load\.id\)/);
  const { listDispatcherUsers } = await import("../lib/settings");
  const dispatcher = listDispatcherUsers(false)[0];
  assert.ok(dispatcher);
  audit.runWithAuditActor({ name: "MS Test", kind: "dispatcher" }, () => {
    audit.recordLoadAudit({
      loadId,
      action: "check_call",
      field: "notes",
      oldValue: "2026-08-23T18:00:00.000Z",
      newValue: "Rolling I-80",
    });
    queries.setLoadDocsRequested(loadId, true);
    queries.assignLoadDispatcher(loadId, dispatcher.id);
    queries.setLoadReadyToInvoice(loadId, true);
  });
  const afterActions = queries.getLoad(loadId);
  assert.ok(afterActions?.docs_requested);
  assert.ok(afterActions?.ready_to_invoice);
  assert.ok(afterActions?.dispatcher_id);
  assert.ok(audit.listLoadLog(loadId).some((row) => row.action === "check_call" && row.new_value === "Rolling I-80"));
  assert.ok(audit.listLoadLog(loadId).some((row) => row.action === "docs_requested"));
  const twilioEnvKeys = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] as const;
  const previousTwilio = Object.fromEntries(twilioEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of twilioEnvKeys) delete process.env[key];
  const twilio = await import("../lib/integrations/twilio");
  const { SMS_MISSING_KEYS } = await import("../lib/sms-shared");
  assert.equal(twilio.twilioConfigured(), false);
  assert.equal(twilio.formatSmsDestination("(312) 555-0148"), "+13125550148");
  await assert.rejects(
    () => twilio.sendTwilioSms({ to: "(312) 555-0148", body: "Rolling" }),
    (error: unknown) => {
      assert.equal(error instanceof Error && error.message, SMS_MISSING_KEYS);
      return true;
    },
  );
  const { sendLoadSmsAction } = await import("../lib/dispatcher-actions");
  const smsForm = new FormData();
  smsForm.set("load_id", String(loadId));
  smsForm.set("kind", "load_info");
  const missingKeys = await sendLoadSmsAction(smsForm);
  assert.equal(missingKeys.ok, false);
  if (!missingKeys.ok) assert.match(missingKeys.error, /Twilio is not connected/);
  process.env.TWILIO_ACCOUNT_SID = "ACtestnotreal";
  process.env.TWILIO_AUTH_TOKEN = "twilio-secret-token-do-not-log";
  process.env.TWILIO_FROM_NUMBER = "+15555550100";
  const failFetch = (async () =>
    new Response(
      JSON.stringify({
        message: "Authenticate twilio-secret-token-do-not-log ACtestnotreal",
      }),
      { status: 401, statusText: "Unauthorized", headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  await assert.rejects(
    () => twilio.sendTwilioSms({ to: "(312) 555-0148", body: "Rolling" }, failFetch),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      assert.doesNotMatch(message, /twilio-secret-token-do-not-log/);
      assert.doesNotMatch(message, /ACtestnotreal/);
      assert.match(message, /redacted|Authenticate/);
      return true;
    },
  );
  let sentBody = "";
  const okFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sentBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ sid: "SM-test" }), {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  await twilio.sendTwilioSms({ to: "(312) 555-0148", body: "On time" }, okFetch);
  assert.match(sentBody, /On\+time|On%20time|On time/);
  audit.runWithAuditActor({ name: "MS Test", kind: "dispatcher" }, () => {
    audit.recordLoadAudit({
      loadId,
      action: "sms",
      field: "to",
      oldValue: "load information",
      newValue: "(312) 555-0148",
    });
  });
  assert.ok(audit.listLoadLog(loadId).some((row) => row.action === "sms" && row.field === "to"));
  for (const key of twilioEnvKeys) {
    const value = previousTwilio[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  const mailEnvKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SENDGRID_API_KEY"] as const;
  const previousMail = Object.fromEntries(mailEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of mailEnvKeys) delete process.env[key];
  const mailer = await import("../lib/integrations/mail");
  const { MAIL_MISSING } = await import("../lib/mail-shared");
  const loadMail = await import("../lib/load-mail");
  assert.equal(mailer.mailConfigured(), false);
  assert.equal(mailer.mailTransport(), "none");
  await assert.rejects(
    () => mailer.sendMail({ to: "x@msloads.com", subject: "Hi", text: "Body" }),
    (error: unknown) => {
      assert.equal(error instanceof Error && error.message, MAIL_MISSING);
      return true;
    },
  );
  const spanishMail = loadMail.composeDriverLoadEmail({
    loadNumber: "MSE-MAIL",
    stops: [{ title: "Pickup 1", address: "Hastings, NE", window: "8:00 AM", appointment: "", reference: "" }],
    refs: "",
    commodity: "Beef",
    trailer: "MS1519",
    reefer: "26°F · Continuous",
    specialInstructions: "",
    settlement: "",
    officePhone: "402-302-0097",
    locale: "es",
    driverName: "Jose",
    now: new Date("2026-08-29T14:00:00.000Z"),
  });
  assert.match(spanishMail.subject, /Carga MSE-MAIL/);
  assert.match(spanishMail.text, /Buenos días, Jose/);
  assert.match(spanishMail.text, /No responda/);
  assert.match(spanishMail.text, /402-302-0097/);
  assert.doesNotMatch(spanishMail.text, /Do not reply/);
  assert.doesNotMatch(
    loadMail.composeCustomerUpdateEmail({
      loadNumber: "12345",
      customerRef: "12345",
      status: "Assigned",
      truck: "28",
      trailer: "MS1519",
      lastLocation: "Hastings, NE",
      eta: "",
      nextStop: "",
      stops: [],
      officePhone: "402-302-0097",
    }).text,
    /Good morning|Buenos días|Hope you're having/,
  );
  const companyDraft = loadMail.composeDriverLoadEmail({
    loadNumber: "MSE-MAIL",
    stops: [
      {
        title: "Pickup 1",
        address: "600 E 39th St, Hastings, NE 68901",
        window: "08/28/26 8:00 AM – 08/28/26 12:00 PM",
        appointment: "Dock 2",
        reference: "PU-1",
      },
      {
        title: "Delivery 1",
        address: "Birmingham, AL",
        window: "08/29/26 8:00 AM – 08/29/26 4:00 PM",
        appointment: "",
        reference: "",
      },
    ],
    refs: "RC-SMOKE · PO-SMOKE",
    commodity: "Paper rolls",
    trailer: "TR-12",
    reefer: "34°F · Continuous",
    specialInstructions: "Call receiver.",
    settlement: "",
  });
  assert.match(companyDraft.subject, /MSE-MAIL/);
  assert.match(companyDraft.text, /Pickup 1/);
  assert.match(companyDraft.text, /Delivery 1/);
  assert.match(companyDraft.text, /34°F · Continuous/);
  assert.match(companyDraft.text, /M & S Loads LLC/);
  assert.equal(companyDraft.replyTo, "noreply@msloads.com");
  assert.match(companyDraft.text, /Do not reply/);
  assert.match(companyDraft.text, /not monitored/);
  assert.match(companyDraft.text, /if you need further assistance/);
  assert.doesNotMatch(companyDraft.text, /if you need something/);
  assert.doesNotMatch(companyDraft.text, /\$|USD|1,400|1400/);
  assert.equal(loadMail.cityStateFromAddress("2200 North Kansas Avenue, Hastings, NE, 68901"), "Hastings, NE");
  assert.equal(loadMail.cityStateFromAddress("Hastings, NE"), "Hastings, NE");
  const customerDraft = loadMail.composeCustomerUpdateEmail({
    loadNumber: "12345",
    customerRef: "12345",
    status: "Assigned",
    truck: "28/511698",
    trailer: "MS1519",
    lastLocation: "2200 North Kansas Avenue, Hastings, NE, 68901",
    eta: "1,539.3 mi on file · 08/28/26",
    nextStop: "Pickup 1 · Hastings, NE",
    stops: [
      { title: "Pickup 1", place: "Nebraska Cold Storage Inc, Hastings, NE" },
      { title: "Delivery 1", place: "Lineage Logistics, Avenel, NJ" },
      { title: "Delivery 5", place: "Kayco, Bayonne, NJ" },
    ],
    officePhone: "402-302-0097",
  });
  assert.match(customerDraft.text, /Load 12345/);
  assert.match(customerDraft.text, /Status: Assigned/);
  assert.match(customerDraft.text, /Truck: 28\/511698/);
  assert.match(customerDraft.text, /Trailer: MS1519/);
  assert.match(customerDraft.text, /Last location: Hastings, NE/);
  assert.doesNotMatch(customerDraft.text, /2200 North Kansas|1,539\.3 mi on file|Next stop/);
  assert.match(customerDraft.text, /Pickup\nNebraska Cold Storage Inc, Hastings, NE/);
  assert.match(customerDraft.text, /Deliveries\n1\. Lineage Logistics, Avenel, NJ/);
  assert.match(customerDraft.text, /2\. Kayco, Bayonne, NJ/);
  assert.match(customerDraft.text, /Call the office at 402-302-0097 if you need further assistance/);
  assert.doesNotMatch(customerDraft.text, /if you need something/);
  assert.equal(
    loadMail.mailNoReplyLine("402-302-0097"),
    "Do not reply. This mailbox is not monitored. Call the office at 402-302-0097 if you need further assistance.",
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "lib/load-mail.ts"), "utf8"),
    /if you need something/,
  );
  assert.doesNotMatch(customerDraft.text, /275 Blair|600 E 39th|MSE-/);
  const deliveredDraft = loadMail.composeCustomerUpdateEmail({
    loadNumber: "12345",
    customerRef: "12345",
    status: "Assigned",
    truck: "28",
    trailer: "MS1519",
    lastLocation: "Hastings, NE",
    eta: "",
    nextStop: "",
    stops: [
      { title: "Pickup 1", place: "Nebraska Cold Storage Inc, Hastings, NE" },
      { title: "Delivery 1", place: "Place A, Avenel, NJ", delivered: true },
      { title: "Delivery 2", place: "Place B, Newark, NJ", delivered: true },
      { title: "Delivery 3", place: "Place C, Elizabeth, NJ" },
      { title: "Delivery 4", place: "Place D, Jersey City, NJ" },
      { title: "Delivery 5", place: "Kayco, Bayonne, NJ" },
    ],
  });
  assert.match(deliveredDraft.text, /1\. Place A, Avenel, NJ · Delivered/);
  assert.match(deliveredDraft.text, /2\. Place B, Newark, NJ · Delivered/);
  assert.match(deliveredDraft.text, /3\. Place C, Elizabeth, NJ/);
  assert.match(deliveredDraft.text, /5\. Kayco, Bayonne, NJ/);
  assert.doesNotMatch(deliveredDraft.text, /3\. Place C, Elizabeth, NJ · Delivered|Kayco, Bayonne, NJ · Delivered/);
  assert.doesNotMatch(deliveredDraft.text, /The load was delivered|The load was picked up/);
  assert.doesNotMatch(deliveredDraft.text, /mi on file|\$|relay|oo pay/i);
  const pickedDraft = loadMail.composeCustomerUpdateEmail({
    loadNumber: "12345",
    customerRef: "12345",
    status: "In Transit",
    truck: "28",
    trailer: "MS1519",
    lastLocation: "Hastings, NE",
    eta: "",
    nextStop: "",
    stops: [
      { title: "Pickup 1", place: "Nebraska Cold Storage Inc, Hastings, NE", delivered: true },
      { title: "Delivery 1", place: "Kayco, Bayonne, NJ", delivered: true },
    ],
  });
  assert.match(pickedDraft.text, /The load was picked up/);
  assert.match(pickedDraft.text, /Nebraska Cold Storage Inc, Hastings, NE · Picked up/);
  assert.match(pickedDraft.text, /The load was delivered/);
  assert.match(pickedDraft.text, /1\. Kayco, Bayonne, NJ · Delivered/);
  assert.equal(customerDraft.replyTo, "noreply@msloads.com");
  assert.match(customerDraft.text, /Do not reply/);
  assert.match(customerDraft.text, /not monitored/);
  assert.doesNotMatch(customerDraft.text, /\$|settlement|relay|oo pay/i);
  const invoiceDraft = loadMail.composeCustomerInvoiceEmail({
    invoiceNumber: "INV-12345",
    loadNumber: "12345",
    customerName: "Kayco",
    totalLabel: "$2,200.00",
  });
  assert.equal(invoiceDraft.from, "ar@msloads.com");
  assert.equal(invoiceDraft.replyTo, "ar@msloads.com");
  assert.match(invoiceDraft.subject, /INV-12345/);
  assert.match(invoiceDraft.subject, /12345/);
  assert.match(invoiceDraft.text, /Invoice INV-12345 for load 12345/);
  assert.match(invoiceDraft.text, /Bill to: Kayco/);
  assert.match(invoiceDraft.text, /\$2,200\.00/);
  assert.match(invoiceDraft.text, /The invoice PDF is attached/);
  assert.match(invoiceDraft.text, /Reply to this email/);
  assert.match(invoiceDraft.text, /Accounts Receivable/);
  assert.doesNotMatch(invoiceDraft.text, /Do not reply|not monitored/);
  assert.doesNotMatch(invoiceDraft.replyTo, /noreply@|dispatch@/);
  const invoiceDraftWithDocs = loadMail.composeCustomerInvoiceEmail({
    invoiceNumber: "INV-12345",
    loadNumber: "12345",
    extraLabels: ["BOL", "Lumper"],
  });
  assert.match(invoiceDraftWithDocs.text, /Also attached: BOL, Lumper/);
  assert.doesNotMatch(invoiceDraft.text, /Also attached/);
  const { DEFAULT_INVOICE_EMAIL_BODY } = await import("../lib/invoice-email-shared");
  const invoiceLetter = loadMail.composeCustomerInvoiceEmail({
    invoiceNumber: "INV-12345",
    loadNumber: "12345",
    customerName: "Kayco",
    totalLabel: "$2,200.00",
    extraLabels: ["BOL"],
    body: DEFAULT_INVOICE_EMAIL_BODY,
  });
  assert.match(invoiceLetter.text, /Dear Kayco/);
  assert.match(invoiceLetter.text, /INV-12345/);
  assert.match(invoiceLetter.text, /load 12345/);
  assert.match(invoiceLetter.text, /\$2,200\.00/);
  assert.match(invoiceLetter.text, /Thank you for your business/);
  assert.match(invoiceLetter.text, /Also attached: BOL/);
  assert.doesNotMatch(invoiceLetter.text, /Do not reply|not monitored/);
  assert.equal(
    loadMail.customerFacingLoadNumber({
      load_number: "MSE-1055",
      customer_reference: "45090",
      po_number: "",
      reference_number: "45090",
    }),
    "45090",
  );
  assert.equal(
    loadMail.customerFacingLoadNumber({
      load_number: "MSE-1055",
      customer_reference: "",
      po_number: "",
      reference_number: "",
    }),
    "",
  );
  const customerByRef = loadMail.composeCustomerUpdateEmail({
    loadNumber: "45090",
    customerRef: "45090",
    status: "In transit",
    truck: "112",
    trailer: "TR-12",
    lastLocation: "Memphis, TN",
    eta: "",
    nextStop: "",
  });
  assert.match(customerByRef.subject, /45090/);
  assert.match(customerByRef.text, /Load 45090/);
  assert.doesNotMatch(customerByRef.subject, /MSE-/);
  assert.doesNotMatch(customerByRef.text, /MSE-/);
  const customerNoRef = loadMail.composeCustomerUpdateEmail({
    loadNumber: "",
    customerRef: "",
    status: "In transit",
    truck: "112",
    trailer: "",
    lastLocation: "Memphis, TN",
    eta: "",
    nextStop: "",
  });
  assert.equal(customerNoRef.subject, "Tracking update");
  assert.doesNotMatch(customerNoRef.text, /MSE-|1006150/);
  const mailDriverId = queries.createDriver({
    name: "Pat Mail",
    phone: "555-0188",
    email: "pat.mail@msloads.com",
    license: "NE-MAIL",
    pin: "1888",
    truck_id: null,
    status: "available",
  });
  const mailLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Birmingham, AL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 32000,
    commodity: "Frozen beef",
    rate: 2200,
    notes: "internal only",
    special_instructions: "Keep continuous.",
    appointment_notes: "",
    reference_number: "RC-MAIL",
    po_number: "PO-MAIL",
    reefer_setpoint_f: 10,
    trailer_number: "TR-MAIL",
    status: "in_transit",
    truck_id: null,
    driver_id: mailDriverId,
  });
  getDb().prepare("UPDATE loads SET contact_email = ? WHERE id = ?").run("ap.mail@customer.example", mailLoadId);
  const { ensureDefaultStops } = await import("../lib/stops");
  ensureDefaultStops(mailLoadId);
  const mailLoad = queries.getLoad(mailLoadId);
  assert.ok(mailLoad);
  assert.equal(loadMail.resolveLoadDriverEmail(mailLoad), "pat.mail@msloads.com");
  assert.equal(loadMail.resolveLoadCustomerEmail(mailLoad), "ap.mail@customer.example");
  const builtDriver = loadMail.buildDriverLoadDraft(mailLoad);
  assert.match(builtDriver.text, /Pickup 1|Delivery 1/);
  assert.doesNotMatch(builtDriver.text, /\$2|2200|USD/);
  assert.doesNotMatch(builtDriver.text, /Refs /);
  assert.doesNotMatch(builtDriver.text, /PO-MAIL|RC-MAIL/);
  assert.equal(builtDriver.replyTo, "noreply@msloads.com");
  assert.match(builtDriver.text, /Do not reply/);
  assert.match(builtDriver.text, /not monitored/);
  assert.match(builtDriver.text, /402-302-0097/);
  assert.match(builtDriver.text, /if you need further assistance/);
  assert.doesNotMatch(builtDriver.text, /if you need something/);
  const { sendLoadMailAction } = await import("../lib/dispatcher-actions");
  const missingMail = new FormData();
  missingMail.set("load_id", String(mailLoadId));
  missingMail.set("kind", "driver_load");
  const missingMailResult = await sendLoadMailAction(missingMail);
  assert.equal(missingMailResult.ok, false);
  if (!missingMailResult.ok) assert.equal(missingMailResult.error, MAIL_MISSING);
  const silentCustomerId = queries.createCustomer({
    name: "No Email Shipper",
    billing_notes: "",
    contacts: [],
  });
  const noEmailLoadId = queries.createLoad({
    customer_id: silentCustomerId,
    origin: "Hastings, NE",
    destination: "Birmingham, AL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 1000,
    commodity: "Frozen",
    rate: 100,
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
  });
  const noDriverMail = new FormData();
  noDriverMail.set("load_id", String(noEmailLoadId));
  noDriverMail.set("kind", "driver_load");
  const noDriverResult = await sendLoadMailAction(noDriverMail);
  assert.equal(noDriverResult.ok, false);
  if (!noDriverResult.ok) assert.match(noDriverResult.error, /Assign a driver first/);
  const noCustomerMail = new FormData();
  noCustomerMail.set("load_id", String(noEmailLoadId));
  noCustomerMail.set("kind", "customer_update");
  const noCustomerResult = await sendLoadMailAction(noCustomerMail);
  assert.equal(noCustomerResult.ok, false);
  if (!noCustomerResult.ok) assert.match(noCustomerResult.error, /no customer email/);
  process.env.SENDGRID_API_KEY = "SG.test-secret-do-not-log";
  process.env.SMTP_FROM = "dispatch@msloads.com";
  assert.equal(mailer.mailTransport(), "sendgrid");
  await assert.rejects(
    () =>
      mailer.sendMail({ to: "x@msloads.com", subject: "Hi", text: "Body" }, (async () =>
        new Response(JSON.stringify({ errors: [{ message: "bad SG.test-secret-do-not-log" }] }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      assert.doesNotMatch(message, /SG\.test-secret-do-not-log/);
      assert.match(message, /redacted|SendGrid/);
      return true;
    },
  );
  let sentMailTo = "";
  let sentMailSubject = "";
  let sentMailHasPdf = false;
  let sentMailReplyTo = "";
  await loadMail.sendDriverLoadMail(mailLoadId, async (input) => {
    sentMailTo = input.to;
    sentMailSubject = input.subject;
    sentMailHasPdf = Boolean(input.attachments?.some((file) => file.filename.endsWith("-driver-packet.pdf")));
    sentMailReplyTo = input.replyTo ?? "";
  });
  assert.equal(sentMailTo, "pat.mail@msloads.com");
  assert.match(sentMailSubject, /MSE-/);
  assert.equal(sentMailHasPdf, true);
  assert.equal(sentMailReplyTo, "noreply@msloads.com");
  assert.doesNotMatch(sentMailReplyTo, /ana@|info@msloads\.com/);
  assert.equal(loadMail.lastLoadMail(mailLoadId, "driver_load")?.to_email, "pat.mail@msloads.com");
  let sendgridBody = "";
  await mailer.sendMail(
    { to: "pat.mail@msloads.com", subject: "Hi", text: "Body", replyTo: "noreply@msloads.com" },
    (async (_url, init) => {
      sendgridBody = String(init && typeof init === "object" && "body" in init ? init.body : "");
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  );
  assert.match(sendgridBody, /"email":"dispatch@msloads.com"/);
  assert.doesNotMatch(sendgridBody, /info@msloads\.com/);
  assert.match(sendgridBody, /"reply_to":\{"email":"noreply@msloads.com"\}/);
  assert.doesNotMatch(sendgridBody, /ana@/);
  let invoiceSendgridBody = "";
  await mailer.sendMail(
    {
      to: "ap.mail@customer.example",
      from: "ar@msloads.com",
      subject: "Invoice INV-12345",
      text: "Invoice attached.",
      replyTo: "ar@msloads.com",
    },
    (async (_url, init) => {
      invoiceSendgridBody = String(init && typeof init === "object" && "body" in init ? init.body : "");
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  );
  assert.match(invoiceSendgridBody, /"email":"ar@msloads.com"/);
  assert.match(invoiceSendgridBody, /"reply_to":\{"email":"ar@msloads.com"\}/);
  assert.doesNotMatch(invoiceSendgridBody, /dispatch@msloads\.com|noreply@msloads\.com/);
  await loadMail.sendCustomerUpdateMail(mailLoadId, async (input) => {
    assert.equal(input.to, "ap.mail@customer.example");
    assert.equal(input.replyTo, "noreply@msloads.com");
    assert.doesNotMatch(input.replyTo ?? "", /ana@|info@msloads\.com/);
    assert.doesNotMatch(input.text, /\$|2200|settlement/i);
    assert.match(input.text, /Do not reply/);
    assert.match(input.text, /not monitored/);
    assert.match(input.text, /if you need further assistance/);
    assert.doesNotMatch(input.text, /if you need something/);
    assert.match(input.text, /Status: In Transit/);
    assert.match(input.text, /Trailer: TR-MAIL/);
    assert.doesNotMatch(input.text, /mi on file/);
    assert.match(input.subject, /PO-MAIL|RC-MAIL/);
    assert.doesNotMatch(input.subject, /MSE-/);
    assert.doesNotMatch(input.text, /Load MSE-/);
    assert.match(input.text, /Pickup/);
    assert.match(input.text, /Deliveries/);
    assert.match(input.text, /Hastings, NE/);
    assert.match(input.text, /Birmingham, AL/);
    assert.doesNotMatch(input.text, /Hastings, Hastings|Birmingham, Birmingham/);
    assert.doesNotMatch(input.text, /\$|settlement|relay|oo pay/i);
  });
  assert.equal(loadMail.lastLoadMail(mailLoadId, "customer_update")?.to_email, "ap.mail@customer.example");
  queries.updateLoadStatus(mailLoadId, "delivered");
  let invoiceMailTo = "";
  let invoiceMailFrom = "";
  let invoiceMailReplyTo = "";
  let invoiceMailHasPdf = false;
  await loadMail.sendCustomerInvoiceMail(mailLoadId, async (input) => {
    invoiceMailTo = input.to;
    invoiceMailFrom = input.from ?? "";
    invoiceMailReplyTo = input.replyTo ?? "";
    invoiceMailHasPdf = Boolean(input.attachments?.some((file) => file.contentType === "application/pdf"));
    assert.match(input.subject, /Invoice/);
    assert.match(input.text, /Thank you for your business|The invoice PDF is attached/);
    assert.doesNotMatch(input.text, /Do not reply|not monitored/);
  });
  assert.equal(invoiceMailTo, "pat@example.com");
  assert.equal(invoiceMailFrom, "ar@msloads.com");
  assert.equal(invoiceMailReplyTo, "ar@msloads.com");
  assert.equal(invoiceMailHasPdf, true);
  assert.equal(loadMail.lastLoadMail(mailLoadId, "customer_invoice")?.to_email, "pat@example.com");
  const lumperReceipt = addAttachment({
    loadId: mailLoadId,
    kind: "lumper",
    originalName: "lumper-receipt.pdf",
    buffer: Buffer.from("%PDF-1.4 lumper"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const bolScan = addAttachment({
    loadId: mailLoadId,
    kind: "bol",
    originalName: "bol.pdf",
    buffer: Buffer.from("%PDF-1.4 bol"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const extraDocs = loadMail.invoiceMailExtraDocs(mailLoadId);
  assert.ok(extraDocs.some((file) => file.id === lumperReceipt.id && file.kindLabel === "Lumper"));
  assert.ok(extraDocs.some((file) => file.id === bolScan.id && file.kindLabel === "BOL"));
  assert.equal(extraDocs.some((file) => file.kind === "invoice"), false);
  assert.throws(() => loadMail.mailFilesForLoadDocs(mailLoadId, [999999]), /not on this load/);
  await loadMail.sendCustomerInvoiceMail(
    mailLoadId,
    async (input) => {
      assert.equal(input.attachments?.length, 3);
      assert.ok(input.attachments?.some((file) => file.filename === "lumper-receipt.pdf"));
      assert.ok(input.attachments?.some((file) => file.filename === "bol.pdf"));
      assert.match(input.text, /Also attached: Lumper, BOL/);
    },
    { extraIds: [lumperReceipt.id, bolScan.id] },
  );
  const noInvoiceMail = new FormData();
  noInvoiceMail.set("load_id", String(noEmailLoadId));
  const { sendCustomerInvoiceMailAction } = await import("../lib/dispatcher-actions");
  const noInvoiceMailResult = await sendCustomerInvoiceMailAction(noInvoiceMail);
  assert.equal(noInvoiceMailResult.ok, false);
  if (!noInvoiceMailResult.ok) assert.match(noInvoiceMailResult.error, /Enter an email to send this invoice/);
  assert.doesNotMatch(noInvoiceMailResult.ok ? "" : noInvoiceMailResult.error, /no customer email/);
  queries.updateLoadStatus(noEmailLoadId, "delivered");
  let typedInvoiceTo = "";
  await loadMail.sendCustomerInvoiceMail(
    noEmailLoadId,
    async (input) => {
      typedInvoiceTo = input.to;
    },
    { to: "typed.invoice@example.com" },
  );
  assert.equal(typedInvoiceTo, "typed.invoice@example.com");
  assert.equal(loadMail.resolveLoadCustomerEmail(queries.getLoad(noEmailLoadId)!), "");
  await loadMail.sendCustomerInvoiceMail(
    mailLoadId,
    async (input) => {
      assert.equal(input.to, "pat@example.com");
    },
    { to: "ignore-override@example.com" },
  );
  const slotCustomerId = queries.createCustomer({
    name: "Three Slot Shipper",
    billing_notes: "",
    main_email: "info@slots.example",
    billing_email: "billing@slots.example",
    contacts: [{ name: "Desk", role: "Office", phone: "555-0100", email: "info@slots.example" }],
  });
  const slotLoadId = queries.createLoad({
    customer_id: slotCustomerId,
    origin: "Omaha, NE",
    destination: "Dallas, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Beef",
    rate: 1800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "delivered",
    truck_id: null,
    driver_id: null,
  });
  getDb().prepare("UPDATE loads SET contact_email = ? WHERE id = ?").run("ana@slots.example", slotLoadId);
  const slotLoad = queries.getLoad(slotLoadId)!;
  assert.equal(loadMail.resolveLoadCustomerEmail(slotLoad), "ana@slots.example");
  assert.equal(loadMail.resolveInvoiceCustomerEmail(slotLoad), "billing@slots.example");
  assert.equal(loadMail.invoiceMailTo(slotLoad, "typed@slots.example"), "billing@slots.example");
  assert.notEqual(loadMail.resolveInvoiceCustomerEmail(slotLoad), "ana@slots.example");
  const loadContact = await import("../lib/load-contact");
  getDb()
    .prepare("UPDATE loads SET contact_phone = ?, contact_ext = ? WHERE id = ?")
    .run("800-555-0142", "2210", slotLoadId);
  const slotPhoneLoad = queries.getLoad(slotLoadId)!;
  assert.equal(loadContact.resolveLoadPerLoadPhone(slotPhoneLoad), "800-555-0142");
  assert.equal(loadContact.resolveLoadPerLoadExt(slotPhoneLoad), "2210");
  assert.equal(loadContact.resolveLoadCustomerPhone(slotPhoneLoad), "800-555-0142");
  assert.equal(loadContact.resolveLoadCustomerExt(slotPhoneLoad), "2210");
  assert.equal(loadContact.resolveLoadCustomerPhoneLine(slotPhoneLoad), "800-555-0142 x2210");
  assert.equal(loadContact.resolveCustomerMainPhone(slotCustomerId), "555-0100");
  assert.equal(loadMail.resolveInvoiceCustomerEmail(slotPhoneLoad), "billing@slots.example");
  getDb()
    .prepare("UPDATE loads SET contact_phone = ?, contact_ext = ? WHERE id = ?")
    .run("800-555-0142", "", slotLoadId);
  assert.equal(loadContact.resolveLoadCustomerPhoneLine(queries.getLoad(slotLoadId)!), "800-555-0142");
  getDb()
    .prepare("UPDATE loads SET contact_phone = ?, contact_ext = ? WHERE id = ?")
    .run("", "9999", slotLoadId);
  const slotFallback = queries.getLoad(slotLoadId)!;
  assert.equal(loadContact.resolveLoadCustomerPhone(slotFallback), "555-0100");
  assert.equal(loadContact.resolveLoadCustomerExt(slotFallback), "");
  assert.equal(loadContact.resolveLoadCustomerPhoneLine(slotFallback), "555-0100");
  assert.equal(queries.getCustomer(slotCustomerId)?.contacts[0]?.phone, "555-0100");
  queries.updateCustomer(slotCustomerId, {
    name: "Three Slot Shipper",
    billing_notes: "",
    main_email: "info@slots.example",
    billing_email: "",
    contacts: [{ name: "Desk", role: "Office", phone: "555-0100", email: "info@slots.example" }],
  });
  assert.equal(loadMail.resolveInvoiceCustomerEmail(queries.getLoad(slotLoadId)!), "info@slots.example");
  queries.updateCustomer(slotCustomerId, {
    name: "Three Slot Shipper",
    billing_notes: "",
    main_email: "",
    billing_email: "",
    contacts: [],
  });
  assert.equal(loadMail.resolveInvoiceCustomerEmail(queries.getLoad(slotLoadId)!), "");
  assert.equal(loadMail.invoiceMailTo(queries.getLoad(slotLoadId)!, "typed@slots.example"), "typed@slots.example");
  assert.equal(loadMail.resolveLoadCustomerEmail(queries.getLoad(slotLoadId)!), "ana@slots.example");
  assert.equal(queries.getCustomer(slotCustomerId)?.main_email, "");
  assert.equal(queries.getCustomer(slotCustomerId)?.billing_email, "");
  const {
    replaceStops: replaceDropStops,
    setStopDelivered,
    getStop,
    stampStopTime,
    stopIsDelivered,
    listStops: listDropStops,
  } = await import("../lib/stops");
  assert.equal(stopIsDelivered({ delivered: 1, arrived_at: "", departed_at: "" }), true);
  assert.equal(stopIsDelivered({ delivered: 0, arrived_at: "", departed_at: "" }), false);
  assert.equal(stopIsDelivered({ delivered: 0, arrived_at: "2026-08-28T12:00:00.000Z", departed_at: "" }), true);
  assert.equal(stopIsDelivered({ delivered: 0, arrived_at: "", departed_at: "2026-08-28T13:00:00.000Z" }), true);
  assert.equal(stopIsDelivered({ delivered: 2, arrived_at: "2026-08-28T12:00:00.000Z", departed_at: "" }), false);
  const dropLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Frozen",
    rate: 4500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "RC-DROPS",
    po_number: "PO-DROPS",
    reefer_setpoint_f: 10,
    trailer_number: "TR-DROPS",
    status: "in_transit",
    truck_id: null,
    driver_id: mailDriverId,
  });
  getDb()
    .prepare("UPDATE loads SET contact_email = ?, customer_reference = ? WHERE id = ?")
    .run("ap.drops@customer.example", "45090-DROPS", dropLoadId);
  replaceDropStops(dropLoadId, [
    { kind: "pickup", name: "Nebraska Cold Storage Inc", city: "Hastings", state: "NE" },
    { kind: "delivery", name: "Place A", city: "Avenel", state: "NJ" },
    { kind: "delivery", name: "Place B", city: "Newark", state: "NJ" },
    { kind: "delivery", name: "Place C", city: "Elizabeth", state: "NJ" },
    { kind: "delivery", name: "Place D", city: "Jersey City", state: "NJ" },
    { kind: "delivery", name: "Kayco", city: "Bayonne", state: "NJ" },
  ]);
  const dropStops = listDropStops(dropLoadId);
  const dropDeliveries = dropStops.filter((stop) => stop.kind === "delivery");
  const dropPickup = dropStops.find((stop) => stop.kind === "pickup");
  assert.equal(dropDeliveries.length, 5);
  assert.ok(dropPickup);
  assert.equal(dropDeliveries[0].arrived_at, "");
  assert.equal(dropDeliveries[0].departed_at, "");
  setStopDelivered(dropDeliveries[0].id, true);
  setStopDelivered(dropDeliveries[1].id, true);
  assert.equal(getStop(dropDeliveries[0].id)?.delivered, 1);
  assert.equal(getStop(dropDeliveries[0].id)?.arrived_at, "");
  assert.equal(getStop(dropDeliveries[1].id)?.departed_at, "");
  getDb()
    .prepare("UPDATE loads SET route_miles = 1369.2, route_source = 'google' WHERE id = ?")
    .run(dropLoadId);
  const dropLoad = queries.getLoad(dropLoadId);
  assert.ok(dropLoad);
  const dropDraft = await loadMail.buildCustomerUpdateDraft(dropLoad);
  assert.match(dropDraft.text, /Load 45090-DROPS/);
  assert.match(dropDraft.text, /1\. Place A, Avenel, NJ · Delivered/);
  assert.match(dropDraft.text, /2\. Place B, Newark, NJ · Delivered/);
  assert.match(dropDraft.text, /3\. Place C, Elizabeth, NJ/);
  assert.match(dropDraft.text, /4\. Place D, Jersey City, NJ/);
  assert.match(dropDraft.text, /5\. Kayco, Bayonne, NJ/);
  assert.doesNotMatch(dropDraft.text, /3\. Place C, Elizabeth, NJ · Delivered|4\. Place D, Jersey City, NJ · Delivered|Kayco, Bayonne, NJ · Delivered/);
  assert.doesNotMatch(dropDraft.text, /The load was delivered/);
  assert.doesNotMatch(dropDraft.text, /mi on file|\$|settlement|relay|oo pay/i);
  assert.equal(dropDraft.replyTo, "noreply@msloads.com");
  const typedAt = "2026-08-27T15:00:00.000Z";
  stampStopTime(dropDeliveries[1].id, "arrived_at", typedAt);
  setStopDelivered(dropDeliveries[1].id, true);
  assert.equal(getStop(dropDeliveries[1].id)?.arrived_at, typedAt);
  stampStopTime(dropDeliveries[2].id, "arrived_at", typedAt);
  const stampedDraft = await loadMail.buildCustomerUpdateDraft(queries.getLoad(dropLoadId)!);
  assert.match(stampedDraft.text, /3\. Place C, Elizabeth, NJ · Delivered/);
  setStopDelivered(dropDeliveries[2].id, false);
  assert.equal(getStop(dropDeliveries[2].id)?.arrived_at, typedAt);
  const uncheckedDraft = await loadMail.buildCustomerUpdateDraft(queries.getLoad(dropLoadId)!);
  assert.doesNotMatch(uncheckedDraft.text, /3\. Place C, Elizabeth, NJ · Delivered/);
  setStopDelivered(dropPickup.id, true);
  const pickedUpDraft = await loadMail.buildCustomerUpdateDraft(queries.getLoad(dropLoadId)!);
  assert.match(pickedUpDraft.text, /The load was picked up/);
  assert.match(pickedUpDraft.text, /Nebraska Cold Storage Inc, Hastings, NE/);
  setStopDelivered(dropPickup.id, false);
  const unpickedDraft = await loadMail.buildCustomerUpdateDraft(queries.getLoad(dropLoadId)!);
  assert.doesNotMatch(unpickedDraft.text, /The load was picked up/);
  await loadMail.sendCustomerUpdateMail(dropLoadId, async (input) => {
    assert.equal(input.to, "ap.drops@customer.example");
    assert.equal(input.replyTo, "noreply@msloads.com");
    assert.match(input.text, /1\. Place A, Avenel, NJ · Delivered/);
    assert.match(input.text, /2\. Place B, Newark, NJ · Delivered/);
    assert.doesNotMatch(input.text, /Kayco, Bayonne, NJ · Delivered/);
    assert.doesNotMatch(input.subject, /MSE-/);
    assert.doesNotMatch(input.text, /\$|relay|oo pay/i);
  });
  for (const key of mailEnvKeys) {
    const value = previousMail[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  assert.ok(history.every((row) => !/4020|1125|password|api[_-]?key/i.test(`${row.old_value} ${row.new_value} ${row.actor}`)));
  assert.equal(history[0].id > history[history.length - 1].id, true, "newest first");
  const company = audit.listCompanyAudit({ loadNumber: created.load_number, actor: "MS Test" });
  assert.ok(company.length >= 1);
  addFleetDocument({
    ownerType: "driver",
    ownerId: otherDriverId,
    kind: "cdl",
    originalName: "cdl-smoke.pdf",
    buffer: Buffer.from("%PDF-1.4 cdl"),
    mimeType: "application/pdf",
  });
  addFleetDocument({
    ownerType: "truck",
    ownerId: truckId,
    kind: "registration",
    originalName: "reg-smoke.pdf",
    buffer: Buffer.from("%PDF-1.4 reg"),
    mimeType: "application/pdf",
  });
  assert.ok(listFleetDocuments("driver", otherDriverId).some((file) => file.kind === "cdl"));
  assert.ok(listFleetDocuments("truck", truckId).some((file) => file.kind === "registration"));

  const { parseRateConText } = await import("../lib/rate-con");
  const parsed = parseRateConText(
    `RATE CONFIRMATION
Customer: Delta Cold Storage
Origin: Atlanta, GA
Destination: Jacksonville, FL
Pickup Window: 08/25/2026 06:00 - 08/25/2026 10:00
Delivery Window: 08/25/2026 16:00 - 08/25/2026 20:00
Commodity: Frozen poultry
Weight: 41500 lbs
Rate: $2,150.00
Ref #: RC-22018
PO #: PO-77841
Reefer Setpoint: 0 F
SPECIAL INSTRUCTIONS
- Appointment required at delivery; call 60 minutes out
- Lumper receipt required
`,
    queries.listCustomers(),
  );
  assert.equal(parsed.origin, "Atlanta, GA");
  assert.equal(parsed.destination, "Jacksonville, FL");
  assert.equal(parsed.rate, 2150);
  assert.equal(parsed.reefer_setpoint_f, 0);
  assert.match(parsed.special_instructions, /Lumper/i);
  assert.ok(parsed.customer_id, "sample customer should match Delta Cold Storage");

  const ascendText = `
LOAD CONFIRMATION
Load # 45090
Date 08/23/2026
Equipment Reefer, 53'
Weight 42500 lbs
Commodity FROZEN BEEF
Rate $3200 / Flat Rate
Pickup 03/03/25 Lineage Logistics - Avenel, 275 Blair rd, Avenel, NJ 07001
Delivery 03/05/25 Nebraska Cold Storage, 600 E 39th St, Hastings, NE 68901
Special instructions: continuous reefer, two load locks, seal required.
Send bills to billing@msloads.com
`;
  const ascend = parseRateConText(ascendText);
  assert.equal(ascend.load_number_hint, "45090");
  assert.equal(ascend.reference_number, "45090");
  assert.equal((await import("../lib/rate-con-shared")).customerRefFromRateCon(ascend), "45090");
  assert.equal(ascend.weight, 42500);
  assert.notEqual(ascend.weight, 45090);
  assert.match(ascend.commodity, /FROZEN BEEF/i);
  assert.equal(ascend.rate, 3200);
  assert.match(ascend.origin, /Avenel/i);
  assert.match(ascend.destination, /Hastings/i);
  assert.match(ascend.special_instructions, /continuous reefer/i);
  assert.equal(ascend.customer_name, "", "broker packet has no shipper customer");
  assert.equal(ascend.shipper.name, "Lineage Logistics - Avenel");
  assert.match(ascend.shipper.street, /275 Blair/i);
  assert.equal(ascend.shipper.city, "Avenel");
  assert.equal(ascend.shipper.state, "NJ");
  assert.equal(ascend.shipper.zip, "07001");
  assert.equal(ascend.consignee.name, "Nebraska Cold Storage");
  assert.match(ascend.consignee.street, /600 E 39th/i);
  assert.equal(ascend.consignee.city, "Hastings");
  assert.equal(ascend.consignee.state, "NE");
  assert.match(ascend.consignee.zip, /68901/);
  assert.equal(ascend.shipper_location_id, null);
  assert.equal(ascend.consignee_location_id, null);

  const stackedAscend = parseRateConText(
    `
LOAD CONFIRMATION
Load #
45090
Date
08/23/2026
Equipment
Reefer
Equipment Length
53'
Weight
42500 lbs
Commodity
FROZEN BEEF
Distance
1406 miles
Carrier
MS EXPRESS
Stops / Actions
#
Action
Date/Time
Location
Contact
1
Pickup
03/03/25
Lineage Logistics - Avenel
275 Blair rd
Avenel, NJ 07001
Preferred Freezer-Woodridge
Phone: 732-340-1600
2
Delivery
03/05/25
Nebraska Cold Storage
600 E 39th St
Hastings, NE 68901-7381 USA
Jennifer
Phone: 402-461-4442
Pay Items
Description
Notes
Quantity
Rate
Amount
Flat Rate
1
3200.00
$ 3,200.00
Total
$ 3,200.00
Terms of Load
Please email invoices to billing@msloads.com with the load number in the subject line.
Temperature controlled loads must always run on continuous mode. Never start and stop.
Two load locks. Seal required.
Page 1 out of 2
Load #45090 | Powered by AscendTMS.com
`,
    [],
    "Load_Confirmation_45090_20260823190045.pdf",
  );
  assert.equal(stackedAscend.weight, 42500);
  assert.notEqual(stackedAscend.weight, 45090);
  assert.equal(stackedAscend.reference_number, "45090");
  assert.equal(stackedAscend.rate, 3200);
  assert.match(stackedAscend.commodity, /FROZEN BEEF/i);
  assert.equal(stackedAscend.origin, "Avenel, NJ");
  assert.equal(stackedAscend.destination, "Hastings, NE");
  assert.match(stackedAscend.special_instructions, /continuous reefer/i);
  assert.match(stackedAscend.special_instructions, /billing@msloads.com/i);
  assert.equal(stackedAscend.reefer_mode, "continuous", "Ascend terms: continuous, never start/stop");
  assert.equal(stackedAscend.customer_name, "");
  assert.equal(stackedAscend.shipper.name, "Lineage Logistics - Avenel");
  assert.match(stackedAscend.shipper.street, /275 Blair/i);
  assert.equal(stackedAscend.shipper.city, "Avenel");
  assert.equal(stackedAscend.shipper.state, "NJ");
  assert.equal(stackedAscend.shipper.zip, "07001");
  assert.equal(stackedAscend.shipper.phone, "732-340-1600");
  assert.equal(stackedAscend.consignee.name, "Nebraska Cold Storage");
  assert.match(stackedAscend.consignee.street, /600 E 39th/i);
  assert.equal(stackedAscend.consignee.city, "Hastings");
  assert.equal(stackedAscend.consignee.state, "NE");
  assert.match(stackedAscend.consignee.zip, /68901/);
  assert.equal(stackedAscend.consignee.phone, "402-461-4442");
  assert.equal(stackedAscend.shipper_location_id, null, "parse must not invent a location id");
  assert.equal(stackedAscend.consignee_location_id, null, "parse must not invent a location id");
  assert.deepEqual(stackedAscend.extra_stops, []);

  const noahId = queries.createCustomer({
    name: "Noah's Ark Processors",
    billing_notes: "1 University Plaza, Hackensack, NJ 07601",
    contacts: [],
  });
  const noahParsed = parseRateConText(
    `
LOAD CONFIRMATION
Load # 52309
Date 08/30/2026
Customer Information
NOAH'S ARK PROCESSORS
1 UNIVERSITY PLAZA
SUITE 206
HACKENSACK, NJ 07601
201-488-6789
Weight 21000 lbs
Commodity FRESH BEEF
Rate $5869 / Flat Rate
1
Pickup
08/21/26
Nebraska Cold Storage
600 E 39th St
Hastings, NE 68901
2
Delivery
08/24/26
Westside Foods - KOSHER
355 Food Center Dr
Bronx, NY 10474
`,
    queries.listCustomers(),
  );
  assert.equal(noahParsed.customer_name, "NOAH'S ARK PROCESSORS");
  assert.equal(noahParsed.customer_id, noahId);
  assert.equal(noahParsed.rate, 5869);
  assert.equal(noahParsed.weight, 21000);

  const messyAscendRate = parseRateConText(
    `
LOAD CONFIRMATION
Load # 52309
Customer Information
NOAH'S ARK PROCESSORS
Weight
21000 lbs
Commodity
FRESH BEEF
Stops / Actions
1
Pickup
08/21/26
Nebraska Cold Storage
600 E 39th St
Hastings, NE 68901
2
Delivery
08/24/26
Westside Foods - KOSHER
355 Food Center Dr
Bronx, NY 10474
Pay Items
Description
Notes
Quantity
Rate
Amount
Flat Rate
1
5 869.00
$ 5 869.00
Fuel surcharge rate: $0.45 per mile
Total
$ 5 869.00
Terms of Load
Linehaul rate: 1
`,
    queries.listCustomers(),
    "Load_Confirmation_52309_20260830013800.pdf",
  );
  assert.equal(messyAscendRate.rate, 5869, "pay-item total wins over qty 1 and fuel-per-mile");
  assert.equal(messyAscendRate.weight, 21000);

  const agreedAmount = parseRateConText(
    `
Rate & Load Confirmation
LOAD #: 52310
Shipper 1
Nebraska Cold Storage
600 E 39th St, Hastings, NE 68901
Date 08/21/2026
Weight 21000 lbs
Description FRESH BEEF
Consignee 1
Westside Foods
355 Food Center Dr, Bronx, NY 10474
Agreed Amount: $5,869.00
Dispatch Notes:
Continuous reefer.
`,
  );
  assert.equal(agreedAmount.rate, 5869, "printed agreed amount is the customer rate");

  const { extractDocumentText: extract52309Text } = await import("../lib/rate-con");
  const real52309Text = await extract52309Text(
    fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/Load_Confirmation_52309.pdf")),
    "application/pdf",
    "Load_Confirmation_52309_20260830013800.pdf",
  );
  const real52309 = parseRateConText(
    real52309Text,
    queries.listCustomers(),
    "Load_Confirmation_52309_20260830013800.pdf",
  );
  assert.equal(real52309.rate, 5869, "Ascend 52309 Flat Rate total is the customer rate");
  assert.equal(real52309.weight, 21000);
  assert.match(real52309.commodity, /FRESH BEEF/i);
  assert.equal(real52309.reference_number, "52309");
  assert.equal(real52309.customer_name, "", "carrier packet has no Customer Information block");
  assert.match(real52309.shipper.name, /Nebraska Cold Storage/i);
  assert.match(real52309.shipper.street, /600 E 39th/i);
  assert.match(real52309.origin, /Hastings/i);
  assert.match(real52309.consignee.name, /Westside Foods/i);
  assert.match(real52309.consignee.street, /355 Food Center/i);
  assert.match(real52309.consignee.city, /Bronx/i);
  assert.equal(real52309.extra_stops.length, 3, "52309 has four deliveries — keep every drop after the first");
  assert.match(real52309.extra_stops[0]?.stop.name ?? "", /Chef's Kingdom/i);
  assert.match(real52309.extra_stops[0]?.stop.street ?? "", /1 Alpine/i);
  assert.match(real52309.extra_stops[0]?.stop.city ?? "", /Chestnut Ridge/i);
  assert.match(real52309.extra_stops[1]?.stop.name ?? "", /Wakefern/i);
  assert.match(real52309.extra_stops[1]?.stop.street ?? "", /5000 Riverside/i);
  assert.match(real52309.extra_stops[1]?.stop.city ?? "", /Keasbey/i);
  assert.match(real52309.extra_stops[2]?.stop.name ?? "", /Kayco/i);
  assert.match(real52309.extra_stops[2]?.stop.street ?? "", /72 New Hook/i);
  assert.match(real52309.extra_stops[2]?.stop.city ?? "", /Bayonne/i);
  assert.ok(real52309.extra_stops.every((extra) => extra.kind === "delivery"));

  const threeStopAscend = parseRateConText(
    `
LOAD CONFIRMATION
Load # 45091
Weight 42000 lbs
Commodity FRESH BEEF
Rate $2800 / Flat Rate
1
Pickup
08/25/26
Midwest Beef Hastings
100 Packer Rd
Hastings, NE 68901
2
Pickup
08/25/26
Grand Island Cooler
50 Warehouse Ave
Grand Island, NE 68801
3
Delivery
08/27/26
El Paso Foods
200 Border St
El Paso, TX 79901
Pay Items
Total
$ 2,800.00
`,
  );
  assert.equal(threeStopAscend.shipper.name, "Midwest Beef Hastings");
  assert.match(threeStopAscend.shipper.street, /100 Packer/i);
  assert.equal(threeStopAscend.shipper.city, "Hastings");
  assert.equal(threeStopAscend.consignee.name, "El Paso Foods");
  assert.match(threeStopAscend.consignee.street, /200 Border/i);
  assert.equal(threeStopAscend.extra_stops.length, 1);
  assert.equal(threeStopAscend.extra_stops[0]?.kind, "pickup");
  assert.equal(threeStopAscend.extra_stops[0]?.stop.name, "Grand Island Cooler");
  assert.match(threeStopAscend.extra_stops[0]?.stop.street ?? "", /50 Warehouse/i);

  const withPhones = parseRateConText(
    `
LOAD CONFIRMATION
Load # 45090
Weight 42500 lbs
Commodity FROZEN BEEF
Rate $3200 / Flat Rate
Pickup 03/03/25 Lineage Logistics - Avenel, 275 Blair rd, Avenel, NJ 07001 Phone: 732-750-5900
Delivery 03/05/25 Nebraska Cold Storage, 600 E 39th St, Hastings, NE 68901 Phone: 402-461-4442
`,
  );
  assert.equal(withPhones.shipper.phone, "732-750-5900");
  assert.equal(withPhones.consignee.phone, "402-461-4442");
  assert.equal(withPhones.shipper.street, "275 Blair rd");
  assert.equal(withPhones.consignee.street, "600 E 39th St");
  const namedFile = parseRateConText(
    "Load confirmation for file Load_Confirmation_45090_20260823190045.pdf",
    [],
    "Load_Confirmation_45090_20260823190045.pdf",
  );
  assert.equal(namedFile.weight, null, "filename digits must not become weight");
  assert.equal(namedFile.origin, "", "filename-only text must not invent origin");

  const { sanitizeParsedRateCon, emptyParsedRateCon, textLooksLikeFilenameOnly } = await import("../lib/rate-con");
  assert.equal(
    textLooksLikeFilenameOnly(
      "Load_Confirmation_45090_20260823190045.pdf",
      "Load_Confirmation_45090_20260823190045.pdf",
    ),
    true,
  );
  const filenameWeight = sanitizeParsedRateCon(
    { ...emptyParsedRateCon(), weight: 45090, load_number_hint: "45090", raw_text: "LOAD CONFIRMATION\nLoad # 45090" },
    "Load_Confirmation_45090_20260823190045.pdf",
  );
  assert.equal(filenameWeight.weight, null, "load number / filename digits must not become weight");

  const printed = parseRateConText(
    `
Rate & Load Confirmation
LOAD #: 45090
Shipper 1
Lineage Logistics - Avenel
275 Blair rd, Avenel, NJ 07001
Date 03/03/2025
Time 8:00 AM
Weight 42500 lbs
Description FROZEN BEEF
Consignee 1
Nebraska Cold Storage
600 E 39th St, Hastings, NE 68901
Date 03/05/2025
Time 2:00 PM
Dispatch Notes:
Continuous reefer. Two load locks.
`,
    [],
    "Load_Confirmation_45090_20260823190045.pdf",
  );
  assert.equal(printed.weight, 42500);
  assert.notEqual(printed.weight, 45090);
  assert.match(printed.origin, /Avenel/i);
  assert.match(printed.destination, /Hastings/i);
  assert.ok(printed.pickup_start);
  assert.ok(printed.delivery_start);
  assert.match(printed.special_instructions, /Continuous reefer/i);
  assert.equal(printed.shipper.name, "Lineage Logistics - Avenel");
  assert.match(printed.shipper.street, /275 Blair/i);
  assert.equal(printed.shipper.city, "Avenel");
  assert.equal(printed.consignee.name, "Nebraska Cold Storage");
  assert.match(printed.consignee.street, /600 E 39th/i);
  assert.equal(printed.consignee.city, "Hastings");

  const { parseReeferModeFromText, parseReeferSetpointFromText, resolveReeferSpec } = await import(
    "../lib/reefer-shared"
  );
  assert.equal(
    parseReeferModeFromText("Temperature controlled loads must always run on continuous mode. Never start and stop."),
    "continuous",
  );
  assert.equal(parseReeferModeFromText("Run start and stop overnight"), "start_stop");
  assert.equal(parseReeferSetpointFromText("Reefer Setpoint: 0 F"), 0);
  assert.equal(parseReeferSetpointFromText("Maintain 34°F."), 34);
  assert.equal(resolveReeferSpec({ reefer_setpoint_f: -10, reefer_mode: "", special_instructions: "" }).mode, "continuous");
  assert.equal(resolveReeferSpec({ equipment: "dry_van_53" }).isReefer, false);
  assert.equal(resolveReeferSpec({ equipment: "reefer_53" }).isReefer, true);
  assert.equal(resolveReeferSpec({ equipment: "reefer_53" }).mode, "continuous");
  assert.equal(resolveReeferSpec({ equipment: "reefer_53" }).setpointF, null);
  assert.equal(resolveReeferSpec({ equipment: "reefer_53", temperature_f: 34 }).setpointF, 34);
  assert.equal(resolveReeferSpec({ equipment: "dry_van_53", temperature_f: 34 }).isReefer, false);

  const { attachParsedLocationMatches, matchLocationForParsedStop } = await import("../lib/rate-con-shared");
  const locationsBeforeMatch = queries.listLocations().length;
  const lineageId = queries.createLocation({
    name: "Lineage Logistics - Avenel",
    street: "275 Blair rd",
    city: "Avenel",
    state: "NJ",
    zip: "07001",
    phone: "732-340-1600",
    notes: "",
    role: "shipper",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
  });
  const matchedBook = attachParsedLocationMatches(stackedAscend, queries.listLocations());
  assert.equal(matchedBook.shipper_location_id, lineageId);
  assert.equal(matchedBook.consignee_location_id, null, "unmatched consignee must wait for human confirm");
  assert.equal(queries.listLocations().length, locationsBeforeMatch + 1, "matching must not insert locations");
  assert.equal(
    matchLocationForParsedStop(queries.listLocations(), stackedAscend.consignee, "receiver")?.id ?? null,
    null,
  );
  const addressOnly = matchLocationForParsedStop(
    queries.listLocations(),
    { name: "Different Name LLC", street: "275 Blair Road", city: "Avenel", state: "NJ", zip: "07001", phone: "" },
    "shipper",
  );
  assert.equal(addressOnly?.id, lineageId, "street+city+state should match even when the name differs");

  const emptyExtract = await (await import("../lib/actions")).parseRateConAction(null, new FormData());
  assert.equal(emptyExtract.ok, false);
  if (!emptyExtract.ok) assert.match(emptyExtract.error, /Pick a file first/);

  const { default: PDFDocumentCtor } = await import("../lib/pdfkit-document");
  const ascendPdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocumentCtor({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text("LOAD CONFIRMATION");
    doc.fontSize(11);
    doc.text("Load # 45090");
    doc.text("Weight 42500 lbs");
    doc.text("Commodity FROZEN BEEF");
    doc.text("Rate $3200 / Flat Rate");
    doc.text("Pickup 03/03/25 Lineage Logistics - Avenel, 275 Blair rd, Avenel, NJ 07001");
    doc.text("Delivery 03/05/25 Nebraska Cold Storage, 600 E 39th St, Hastings, NE 68901");
    doc.text("Special instructions: continuous reefer, two load locks, seal required.");
    doc.end();
  });
  const ascendForm = new FormData();
  ascendForm.set(
    "rate_con",
    new File([new Uint8Array(ascendPdf)], "Load_Confirmation_45090_20260823190045.pdf", {
      type: "application/pdf",
    }),
  );
  const extracted = await (await import("../lib/actions")).parseRateConAction(null, ascendForm);
  assert.equal(extracted.ok, true);
  if (extracted.ok && "parsed" in extracted) {
    assert.equal(extracted.parsed.weight, 42500);
    assert.notEqual(extracted.parsed.weight, 45090);
    assert.equal(extracted.parsed.rate, 3200);
    assert.match(extracted.parsed.origin, /Avenel/i);
    assert.match(extracted.parsed.destination, /Hastings/i);
    assert.equal(extracted.parsed.shipper.name, "Lineage Logistics - Avenel");
    assert.match(extracted.parsed.shipper.street, /275 Blair/i);
    assert.equal(extracted.parsed.consignee.name, "Nebraska Cold Storage");
    assert.match(extracted.parsed.consignee.street, /600 E 39th/i);
    assert.equal(extracted.parsed.shipper_location_id, lineageId);
    assert.equal(extracted.parsed.consignee_location_id, null);
    assert.ok(extracted.inboxId);
    assert.equal(extracted.fileName, "Load_Confirmation_45090_20260823190045.pdf");
  }

  const locationsAfterParse = queries.listLocations().length;
  const saveForm = new FormData();
  saveForm.set("name", "Nebraska Cold Storage");
  saveForm.set("street", "600 E 39th St");
  saveForm.set("city", "Hastings");
  saveForm.set("state", "NE");
  saveForm.set("zip", "68901");
  saveForm.set("phone", "402-461-4442");
  saveForm.set("role", "receiver");
  saveForm.set("scheduling_type", "appointment");
  const savedStop = await (await import("../lib/actions")).saveRateConLocationAction(null, saveForm);
  assert.equal(savedStop.ok, true);
  if (savedStop.ok) {
    assert.equal(savedStop.location.name, "Nebraska Cold Storage");
    assert.match(savedStop.location.street, /600 E 39th/i);
    assert.equal(savedStop.location.city, "Hastings");
    assert.equal(savedStop.location.state, "NE");
    assert.equal(savedStop.location.phone, "402-461-4442");
    const afterConfirm = attachParsedLocationMatches(stackedAscend, queries.listLocations());
    assert.equal(afterConfirm.consignee_location_id, savedStop.location.id);
  }
  assert.equal(queries.listLocations().length, locationsAfterParse + 1, "only the confirmed save adds a location");

  const { applyRateConStopsToLoad } = await import("../lib/rate-con-stops");
  const { listStops: listRateConStops, ensureDefaultStops: ensureRateConStops } = await import("../lib/stops");
  const cityOnlyLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "El Paso, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 42000,
    commodity: "FRESH BEEF",
    rate: 2800,
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
  });
  const cityOnlyStops = ensureRateConStops(cityOnlyLoadId);
  assert.equal(cityOnlyStops[0]?.street, "", "city/state lane must not invent a street");
  assert.equal(cityOnlyStops[0]?.city, "Hastings");
  assert.equal(cityOnlyStops[0]?.state, "NE");
  assert.equal(cityOnlyStops[1]?.city, "El Paso");
  assert.equal(cityOnlyStops[1]?.state, "TX");

  const rateConStopForm = new FormData();
  rateConStopForm.set("pickup_stop_name", "Midwest Beef Hastings");
  rateConStopForm.set("pickup_stop_street", "100 Packer Rd");
  rateConStopForm.set("pickup_stop_city", "Hastings");
  rateConStopForm.set("pickup_stop_state", "NE");
  rateConStopForm.set("pickup_stop_zip", "68901");
  rateConStopForm.set("delivery_stop_name", "El Paso Foods");
  rateConStopForm.set("delivery_stop_street", "200 Border St");
  rateConStopForm.set("delivery_stop_city", "El Paso");
  rateConStopForm.set("delivery_stop_state", "TX");
  rateConStopForm.set("delivery_stop_zip", "79901");
  rateConStopForm.set(
    "extra_stops_json",
    JSON.stringify([{ kind: "pickup", stop: threeStopAscend.extra_stops[0]?.stop }]),
  );
  applyRateConStopsToLoad(cityOnlyLoadId, rateConStopForm);
  const filledStops = listRateConStops(cityOnlyLoadId);
  const filledPickup = filledStops.find((stop) => stop.kind === "pickup" && stop.name === "Midwest Beef Hastings");
  const filledExtra = filledStops.find((stop) => stop.name === "Grand Island Cooler");
  const filledDelivery = filledStops.find((stop) => stop.kind === "delivery");
  assert.equal(filledPickup?.name, "Midwest Beef Hastings");
  assert.match(filledPickup?.street ?? "", /100 Packer/i);
  assert.equal(filledPickup?.city, "Hastings");
  assert.equal(filledPickup?.state, "NE");
  assert.equal(filledPickup?.zip, "68901");
  assert.equal(filledDelivery?.name, "El Paso Foods");
  assert.match(filledDelivery?.street ?? "", /200 Border/i);
  assert.equal(filledDelivery?.city, "El Paso");
  assert.equal(filledDelivery?.zip, "79901");
  assert.equal(filledExtra?.street, "50 Warehouse Ave");
  assert.equal(filledStops.length, 3);
  const keepStreetForm = new FormData();
  keepStreetForm.set("pickup_stop_name", "Other Plant");
  keepStreetForm.set("pickup_stop_street", "999 Invented Ave");
  keepStreetForm.set("pickup_stop_city", "Hastings");
  keepStreetForm.set("pickup_stop_state", "NE");
  applyRateConStopsToLoad(cityOnlyLoadId, keepStreetForm);
  assert.equal(
    listRateConStops(cityOnlyLoadId).find((stop) => stop.kind === "pickup" && stop.name === "Midwest Beef Hastings")
      ?.street,
    filledPickup?.street,
    "a filled street must not be overwritten on a later apply",
  );

  const fiveStopLoadId = queries.createLoad({
    customer_id: customerId,
    origin: real52309.origin,
    destination: real52309.destination,
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 21000,
    commodity: "FRESH BEEF",
    rate: 5869,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "52309",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const fiveStopForm = new FormData();
  fiveStopForm.set("pickup_stop_name", real52309.shipper.name);
  fiveStopForm.set("pickup_stop_street", real52309.shipper.street);
  fiveStopForm.set("pickup_stop_city", real52309.shipper.city);
  fiveStopForm.set("pickup_stop_state", real52309.shipper.state);
  fiveStopForm.set("pickup_stop_zip", real52309.shipper.zip);
  fiveStopForm.set("delivery_stop_name", real52309.consignee.name);
  fiveStopForm.set("delivery_stop_street", real52309.consignee.street);
  fiveStopForm.set("delivery_stop_city", real52309.consignee.city);
  fiveStopForm.set("delivery_stop_state", real52309.consignee.state);
  fiveStopForm.set("delivery_stop_zip", real52309.consignee.zip);
  fiveStopForm.set("extra_stops_json", JSON.stringify(real52309.extra_stops));
  applyRateConStopsToLoad(fiveStopLoadId, fiveStopForm);
  const fiveStopRows = listRateConStops(fiveStopLoadId);
  assert.equal(fiveStopRows.length, 5, "one pickup and four deliveries each stay their own stop");
  assert.equal(fiveStopRows.filter((stop) => stop.kind === "pickup").length, 1);
  assert.equal(fiveStopRows.filter((stop) => stop.kind === "delivery").length, 4);
  assert.match(fiveStopRows.find((stop) => /Chef/i.test(stop.name))?.street ?? "", /1 Alpine/i);
  assert.match(fiveStopRows.find((stop) => /Wakefern/i.test(stop.name))?.city ?? "", /Keasbey/i);
  assert.match(fiveStopRows.find((stop) => /Kayco/i.test(stop.name))?.city ?? "", /Bayonne/i);

  const blankPdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocumentCtor({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(11).text(" ");
    doc.end();
  });
  const blankForm = new FormData();
  blankForm.set(
    "rate_con",
    new File([new Uint8Array(blankPdf)], "Load_Confirmation_45090_20260823190045.pdf", {
      type: "application/pdf",
    }),
  );
  const blankExtract = await (await import("../lib/actions")).parseRateConAction(null, blankForm);
  assert.equal(blankExtract.ok, true);
  if (blankExtract.ok && "parsed" in blankExtract) {
    assert.equal(blankExtract.parsed.weight, null, "empty PDF must not scrape 45090 from the filename");
    assert.equal(blankExtract.parsed.origin, "");
    assert.equal(blankExtract.warning, "Couldn't read text from this PDF");
    assert.equal(blankExtract.fileName, "Load_Confirmation_45090_20260823190045.pdf");
    assert.ok(blankExtract.inboxId);
  }

  const {
    applyAiRateCon,
    decorateHintRateCon,
    parseRateConAiJson,
    RATE_CON_AI_MISSING_KEY,
    setRateConAiTestClient,
  } = await import("../lib/rate-con-ai");
  const brokerDraft = parseRateConAiJson(`{
    "customer_name": "Allen Lund Company",
    "customer_confidence": "high",
    "rate": 4250,
    "rate_confidence": "high",
    "commodity": "Fresh beef trimmings",
    "weight": 38400,
    "load_number": "RXO-77241",
    "po_number": "WSF-8891",
    "equipment": "reefer",
    "reefer_setpoint_f": 28,
    "reefer_mode": "continuous",
    "special_instructions": "Call the yard before arrival.",
    "contact_name": "Alex Broker",
    "contact_email": "alex.broker@example.com",
    "contact_phone": "402-555-0199",
    "contact_ext": "2210",
    "stops": [
      {
        "kind": "pickup",
        "name": "Hastings Packing",
        "street": "100 Packer Rd",
        "city": "Hastings",
        "state": "NE",
        "zip": "68901",
        "schedule_type": "appointment",
        "window_start": "2026-08-21T06:00",
        "window_end": "2026-08-21T10:00",
        "confirmation": "HST-441",
        "notes": "Call the yard before arrival.",
        "confidence": "high"
      },
      {
        "kind": "delivery",
        "name": "Westside Foods - KOSHER",
        "street": "355 Food Center Dr",
        "city": "Bronx",
        "state": "NY",
        "zip": "10474",
        "schedule_type": "fcfs",
        "window_start": "2026-08-24T07:00",
        "window_end": "2026-08-24T15:00",
        "confirmation": "WSF-8891",
        "confidence": "high"
      },
      {
        "kind": "delivery",
        "name": "Kayco Bayonne",
        "street": "72 New Hook Rd",
        "city": "Bayonne",
        "state": "NJ",
        "zip": "07002",
        "schedule_type": "appointment",
        "window_start": "2026-08-24T16:00",
        "confirmation": "",
        "confidence": "high"
      }
    ]
  }`);
  const allenId = queries.createCustomer({ name: "Allen Lund Company", billing_notes: "", contacts: [] });
  const brokerParsed = applyAiRateCon(brokerDraft, queries.listCustomers(), emptyParsedRateCon(), "RXO Carrier Tender");
  assert.equal(brokerParsed.reader, "ai");
  assert.equal(brokerParsed.customer_name, "Allen Lund Company");
  assert.equal(brokerParsed.customer_id, allenId);
  assert.equal(brokerParsed.contact_email, "alex.broker@example.com");
  assert.equal(brokerParsed.contact_name, "Alex Broker");
  assert.equal(brokerParsed.contact_phone, "402-555-0199");
  assert.equal(brokerParsed.contact_ext, "2210");
  assert.equal(queries.getCustomer(allenId)?.main_email, "");
  assert.equal(queries.getCustomer(allenId)?.billing_email, "");
  assert.equal(queries.getCustomer(allenId)?.contacts.length, 0);
  assert.equal(brokerParsed.rate, 4250);
  assert.equal(brokerParsed.weight, 38400);
  assert.match(brokerParsed.commodity, /Fresh beef/i);
  assert.equal(brokerParsed.load_number_hint, "RXO-77241");
  assert.equal((await import("../lib/rate-con-shared")).customerRefFromRateCon(brokerParsed), "RXO-77241");
  assert.equal(brokerParsed.equipment, "reefer_53");
  assert.equal(brokerParsed.reefer_mode, "continuous");
  assert.equal(brokerParsed.reefer_setpoint_f, 28);
  assert.equal(brokerParsed.shipper.name, "Hastings Packing");
  assert.match(brokerParsed.shipper.street, /100 Packer/i);
  assert.equal(brokerParsed.shipper.schedule_type, "appointment");
  assert.equal(brokerParsed.shipper.confirmation, "HST-441");
  assert.equal(brokerParsed.consignee.name, "Westside Foods - KOSHER");
  assert.equal(brokerParsed.consignee.schedule_type, "fcfs");
  assert.equal(brokerParsed.extra_stops.length, 1);
  assert.equal(brokerParsed.extra_stops[0]?.kind, "delivery");
  assert.match(brokerParsed.extra_stops[0]?.stop.name ?? "", /Kayco/i);
  assert.equal(brokerParsed.field_flags.some((flag) => flag.key === "rate" && flag.status === "low"), false);

  const { parseBrokerContactFromText } = await import("../lib/rate-con-shared");
  const tqlContactText = `
CARRIER CONTACT
MS Express
jc 402-555-0100
TQL CONTACT INFO
Name Phone Email Fax
Riley Booker 800-555-3101 x47010 riley.booker@broker.example 5135554273
PICKUP
Indel (915) 590-5914
send POD to billing.pod@broker.example
`;
  const tqlContact = parseBrokerContactFromText(tqlContactText);
  assert.equal(tqlContact.contact_email, "riley.booker@broker.example");
  assert.match(tqlContact.contact_name, /Riley Booker/);
  assert.equal(tqlContact.contact_phone, "800-555-3101");
  assert.equal(tqlContact.contact_ext, "47010");
  assert.doesNotMatch(tqlContact.contact_email, /billing\.pod|jc@|indel/i);
  const aboveTitleSheet = fs.readFileSync(
    path.join(process.cwd(), "scripts/fixtures/contact-table-above-title.txt"),
    "utf8",
  );
  const aboveTitleContact = parseBrokerContactFromText(aboveTitleSheet);
  assert.equal(aboveTitleContact.contact_name, "Morgan Hale");
  assert.equal(aboveTitleContact.contact_email, "morgan.hale@broker.example");
  assert.equal(aboveTitleContact.contact_phone, "312-555-0144");
  assert.equal(aboveTitleContact.contact_ext, "8821");
  assert.doesNotMatch(aboveTitleContact.contact_email, /leftover\.pod|jc@|tql/i);
  assert.doesNotMatch(`${aboveTitleContact.contact_phone} ${aboveTitleContact.contact_ext}`, /60666|7177828|915|580-3101/);
  const sheetCustomerId = queries.createCustomer({
    name: "Sheet Customer",
    billing_notes: "",
    main_email: "desk@shipper.example",
    billing_email: "ap@shipper.example",
    contacts: [{ name: "Desk", role: "Office", phone: "402-555-0100", email: "desk@shipper.example" }],
  });
  const sheetLoadId = queries.createLoad({
    customer_id: sheetCustomerId,
    origin: "Chicago, IL",
    destination: "Lenexa, KS",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 2699,
    commodity: "Epoxy",
    rate: null,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 0,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
    contact_name: aboveTitleContact.contact_name,
    contact_email: aboveTitleContact.contact_email,
    contact_phone: aboveTitleContact.contact_phone,
    contact_ext: aboveTitleContact.contact_ext,
  });
  const sheetLoad = queries.getLoad(sheetLoadId)!;
  assert.equal(sheetLoad.contact_name, "Morgan Hale");
  assert.equal(sheetLoad.contact_email, "morgan.hale@broker.example");
  assert.equal(sheetLoad.contact_phone, "312-555-0144");
  assert.equal(sheetLoad.contact_ext, "8821");
  assert.equal(queries.getCustomer(sheetCustomerId)?.main_email, "desk@shipper.example");
  assert.equal(queries.getCustomer(sheetCustomerId)?.billing_email, "ap@shipper.example");
  assert.equal(queries.getCustomer(sheetCustomerId)?.contacts[0]?.phone, "402-555-0100");
  assert.equal(loadMail.resolveInvoiceCustomerEmail(sheetLoad), "ap@shipper.example");
  assert.equal(loadMail.resolveLoadCustomerEmail(sheetLoad), "morgan.hale@broker.example");
  assert.equal(loadContact.resolveLoadCustomerPhone(sheetLoad), "312-555-0144");
  assert.equal(loadContact.resolveCustomerMainPhone(sheetCustomerId), "402-555-0100");
  const noContactBlock = parseBrokerContactFromText(`
LOAD INFORMATION
Pickup Chicago IL
Phone: (915) 590-5914
send POD to leftover@broker.example
`);
  assert.equal(noContactBlock.contact_name, "");
  assert.equal(noContactBlock.contact_email, "");
  assert.equal(noContactBlock.contact_phone, "");
  assert.equal(noContactBlock.contact_ext, "");
  const tqlHint = parseRateConText(tqlContactText);
  assert.equal(tqlHint.contact_email, "riley.booker@broker.example");
  assert.equal(tqlHint.contact_ext, "47010");
  const fromTextOnly = applyAiRateCon(
    { customer_name: "Allen Lund Company", customer_confidence: "high", stops: [] },
    queries.listCustomers(),
    emptyParsedRateCon(),
    tqlContactText,
  );
  assert.equal(fromTextOnly.contact_email, "riley.booker@broker.example");
  assert.equal(fromTextOnly.contact_phone, "800-555-3101");
  assert.equal(fromTextOnly.contact_ext, "47010");
  assert.equal(queries.getCustomer(allenId)?.main_email, "");
  assert.equal(queries.getCustomer(allenId)?.contacts.length, 0);
  const phoneOnlyContact = parseBrokerContactFromText(`
BROKER CONTACT
Name: Dana Desk
Phone: 402-555-0188
Email: dana.desk@broker.example
`);
  assert.equal(phoneOnlyContact.contact_phone, "402-555-0188");
  assert.equal(phoneOnlyContact.contact_ext, "");
  assert.equal(phoneOnlyContact.contact_email, "dana.desk@broker.example");
  const noPhoneContact = parseBrokerContactFromText(`
BROKER CONTACT
Name: No Phone
Email: nophone@broker.example
`);
  assert.equal(noPhoneContact.contact_phone, "");
  assert.equal(noPhoneContact.contact_ext, "");
  assert.equal(noPhoneContact.contact_email, "nophone@broker.example");
  const appliedPhoneLoadId = queries.createLoad({
    customer_id: allenId,
    origin: "Hastings, NE",
    destination: "Bronx, NY",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 38400,
    commodity: "Fresh beef trimmings",
    rate: 4250,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 28,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
    contact_name: brokerParsed.contact_name,
    contact_email: brokerParsed.contact_email,
    contact_phone: brokerParsed.contact_phone,
    contact_ext: brokerParsed.contact_ext,
  });
  const appliedPhoneLoad = queries.getLoad(appliedPhoneLoadId)!;
  assert.equal(appliedPhoneLoad.contact_phone, "402-555-0199");
  assert.equal(appliedPhoneLoad.contact_ext, "2210");
  assert.equal(appliedPhoneLoad.contact_email, "alex.broker@example.com");
  assert.equal(queries.getCustomer(allenId)?.contacts.length, 0);
  assert.equal(queries.getCustomer(allenId)?.contacts[0]?.phone, undefined);
  const { resolveLoadCustomerPhoneLine, resolveCustomerMainPhone } = await import("../lib/load-contact");
  assert.equal(resolveLoadCustomerPhoneLine(appliedPhoneLoad), "402-555-0199 x2210");
  assert.equal(resolveCustomerMainPhone(allenId), "");
  assert.equal(loadMail.resolveInvoiceCustomerEmail(appliedPhoneLoad), "");

  const lowMoney = applyAiRateCon(
    {
      customer_name: "Maybe This Broker",
      customer_confidence: "low",
      rate: 9999,
      rate_confidence: "low",
      commodity: "Beef",
      weight: 20000,
      load_number: "X-1",
      stops: [
        { kind: "pickup", name: "Yard A", street: "1 A St", city: "Omaha", state: "NE", zip: "68102" },
        { kind: "delivery", name: "Yard B", street: "2 B St", city: "Chicago", state: "IL", zip: "60601" },
      ],
    },
    queries.listCustomers(),
  );
  assert.equal(lowMoney.rate, null, "low-confidence rate must not fill money");
  assert.equal(lowMoney.customer_id, null, "low-confidence customer must not match identity");
  assert.ok(lowMoney.field_flags.some((flag) => flag.key === "rate" && flag.status === "low"));
  assert.ok(lowMoney.field_flags.some((flag) => flag.key === "customer" && flag.status === "low"));

  const hinted = decorateHintRateCon(parseRateConText("RATE CONFIRMATION\nCustomer: Delta Cold Storage\nRate: $100\n", []));
  assert.equal(hinted.reader, "hint");
  assert.ok(hinted.field_flags.some((flag) => flag.status === "missing"));
  assert.match(RATE_CON_AI_MISSING_KEY, /not connected/);
  assert.doesNotMatch(RATE_CON_AI_MISSING_KEY, /\.env|OPENAI_API_KEY|sk-/);

  const brokerPdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocumentCtor({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text("RXO Carrier Tender");
    doc.fontSize(11).text("Tender ID  RXO-77241");
    doc.text("Bill-to party  Allen Lund Company");
    doc.text("All-in freight  USD 4,250.00");
    doc.text("Collect at Hastings Packing, 100 Packer Rd, Hastings NE 68901");
    doc.text("Deliver to Westside Foods - KOSHER, 355 Food Center Dr, Bronx NY 10474");
    doc.end();
  });
  setRateConAiTestClient(async () => JSON.stringify(brokerDraft));
  const brokerForm = new FormData();
  brokerForm.set("rate_con", new File([new Uint8Array(brokerPdf)], "rxo-tender-77241.pdf", { type: "application/pdf" }));
  const brokerExtract = await (await import("../lib/actions")).parseRateConAction(null, brokerForm);
  setRateConAiTestClient(null);
  assert.equal(brokerExtract.ok, true);
  if (brokerExtract.ok && "parsed" in brokerExtract) {
    assert.equal(brokerExtract.parsed.reader, "ai");
    assert.equal(brokerExtract.parsed.customer_name, "Allen Lund Company");
    assert.equal(brokerExtract.parsed.rate, 4250);
    assert.equal(brokerExtract.parsed.shipper.name, "Hastings Packing");
    assert.equal(brokerExtract.parsed.consignee.city, "Bronx");
    assert.equal(brokerExtract.parsed.extra_stops.length, 1);
    assert.ok(brokerExtract.inboxId, "file is held; load is not created until confirm");
    const loadsBeforeConfirm = queries.listLoads().length;
    assert.equal(queries.listLoads().length, loadsBeforeConfirm, "AI read must not save a load");
  }

  const rateConImportUi = fs.readFileSync(path.join(process.cwd(), "components/rate-con-import.tsx"), "utf8");
  assert.match(rateConImportUi, /Confirm and save load/);
  assert.match(rateConImportUi, /Discard draft/);
  assert.match(rateConImportUi, /data-rate-con-discard/);
  assert.match(rateConImportUi, /RateConFieldFlags/);
  assert.doesNotMatch(rateConImportUi, /Liftgate|Inside Pickup|Inside Delivery/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/rate-con-ai.ts"), "utf8"), /gpt-4o-mini|MIKE_OPENAI_MODEL/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/rate-con-ai.ts"), "utf8"), /console\.log/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/rate-con-ai.ts"), "utf8"), /redactRateConSecrets/);

  const { extractDocumentText: extractBrokerText } = await import("../lib/rate-con");
  const { parsedStopHasDetails } = await import("../lib/rate-con-shared");
  const comparisonFixtures = [
    {
      file: "tql-po-36817888.pdf",
      needle: /TQL PO#\s*36817888/i,
      hintMustMissStops: true,
      hintRate: null as number | null,
      draft: parseRateConAiJson(`{
        "customer_name": "TQL",
        "customer_confidence": "high",
        "rate": null,
        "rate_confidence": "low",
        "commodity": "Canned food",
        "weight": 44000,
        "load_number": "36817888",
        "po_number": "50826",
        "equipment": "reefer",
        "reefer_mode": "continuous",
        "special_instructions": "Must accept TQL tracking. Food grade trailer. Do not break the seal.",
        "stops": [
          {
            "kind": "pickup",
            "name": "Indel Food Products Inc",
            "street": "9515 Plaza Circle",
            "city": "El Paso",
            "state": "TX",
            "zip": "79927",
            "phone": "915-590-5914",
            "schedule_type": "fcfs",
            "window_start": "2026-05-18T08:00",
            "window_end": "2026-05-18T17:00",
            "confirmation": "50826",
            "notes": "FCFS 08:00 to 17:00 MST",
            "confidence": "high"
          },
          {
            "kind": "delivery",
            "name": "Cox Marketing",
            "street": "10150 Pilot Ave",
            "city": "Midland",
            "state": "TX",
            "zip": "79706",
            "schedule_type": "fcfs",
            "window_start": "2026-05-19T06:00",
            "window_end": "2026-05-19T14:00",
            "confidence": "high"
          }
        ]
      }`),
    },
    {
      file: "bmm-load-confirmation-056299.pdf",
      needle: /LOAD CONFIRMATION AND PAYMENT AGREEMENT/i,
      hintMustMissStops: true,
      hintRate: 2000 as number | null,
      draft: parseRateConAiJson(`{
        "customer_name": "BMM Logistics",
        "customer_confidence": "high",
        "rate": 2000,
        "rate_confidence": "high",
        "commodity": "CANDY",
        "weight": 20000,
        "load_number": "056299",
        "po_number": "H20279911",
        "equipment": "reefer",
        "reefer_setpoint_f": 60,
        "reefer_mode": "continuous",
        "special_instructions": "PRECOOL TO 60F. FOLLOW TEMP ON BOL. 2 LOAD LOCKS REQUIRED.",
        "stops": [
          {
            "kind": "pickup",
            "name": "FERRERO",
            "street": "600 Cottontail LN",
            "city": "Somerset",
            "state": "NJ",
            "zip": "08873",
            "schedule_type": "appointment",
            "window_start": "2025-12-05T16:30",
            "window_end": "2025-12-05T16:30",
            "confirmation": "H20279911",
            "confidence": "high"
          },
          {
            "kind": "delivery",
            "name": "SP DEKALB DC",
            "street": "801 E GURLER RD",
            "city": "DeKalb",
            "state": "IL",
            "zip": "60115",
            "schedule_type": "appointment",
            "window_start": "2025-12-07T12:00",
            "window_end": "2025-12-07T12:00",
            "confirmation": "1155538327",
            "confidence": "high"
          }
        ]
      }`),
    },
    {
      file: "cei-load-confirmation-0502830.pdf",
      needle: /CEI LOGISTICS/i,
      hintMustMissStops: true,
      hintRate: null as number | null,
      draft: parseRateConAiJson(`{
        "customer_name": "CEI Logistics",
        "customer_confidence": "high",
        "rate": 4000,
        "rate_confidence": "high",
        "commodity": "Fresh Product",
        "weight": 28000,
        "load_number": "0502830",
        "po_number": "49596555",
        "equipment": "reefer",
        "reefer_mode": "continuous",
        "special_instructions": "Verify rate confirmation temperature matches the BOL before leaving shipper. Four Kites tracking required.",
        "stops": [
          {
            "kind": "pickup",
            "name": "DFA DAIRY BRANDS",
            "street": "1188 LINCOLN ST SW",
            "city": "Le Mars",
            "state": "IA",
            "zip": "51031",
            "phone": "712-548-2200",
            "schedule_type": "appointment",
            "window_start": "2026-07-14T23:59",
            "confirmation": "49596555",
            "notes": "No driver loading. ck temp on bol b4 leaving shpr",
            "confidence": "high"
          },
          {
            "kind": "delivery",
            "name": "MCLANE COMMERCE CITY",
            "street": "17100 EAST 81ST AVE",
            "city": "Commerce City",
            "state": "CO",
            "zip": "80022",
            "phone": "720-374-5080",
            "schedule_type": "appointment",
            "window_start": "2026-07-16T01:00",
            "confirmation": "49596555",
            "notes": "No driver unloading",
            "confidence": "high"
          }
        ]
      }`),
    },
  ];
  for (const fixture of comparisonFixtures) {
    const pdfPath = path.join(process.cwd(), "scripts/fixtures", fixture.file);
    assert.equal(fs.existsSync(pdfPath), true, fixture.file);
    const text = await extractBrokerText(fs.readFileSync(pdfPath), "application/pdf", fixture.file);
    assert.match(text, fixture.needle, `${fixture.file} must extract readable text`);
    const hintOnly = parseRateConText(text, [], fixture.file);
    assert.equal(parsedStopHasDetails(hintOnly.shipper), false, `${fixture.file} layout helper misses pickup`);
    assert.equal(parsedStopHasDetails(hintOnly.consignee), false, `${fixture.file} layout helper misses delivery`);
    assert.equal(hintOnly.extra_stops.length, 0);
    assert.equal(hintOnly.rate, fixture.hintRate, `${fixture.file} hint rate`);
    const tqlCustomer = queries.listCustomers().find((row) => row.name === fixture.draft.customer_name);
    const customerId =
      tqlCustomer?.id ??
      queries.createCustomer({ name: String(fixture.draft.customer_name ?? ""), billing_notes: "", contacts: [] });
    const aiDraft = applyAiRateCon(fixture.draft, queries.listCustomers(), hintOnly, text);
    assert.equal(aiDraft.reader, "ai");
    assert.equal(aiDraft.customer_id, customerId);
    assert.ok(parsedStopHasDetails(aiDraft.shipper), `${fixture.file} AI fills pickup`);
    assert.ok(parsedStopHasDetails(aiDraft.consignee), `${fixture.file} AI fills delivery`);
    assert.match(aiDraft.shipper.street, /\d/);
    assert.match(aiDraft.consignee.street, /\d/);
    if (fixture.file.startsWith("tql")) {
      assert.equal(aiDraft.rate, null, "TQL sheet has no freight $ — do not invent a rate");
      assert.ok(aiDraft.field_flags.some((flag) => flag.key === "rate"));
      assert.equal(aiDraft.weight, 44000);
      assert.match(aiDraft.commodity, /canned food/i);
      assert.equal(aiDraft.shipper.schedule_type, "fcfs");
      assert.equal(aiDraft.consignee.schedule_type, "fcfs");
      assert.equal(aiDraft.consignee.city, "Midland");
      const tqlHintContact = parseRateConText(text, [], fixture.file);
      assert.equal(tqlHintContact.contact_name, "Caitlyn Will");
      assert.equal(tqlHintContact.contact_email, "CWill@TQL.com");
      assert.equal(tqlHintContact.contact_phone, "800-580-3101");
      assert.equal(tqlHintContact.contact_ext, "43088");
      assert.doesNotMatch(tqlHintContact.contact_phone, /915|590-5914/);
      assert.doesNotMatch(tqlHintContact.contact_name, /Pike|Express|jc/i);
      assert.equal(aiDraft.contact_name, "Caitlyn Will");
      assert.equal(aiDraft.contact_email, "CWill@TQL.com");
      assert.equal(aiDraft.contact_phone, "800-580-3101");
      assert.equal(aiDraft.contact_ext, "43088");
      assert.equal(queries.getCustomer(customerId)?.contacts.length, 0);
      assert.equal(loadMail.resolveInvoiceCustomerEmail({ contact_email: aiDraft.contact_email, customer_id: customerId }), "");
    }
    if (fixture.file.startsWith("bmm")) {
      assert.equal(aiDraft.rate, 2000);
      assert.equal(aiDraft.weight, 20000);
      assert.match(aiDraft.commodity, /^CANDY$/i);
      assert.equal(aiDraft.reefer_setpoint_f, 60);
      assert.match(aiDraft.shipper.name, /FERRERO/i);
      assert.match(aiDraft.consignee.city, /DeKalb/i);
    }
    if (fixture.file.startsWith("cei")) {
      assert.equal(aiDraft.rate, 4000);
      assert.equal(aiDraft.weight, 28000);
      assert.match(aiDraft.shipper.name, /DFA DAIRY/i);
      assert.match(aiDraft.consignee.name, /MCLANE/i);
      assert.equal(aiDraft.load_number_hint, "0502830");
    }
  }
  const tqlPath = path.join(process.cwd(), "scripts/fixtures", "tql-po-36817888.pdf");
  const tqlDraft = comparisonFixtures[0]?.draft;
  setRateConAiTestClient(async () => JSON.stringify(tqlDraft));
  const tqlForm = new FormData();
  tqlForm.set(
    "rate_con",
    new File([new Uint8Array(fs.readFileSync(tqlPath))], "tql-po-36817888.pdf", { type: "application/pdf" }),
  );
  const tqlExtract = await (await import("../lib/actions")).parseRateConAction(null, tqlForm);
  setRateConAiTestClient(null);
  assert.equal(tqlExtract.ok, true);
  if (tqlExtract.ok && "parsed" in tqlExtract) {
    assert.equal(tqlExtract.parsed.reader, "ai");
    assert.equal(tqlExtract.parsed.rate, null, "confirm-before-save: TQL rate stays empty");
    assert.match(tqlExtract.parsed.shipper.street, /9515 Plaza/i);
    assert.match(tqlExtract.parsed.consignee.city, /Midland/i);
    const loadsAfterTql = queries.listLoads().length;
    assert.equal(queries.listLoads().length, loadsAfterTql, "reading TQL must not save a load");
  }

  const cbText = fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/cb-logistics-106361.txt"), "utf8");
  const { parseStopPaperwork } = await import("../lib/rate-con-paperwork");
  const shipperPaper = parseStopPaperwork("PU# N25504 (1440 CASES)");
  assert.equal(shipperPaper.reference, "N25504");
  assert.equal(shipperPaper.confirmation, "");
  assert.equal(shipperPaper.quantity, "1440 cases");
  const kcPaper = parseStopPaperwork("CONF# 61511545 PO# 000250476 ( 960 CASES)");
  assert.equal(kcPaper.reference, "000250476");
  assert.equal(kcPaper.confirmation, "61511545");
  assert.equal(kcPaper.quantity, "960 cases");
  const norfolkPaper = parseStopPaperwork("CONF#61713982 PO# 110247187 (480 CASES)");
  assert.equal(norfolkPaper.reference, "110247187");
  assert.equal(norfolkPaper.confirmation, "61713982");
  const cbHint = parseRateConText(cbText, [], "cb-logistics-106361.txt");
  assert.equal(cbHint.customer_name, "CB Logistics Group");
  assert.equal(cbHint.contact_name, "");
  assert.equal(cbHint.contact_phone, "314-459-1752");
  assert.match(cbHint.origin, /Mascoutah/i);
  assert.doesNotMatch(cbHint.origin, /Imperial/i);
  assert.equal(cbHint.load_number_hint, "106361");
  assert.doesNotMatch(cbHint.contact_name, /Imperial|63052|106361|JoJo|MS Test|M&S|Express/i);
  assert.doesNotMatch(cbHint.contact_phone, /402-302-0097|3217709078/);
  const liveCarrierSheet = `
CB Logistics Group
2704 Adobe Drive
Imperial, MO
P: 314-459-1752
DISPATCH CONFIRMATION
Load Number 106361
Carrier: M&S LOADS LLC / HASTINGS, NE / Ph (402) 302-0097 / Attn JoJo Schwartz
CONTACT INFO
Name Phone Email Fax
JoJo Schwartz 402-302-0097 jojo@msloads.com
`;
  const { parseBrokerContactFromText: parseCbBrokerContact } = await import("../lib/rate-con-shared");
  const cbBrokerContact = parseCbBrokerContact(liveCarrierSheet);
  assert.equal(cbBrokerContact.contact_name, "");
  assert.equal(cbBrokerContact.contact_phone, "314-459-1752");
  assert.doesNotMatch(cbBrokerContact.contact_name, /Imperial|63052|106361|JoJo|MS Test/i);
  assert.doesNotMatch(cbBrokerContact.contact_phone, /402-302-0097/);
  assert.doesNotMatch(cbBrokerContact.contact_email, /jojo@msloads|msloads/i);
  const twoColumnCarrierSheet = `
CB Logistics Group M&S LOADS LLC
2704 Adobe Drive HASTINGS, NE
Imperial, MO Ph (402) 302-0097
P: 314-459-1752 Attn JoJo Schwartz
DISPATCH CONFIRMATION
Load Number 106361
`;
  const twoColumnContact = parseCbBrokerContact(twoColumnCarrierSheet);
  assert.equal(twoColumnContact.contact_name, "");
  assert.equal(twoColumnContact.contact_phone, "314-459-1752");
  assert.doesNotMatch(twoColumnContact.contact_name, /JoJo|MS Test|M&S|Express|Imperial|106361/i);
  assert.doesNotMatch(twoColumnContact.contact_phone, /402-302-0097/);
  assert.ok(twoColumnContact.contact_phone, "broker phone must not be blank");
  const titledHeaderSheet = `
RATE CONFIRMATION
CB Logistics Group
2704 Adobe Drive
Imperial, MO
P: 314-459-1752
F: 314-555-0199
CARRIER
M&S LOADS LLC
HASTINGS, NE
Ph (402) 302-0097
Fax (402) 302-0098
Attn: JoJo Schwartz
`;
  const titledHeaderContact = parseCbBrokerContact(titledHeaderSheet);
  assert.equal(titledHeaderContact.contact_name, "");
  assert.equal(titledHeaderContact.contact_phone, "314-459-1752");
  assert.doesNotMatch(titledHeaderContact.contact_name, /JoJo|RATE CONFIRMATION|MS Test|Imperial|106361/i);
  assert.doesNotMatch(titledHeaderContact.contact_phone, /402-302-0097|314-555-0199/);
  assert.ok(titledHeaderContact.contact_phone);
  const { brokerContactPersonName } = await import("../lib/rate-con-shared");
  assert.equal(brokerContactPersonName("Imperial, MO 63052 106361"), "");
  assert.equal(brokerContactPersonName("2704 Adobe Drive"), "");
  assert.equal(brokerContactPersonName("CB Logistics Group"), "");
  assert.equal(brokerContactPersonName("106361"), "");
  assert.equal(brokerContactPersonName("Riley Booker"), "Riley Booker");
  assert.equal(brokerContactPersonName("Ph"), "");
  const gluedHeaderName = parseCbBrokerContact(`
Imperial, MO 63052 106361
P: 314-459-1752
`);
  assert.equal(gluedHeaderName.contact_name, "");
  assert.equal(gluedHeaderName.contact_phone, "314-459-1752");
  const { extractDocumentText: extractCbLiveText } = await import("../lib/rate-con");
  const {
    mergeBrokerContact,
    rateConApplyContactFields,
    isOwnPaperworkName: ownPaperworkName,
  } = await import("../lib/rate-con-shared");
  const leftoverPersonAfterBareAttn = (text: string) => {
    const lines = String(text ?? "").split(/\n/);
    const attnAt = lines.findIndex((line) => /^\s*attn\s*:?\s*$/i.test(line));
    if (attnAt < 0) return "";
    for (const line of lines.slice(attnAt + 1, attnAt + 16)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^(carrier|attn|driver|cell|truck|trailer|reference|ph|fax|mcid|dispatch)\b/i.test(trimmed)) continue;
      if (/\d{3}|llc|inc|group|loads|logistics|hastings/i.test(trimmed)) continue;
      if (/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)+$/.test(trimmed)) return trimmed;
    }
    return "";
  };
  const officeUnpdfHeader = `LOAD NUMBERCB Logistics Group
2704 Adobe Drive
Imperial, MO 63052 106361
MC: 1326420 P: 314-459-1752 F: 9/2/2026
Carrier:
Attn:
(402) 302-0097Ph/Fax: Truck: 42
Driver: Chris
Reference: Cell: 3217709078
Trailer: MS1519
M&S LOADS LLC
HASTINGS, NE
JoJo Schwartz
DISPATCH CONFIRMATION
`;
  const officeHeaderParsed = parseRateConText(officeUnpdfHeader, [], "DispatchConfirmation106361-09-02-2026-1-.pdf");
  assert.equal(officeHeaderParsed.contact_name, "");
  assert.equal(officeHeaderParsed.customer_name, "CB Logistics Group");
  assert.equal(officeHeaderParsed.contact_phone, "314-459-1752");
  assert.equal(officeHeaderParsed.load_number_hint, "106361");
  assert.equal((await import("../lib/rate-con-shared")).customerRefFromRateCon(officeHeaderParsed), "106361");
  assert.doesNotMatch(officeHeaderParsed.contact_name, /Imperial|63052|106361|JoJo|MS Test|M&S|Express/i);
  const officeLeftover = leftoverPersonAfterBareAttn(officeUnpdfHeader);
  assert.ok(officeLeftover, "office unpdf header must keep a leftover person after bare Attn:");
  assert.equal(ownPaperworkName(officeLeftover, officeUnpdfHeader), true);
  const livePdfCandidates = ["/workspace/mse1065/broker-ratecon.pdf"];
  let livePdfPath = livePdfCandidates.find((candidate) => fs.existsSync(candidate));
  if (!livePdfPath) {
    const { writeCb106361Pdf } = await import("./build-cb-106361-pdf");
    livePdfPath = await writeCb106361Pdf();
  }
  const livePdfBytes = fs.readFileSync(livePdfPath);
  const liveExtract = await extractCbLiveText(livePdfBytes, "application/pdf", path.basename(livePdfPath));
  assert.match(liveExtract, /CB Logistics Group/i);
  assert.match(liveExtract, /314-459-1752/);
  assert.match(liveExtract, /JoJo Schwartz/);
  assert.match(liveExtract, /Attn/i);
  const bareAttn = liveExtract.split(/\n/).some((line) => /^\s*attn\s*:?\s*$/i.test(line));
  assert.equal(bareAttn, true, "live unpdf extract is a bare Attn: line, not pdftotext Attn: Name");
  const leftoverNearAttn = leftoverPersonAfterBareAttn(liveExtract);
  assert.ok(leftoverNearAttn, "bare Attn: must have a nearby leftover person line");
  const liveParsed = parseRateConText(liveExtract, [], path.basename(livePdfPath));
  assert.equal(liveParsed.customer_name, "CB Logistics Group");
  assert.equal(liveParsed.contact_name, "");
  assert.equal(liveParsed.contact_phone, "314-459-1752");
  assert.equal(liveParsed.load_number_hint, "106361");
  assert.equal((await import("../lib/rate-con-shared")).customerRefFromRateCon(liveParsed), "106361");
  assert.match(liveParsed.origin, /Mascoutah/i);
  assert.doesNotMatch(liveParsed.origin, /Imperial/i);
  assert.doesNotMatch(liveParsed.contact_name, /JoJo|Chris|Imperial|106361|M&S|Express/i);
  assert.doesNotMatch(liveParsed.contact_phone, /402-302-0097|3217709078/);
  assert.doesNotMatch(liveParsed.customer_name, /M&S|MS Express|Loads LLC/i);
  assert.equal(ownPaperworkName(leftoverNearAttn, liveExtract), true);
  assert.equal(ownPaperworkName("JoJo Schwartz", liveExtract), true);
  assert.equal(ownPaperworkName("JoJo", liveExtract), true);
  assert.equal(ownPaperworkName("Riley Booker", liveExtract), false);
  const mixedKeepPhone = applyAiRateCon(
    parseRateConAiJson(`{
      "customer_name": "CB Logistics Group",
      "contact_name": "JoJo Schwartz",
      "contact_phone": "314-459-1752",
      "load_number": "106361",
      "stops": [
        {
          "kind": "pickup",
          "name": "North Bay Produce - Mascoutah",
          "city": "Mascoutah",
          "state": "IL"
        }
      ]
    }`),
    [],
    liveParsed,
    liveExtract,
  );
  assert.equal(mixedKeepPhone.contact_name, "");
  assert.equal(mixedKeepPhone.contact_phone, "314-459-1752");
  assert.equal(mixedKeepPhone.customer_name, "CB Logistics Group");
  assert.match(mixedKeepPhone.origin, /Mascoutah/i);
  const mashedAttn = mergeBrokerContact(
    { contact_name: "JoJo Schwartz", contact_phone: "314-459-1752" },
    parseCbBrokerContact(liveExtract),
    liveExtract,
  );
  assert.equal(mashedAttn.contact_name, "");
  assert.equal(mashedAttn.contact_phone, "314-459-1752");
  const overwriteJoJo = rateConApplyContactFields(liveParsed, {
    contact_name: "JoJo Schwartz",
    contact_phone: "402-302-0097",
  });
  assert.equal(overwriteJoJo.contact_name, "");
  assert.equal(overwriteJoJo.contact_phone, "314-459-1752");
  assert.match(cbHint.shipper.name, /North Bay/i);
  assert.match(cbHint.shipper.street, /8835 Richard Brauer/i);
  assert.equal(cbHint.shipper.reference, "N25504");
  assert.equal(cbHint.shipper.confirmation, "");
  assert.match(cbHint.shipper.notes, /FOOD GRADE TRAILER REQUIRED/i);
  assert.match(cbHint.shipper.notes, /DETENTION IS NOT PAID HERE/i);
  assert.match(cbHint.shipper.notes, /\$100 fine/i);
  assert.match(cbHint.shipper.notes, /PU# N25504 \(1440 CASES\)/);
  assert.equal(cbHint.consignee.reference, "000250476");
  assert.equal(cbHint.consignee.confirmation, "61511545");
  assert.match(cbHint.consignee.notes, /AWG IS BY SET APPT/);
  assert.match(cbHint.consignee.notes, /CONF# 61511545 PO# 000250476/);
  assert.equal(cbHint.consignee.schedule_type, "appointment");
  const cbNorfolk = cbHint.extra_stops.find((item) => /Norfolk/i.test(item.stop.city) || /Norfolk/i.test(item.stop.name));
  assert.ok(cbNorfolk, "third stop Norfolk must persist");
  assert.equal(cbNorfolk?.stop.reference, "110247187");
  assert.equal(cbNorfolk?.stop.confirmation, "61713982");
  assert.match(cbHint.special_instructions, /MUST PULP PRODUCT-TAKE TEMP WHEN LOADING/);
  assert.match(cbHint.special_instructions, /MUST CHECK IN WITH ALL PU#s/);
  assert.match(cbHint.special_instructions, /GATE FEES AND LUMPER FEES AND SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  assert.match(cbHint.special_instructions, /after-hours tracking/);
  assert.match(cbHint.special_instructions, /air chute/);
  assert.match(cbHint.special_instructions, /exposed insulation/);
  assert.doesNotMatch(cbHint.special_instructions, /BACK SOLICIT|REMIT TO|ATTORNEY FEES|FINES SCHEDULE/i);
  assert.equal(cbHint.reefer_setpoint_f, 34);
  assert.equal(cbHint.reefer_mode, "continuous");
  const mixedAi = applyAiRateCon(
    parseRateConAiJson(`{
      "customer_name": "CB Logistics Group",
      "customer_confidence": "high",
      "rate": 2625,
      "rate_confidence": "high",
      "commodity": "Fresh Foods BERRIES",
      "weight": 12000,
      "load_number": "106361",
      "equipment": "reefer",
      "reefer_mode": "continuous",
      "contact_name": "JoJo Schwartz",
      "contact_phone": "402-302-0097",
      "special_instructions": "MUST PULP PRODUCT-TAKE TEMP WHEN LOADING!!!!....MUST CHECK IN",
      "stops": [
        {
          "kind": "pickup",
          "name": "North Bay Produce - Mascoutah",
          "street": "8835 Richard Brauer Road",
          "city": "Mascoutah",
          "state": "IL",
          "zip": "62258",
          "schedule_type": "appointment",
          "confirmation": "",
          "notes": ""
        },
        {
          "kind": "delivery",
          "name": "AWG - Kansas City",
          "street": "4701 Speaker Road",
          "city": "Kansas City",
          "state": "KS",
          "zip": "66106",
          "confirmation": "61511545",
          "notes": "AWG IS BY SET APPT DRIVER TO VERIFY COUNTS RECEIVED, AWG DOES NOT PAY DETENTION, CALL IF BEING DETAINED."
        },
        {
          "kind": "delivery",
          "name": "AWG - Norfolk",
          "street": "1301 W Omaha Ave",
          "city": "Norfolk",
          "state": "NE",
          "zip": "68701",
          "confirmation": "61713982",
          "notes": "AWG IS BY SET APPT DRIVER TO VERIFY COUNTS RECEIVED, AWG DOES NOT PAY DETENTION, CALL IF BEING DETAINED."
        }
      ]
    }`),
    queries.listCustomers(),
    cbHint,
    cbText,
  );
  assert.equal(mixedAi.shipper.reference, "N25504");
  assert.equal(mixedAi.consignee.reference, "000250476");
  assert.equal(mixedAi.consignee.confirmation, "61511545");
  assert.notEqual(mixedAi.consignee.reference, mixedAi.consignee.confirmation);
  assert.match(mixedAi.special_instructions, /MUST CHECK IN WITH ALL PU#s/);
  assert.match(mixedAi.special_instructions, /SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  assert.equal(mixedAi.contact_name, "");
  assert.equal(mixedAi.contact_phone, "314-459-1752");
  assert.doesNotMatch(mixedAi.contact_name, /JoJo|MS Test|Imperial|106361/i);
  assert.doesNotMatch(mixedAi.contact_phone, /402-302-0097/);
  const cbCustomerId =
    queries.listCustomers().find((row) => /CB Logistics/i.test(row.name))?.id ??
    queries.createCustomer({ name: "CB Logistics Group", billing_notes: "", contacts: [] });
  const cbLoadId = queries.createLoad({
    customer_id: cbCustomerId,
    load_number: "MSE-1065-SMOKE",
    origin: "Mascoutah, IL",
    destination: "Norfolk, NE",
    pickup_start: "2026-09-02T14:00",
    pickup_end: "2026-09-02T14:00",
    delivery_start: "2026-09-04T21:00",
    delivery_end: "2026-09-04T21:00",
    weight: 12000,
    commodity: "Fresh Foods BERRIES",
    rate: 2625,
    notes: "",
    special_instructions: mixedAi.special_instructions,
    appointment_notes: "",
    contact_name: mixedAi.contact_name,
    contact_phone: mixedAi.contact_phone,
    reference_number: "106361",
    po_number: "",
    customer_reference: "106361",
    reefer_setpoint_f: mixedAi.reefer_setpoint_f,
    reefer_mode: mixedAi.reefer_mode,
    equipment: "reefer_53",
    trailer_number: "MS1519",
    status: "at_pickup",
    truck_id: null,
    driver_id: null,
  });
  const cbStopForm = new FormData();
  cbStopForm.set("pickup_stop_name", mixedAi.shipper.name);
  cbStopForm.set("pickup_stop_street", mixedAi.shipper.street);
  cbStopForm.set("pickup_stop_city", mixedAi.shipper.city);
  cbStopForm.set("pickup_stop_state", mixedAi.shipper.state);
  cbStopForm.set("pickup_stop_zip", mixedAi.shipper.zip);
  cbStopForm.set("pickup_stop_schedule_type", mixedAi.shipper.schedule_type);
  cbStopForm.set("pickup_stop_confirmation", mixedAi.shipper.confirmation);
  cbStopForm.set("pickup_stop_reference", mixedAi.shipper.reference);
  cbStopForm.set("pickup_stop_quantity", mixedAi.shipper.quantity);
  cbStopForm.set("pickup_stop_notes", mixedAi.shipper.notes);
  cbStopForm.set("delivery_stop_name", mixedAi.consignee.name);
  cbStopForm.set("delivery_stop_street", mixedAi.consignee.street);
  cbStopForm.set("delivery_stop_city", mixedAi.consignee.city);
  cbStopForm.set("delivery_stop_state", mixedAi.consignee.state);
  cbStopForm.set("delivery_stop_zip", mixedAi.consignee.zip);
  cbStopForm.set("delivery_stop_schedule_type", mixedAi.consignee.schedule_type);
  cbStopForm.set("delivery_stop_confirmation", mixedAi.consignee.confirmation);
  cbStopForm.set("delivery_stop_reference", mixedAi.consignee.reference);
  cbStopForm.set("delivery_stop_quantity", mixedAi.consignee.quantity);
  cbStopForm.set("delivery_stop_notes", mixedAi.consignee.notes);
  cbStopForm.set("extra_stops_json", JSON.stringify(mixedAi.extra_stops));
  const { applyRateConStopsToLoad: applyCbStops } = await import("../lib/rate-con-stops");
  applyCbStops(cbLoadId, cbStopForm);
  assert.equal(queries.getLoad(cbLoadId)!.contact_name, "");
  assert.equal(queries.getLoad(cbLoadId)!.contact_phone, "314-459-1752");
  const { parseLoadInput: parseCbReapplyInput } = await import("../lib/load-input");
  const createFromRateCon = new FormData();
  createFromRateCon.set("customer_id", String(cbCustomerId));
  createFromRateCon.set("origin", liveParsed.origin || "Mascoutah, IL");
  createFromRateCon.set("destination", "Norfolk, NE");
  createFromRateCon.set("contact_name", leftoverNearAttn || "JoJo Schwartz");
  createFromRateCon.set("contact_phone", "314-459-1752");
  const createDraft = parseCbReapplyInput(createFromRateCon);
  const createMapped = rateConApplyContactFields(liveParsed, createDraft);
  assert.equal(createMapped.contact_name, "");
  assert.equal(createMapped.contact_phone, "314-459-1752");
  const createdFromRateConId = queries.createLoad({
    ...createDraft,
    ...createMapped,
    load_number: "MSE-1065-CREATE",
    pickup_start: "2026-09-02T14:00",
    pickup_end: "2026-09-02T14:00",
    delivery_start: "2026-09-04T21:00",
    delivery_end: "2026-09-04T21:00",
    status: "at_pickup",
    truck_id: null,
    driver_id: null,
  });
  assert.equal(queries.getLoad(createdFromRateConId)!.contact_name, "");
  assert.doesNotMatch(queries.getLoad(createdFromRateConId)!.contact_name, /JoJo/);
  assert.match(queries.getCustomer(cbCustomerId)?.name ?? "", /CB Logistics/i);
  assert.equal(queries.getLoad(cbLoadId)!.customer_reference, "106361");
  const blankReapplyId = queries.createLoad({
    customer_id: cbCustomerId,
    load_number: "MSE-1065-REAPPLY",
    origin: "Mascoutah, IL",
    destination: "Norfolk, NE",
    pickup_start: "2026-09-02T14:00",
    pickup_end: "2026-09-02T14:00",
    delivery_start: "2026-09-04T21:00",
    delivery_end: "2026-09-04T21:00",
    weight: 12000,
    commodity: "Fresh Foods BERRIES",
    rate: 2625,
    notes: "",
    special_instructions: "MUST PULP PRODUCT-TAKE TEMP WHEN LOADING!!!!....MUST CHECK IN",
    appointment_notes: "",
    contact_name: "",
    contact_phone: "",
    reference_number: "106361",
    po_number: "",
    customer_reference: "106361",
    reefer_setpoint_f: 34,
    reefer_mode: "continuous",
    equipment: "reefer_53",
    trailer_number: "MS1519",
    status: "at_pickup",
    truck_id: null,
    driver_id: null,
  });
  assert.equal(queries.getLoad(blankReapplyId)!.contact_name, "");
  assert.equal(queries.getLoad(blankReapplyId)!.contact_phone, "");
  const blankExisting = queries.getLoad(blankReapplyId)!;
  const reapplyForm = new FormData();
  reapplyForm.set("customer_id", String(cbCustomerId));
  reapplyForm.set("origin", blankExisting.origin);
  reapplyForm.set("destination", blankExisting.destination);
  reapplyForm.set("contact_name", cbHint.contact_name);
  reapplyForm.set("contact_phone", cbHint.contact_phone);
  queries.updateLoad(blankReapplyId, parseCbReapplyInput(reapplyForm, true, blankExisting));
  assert.equal(queries.getLoad(blankReapplyId)!.contact_name, "");
  assert.equal(queries.getLoad(blankReapplyId)!.contact_phone, "314-459-1752");
  assert.equal(queries.getLoad(blankReapplyId)!.customer_reference, "106361");
  assert.doesNotMatch(queries.getLoad(blankReapplyId)!.contact_name, /Imperial|63052|106361|JoJo|MS Test/i);
  assert.doesNotMatch(queries.getLoad(blankReapplyId)!.contact_phone, /402-302-0097/);
  const storedJoJoId = queries.createLoad({
    customer_id: cbCustomerId,
    load_number: "MSE-1065-JOJO",
    origin: "Imperial, MO",
    destination: "Norfolk, NE",
    pickup_start: "2026-09-02T14:00",
    pickup_end: "2026-09-02T14:00",
    delivery_start: "2026-09-04T21:00",
    delivery_end: "2026-09-04T21:00",
    weight: 12000,
    commodity: "Fresh Foods BERRIES",
    rate: 2625,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    contact_name: "JoJo Schwartz",
    contact_phone: "402-302-0097",
    reference_number: "106361",
    po_number: "",
    customer_reference: "106361",
    reefer_setpoint_f: 34,
    reefer_mode: "continuous",
    equipment: "reefer_53",
    trailer_number: "MS1519",
    status: "at_pickup",
    truck_id: null,
    driver_id: null,
  });
  assert.equal(queries.getLoad(storedJoJoId)!.contact_name, "JoJo Schwartz");
  const storedJoJo = queries.getLoad(storedJoJoId)!;
  const jojoForm = new FormData();
  jojoForm.set("customer_id", String(cbCustomerId));
  jojoForm.set("origin", liveParsed.origin || storedJoJo.origin);
  jojoForm.set("destination", storedJoJo.destination);
  const appliedContact = rateConApplyContactFields(liveParsed, storedJoJo);
  jojoForm.set("contact_name", appliedContact.contact_name);
  jojoForm.set("contact_phone", appliedContact.contact_phone);
  queries.updateLoad(storedJoJoId, parseCbReapplyInput(jojoForm, true, storedJoJo));
  assert.equal(queries.getLoad(storedJoJoId)!.contact_name, "");
  assert.equal(queries.getLoad(storedJoJoId)!.contact_phone, "314-459-1752");
  assert.doesNotMatch(queries.getLoad(storedJoJoId)!.contact_name, /JoJo/);
  assert.doesNotMatch(queries.getLoad(storedJoJoId)!.contact_phone, /402-302-0097/);
  const confirmationLib = await import("../lib/load-confirmation");
  const cbDriver = confirmationLib.buildConfirmationForLoad(cbLoadId, { packet: "internal" });
  assert.equal(cbDriver.loadNumber, "MSE-1065-SMOKE");
  assert.equal(cbDriver.customerReference, "");
  assert.equal(cbDriver.reeferSetpoint, "34°F");
  assert.match(cbDriver.reeferMode, /Continuous/i);
  const cbShipper = cbDriver.stops.find((stop) => /North Bay/i.test(stop.name));
  const cbKc = cbDriver.stops.find((stop) => /Kansas City/i.test(`${stop.name} ${stop.address}`));
  const cbNf = cbDriver.stops.find((stop) => /Norfolk/i.test(`${stop.name} ${stop.address}`));
  assert.equal(cbShipper?.poNumber, "");
  assert.equal(cbShipper?.puNumber, "N25504");
  assert.equal(cbShipper?.confirmationNumber, "");
  assert.match(cbShipper?.quantity ?? "", /1440/);
  assert.match(cbShipper?.extra ?? "", /FOOD GRADE TRAILER REQUIRED/i);
  assert.match(cbShipper?.extra ?? "", /LOAD LOCKS ARE REQUIRED/i);
  assert.equal(cbKc?.poNumber, "000250476");
  assert.equal(cbKc?.confirmationNumber, "61511545");
  assert.match(cbKc?.quantity ?? "", /960/);
  assert.equal(cbKc?.appointment, "Yes");
  assert.match(cbKc?.extra ?? "", /AWG IS BY SET APPT/);
  assert.equal(cbNf?.poNumber, "110247187");
  assert.equal(cbNf?.confirmationNumber, "61713982");
  assert.match(cbNf?.quantity ?? "", /480/);
  assert.equal(cbNf?.appointment, "Yes");
  assert.match(cbDriver.dispatchNotes, /MUST CHECK IN WITH ALL PU#s/);
  assert.match(cbDriver.dispatchNotes, /SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  assert.match(cbDriver.dispatchNotes, /air chute/);
  assert.doesNotMatch(cbDriver.dispatchNotes, /106361/);
  const { extractText: extractCbPdfText } = await import("unpdf");
  const cbDriverText = String(
    (await extractCbPdfText(new Uint8Array(await confirmationLib.renderConfirmationPdf(cbDriver)), { mergePages: true }))
      .text ?? "",
  );
  const cbDriverFlat = cbDriverText.replace(/\s+/g, " ");
  assert.match(cbDriverText, /Driver Confirmation/);
  assert.doesNotMatch(cbDriverText, /Rate & Load Confirmation/);
  assert.doesNotMatch(cbDriverText, /at_pickup/);
  assert.doesNotMatch(cbDriverText, /MS Test/);
  assert.doesNotMatch(cbDriverText, /ana@msloads\.com/);
  assert.doesNotMatch(cbDriverText, /Purchase Order #: s\b|Purchase Order #:\s*s\s/);
  assert.match(cbDriverText, /N25504/);
  assert.match(cbDriverText, /000250476/);
  assert.match(cbDriverText, /110247187/);
  assert.match(cbDriverText, /61511545/);
  assert.match(cbDriverText, /61713982/);
  assert.match(cbDriverText, /Consignee 2/);
  assert.match(cbDriverText, /AWG - Norfolk|Norfolk/);
  assert.match(cbDriverText, /PU#:\s*N25504|PU #:\s*N25504/);
  assert.doesNotMatch(cbDriverText, /Quantity:\s*N25504/);
  assert.match(cbDriverText, /1440 cases/);
  assert.match(cbDriverText, /Fresh Foods BERRIES/);
  assert.equal(cbDriver.shipper.description, "Fresh Foods BERRIES");
  assert.doesNotMatch(cbDriver.shipper.description.replace(/\s+/g, ""), /BERRIESFOODGRADE/);
  assert.doesNotMatch(cbDriverText, /Page \d+on|Page 1on|of the\s+\d+\s+POD/);
  const signedDriverPdf = await confirmationLib.renderConfirmationPdf({
    ...cbDriver,
    driverName: "Ceferino",
    driverPhone: "3217709078",
    truckNumber: "42",
    trailerNumber: "MS1519",
  });
  const signedDriverText = String(
    (await extractCbPdfText(new Uint8Array(signedDriverPdf), { mergePages: true })).text ?? "",
  );
  assert.match(signedDriverText, /Ceferino/);
  assert.match(signedDriverText, /3217709078/);
  assert.match(signedDriverText, /MS1519/);
  assert.match(signedDriverText, /Truck #:[\s\S]{0,24}42|42[\s\S]{0,12}Trailer/);
  const cbCustomer = confirmationLib.buildConfirmationForLoad(cbLoadId, { packet: "customer" });
  assert.equal(cbCustomer.stops.find((stop) => /North Bay/i.test(stop.name))?.poNumber, "");
  assert.equal(cbCustomer.stops.find((stop) => /Kansas City/i.test(`${stop.name} ${stop.address}`))?.poNumber, "000250476");
  assert.equal(
    cbCustomer.stops.find((stop) => /Kansas City/i.test(`${stop.name} ${stop.address}`))?.confirmationNumber,
    "61511545",
  );
  const cbCustomerText = String(
    (await extractCbPdfText(new Uint8Array(await confirmationLib.renderConfirmationPdf(cbCustomer)), { mergePages: true }))
      .text ?? "",
  );
  assert.match(cbCustomerText, /Customer Confirmation/);
  assert.doesNotMatch(cbCustomerText, /Truck #|Trailer #|Load Status|at_pickup/);
  assert.doesNotMatch(cbCustomerText, /PO#\s*000250476|CONF#\s*61511545/);
  assert.match(cbCustomerText, /000250476/);
  assert.match(cbCustomerText, /61511545/);
  assert.match(cbCustomerText, /Consignee 2/);
  assert.match(cbCustomerText, /110247187/);
  assert.match(cbCustomerText, /61713982/);
  assert.match(cbCustomerText, /PU#:\s*N25504|PU #:\s*N25504/);
  assert.doesNotMatch(cbCustomerText, /Quantity:\s*N25504/);
  assert.match(cbCustomerText, /Fresh Foods BERRIES/);
  assert.equal(cbCustomer.shipper.description, "Fresh Foods BERRIES");
  assert.doesNotMatch(cbCustomer.shipper.description.replace(/\s+/g, ""), /BERRIESFOODGRADE/);
  assert.doesNotMatch(cbCustomerText, /Page \d+on|Page 1on|of the\s+\d+\s+POD/);
  assert.match(cbDriverFlat, /MUST CHECK IN WITH ALL PU#s/);
  assert.match(cbDriverFlat, /SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  assert.match(cbDriverFlat, /MUST CHECK IN[\s\S]*WITH ALL PU#s[\s\S]*SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  assert.match(cbDriverText, /34\s*°\s*F/);
  assert.doesNotMatch(cbDriverText, /106361/);
  assert.doesNotMatch(cbDriverText, /billing@msloads\.com/);
  assert.doesNotMatch(cbDriverText, /Email invoices, the rate confirmation/);
  assert.doesNotMatch(cbDriverText, /turn left|google maps|head north on/i);
  const { expandTruncatedDispatchNotes: expandPulpNotes } = await import("../lib/rate-con-paperwork");
  const liveTruncatedPulp = "MUST PULP PRODUCT-TAKE TEMP WHEN LOADING!!!!....MUST CHECK IN";
  assert.match(expandPulpNotes(liveTruncatedPulp), /WITH ALL PU#s/);
  assert.match(expandPulpNotes(liveTruncatedPulp), /SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  assert.doesNotMatch(expandPulpNotes(liveTruncatedPulp).trim(), /MUST CHECK IN$/);
  const {
    CUSTOMER_CONFIRMATION_TERMS: customerTermsCopy,
    DRIVER_CONFIRMATION_TERMS: driverTermsCopy,
    driverFacingTermsText,
    shouldReplaceStoredTerms,
  } = await import("../lib/document-copy");
  assert.doesNotMatch(driverFacingTermsText(customerTermsCopy), /billing@msloads\.com/);
  assert.match(driverFacingTermsText(customerTermsCopy), /Temperature-controlled loads run Continuous/);
  assert.match(driverFacingTermsText(customerTermsCopy), /claim number/);
  assert.equal(shouldReplaceStoredTerms("load_confirmation", customerTermsCopy), true);
  const mse1055Lecture =
    ": To ensure prompt payment please EMAIL your invoice, rate confirmation and proof of delivery to billing@msloads.com Equipment: Reefer, 53'. Continuous reefer. Two load locks. Seal required. Billing: billing@msloads.com";
  const mse1055DriverNotes = driverFacingTermsText(mse1055Lecture);
  assert.doesNotMatch(mse1055DriverNotes, /billing@msloads\.com/i);
  assert.doesNotMatch(mse1055DriverNotes, /EMAIL your invoice/i);
  assert.doesNotMatch(mse1055DriverNotes, /prompt payment/i);
  assert.match(mse1055DriverNotes, /Equipment:\s*Reefer/);
  assert.match(mse1055DriverNotes, /Two load locks/);
  assert.match(mse1055DriverNotes, /Seal required/);
  const { replaceStops: replaceMse1055Stops } = await import("../lib/stops");
  const mse1055ShipperLoc = queries.createLocation({
    name: "Nebraska Cold Storage Inc Sheet",
    street: "600 E 39th St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    phone: "(402) 461-4442",
    notes: "",
    role: "shipper",
    scheduling_type: "appointment",
    hours: "Mon–Fri 07:00–15:00",
    scheduling_notes: "",
  });
  const mse1055ConsigneeLoc = queries.createLocation({
    name: "ESSENTIA PROTEIN SOLUTIONS Sheet",
    street: "2043 Juniper Ave",
    city: "Harlan",
    state: "IA",
    zip: "51537",
    phone: "",
    notes: "",
    role: "consignee",
    scheduling_type: "fcfs",
    hours: "Mon–Fri 08:00–17:00",
    scheduling_notes: "FCFS",
  });
  const mse1055SheetId = queries.createLoad({
    customer_id: cbCustomerId,
    load_number: "MSE-1055-SHEET",
    origin: "Hastings, NE",
    destination: "Harlan, IA",
    pickup_start: "2026-08-27T08:00",
    pickup_end: "2026-08-27T08:00",
    delivery_start: "2026-08-28T08:00",
    delivery_end: "2026-08-28T17:00",
    weight: 41500,
    commodity: "FRESH BEEF",
    rate: 2200,
    notes: "",
    special_instructions: mse1055Lecture,
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    customer_reference: "",
    reefer_setpoint_f: 26,
    reefer_mode: "continuous",
    equipment: "reefer_53",
    trailer_number: "MS1523",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
    shipper_location_id: mse1055ShipperLoc,
    consignee_location_id: mse1055ConsigneeLoc,
  });
  replaceMse1055Stops(mse1055SheetId, [
    {
      kind: "pickup",
      name: "Nebraska Cold Storage Inc Sheet",
      street: "600 E 39th St",
      city: "Hastings",
      state: "NE",
      zip: "68901",
      phone: "(402) 461-4442",
      window_start: "2026-08-27T08:00",
      window_end: "2026-08-27T08:00",
      schedule_type: "appointment",
      location_id: mse1055ShipperLoc,
    },
    {
      kind: "delivery",
      name: "ESSENTIA PROTEIN SOLUTIONS Sheet",
      street: "2043 Juniper Ave",
      city: "Harlan",
      state: "IA",
      zip: "51537",
      window_start: "2026-08-28T08:00",
      window_end: "2026-08-28T17:00",
      schedule_type: "fcfs",
      location_id: mse1055ConsigneeLoc,
    },
  ]);
  const mse1055Driver = confirmationLib.buildConfirmationForLoad(mse1055SheetId, { packet: "internal" });
  assert.doesNotMatch(mse1055Driver.dispatchNotes, /billing@msloads\.com/i);
  assert.doesNotMatch(mse1055Driver.dispatchNotes, /EMAIL your invoice/i);
  assert.match(mse1055Driver.dispatchNotes, /Equipment:\s*Reefer|Continuous reefer|load locks/i);
  assert.match(mse1055Driver.consignee.time, /8:00\s*AM/);
  assert.match(mse1055Driver.consignee.time, /5:00\s*PM/);
  assert.equal(mse1055Driver.consignee.weight, "41500");
  const mse1055DriverPdf = await confirmationLib.renderConfirmationPdf(mse1055Driver);
  const mse1055DriverText = String(
    (await extractCbPdfText(new Uint8Array(mse1055DriverPdf), { mergePages: true })).text ?? "",
  );
  assert.doesNotMatch(mse1055DriverText, /billing@msloads\.com/i);
  assert.doesNotMatch(mse1055DriverText, /EMAIL your invoice/i);
  assert.doesNotMatch(mse1055DriverText, /prompt payment/i);
  assert.match(mse1055DriverText, /8:00\s*AM/);
  assert.match(mse1055DriverText, /5:00\s*PM/);
  assert.match(mse1055DriverText, /41500\s*lbs/);
  assert.match(mse1055DriverText, /FRESH BEEF/);
  const mse1055CustomerText = String(
    (
      await extractCbPdfText(
        new Uint8Array(
          await confirmationLib.renderConfirmationPdf(
            confirmationLib.buildConfirmationForLoad(mse1055SheetId, { packet: "customer" }),
          ),
        ),
        { mergePages: true },
      )
    ).text ?? "",
  );
  assert.match(mse1055CustomerText, /billing@msloads\.com/i);
  const truncatedPersistId = queries.createLoad({
    customer_id: cbCustomerId,
    load_number: "MSE-1065-TRUNC",
    origin: "Mascoutah, IL",
    destination: "Norfolk, NE",
    pickup_start: "2026-09-02T14:00",
    pickup_end: "2026-09-02T14:00",
    delivery_start: "2026-09-04T21:00",
    delivery_end: "2026-09-04T21:00",
    weight: 12000,
    commodity: "Fresh Foods BERRIES",
    rate: 2625,
    notes: "",
    special_instructions: liveTruncatedPulp,
    appointment_notes: "",
    reference_number: "106361",
    po_number: "",
    customer_reference: "106361",
    reefer_setpoint_f: 34,
    reefer_mode: "continuous",
    equipment: "reefer_53",
    trailer_number: "MS1519",
    status: "at_pickup",
    truck_id: null,
    driver_id: null,
  });
  assert.match(queries.getLoad(truncatedPersistId)!.special_instructions, /WITH ALL PU#s/);
  assert.match(queries.getLoad(truncatedPersistId)!.special_instructions, /SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  const { getDb: getSmokeDb } = await import("../lib/db");
  getSmokeDb()
    .prepare("UPDATE loads SET special_instructions = ? WHERE id = ?")
    .run(liveTruncatedPulp, truncatedPersistId);
  const liveReprint = confirmationLib.buildConfirmationForLoad(truncatedPersistId, { packet: "internal" });
  assert.match(liveReprint.dispatchNotes, /WITH ALL PU#s/);
  assert.match(liveReprint.dispatchNotes, /SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  const liveReprintText = String(
    (
      await extractCbPdfText(new Uint8Array(await confirmationLib.renderConfirmationPdf(liveReprint)), {
        mergePages: true,
      })
    ).text ?? "",
  ).replace(/\s+/g, " ");
  assert.match(liveReprintText, /MUST CHECK IN WITH ALL PU#s/);
  assert.match(liveReprintText, /SUBMIT RECEIPTS FOR REIMBURSEMENT/);
  assert.doesNotMatch(liveReprintText, /billing@msloads\.com/);
  const liveCustomerText = String(
    (
      await extractCbPdfText(
        new Uint8Array(
          await confirmationLib.renderConfirmationPdf(
            confirmationLib.buildConfirmationForLoad(truncatedPersistId, { packet: "customer" }),
          ),
        ),
        { mergePages: true },
      )
    ).text ?? "",
  );
  assert.match(liveCustomerText, /billing@msloads\.com/);
  const settingsForTerms = await import("../lib/settings");
  const priorDriverDefaults = settingsForTerms.getDocumentDefaults("load_confirmation");
  settingsForTerms.updateDocumentDefaults({
    ...priorDriverDefaults,
    terms_text: customerTermsCopy,
    footer_text: "Questions? Call dispatch.",
  });
  try {
    const pollutedDriverText = String(
      (
        await extractCbPdfText(new Uint8Array(await confirmationLib.renderConfirmationPdf(liveReprint)), {
          mergePages: true,
        })
      ).text ?? "",
    );
    assert.doesNotMatch(pollutedDriverText, /billing@msloads\.com/);
    assert.doesNotMatch(pollutedDriverText, /Email invoices, the rate confirmation/);
    assert.match(pollutedDriverText, /Questions\? Call dispatch/);
    assert.match(pollutedDriverText, /Continuous/);
    assert.match(pollutedDriverText, /claim number/);
  } finally {
    settingsForTerms.updateDocumentDefaults({
      ...priorDriverDefaults,
      terms_text: driverTermsCopy,
      footer_text: priorDriverDefaults.footer_text,
    });
  }
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/rate-con-ai.ts"), "utf8"), /reference \(also called po/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "lib/rate-con-ai.ts"), "utf8"),
    /confirmation is the stop PO/,
  );

  const sampleAscendPdf = path.join(process.cwd(), "public", "samples", "sample-ascend-rate-con.pdf");
  if (fs.existsSync(sampleAscendPdf)) {
    const { extractDocumentText } = await import("../lib/rate-con");
    const ascendFromFile = parseRateConText(
      await extractDocumentText(
        fs.readFileSync(sampleAscendPdf),
        "application/pdf",
        "Load_Confirmation_45090_20260823190045.pdf",
      ),
      [],
      "Load_Confirmation_45090_20260823190045.pdf",
    );
    assert.equal(ascendFromFile.weight, 42500);
    assert.notEqual(ascendFromFile.weight, 45090);
    assert.equal(ascendFromFile.rate, 3200);
    assert.equal(ascendFromFile.origin, "Avenel, NJ");
    assert.equal(ascendFromFile.destination, "Hastings, NE");
    assert.equal(ascendFromFile.shipper.name, "Lineage Logistics - Avenel");
    assert.match(ascendFromFile.shipper.street, /275 Blair/i);
    assert.equal(ascendFromFile.consignee.name, "Nebraska Cold Storage");
    assert.match(ascendFromFile.consignee.street, /600 E 39th/i);
    assert.match(ascendFromFile.commodity, /FROZEN BEEF/i);
    assert.match(ascendFromFile.special_instructions, /billing@msloads.com/i);
  }

  const samplePdf = path.join(process.cwd(), "public", "samples", "sample-rate-con.pdf");
  if (fs.existsSync(samplePdf)) {
    const { extractDocumentText } = await import("../lib/rate-con");
    const pdfText = await extractDocumentText(fs.readFileSync(samplePdf), "application/pdf", "sample-rate-con.pdf");
    const fromPdf = parseRateConText(pdfText, queries.listCustomers());
    assert.match(fromPdf.origin, /Atlanta/i);
    assert.match(fromPdf.special_instructions, /Appointment required/i);

    const { fromInputDateTime } = await import("../lib/format");
    const importedId = queries.createLoad({
      customer_id: fromPdf.customer_id ?? queries.findOrCreateCustomer(fromPdf.customer_name || "Delta Cold Storage"),
      origin: fromPdf.origin,
      destination: fromPdf.destination,
      pickup_start: fromInputDateTime(fromPdf.pickup_start),
      pickup_end: fromInputDateTime(fromPdf.pickup_end),
      delivery_start: fromInputDateTime(fromPdf.delivery_start),
      delivery_end: fromInputDateTime(fromPdf.delivery_end),
      weight: fromPdf.weight,
      commodity: fromPdf.commodity,
      rate: fromPdf.rate,
      notes: "",
      special_instructions: fromPdf.special_instructions,
      appointment_notes: fromPdf.appointment_notes,
      reference_number: fromPdf.reference_number,
      po_number: fromPdf.po_number,
      reefer_setpoint_f: fromPdf.reefer_setpoint_f,
      trailer_number: "",
      status: "available",
      truck_id: null,
      driver_id: null,
    });
    addAttachment({
      loadId: importedId,
      kind: "rate_con",
      originalName: "sample-rate-con.pdf",
      buffer: fs.readFileSync(samplePdf),
      mimeType: "application/pdf",
      uploadedBy: "dispatcher",
    });
    const imported = queries.getLoad(importedId);
    assert.ok(imported);
    assert.match(imported.special_instructions, /Lumper receipt/i);
    assert.equal(listAttachments(importedId).some((file) => file.kind === "rate_con"), true);

    const firstDriver = queries.listDrivers().find((driver) => driver.name === "Priya Shah");
    const secondDriver = queries.listDrivers().find((driver) => driver.name === "Tyrell Brooks");
    const freeTruck = queries.listAssignableTrucks().find((truck) => truck.unit_number === "101");
    assert.ok(firstDriver && secondDriver && freeTruck);
    queries.assignLoad(importedId, freeTruck.id, firstDriver.id);
    const priyaView = queries.listLoadsForDriver(firstDriver.id).find((load) => load.id === importedId);
    assert.ok(priyaView);
    assert.match(priyaView.special_instructions, /call 60 minutes out/i);
    assert.equal(priyaView.rate, 2150);

    queries.assignLoad(importedId, freeTruck.id, secondDriver.id);
    assert.equal(queries.listLoadsForDriver(firstDriver.id).some((load) => load.id === importedId), false);
    const tyrellView = queries.listLoadsForDriver(secondDriver.id).find((load) => load.id === importedId);
    assert.ok(tyrellView);
    assert.match(tyrellView.special_instructions, /Driver assist unload/i);
  }

  const denise = queries.listDrivers().find((driver) => driver.name === "Denise Ortega");
  assert.ok(denise);
  queries.authenticateDriver(denise.id, "1125");
  assert.equal(
    queries.listDriversForLogin().every((driver) => driver.active !== 0 && !String(driver.termination_date ?? "").trim()),
    true,
  );
  const noPinDriverId = queries.createDriver({
    name: "No Pin Login",
    phone: "555-0199",
    license: "XX-NONE",
    pin: "",
    truck_id: null,
    status: "available",
  });
  assert.throws(() => queries.authenticateDriver(noPinDriverId, "1234"));
  queries.updateDriver(noPinDriverId, {
    name: "No Pin Login",
    phone: "555-0199",
    license: "XX-NONE",
    pin: "4567",
    truck_id: null,
    status: "available",
  });
  queries.authenticateDriver(noPinDriverId, "4567");
  assert.throws(() => queries.authenticateDriver(noPinDriverId, "1125"));
  const deniseLoads = queries.listLoadsForDriver(denise.id);
  assert.ok(deniseLoads.some((load) => load.load_number === "MSE-1045"));
  const orbcomm = await import("../lib/integrations/orbcomm");
  const samsara = await import("../lib/integrations/samsara");
  const reeferLoad = deniseLoads.find((load) => load.load_number === "MSE-1045");
  assert.ok(reeferLoad);
  const previousSamsara = process.env.SAMSARA_API_TOKEN;
  const previousUser = process.env.ORBCOMM_USERNAME;
  const previousPass = process.env.ORBCOMM_PASSWORD;
  delete process.env.SAMSARA_API_TOKEN;
  delete process.env.ORBCOMM_USERNAME;
  delete process.env.ORBCOMM_PASSWORD;
  orbcomm.resetOrbcommCacheForTests();
  samsara.resetSamsaraCacheForTests();
  const reading = await orbcomm.getLatestReeferForLoad(reeferLoad.id);
  assert.ok(reading, "seeded reefer load should have a demo temperature");
  assert.equal(reading.source, "demo");
  assert.equal(reading.temperature_f, 48.6);
  assert.equal(reading.alarm, "HIGH TEMP");

  const mappedReefer = orbcomm.mapOrbcommReadingsToLoads({
    loads: [
      { id: reeferLoad.id, truck_id: reeferLoad.truck_id, trailer_number: "TR-7742", reefer_setpoint_f: 34 },
    ],
    trucks: [
      {
        id: reeferLoad.truck_id ?? 0,
        unit_number: "112",
        orbcomm_asset_id: "orbcomm-tr-7742",
        trailer_number: "TR-7742",
      },
    ],
    assets: [
      {
        assetId: "orbcomm-tr-7742",
        trailerId: "TR-7742",
        temperatureF: 34.2,
        setpointF: 34,
        latitude: 32.78,
        longitude: -96.8,
        address: "Dallas, TX",
        recordedAt: "2026-08-23T13:05:00Z",
      },
    ],
  });
  assert.equal(mappedReefer.length, 1);
  assert.equal(mappedReefer[0].source, "orbcomm");
  assert.equal(mappedReefer[0].temperatureF, 34.2);
  assert.equal(mappedReefer[0].latitude, 32.78);
  assert.equal(mappedReefer[0].address, "Dallas, TX");
  assert.equal(mappedReefer[0].recordedAt, "2026-08-23T13:05:00Z");

  const mappedViaTrailer = orbcomm.mapOrbcommReadingsToLoads({
    loads: [
      {
        id: reeferLoad.id,
        truck_id: null,
        trailer_id: 99,
        trailer_number: "TR-7742",
        reefer_setpoint_f: 34,
      },
    ],
    trucks: [],
    trailers: [{ id: 99, unit_number: "TR-7742", orbcomm_asset_id: "orbcomm-tr-7742" }],
    assets: [{ assetId: "orbcomm-tr-7742", temperatureF: 33.1, setpointF: 34 }],
  });
  assert.equal(mappedViaTrailer[0]?.temperatureF, 33.1, "trailer ORBCOMM asset id should map reefer");

  const locationOnly = orbcomm.mapOrbcommReadingsToLoads({
    loads: [
      { id: reeferLoad.id, truck_id: reeferLoad.truck_id, trailer_number: "TR-7742", reefer_setpoint_f: null },
    ],
    trucks: [
      {
        id: reeferLoad.truck_id ?? 0,
        unit_number: "112",
        orbcomm_asset_id: "orbcomm-tr-7742",
        trailer_number: "TR-7742",
      },
    ],
    assets: [{ assetId: "orbcomm-tr-7742", latitude: 35.1, longitude: -90.05 }],
  });
  assert.equal(locationOnly[0]?.latitude, 35.1);

  const parsedReport = orbcomm.parseOrbcommReport(
    "trailer_id,temperature_f,setpoint_f,latitude,longitude,recorded_at\nTR-7742,34.2,34,32.78,-96.8,2026-08-23T13:05:00Z\n",
  );
  assert.equal(parsedReport[0]?.trailerId, "TR-7742");
  assert.equal(parsedReport[0]?.latitude, 32.78);
  const { classifyOrbcommReeferMode } = await import("../lib/fleet-map-shared");
  assert.equal(classifyOrbcommReeferMode("Running"), "running");
  assert.equal(classifyOrbcommReeferMode("Power On"), "running");
  assert.equal(classifyOrbcommReeferMode("Continuous"), "running");
  assert.equal(classifyOrbcommReeferMode("Off"), "off");
  assert.equal(classifyOrbcommReeferMode("Power Off"), "off");
  assert.equal(classifyOrbcommReeferMode("Shutdown"), "shutdown");
  assert.equal(classifyOrbcommReeferMode("Unit Shutdown"), "shutdown");
  assert.equal(classifyOrbcommReeferMode(""), "unknown");
  assert.equal(classifyOrbcommReeferMode("defrost"), "unknown");
  const modeReport = orbcomm.parseOrbcommReport(
    "trailer_id,latitude,longitude,Operating Mode\nR-RUN,40.1,-96.1,Running\nR-OFF,40.2,-96.2,Off\nR-SD,40.3,-96.3,Shutdown\n",
  );
  assert.equal(classifyOrbcommReeferMode(modeReport.find((row) => row.trailerId === "R-RUN")?.operatingMode), "running");
  assert.equal(classifyOrbcommReeferMode(modeReport.find((row) => row.trailerId === "R-OFF")?.operatingMode), "off");
  assert.equal(classifyOrbcommReeferMode(modeReport.find((row) => row.trailerId === "R-SD")?.operatingMode), "shutdown");
  const shutdownPayload = orbcomm.normalizeOrbcommPayload({
    data: {
      assets: [{ assetName: "SD1", reeferStatus: { reeferPowerDesc: "Shutdown" } }],
    },
  });
  assert.equal(shutdownPayload[0]?.powerOn, false);
  assert.equal(classifyOrbcommReeferMode(shutdownPayload[0]?.operatingMode), "shutdown");

  const trailerLocation = await orbcomm.getTrailerLocationForLoad(reeferLoad.id);
  assert.ok(trailerLocation, "demo ORBCOMM snapshot should include trailer location");
  assert.equal(trailerLocation.source, "demo");
  assert.ok(trailerLocation.latitude != null && trailerLocation.longitude != null);

  const trailerShare = await import("../lib/trailer-share");
  const { fromOfficeDateTime, toOfficeDateTime } = await import("../lib/format");
  const shareLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const shareExpiresInput = toOfficeDateTime(shareLater.toISOString());
  assert.match(shareExpiresInput, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.ok(Math.abs(Date.parse(fromOfficeDateTime(shareExpiresInput)) - shareLater.getTime()) < 60_000);
  const orbcommShareTrailerId = queries.createTrailer({
    unit_number: "TR-SHARE-1",
    type: "reefer",
    orbcomm_asset_id: "orbcomm-tr-share-1",
  });
  assert.throws(() => trailerShare.createTrailerShareLink(orbcommShareTrailerId, ""), /date and time/);
  assert.throws(
    () => trailerShare.createTrailerShareLink(orbcommShareTrailerId, toOfficeDateTime(new Date(Date.now() - 60 * 60 * 1000).toISOString())),
    /future/,
  );
  const noOrbcommShareId = queries.createTrailer({ unit_number: "TR-SHARE-DRY", type: "dry_van" });
  assert.throws(() => trailerShare.createTrailerShareLink(noOrbcommShareId, shareExpiresInput), /Orbcomm/);
  const emptyShareTrailerId = queries.createTrailer({
    unit_number: "TR-SHARE-EMPTY",
    type: "reefer",
    orbcomm_asset_id: "orbcomm-tr-share-empty",
  });
  const emptyShare = trailerShare.createTrailerShareLink(
    emptyShareTrailerId,
    shareExpiresInput,
    new Date("2026-08-20T16:00:00.000Z"),
  );
  const emptyShareView = trailerShare.trailerShareView(emptyShare.token, new Date("2026-08-20T16:01:00.000Z"));
  assert.equal(emptyShareView.found, true);
  assert.equal(emptyShareView.expired, false);
  assert.equal(emptyShareView.temperatureF, null);
  assert.equal(emptyShareView.address, "");
  assert.equal(emptyShareView.points.length, 0);
  const gpsOnlyShareTrailerId = queries.createTrailer({
    unit_number: "TR-SHARE-GPS",
    type: "reefer",
    orbcomm_asset_id: "orbcomm-tr-share-gps",
  });
  queries.saveTrailerGps(gpsOnlyShareTrailerId, {
    latitude: 41.2,
    longitude: -73.8,
    address: "GPS only last known",
    recordedAt: "2026-08-20T14:00:00.000Z",
    source: "orbcomm",
  });
  const gpsOnlyShare = trailerShare.createTrailerShareLink(
    gpsOnlyShareTrailerId,
    shareExpiresInput,
    new Date("2026-08-20T16:00:00.000Z"),
  );
  assert.equal(gpsOnlyShare.snapshot_latitude, 41.2);
  assert.equal(gpsOnlyShare.snapshot_address, "GPS only last known");
  assert.equal(gpsOnlyShare.snapshot_temperature_f, null);
  const gpsOnlyView = trailerShare.trailerShareView(gpsOnlyShare.token, new Date("2026-08-20T16:01:00.000Z"));
  assert.equal(gpsOnlyView.temperatureF, null);
  assert.equal(gpsOnlyView.address, "GPS only last known");
  assert.equal(gpsOnlyView.points.length, 1);
  assert.equal(gpsOnlyView.points[0]?.lat, 41.2);
  assert.equal(gpsOnlyView.points[0]?.pinColor, "#64748b");
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "TR-SHARE-1",
    setpoint_f: 34,
    temperature_f: 10,
    return_air_f: null,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "Running",
    latitude: 40.7,
    longitude: -74,
    address: "Before create",
    source: "orbcomm",
    recorded_at: "2026-08-20T15:00:00.000Z",
  });
  const shareCreatedAt = new Date("2026-08-20T16:00:00.000Z");
  const firstShare = trailerShare.createTrailerShareLink(orbcommShareTrailerId, shareExpiresInput, shareCreatedAt);
  const secondShare = trailerShare.createTrailerShareLink(orbcommShareTrailerId, shareExpiresInput, shareCreatedAt);
  assert.notEqual(firstShare.token, secondShare.token);
  assert.ok(firstShare.token.length >= 24);
  assert.notEqual(firstShare.token, String(orbcommShareTrailerId));
  assert.equal(trailerShare.getTrailerShareLink("1"), null);
  assert.equal(trailerShare.getTrailerShareLink("abc"), null);
  assert.equal(firstShare.created_at, shareCreatedAt.toISOString());
  assert.equal(firstShare.snapshot_temperature_f, 10);
  assert.equal(firstShare.snapshot_address, "Before create");
  assert.equal(firstShare.snapshot_latitude, 40.7);
  const justMintedView = trailerShare.trailerShareView(firstShare.token, shareCreatedAt);
  assert.equal(justMintedView.expired, false);
  assert.equal(justMintedView.temperatureF, 10);
  assert.equal(justMintedView.address, "Before create");
  assert.equal(justMintedView.points.length, 1);
  assert.equal(justMintedView.points[0]?.lat, 40.7);
  assert.equal(justMintedView.points[0]?.pinColor, "#16a34a");
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "orbcomm-tr-share-1",
    setpoint_f: 34,
    temperature_f: 36,
    return_air_f: null,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "Running",
    latitude: 40.8,
    longitude: -74.1,
    address: "After create",
    source: "orbcomm",
    recorded_at: "2026-08-20T16:05:00.000Z",
  });
  const shareNow = new Date("2026-08-20T16:10:00.000Z");
  const shareReadings = trailerShare.listTrailerShareReadings(
    { unit_number: "TR-SHARE-1", orbcomm_asset_id: "orbcomm-tr-share-1" },
    firstShare.created_at,
    shareNow,
  );
  assert.equal(shareReadings.length, 1);
  assert.equal(shareReadings[0]?.temperature_f, 36);
  assert.equal(shareReadings.some((row) => row.address === "Before create"), false);
  const liveShareView = trailerShare.trailerShareView(firstShare.token, shareNow);
  assert.equal(liveShareView.found, true);
  assert.equal(liveShareView.expired, false);
  assert.equal(liveShareView.temperatureF, 36);
  assert.equal(liveShareView.address, "After create");
  assert.equal(liveShareView.points.length, 2);
  assert.equal(liveShareView.points[0]?.lat, 40.7);
  assert.equal(liveShareView.points[1]?.lat, 40.8);
  assert.equal(liveShareView.points[1]?.kind, "trailer");
  assert.equal(liveShareView.points[1]?.pinColor, "#16a34a");
  assert.equal(trailerShare.trailerShareIsExpired(firstShare, new Date(firstShare.expires_at)), true);
  const expiredShareView = trailerShare.trailerShareView(firstShare.token, new Date(firstShare.expires_at));
  assert.equal(expiredShareView.found, true);
  assert.equal(expiredShareView.expired, true);
  assert.equal(expiredShareView.temperatureF, null);
  assert.equal(expiredShareView.address, "");
  assert.equal(expiredShareView.points.length, 0);
  assert.doesNotMatch(
    JSON.stringify({
      temperatureF: expiredShareView.temperatureF,
      address: expiredShareView.address,
      recordedAt: expiredShareView.recordedAt,
      points: expiredShareView.points,
    }),
    /After create|40\.8|36/,
  );

  const { clusterLoadMapPoints } = await import("../lib/map-cluster");
  const clusteredPins = clusterLoadMapPoints(
    [
      { id: "a", kind: "trailer", label: "A", lat: 40.7, lng: -74 },
      { id: "b", kind: "trailer", label: "B", lat: 40.7004, lng: -74.0004 },
      { id: "c", kind: "truck", label: "C", lat: 41.5, lng: -75 },
    ],
    5,
  );
  assert.equal(clusteredPins.some((item) => item.type === "cluster" && item.count === 2), true);
  assert.equal(clusterLoadMapPoints(
    [
      { id: "a", kind: "trailer", label: "A", lat: 40.7, lng: -74 },
      { id: "b", kind: "trailer", label: "B", lat: 40.7004, lng: -74.0004 },
    ],
    14,
  ).every((item) => item.type === "point"), true);

  const loadShare = await import("../lib/load-share");
  const chat = await import("../lib/load-chat");
  const autoInvoice = await import("../lib/auto-invoice");
  const controlCenter = await import("../lib/control-center");
  const controlShared = await import("../lib/control-center-shared");
  const shareLoadCustomerId = queries.createCustomer({
    name: "Share Timeline Customer",
    billing_notes: "",
    contacts: [{ name: "AP", role: "ap", phone: "555-0199", email: "share.ap@customer.example" }],
  });
  const shareLoadId = queries.createLoad({
    customer_id: shareLoadCustomerId,
    origin: "Omaha, NE",
    destination: "Dallas, TX",
    pickup_start: "2026-08-20T12:00:00.000Z",
    pickup_end: "2026-08-20T16:00:00.000Z",
    delivery_start: "2026-08-21T12:00:00.000Z",
    delivery_end: "2026-08-21T20:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 2200,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "RC-SHARE",
    po_number: "PO-SHARE",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const bookedOnly = loadShare.loadShareMilestones(queries.getLoad(shareLoadId)!);
  assert.deepEqual(bookedOnly.map((step) => step.key), ["booked"]);
  queries.updateLoadStatus(shareLoadId, "picked_up");
  assert.deepEqual(loadShare.loadShareMilestones(queries.getLoad(shareLoadId)!).map((step) => step.key), ["booked", "pickup"]);
  queries.updateLoadStatus(shareLoadId, "in_transit");
  assert.deepEqual(
    loadShare.loadShareMilestones(queries.getLoad(shareLoadId)!).map((step) => step.key),
    ["booked", "pickup", "in_transit"],
  );
  queries.updateLoadStatus(shareLoadId, "delivered");
  assert.deepEqual(
    loadShare.loadShareMilestones(queries.getLoad(shareLoadId)!).map((step) => step.key),
    ["booked", "pickup", "in_transit", "delivered"],
  );
  const loadShareExpires = toOfficeDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString());
  const loadLink = loadShare.createLoadShareLink(shareLoadId, loadShareExpires, new Date("2026-08-20T16:00:00.000Z"));
  const liveLoadView = loadShare.loadShareView(loadLink.token, new Date("2026-08-20T16:01:00.000Z"));
  assert.equal(liveLoadView.found, true);
  assert.equal(liveLoadView.expired, false);
  assert.equal(liveLoadView.milestones.some((step) => step.key === "delivered"), true);
  assert.equal(loadShare.loadShareView(loadLink.token, new Date(loadLink.expires_at)).expired, true);
  assert.equal(loadShare.loadShareView(loadLink.token, new Date(loadLink.expires_at)).milestones.length, 0);
  chat.postLoadChatMessage({
    loadId: shareLoadId,
    authorRole: "dispatcher",
    authorId: 1,
    authorName: "Dispatch",
    body: "Call when empty",
    now: new Date("2026-08-20T16:02:00.000Z"),
  });
  chat.postLoadChatMessage({
    loadId: shareLoadId,
    authorRole: "driver",
    authorId: 2,
    authorName: "Driver",
    body: "Rolling",
    now: new Date("2026-08-20T16:03:00.000Z"),
  });
  const chatRows = chat.listLoadChatMessages(shareLoadId);
  assert.equal(chatRows.length, 2);
  assert.equal(chatRows[0]?.body, "Call when empty");
  assert.equal(chatRows[1]?.author_role, "driver");

  addAttachment({
    loadId: shareLoadId,
    kind: "pod",
    originalName: "pod-share.pdf",
    buffer: Buffer.from("%PDF-1.4 pod"),
    mimeType: "application/pdf",
    uploadedBy: "driver",
  });
  let autoInvoiceTo = "";
  const autoFirst = await autoInvoice.maybeAutoInvoiceLoad(shareLoadId, async (input) => {
    autoInvoiceTo = input.to;
  });
  assert.equal(autoFirst.created, true);
  assert.equal(autoFirst.sent, true);
  assert.equal(autoInvoiceTo, "share.ap@customer.example");
  const autoSecond = await autoInvoice.maybeAutoInvoiceLoad(shareLoadId, async () => {
    throw new Error("should not send twice");
  });
  assert.equal(autoSecond.sent, false);
  assert.equal(autoSecond.skipped, "already_sent");

  const noEmailInvoiceCustomer = queries.createCustomer({
    name: "No Email Invoice Co",
    billing_notes: "",
    contacts: [],
  });
  const noEmailInvoiceLoad = queries.createLoad({
    customer_id: noEmailInvoiceCustomer,
    origin: "Lincoln, NE",
    destination: "Kansas City, MO",
    pickup_start: "2026-08-20T12:00:00.000Z",
    pickup_end: "2026-08-20T16:00:00.000Z",
    delivery_start: "2026-08-21T12:00:00.000Z",
    delivery_end: "2026-08-21T20:00:00.000Z",
    weight: 38000,
    commodity: "Pork",
    rate: 1800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "delivered",
    truck_id: null,
    driver_id: null,
  });
  addAttachment({
    loadId: noEmailInvoiceLoad,
    kind: "pod",
    originalName: "pod-no-email.pdf",
    buffer: Buffer.from("%PDF-1.4 pod"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const noEmailAuto = await autoInvoice.maybeAutoInvoiceLoad(noEmailInvoiceLoad, async () => {
    throw new Error("do not invent an email");
  });
  assert.equal(noEmailAuto.created, true);
  assert.equal(noEmailAuto.sent, false);
  assert.equal(noEmailAuto.skipped, "no_email");
  const invoiceInbox = (await import("../lib/exceptions")).listExceptionInbox(new Date("2026-08-21T12:00:00.000Z"));
  assert.ok(invoiceInbox.items.some((item) => item.loadId === noEmailInvoiceLoad && item.kind === "invoice_send"));
  const billingVsBrokerCustomer = queries.createCustomer({
    name: "Billing Vs Broker Co",
    billing_notes: "",
    main_email: "desk@shipper.example",
    billing_email: "ap@shipper.example",
    contacts: [],
  });
  const billingVsBrokerLoad = queries.createLoad({
    customer_id: billingVsBrokerCustomer,
    origin: "Lincoln, NE",
    destination: "Kansas City, MO",
    pickup_start: "2026-08-20T12:00:00.000Z",
    pickup_end: "2026-08-20T16:00:00.000Z",
    delivery_start: "2026-08-21T12:00:00.000Z",
    delivery_end: "2026-08-21T20:00:00.000Z",
    weight: 38000,
    commodity: "Pork",
    rate: 1750,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "delivered",
    truck_id: null,
    driver_id: null,
    contact_email: "broker@packet.example",
  });
  addAttachment({
    loadId: billingVsBrokerLoad,
    kind: "pod",
    originalName: "pod-billing.pdf",
    buffer: Buffer.from("%PDF-1.4 pod"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  let billingAutoTo = "";
  const billingAuto = await autoInvoice.maybeAutoInvoiceLoad(billingVsBrokerLoad, async (input) => {
    billingAutoTo = input.to;
  });
  assert.equal(billingAuto.created, true);
  assert.equal(billingAuto.sent, true);
  assert.equal(billingAutoTo, "ap@shipper.example");
  assert.notEqual(billingAutoTo, "broker@packet.example");

  const controlOrderId = queries.createLoad({
    customer_id: shareLoadCustomerId,
    origin: "Omaha, NE",
    destination: "Chicago, IL",
    pickup_start: "2026-08-22T12:00:00.000Z",
    pickup_end: "2026-08-22T16:00:00.000Z",
    delivery_start: "2026-08-23T12:00:00.000Z",
    delivery_end: "2026-08-23T20:00:00.000Z",
    weight: 36000,
    commodity: "Beef",
    rate: 1900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const idleShareTrailer = queries.createTrailer({
    unit_number: "TR-CTRL-IDLE",
    type: "reefer",
    orbcomm_asset_id: "orbcomm-tr-ctrl-idle",
  });
  queries.saveTrailerGps(idleShareTrailer, {
    latitude: 41.25,
    longitude: -96.0,
    address: "Lincoln, NE",
    recordedAt: "2026-08-20T14:00:00.000Z",
    source: "orbcomm",
  });
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "TR-CTRL-IDLE",
    setpoint_f: 34,
    temperature_f: 34,
    return_air_f: null,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "Running",
    latitude: 41.25,
    longitude: -96.0,
    address: "Lincoln, NE",
    source: "orbcomm",
    recorded_at: "2026-08-20T14:00:00.000Z",
  });
  const center = await controlCenter.buildControlCenter();
  assert.ok(center.orders.some((item) => item.refId === controlOrderId && item.origin.includes("Omaha")));
  assert.ok(center.resources.some((item) => item.refId === idleShareTrailer && item.status === "idle"));
  const idleControl = center.resources.find((item) => item.refId === idleShareTrailer);
  assert.equal(idleControl?.pinColor, "#16a34a");
  assert.equal(controlShared.controlCenterPoints([idleControl!])[0]?.pinColor, "#16a34a");
  const neOnly = controlShared.filterControlCenterItems(center.resources, {
    state: "NE",
    equipment: "reefer",
    status: "idle",
  });
  assert.ok(neOnly.some((item) => item.refId === idleShareTrailer));
  assert.equal(
    controlShared.filterControlCenterItems(center.resources, { state: "TX", equipment: "", status: "" }).some(
      (item) => item.refId === idleShareTrailer,
    ),
    false,
  );

  const mappedGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "281474977075805",
        name: "112",
        gps: {
          time: "2026-08-23T13:05:00Z",
          latitude: 32.78,
          longitude: -96.8,
          speedMilesPerHour: 54,
          reverseGeo: { formattedLocation: "Dallas, TX" },
        },
      },
    ],
    trucks: [{ id: reeferLoad.truck_id ?? 0, unit_number: "112", samsara_vehicle_id: "281474977075805" }],
    loads: [{ id: reeferLoad.id, truck_id: reeferLoad.truck_id }],
  });
  assert.equal(mappedGps[0]?.address, "Dallas, TX");
  assert.equal(mappedGps[0]?.source, "samsara");
  assert.equal(mappedGps[0]?.engineOn, null);
  assert.equal(samsara.isLiveSamsaraGps(mappedGps[0] ?? null), true);
  assert.equal(samsara.extractSamsaraEngineOn({ engineStates: [{ value: "On" }] }), true);
  assert.equal(samsara.extractSamsaraEngineOn({ engineStates: [{ value: "Idle" }] }), true);
  assert.equal(samsara.extractSamsaraEngineOn({ engineStates: [{ value: "Off" }] }), false);
  assert.equal(samsara.extractSamsaraEngineOn({ ecuOn: true }), true);
  assert.equal(
    samsara.mapVehicleLocations({
      vehicles: [
        {
          id: "281474977075805",
          name: "112",
          gps: { time: "2026-08-23T13:05:00Z", latitude: 32.78, longitude: -96.8 },
          engineStates: [{ value: "On" }],
        },
      ],
      trucks: [{ id: reeferLoad.truck_id ?? 0, unit_number: "112", samsara_vehicle_id: "281474977075805" }],
      loads: [{ id: reeferLoad.id, truck_id: reeferLoad.truck_id }],
    })[0]?.engineOn,
    true,
  );
  const unit36Gps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "uuid-samsara-36",
        name: "Unit 36",
        gps: {
          time: "2026-08-23T13:05:00Z",
          latitude: 35.22,
          longitude: -101.83,
          reverseGeo: { formattedLocation: "Amarillo, TX" },
        },
      },
    ],
    trucks: [{ id: 36, unit_number: "36", samsara_vehicle_id: "uuid-samsara-36" }],
    loads: [{ id: 99, truck_id: 36 }],
  });
  assert.equal(unit36Gps[0]?.address, "Amarillo, TX");
  assert.equal(unit36Gps[0]?.unitNumber, "36");
  assert.equal(unit36Gps[0]?.vehicleId, "uuid-samsara-36");
  const named36Gps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "uuid-named-36",
        name: "36",
        gps: { time: "2026-08-23T13:05:00Z", latitude: 35.2, longitude: -101.8, reverseGeo: { formattedLocation: "Amarillo, TX" } },
      },
    ],
    trucks: [{ id: 36, unit_number: "36", samsara_vehicle_id: "" }],
    loads: [],
  });
  assert.equal(named36Gps[0], undefined, "live GPS does not rematch by Samsara name when no vehicle id is stored");
  const padded36Gps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "uuid-padded-36",
        name: "036",
        gps: { time: "2026-08-23T13:05:00Z", latitude: 35.2, longitude: -101.8, reverseGeo: { formattedLocation: "Amarillo, TX" } },
      },
    ],
    trucks: [{ id: 36, unit_number: "36", samsara_vehicle_id: "" }],
    loads: [],
  });
  assert.equal(padded36Gps[0], undefined, "live GPS does not rematch by padded unit name");
  assert.equal(samsara.samsaraGpsEmptyState({ truckAssigned: true, samsaraVehicleId: "", location: null }), samsara.SAMSARA_ID_MISSING_MESSAGE);
  assert.equal(
    samsara.samsaraGpsEmptyState({ truckAssigned: true, samsaraVehicleId: "36", location: null }),
    "No live GPS from Samsara for this truck.",
  );
  assert.equal(samsara.samsaraGpsEmptyState({ truckAssigned: false, samsaraVehicleId: "", location: null }), "No truck assigned.");
  const demoLoc = {
    truckId: 1,
    loadId: 1,
    vehicleId: "x",
    unitNumber: "112",
    latitude: 32.7,
    longitude: -96.8,
    speedMph: 0,
    address: "Dallas, TX",
    recordedAt: "2026-08-23T13:05:00Z",
    source: "demo" as const,
  };
  assert.equal(samsara.isLiveSamsaraGps(demoLoc), false, "demo coordinates must not count as live GPS");

  const mappedHos = samsara.mapHosClocks({
    clocks: [
      {
        driver: { id: "88668", name: "Denise Ortega" },
        currentDutyStatus: { hosStatusType: "driving" },
        clocks: { drive: { driveRemainingDurationMs: 22320000 } },
      },
    ],
    drivers: [{ id: denise.id, name: "Denise Ortega", samsara_driver_id: "88668" }],
    loads: [{ id: reeferLoad.id, driver_id: denise.id }],
  });
  assert.equal(mappedHos[0]?.driveRemainingMs, 22320000);
  assert.equal(samsara.formatDurationMs(22320000), "6h 12m");

  const trailers = queries.listTrailers();
  assert.ok(trailers.some((trailer) => trailer.unit_number === "TR-7742"));
  assert.equal(denise.driver_type, "company_driver");
  const cole = queries.listDrivers().find((driver) => driver.name === "Cole Brennan");
  assert.ok(cole);
  assert.equal(cole.driver_type, "owner_operator");
  assert.equal(cole.company_name, "Brennan Trucking");
  assert.equal(cole.pay_percent, 75);
  const { computeOwnerOperatorPay } = await import("../lib/settlement");
  assert.equal(computeOwnerOperatorPay(2000, 75), 1500);
  assert.equal(computeOwnerOperatorPay(2975, 75), 2231.25);
  const coleLoad = queries.listLoads({ status: "all" }).find((load) => load.driver_id === cole.id);
  assert.ok(coleLoad);
  assert.ok(coleLoad.truck_id);
  queries.assignLoad(coleLoad.id, coleLoad.truck_id, cole.id, coleLoad.trailer_id);
  const coleAssigned = queries.getLoad(coleLoad.id);
  assert.equal(coleAssigned?.oo_percent, 75);
  assert.equal(coleAssigned?.oo_pay, computeOwnerOperatorPay(coleAssigned?.rate, 75));
  const companyDriver = queries
    .listAssignableDrivers(coleLoad.id)
    .find((driver) => driver.driver_type === "company_driver");
  assert.ok(companyDriver);
  queries.assignLoad(coleLoad.id, coleLoad.truck_id, companyDriver.id, coleLoad.trailer_id);
  const afterCompany = queries.getLoad(coleLoad.id);
  assert.equal(afterCompany?.oo_percent, null);
  assert.equal(afterCompany?.oo_pay, null);
  queries.assignLoad(coleLoad.id, coleLoad.truck_id, cole.id, coleLoad.trailer_id);
  assert.equal(computeOwnerOperatorPay(1000, 85), 850);
  const kelvinTruckId = queries.createTruck({
    unit_number: "KELVIN-OO",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const kelvinId = queries.createDriver({
    name: "Kelvin OO Pay",
    phone: "555-0085",
    license: "TN-CDL-KELVIN-OO",
    pin: "8585",
    truck_id: kelvinTruckId,
    status: "available",
    driver_type: "owner_operator",
    pay_percent: 85,
  });
  assert.equal(queries.getDriver(kelvinId)?.pay_percent, 85);
  const kelvinLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Kansas City, MO",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Beef",
    rate: 1000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  queries.assignLoad(kelvinLoadId, kelvinTruckId, kelvinId);
  const kelvinAssigned = queries.getLoad(kelvinLoadId);
  assert.equal(kelvinAssigned?.oo_percent, 85);
  assert.equal(kelvinAssigned?.oo_pay, 850);
  addPayItem(kelvinLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Kelvin Customer",
    category: "detention",
    rate: 200,
    qty: 1,
    total: 200,
    notes: "",
  });
  addPayItem(kelvinLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Kelvin Customer",
    category: "layover",
    rate: 50,
    qty: 1,
    total: 50,
    notes: "",
  });
  const kelvinAfterAccessories = queries.getLoad(kelvinLoadId);
  assert.equal(kelvinAfterAccessories?.rate, 1000, "accessories must not change the flat customer rate");
  assert.equal(kelvinAfterAccessories?.oo_pay, 850, "OO pay is flat rate × percent only");
  addPayItem(kelvinLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Kelvin Customer",
    category: "flat_rate",
    rate: 1000,
    qty: 1,
    total: 1000,
    notes: "",
  });
  const { impliedOwnerOperatorPercent, resolveOwnerOperatorSettlement } = await import("../lib/settlement");
  assert.equal(impliedOwnerOperatorPercent(800, 1000), 80);
  const typedDollars = resolveOwnerOperatorSettlement({
    rate: 1000,
    percent: 85,
    driverPercent: 85,
    submittedPay: 800,
    existingPay: 850,
    existingRate: 1000,
    existingPercent: 85,
    existingDriverId: kelvinId,
    driverId: kelvinId,
  });
  assert.equal(typedDollars.oo_pay, 800);
  assert.equal(typedDollars.oo_percent, 80);
  const typedPercent = resolveOwnerOperatorSettlement({
    rate: 1000,
    percent: 80,
    driverPercent: 85,
    existingPay: 850,
    existingRate: 1000,
    existingPercent: 85,
    existingDriverId: kelvinId,
    driverId: kelvinId,
  });
  assert.equal(typedPercent.oo_pay, 800);
  assert.equal(typedPercent.oo_percent, 80);
  const handTyped = new FormData();
  handTyped.set("oo_pay", "800");
  const keptHand = parseLoadInput(handTyped, true, queries.getLoad(kelvinLoadId)!);
  assert.equal(keptHand.oo_pay, 800);
  assert.equal(keptHand.oo_percent, 80);
  const rateChange = new FormData();
  rateChange.set("rate", "2000");
  const recaled = parseLoadInput(rateChange, true, {
    ...queries.getLoad(kelvinLoadId)!,
    oo_pay: 800,
    oo_percent: 80,
  });
  assert.equal(recaled.oo_pay, 1600);
  assert.equal(recaled.oo_percent, 80);
  queries.updateLoad(kelvinLoadId, recaled);
  queries.assignLoad(kelvinLoadId, kelvinTruckId, kelvinId);
  const kelvinKept = queries.getLoad(kelvinLoadId);
  assert.equal(kelvinKept?.oo_pay, 1600, "re-assigning the same OO must not snap back to 85%");
  assert.equal(kelvinKept?.oo_percent, 80);
  const reopen = parseLoadInput(new FormData(), true, kelvinKept!);
  assert.equal(reopen.oo_pay, 1600);
  assert.equal(reopen.oo_percent, 80);
  queries.updateLoadStatus(kelvinLoadId, "delivered");
  const kelvinInvoice = (await import("../lib/invoice")).buildTmsInvoice(queries.getLoad(kelvinLoadId)!);
  assert.equal(kelvinInvoice.lines.some((line) => /owner-operator|oo pay|relay/i.test(line.name)), false);
  assert.ok(kelvinInvoice.lines.some((line) => line.name === "Flat Rate" && line.amount === 1000));
  assert.ok(kelvinInvoice.lines.some((line) => line.name === "Detention" && line.amount === 200));
  assert.equal(kelvinInvoice.lines.some((line) => line.amount === 1600 || line.amount === 850), false);
  const tyrell = queries.listDrivers().find((driver) => driver.name === "Tyrell Brooks");
  assert.ok(tyrell);
  const { collectAssignmentAlerts, requireAssignmentOverride, trailerComplianceAlerts, truckComplianceAlerts } =
    await import("../lib/compliance");
  assert.equal(denise.license_state, "TN");
  assert.equal(denise.license_number, "772110");
  assert.ok(denise.license_expires);
  assert.ok(denise.medical_expires);
  const tyrellAlerts = collectAssignmentAlerts({ driver: tyrell });
  const tyrellMedical = tyrellAlerts.find((alert) => alert.kind === "medical" && alert.severity === "expired");
  assert.ok(tyrellMedical);
  assert.match(tyrellMedical.message, /Tyrell Brooks/);
  assert.match(tyrellMedical.message, /medical card/);
  const deniseAlerts = collectAssignmentAlerts({ driver: denise });
  const deniseLicense = deniseAlerts.find((alert) => alert.kind === "license" && alert.severity === "expiring");
  assert.ok(deniseLicense);
  assert.match(deniseLicense.message, /Denise Ortega/);
  assert.match(deniseLicense.message, /driver license/);
  assert.throws(() => requireAssignmentOverride(tyrellAlerts, false), /Expired documents/);
  requireAssignmentOverride(tyrellAlerts, true);
  const workflow = await import("../lib/workflow");
  const { DEFAULT_WORKFLOW_SETTINGS } = await import("../lib/workflow-shared");
  assert.throws(
    () =>
      workflow.requireAssignmentHardBlock(
        { driver: tyrell },
        { ...DEFAULT_WORKFLOW_SETTINGS, blockAssignExpiredDriver: true },
      ),
    /Cannot assign/,
  );
  workflow.requireAssignmentHardBlock({ driver: tyrell }, DEFAULT_WORKFLOW_SETTINGS);
  const settingsStore = await import("../lib/settings");
  const previousWorkflow = settingsStore.getWorkflowSettings();
  const { addStop } = await import("../lib/stops");
  const workflowLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Chicago, IL",
    pickup_start: "2026-08-20T08:00:00.000Z",
    pickup_end: "2026-08-20T12:00:00.000Z",
    delivery_start: "2026-08-21T08:00:00.000Z",
    delivery_end: "2026-08-21T16:00:00.000Z",
    weight: 40000,
    commodity: "Workflow fire",
    rate: 900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  addStop(workflowLoadId, {
    kind: "pickup",
    name: "Shipper",
    city: "Hastings",
    state: "NE",
    window_start: "2026-08-20T08:00:00.000Z",
    window_end: "2026-08-20T12:00:00.000Z",
  });
  addStop(workflowLoadId, {
    kind: "delivery",
    name: "Receiver",
    city: "Chicago",
    state: "IL",
    window_start: "2026-08-21T08:00:00.000Z",
    window_end: "2026-08-21T16:00:00.000Z",
  });
  const workflowStops = (await import("../lib/stops")).listStops(workflowLoadId);
  const workflowPickup = workflowStops.find((stop) => stop.kind === "pickup");
  const workflowDelivery = workflowStops.find((stop) => stop.kind === "delivery");
  assert.ok(workflowPickup && workflowDelivery);
  stampStopTime(workflowPickup.id, "arrived_at", "2026-08-20T09:00:00.000Z");
  workflow.applyWorkflowAfterGeofence(workflowLoadId);
  assert.equal(queries.getLoad(workflowLoadId)?.status, "at_pickup");
  stampStopTime(workflowPickup.id, "departed_at", "2026-08-20T11:00:00.000Z");
  workflow.applyWorkflowAfterGeofence(workflowLoadId);
  assert.equal(queries.getLoad(workflowLoadId)?.status, "in_transit");
  stampStopTime(workflowDelivery.id, "arrived_at", "2026-08-21T10:00:00.000Z");
  workflow.applyWorkflowAfterGeofence(workflowLoadId);
  assert.equal(queries.getLoad(workflowLoadId)?.status, "at_delivery");
  settingsStore.updateWorkflowSettings({
    ...previousWorkflow,
    driverAssignLoadStatus: "assigned",
    driverAssignTruckStatus: "dispatched",
  });
  const driverAssignLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Lincoln, NE",
    destination: "Omaha, NE",
    pickup_start: "2026-08-22T08:00:00.000Z",
    pickup_end: "2026-08-22T12:00:00.000Z",
    delivery_start: "2026-08-22T14:00:00.000Z",
    delivery_end: "2026-08-22T18:00:00.000Z",
    weight: 10000,
    commodity: "Driver assign fire",
    rate: 400,
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
  });
  workflow.applyWorkflowOnDriverAssign(driverAssignLoadId);
  const afterDriverAssign = queries.getLoad(driverAssignLoadId);
  assert.equal(afterDriverAssign?.status, "assigned");
  assert.equal(afterDriverAssign?.truck_status, "dispatched");
  const lateLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "York, NE",
    destination: "Grand Island, NE",
    pickup_start: "2026-08-20T08:00:00.000Z",
    pickup_end: "2026-08-20T10:00:00.000Z",
    delivery_start: "2026-08-21T08:00:00.000Z",
    delivery_end: "2026-08-21T12:00:00.000Z",
    weight: 8000,
    commodity: "Late fire",
    rate: 300,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "loading",
    truck_id: null,
    driver_id: null,
  });
  addStop(lateLoadId, {
    kind: "pickup",
    name: "Late shipper",
    city: "York",
    state: "NE",
    window_start: "2026-08-20T08:00:00.000Z",
    window_end: "2026-08-20T10:00:00.000Z",
  });
  settingsStore.updateWorkflowSettings({
    ...previousWorkflow,
    lateStopKind: "pickup",
    lateStopMode: "specified",
    lateStopMinutes: 30,
    lateStopUnit: "minutes",
    lateStopLoadStatus: "hold",
    lateStopOnlyStatuses: ["loading"],
  });
  assert.equal(settingsStore.getWorkflowSettings().lateStopLoadStatus, "hold");
  const lateChanged = workflow.applyLateStopWorkflow(new Date("2026-08-20T12:00:00.000Z"));
  assert.ok(lateChanged >= 1);
  assert.equal(queries.getLoad(lateLoadId)?.status, "hold");
  const deskUser = settingsStore.listDispatcherUsers(false)[0];
  assert.ok(deskUser);
  settingsStore.updateWorkflowSettings({ ...previousWorkflow, autoAssignDispatcherOnCreate: true });
  const autoDispatchId = queries.createLoad({
    customer_id: customerId,
    origin: "Kearney, NE",
    destination: "North Platte, NE",
    pickup_start: "2026-08-23T08:00:00.000Z",
    pickup_end: "2026-08-23T12:00:00.000Z",
    delivery_start: "2026-08-23T14:00:00.000Z",
    delivery_end: "2026-08-23T18:00:00.000Z",
    weight: 5000,
    commodity: "Auto dispatcher",
    rate: 250,
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
  });
  workflow.maybeAssignCreatingDispatcher(autoDispatchId, deskUser.id);
  assert.equal(queries.getLoad(autoDispatchId)?.dispatcher_id, deskUser.id);
  settingsStore.updateWorkflowSettings(previousWorkflow);
  const { expandDocumentTags } = await import("../lib/document-tags");
  assert.equal(expandDocumentTags("Load [load_id] for [customer_name]", { loadId: "MSE-1", customerName: "Acme" }), "Load MSE-1 for Acme");
  const upcoming = queries.listUpcomingCompliance();
  assert.ok(upcoming.length >= 3, "seed should surface expiring/expired documents");
  const truck210 = queries.listTrucks().find((truck) => truck.unit_number === "210");
  const trailer8801 = queries.listTrailers().find((trailer) => trailer.unit_number === "TR-8801");
  assert.ok(truck210);
  assert.ok(trailer8801);
  assert.equal(truck210.year, "2018");
  assert.equal(truck210.make, "Peterbilt");
  assert.equal(truck210.model, "579");
  assert.equal(truck210.plate, "TN-210");
  const truckReg = truckComplianceAlerts(truck210).find((alert) => alert.kind === "registration");
  assert.ok(truckReg);
  assert.equal(truckReg.severity, "expiring");
  assert.match(truckReg.message, /Unit 210/);
  assert.match(truckReg.message, /registration/);
  const trailerReg = trailerComplianceAlerts(trailer8801).find((alert) => alert.kind === "registration");
  assert.ok(trailerReg);
  assert.equal(trailerReg.severity, "expiring");
  assert.match(trailerReg.message, /Trailer TR-8801/);
  assert.match(trailerReg.message, /registration/);
  const truck108 = queries.listTrucks().find((truck) => truck.unit_number === "108");
  assert.ok(truck108);
  const truckDot = truckComplianceAlerts(truck108).find((alert) => alert.kind === "dot_inspection");
  assert.ok(truckDot);
  assert.equal(truckDot.severity, "expiring");
  assert.match(truckDot.message, /Unit 108/);
  assert.match(truckDot.message, /DOT inspection/);
  const bothWindows = truckComplianceAlerts({
    ...truck108,
    registration_expires: truck210.registration_expires,
    dot_expires: truck108.dot_expires,
  });
  assert.ok(bothWindows.some((alert) => alert.kind === "registration"));
  assert.ok(bothWindows.some((alert) => alert.kind === "dot_inspection"));

  const confirmation = await import("../lib/load-confirmation");
  const { getCompanyProfile } = await import("../lib/company");
  const header = getCompanyProfile();
  assert.equal(header.company_name, "M&S Loads");
  const { companyLogoPath, defaultCompanyLogoPath, getDocumentDefaults, hasCustomCompanyLogo } = await import("../lib/settings");
  assert.equal(getDocumentDefaults("load_confirmation").footer_text, "");
  assert.match(getDocumentDefaults("load_confirmation").terms_text, /Continuous/);
  assert.match(getDocumentDefaults("load_confirmation").terms_text, /Two load locks are required/);
  assert.match(getDocumentDefaults("load_confirmation").terms_text, /claim number/);
  assert.doesNotMatch(getDocumentDefaults("load_confirmation").terms_text, /MS Express load number/);
  assert.doesNotMatch(getDocumentDefaults("load_confirmation").terms_text, /TriumphPay/i);
  const confirmSrc = fs.readFileSync(path.join(process.cwd(), "lib/load-confirmation.ts"), "utf8");
  assert.doesNotMatch(confirmSrc, /fontSize\(\s*7\b|fontSize\(\s*6\.5/);
  assert.doesNotMatch(confirmSrc, /#4b5563|#6b7280|#6b7c90|#dbeafe|#111827/);
  assert.match(confirmSrc, /fontSize\(18\)/);
  assert.match(confirmSrc, /#12315c/);
  assert.match(confirmSrc, /#000000/);
  assert.equal(getDocumentDefaults("invoice").footer_text, "");
  assert.equal(getDocumentDefaults("invoice").terms_text, "");
  assert.match(getDocumentDefaults("customer_confirmation").terms_text, /billing@msloads.com/);
  assert.match(getDocumentDefaults("bol").terms_text, /Seal numbers/);
  assert.equal(hasCustomCompanyLogo(), false);
  assert.ok(defaultCompanyLogoPath()?.endsWith("ms-express-logo.png"));
  assert.equal(companyLogoPath(), defaultCompanyLogoPath());
  assert.equal(header.dispatcher_name, "MS Test");
  const coleConfirm = confirmation.buildConfirmationForLoad(coleLoad.id);
  assert.equal(coleConfirm.packet, "customer");
  assert.equal(coleConfirm.style, "owner_operator");
  assert.equal(coleConfirm.carrierName, "Brennan Trucking");
  assert.equal(coleConfirm.driverName, "Cole Brennan");
  assert.equal(coleConfirm.loadNumber, coleLoad.load_number);
  assert.equal(coleConfirm.agreedAmount, null);
  assert.ok(coleConfirm.customerRate != null);
  assert.ok(!["1006149", "1006151"].includes(coleConfirm.loadNumber));
  const colePdf = await confirmation.renderConfirmationPdf(coleConfirm);
  assert.equal(colePdf.subarray(0, 4).toString(), "%PDF");
  const { PDFDocument } = await import("pdf-lib");
  const { extractText } = await import("unpdf");
  assert.equal((await PDFDocument.load(colePdf)).getPageCount(), 1, "confirmation must be one page");
  const coleText = String((await extractText(new Uint8Array(colePdf), { mergePages: true })).text ?? "");
  assert.match(coleText, /Customer Confirmation/);
  assert.doesNotMatch(coleText, /Rate & Load Confirmation/);
  assert.doesNotMatch(coleText, /Agreed Amount/);
  const coleDriver = confirmation.buildConfirmationForLoad(coleLoad.id, { packet: "internal" });
  assert.equal(coleDriver.packet, "internal");
  assert.ok(coleDriver.agreedAmount != null);
  assert.equal(coleDriver.customerRate, null);
  const coleDriverPdf = await confirmation.renderConfirmationPdf(coleDriver);
  const coleDriverText = String((await extractText(new Uint8Array(coleDriverPdf), { mergePages: true })).text ?? "");
  assert.match(coleDriverText, /Driver Confirmation/);
  assert.doesNotMatch(coleDriverText, /Rate & Load Confirmation/);
  assert.doesNotMatch(coleDriverText, /Customer Confirmation/);
  assert.doesNotMatch(coleDriverText, /at_pickup/);
  assert.doesNotMatch(coleDriverText, /MS Test/);
  assert.doesNotMatch(coleDriverText, /ana@msloads\.com/);
  assert.doesNotMatch(coleDriverText, /Thank you for hauling with us/);
  assert.doesNotMatch(coleDriverText, /Carrier is responsible for cargo/);
  assert.doesNotMatch(coleDriverText, /Report exceptions at pickup/);
  const deniseLoad =
    queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1045") ??
    queries.listLoads({ status: "all" }).find((load) => load.driver_id === denise.id);
  assert.ok(deniseLoad);
  const deniseConfirm = confirmation.buildConfirmationForLoad(deniseLoad.id);
  assert.equal(deniseConfirm.packet, "customer");
  assert.equal(deniseConfirm.style, "company_driver");
  assert.equal(deniseConfirm.agreedAmount, null);
  assert.ok(deniseConfirm.customerRate != null);
  assert.equal(deniseConfirm.loadNumber, deniseLoad.load_number);
  const denisePdf = await confirmation.renderConfirmationPdf(deniseConfirm);
  assert.equal(denisePdf.subarray(0, 4).toString(), "%PDF");
  assert.equal((await PDFDocument.load(denisePdf)).getPageCount(), 1, "company confirmation must be one page");
  const deniseText = String((await extractText(new Uint8Array(denisePdf), { mergePages: true })).text ?? "");
  assert.match(deniseText, /Customer Confirmation/);
  assert.doesNotMatch(deniseText, /Rate & Load Confirmation/);
  assert.doesNotMatch(deniseText, /Load Confirmation/);
  assert.match(deniseText, /River City Produce/);
  assert.equal(deniseConfirm.customerRate, 3100);
  assert.match(deniseText, /3,100/);
  const deniseDriver = confirmation.buildConfirmationForLoad(deniseLoad.id, { packet: "internal" });
  assert.equal(deniseDriver.agreedAmount, null);
  assert.equal(deniseDriver.customerRate, null);
  const deniseDriverPdf = await confirmation.renderConfirmationPdf(deniseDriver);
  const deniseDriverText = String(
    (await extractText(new Uint8Array(deniseDriverPdf), { mergePages: true })).text ?? "",
  );
  assert.match(deniseDriverText, /Driver Confirmation/);
  assert.doesNotMatch(deniseDriverText, /Rate & Load Confirmation/);
  assert.doesNotMatch(deniseDriverText, /^Load Confirmation$/m);
  assert.match(deniseDriverText, /Continuous/);
  assert.match(deniseDriverText, /load locks/i);
  assert.match(deniseDriverText, /claim number/);
  assert.doesNotMatch(deniseDriverText, /TriumphPay/i);
  assert.doesNotMatch(deniseDriverText, /billing@msloads\.com/);
  assert.doesNotMatch(deniseDriverText, /Email invoices, the rate confirmation/);
  assert.match(deniseText, /billing@msloads.com/);
  assert.doesNotMatch(deniseDriverText, /Customer Confirmation/);
  assert.doesNotMatch(deniseDriverText, /Thank you for hauling with us/);
  assert.doesNotMatch(deniseDriverText, /Carrier is responsible for cargo/);
  assert.doesNotMatch(deniseDriverText, /Report exceptions at pickup/);
  assert.doesNotMatch(deniseDriverText, /Customer Rate|^Rate$/m);
  assert.doesNotMatch(deniseDriverText, /3,100/);
  assert.doesNotMatch(deniseDriverText, /RC-1045/, "customer / rate-con load # must not appear on the driver sheet");
  assert.doesNotMatch(deniseText.replaceAll(/\s+/g, ""), /ana@msloads\.com/);
  assert.doesNotMatch(deniseText, /Truck #|Trailer #|Load Status|at_pickup/);
  assert.match(deniseText, /Mon–Fri 06:00–12:00|Mon-Fri 06:00–12:00|Mon–Fri 06:00-12:00/);
  assert.match(deniseText, /Daily 14:00–22:00|Daily 14:00-22:00/);
  assert.match(deniseText, /REEFER/);
  assert.match(deniseText, /34\s*°?\s*F|34°F/);
  assert.match(deniseText, /Continuous/);
  assert.equal(deniseConfirm.reeferMode, "Continuous");
  assert.match(deniseConfirm.reeferSetpoint, /34/);
  assert.equal(deniseLoad.reefer_mode, "continuous");
  const feedLoad = queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1046");
  assert.ok(feedLoad);
  const feedConfirm = confirmation.buildConfirmationForLoad(feedLoad.id);
  assert.equal(feedConfirm.reeferSetpoint, "", "dry van / no setpoint must not print blank degrees");
  assert.equal(feedConfirm.reeferMode, "", "bagged feed / dry van must not invent a reefer mode");
  assert.equal(deniseConfirm.shipper.name, "River City Nashville Cooler");
  assert.match(deniseConfirm.shipper.address, /700 Cowan St/);
  assert.match(deniseConfirm.shipper.phone, /615/);
  assert.doesNotMatch(deniseConfirm.shipper.name, /M&S Loads|M & S Loads/i);
  const { replaceStops } = await import("../lib/stops");
  const confirmImportId = queries.createLoad({
    customer_id: customerId,
    load_number: "1006149",
    origin: "Avenel, NJ",
    destination: "Hastings, NE",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 42000,
    commodity: "Frozen beef",
    rate: 2800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "PO-6149",
    po_number: "PO-6149",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  replaceStops(confirmImportId, [
    {
      kind: "pickup",
      name: "Lineage Logistics - Avenel",
      city: "Avenel",
      state: "NJ",
      window_start: pickup.toISOString(),
      window_end: pickupEnd.toISOString(),
    },
    {
      kind: "delivery",
      name: "Westside Foods Test Yard",
      city: "Kansas City",
      state: "MO",
      window_start: delivery.toISOString(),
      window_end: deliveryEnd.toISOString(),
    },
  ]);
  const { applyLocationToStop, formatStopPartyAddress, matchLocationForStop } = await import("../lib/locations");
  assert.equal(
    formatStopPartyAddress({ street: "275 Blair rd", city: "Avenel", state: "NJ", zip: "07001" }),
    "275 Blair rd\nAvenel, NJ 07001",
  );
  assert.equal(formatStopPartyAddress({ city: "Hastings", state: "NE" }), "Hastings, NE");
  const lineage = queries.listLocations().find((location) => location.name === "Lineage Logistics - Avenel");
  assert.ok(lineage);
  assert.equal(
    matchLocationForStop(queries.listLocations(), { name: "Unknown Plant LLC", city: "Avenel", state: "NJ" }),
    null,
  );
  const stuffedCity = matchLocationForStop(queries.listLocations(), {
    name: "Lineage Logistics - Avenel",
    city: "Avenel, NJ",
  });
  assert.ok(stuffedCity);
  assert.match(stuffedCity?.street ?? "", /275 Blair/);
  const hastingsColdId = queries.createLocation({
    name: "Hastings Cold Storage Smoke",
    street: "600 E 39th St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    phone: "(402) 461-4442",
    notes: "",
    role: "shipper",
    scheduling_type: "fcfs",
    hours: "Daily 06:00–16:00",
    scheduling_notes: "FCFS",
  });
  const stuffedHastings = matchLocationForStop(queries.listLocations(), {
    name: "Hastings Cold Storage Smoke",
    city: "Hastings, NE",
  });
  assert.ok(stuffedHastings);
  assert.equal(stuffedHastings?.id, hastingsColdId);
  assert.match(stuffedHastings?.street ?? "", /600 E 39th/);
  const importedConfirm = confirmation.buildConfirmationForLoad(confirmImportId);
  assert.equal(importedConfirm.shipper.name, "Lineage Logistics - Avenel");
  assert.equal(importedConfirm.shipper.address, "275 Blair rd\nAvenel, NJ 07001");
  assert.match(importedConfirm.shipper.phone, /732/);
  assert.equal(importedConfirm.consignee.name, "Westside Foods Test Yard");
  assert.equal(importedConfirm.consignee.address, "Kansas City, MO");
  assert.equal(importedConfirm.consignee.phone, "");
  assert.notEqual(importedConfirm.shipper.name, queries.getLoad(confirmImportId)?.customer_name);
  assert.doesNotMatch(importedConfirm.shipper.name, /M & S Loads/i);
  const firstPickup = (await import("../lib/stops")).listStops(confirmImportId).find((stop) => stop.kind === "pickup");
  assert.equal(firstPickup?.location_id, lineage.id);
  assert.match(firstPickup?.street ?? "", /275 Blair/);
  const linkedConsignee = queries.createLocation({
    name: "Westside Foods Test Yard",
    street: "12 Test Dock Rd",
    city: "Kansas City",
    state: "MO",
    zip: "64120",
    phone: "(816) 555-0140",
    notes: "",
    role: "receiver",
    scheduling_type: "fcfs",
    hours: "Daily 07:00–17:00",
    scheduling_notes: "",
  });
  const matchedConfirm = confirmation.buildConfirmationForLoad(confirmImportId);
  assert.equal(matchedConfirm.shipper.address, "275 Blair rd\nAvenel, NJ 07001");
  assert.equal(matchedConfirm.consignee.address, "12 Test Dock Rd\nKansas City, MO 64120");
  assert.equal(matchedConfirm.consignee.phone, "(816) 555-0140");
  replaceStops(confirmImportId, [
    {
      kind: "pickup",
      name: "Avenel",
      city: "Avenel",
      state: "NJ",
      location_id: lineage.id,
      window_start: pickup.toISOString(),
      window_end: pickupEnd.toISOString(),
    },
    {
      kind: "delivery",
      name: "Kansas City",
      city: "Kansas City",
      state: "MO",
      location_id: linkedConsignee,
      window_start: delivery.toISOString(),
      window_end: deliveryEnd.toISOString(),
    },
  ]);
  const linkedConfirm = confirmation.buildConfirmationForLoad(confirmImportId);
  const linkedDriverPacket = confirmation.buildConfirmationForLoad(confirmImportId, { packet: "internal" });
  assert.equal(linkedConfirm.shipper.name, "Lineage Logistics - Avenel");
  assert.equal(linkedConfirm.shipper.address, "275 Blair rd\nAvenel, NJ 07001");
  assert.equal(linkedConfirm.shipper.phone, lineage.phone);
  assert.equal(linkedConfirm.consignee.name, "Westside Foods Test Yard");
  assert.equal(linkedConfirm.consignee.address, "12 Test Dock Rd\nKansas City, MO 64120");
  assert.equal(linkedConfirm.consignee.phone, "(816) 555-0140");
  assert.equal(linkedConfirm.consignee.hours, "Daily 07:00–17:00");
  assert.equal(linkedDriverPacket.shipper.name, linkedConfirm.shipper.name);
  assert.equal(linkedDriverPacket.consignee.address, linkedConfirm.consignee.address);
  const keptFromLocation = applyLocationToStop(
    {
      name: "Lineage Logistics - Avenel",
      street: "Dispatcher St",
      city: "Avenel",
      state: "NJ",
      zip: "",
      phone: "",
    },
    lineage,
  );
  assert.equal(keptFromLocation.street, "Dispatcher St");
  replaceStops(confirmImportId, [
    {
      kind: "pickup",
      name: "Lineage Logistics - Avenel",
      street: "Dispatcher St",
      city: "Avenel",
      state: "NJ",
      window_start: pickup.toISOString(),
      window_end: pickupEnd.toISOString(),
    },
    {
      kind: "delivery",
      name: "Westside Foods Test Yard",
      city: "Kansas City",
      state: "MO",
      window_start: delivery.toISOString(),
      window_end: deliveryEnd.toISOString(),
    },
  ]);
  const keptStreetConfirm = confirmation.buildConfirmationForLoad(confirmImportId);
  assert.match(keptStreetConfirm.shipper.address, /Dispatcher St/);
  assert.doesNotMatch(keptStreetConfirm.shipper.address, /275 Blair/);
  assert.match(keptStreetConfirm.shipper.address, /07001/);
  const typedPickup = (await import("../lib/stops")).listStops(confirmImportId).find((stop) => stop.kind === "pickup");
  assert.equal(typedPickup?.street, "Dispatcher St");
  assert.equal(typedPickup?.location_id, lineage.id);
  assert.match(linkedConfirm.reeferSetpoint, /34/);
  assert.equal(linkedConfirm.reeferMode, "Continuous");
  const feedPdf = await confirmation.renderConfirmationPdf(feedConfirm);
  const feedText = String((await extractText(new Uint8Array(feedPdf), { mergePages: true })).text ?? "");
  assert.doesNotMatch(feedText, /Setpoint —/);
  assert.doesNotMatch(feedText, /Setpoint\s+Mode/);
  const basicsTempId = queries.createLoad({
    customer_id: customerId,
    origin: "Kansas City, MO",
    destination: "St. Louis, MO",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Chilled produce",
    rate: 1400,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    temperature_f: 28,
    equipment: "reefer_53",
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const basicsTempConfirm = confirmation.buildConfirmationForLoad(basicsTempId);
  assert.match(basicsTempConfirm.reeferSetpoint, /28/);
  assert.equal(basicsTempConfirm.reeferMode, "Continuous");
  const basicsTempPdf = await confirmation.renderConfirmationPdf(basicsTempConfirm);
  const basicsTempText = String((await extractText(new Uint8Array(basicsTempPdf), { mergePages: true })).text ?? "");
  assert.match(basicsTempText, /REEFER/);
  assert.match(basicsTempText, /28\s*°?\s*F|28°F/);
  assert.match(basicsTempText, /Continuous/);
  assert.doesNotMatch(basicsTempText, /Setpoint —/);
  const reeferNoTempId = queries.createLoad({
    customer_id: customerId,
    origin: "Kansas City, MO",
    destination: "St. Louis, MO",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Empty reefer",
    rate: 900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    equipment: "reefer_53",
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const reeferNoTempConfirm = confirmation.buildConfirmationForLoad(reeferNoTempId);
  assert.equal(reeferNoTempConfirm.reeferSetpoint, "");
  assert.equal(reeferNoTempConfirm.reeferMode, "Continuous");
  const reeferNoTempPdf = await confirmation.renderConfirmationPdf(reeferNoTempConfirm);
  const reeferNoTempText = String(
    (await extractText(new Uint8Array(reeferNoTempPdf), { mergePages: true })).text ?? "",
  );
  assert.match(reeferNoTempText, /REEFER/);
  assert.match(reeferNoTempText, /Continuous/);
  assert.doesNotMatch(reeferNoTempText, /Setpoint —/);
  assert.doesNotMatch(reeferNoTempText, /Setpoint\s+Mode/);

  const filesMod = await import("../lib/files");
  assert.equal(
    filesMod.listAttachments(deniseLoad.id).filter((file) => file.kind === "bol").length,
    0,
    "BOL is not auto-created on seed/assign",
  );
  const bolChecklist = (await import("../lib/desk")).requiredDocumentsForLoad(deniseLoad).find((doc) => doc.kind === "bol");
  assert.equal(bolChecklist?.required, false, "making a BOL is optional");
  const settingsMod = await import("../lib/settings");
  settingsMod.updateDocumentDefaults({
    doc_type: "bol",
    header_text: "Smoke Bill of Lading",
    footer_text: "Smoke BOL footer",
    terms_text: "Smoke BOL terms stay on the form.",
    font_size: 10,
  });
  const madeBol = await (await import("../lib/actions")).makeBolAction(deniseLoad.id, null, new FormData());
  assert.equal(madeBol.ok, true);
  const bols = filesMod.listAttachments(deniseLoad.id).filter((file) => file.kind === "bol");
  assert.equal(bols.length, 1);
  assert.equal(bols[0].kind, "bol");
  assert.match(bols[0].original_name, /MSE-1045-BOL\.pdf/);
  const bolBuf = fs.readFileSync(filesMod.getAttachmentPath(bols[0]));
  assert.equal(bolBuf.subarray(0, 4).toString(), "%PDF");
  assert.equal((await PDFDocument.load(bolBuf)).getPageCount(), 1, "BOL must be one page");
  const bolText = String((await extractText(new Uint8Array(bolBuf), { mergePages: true })).text ?? "");
  assert.match(bolText, /Bill Of Lading/);
  assert.match(bolText, /Smoke BOL terms stay on the form/);
  assert.match(bolText, /Smoke BOL footer/);
  assert.doesNotMatch(bolText, /Bill Of LadingLoad Number/);
  assert.doesNotMatch(bolText, /Smoke Bill of Lading/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/bol.ts"), "utf8"), /text\("Bill Of Lading", LEFT, 24/);
  assert.match(bolText, /# of pieces|of pieces/);
  assert.match(bolText, /Description of the goods/);
  assert.match(bolText, /Weight in LBS/);
  assert.match(bolText, /NMFC/);
  assert.match(bolText, /M & S Loads LLC - MS Express/);
  assert.match(bolText, /Transportation Company/);
  assert.match(bolText, /3rd Party Billing/);
  assert.match(bolText, /Emergency Response Phone/);
  assert.match(bolText, /C\.O\.D\. Amount/);
  assert.match(bolText, /Declared Value/);
  assert.match(bolText, /Number Of Pieces Received/);
  assert.match(bolText, /Page 1 of 1/);
  assert.match(bolText, /MSE-1045/);
  const { listDefaultedDocuments, generateDefaultedDocument } = await import("../lib/load-documents");
  const defaulted = listDefaultedDocuments(deniseLoad.id);
  assert.ok(defaulted.some((row) => row.key === "bol" && row.status === "ready"));
  assert.ok(defaulted.some((row) => row.key === "bol_third_party"));
  assert.ok(defaulted.some((row) => row.title === "Customer confirmation"));
  const masterBol = await generateDefaultedDocument(deniseLoad.id, "bol");
  assert.match(masterBol.original_name, /MSE-1045-BOL-master\.pdf/);
  const masterBolText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(masterBol))), { mergePages: true })).text ?? "",
  );
  assert.match(masterBolText, /BILL OF LADING/);
  assert.match(masterBolText, /River City Nashville Cooler/);
  assert.match(masterBolText, /700 Cowan/);
  assert.match(masterBolText, /Dallas Cold Storage/);
  assert.match(masterBolText, /3500 S Lamar/);
  assert.match(masterBolText, /Shipper \/ Consignor/);
  assert.doesNotMatch(masterBolText, /AscendTMS|Powered by|Nanuet/);
  const thirdPartyBol = await generateDefaultedDocument(deniseLoad.id, "bol_third_party");
  const thirdPartyText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(thirdPartyBol))), { mergePages: true }))
      .text ?? "",
  );
  assert.match(thirdPartyText, /Ship From/);
  assert.match(thirdPartyText, /Ship To/);
  assert.match(thirdPartyText, /3rd Party/);
  assert.match(thirdPartyText, /River City Nashville Cooler/);
  assert.match(thirdPartyText, /Dallas Cold Storage/);
  const blindBol = await generateDefaultedDocument(deniseLoad.id, "bol_blind");
  const blindBolText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(blindBol))), { mergePages: true })).text ?? "",
  );
  assert.match(blindBolText, /BILL OF LADING/);
  assert.match(blindBolText, /Nashville, TN/);
  assert.match(blindBolText, /Dallas, TX/);
  assert.doesNotMatch(blindBolText, /River City Nashville Cooler|Dallas Cold Storage/);
  assert.doesNotMatch(blindBolText, /700 Cowan|3500 S Lamar/);
  assert.doesNotMatch(blindBolText, /\(615\) 555-0144|\(214\) 555-0190/);
  assert.doesNotMatch(blindBolText, /AscendTMS|Powered by|Nanuet/);
  const signedBol = await generateDefaultedDocument(deniseLoad.id, "bol_signatures");
  assert.ok((await PDFDocument.load(fs.readFileSync(filesMod.getAttachmentPath(signedBol)))).getPageCount() >= 1);
  const signedBolText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(signedBol))), { mergePages: true })).text ?? "",
  );
  assert.match(signedBolText, /Receiver \/ Consignee/);
  assert.match(signedBolText, /Driver Initials/);
  assert.match(signedBolText, /River City Nashville Cooler/);
  const customerConf = await generateDefaultedDocument(deniseLoad.id, "customer_confirmation");
  const customerConfText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(customerConf))), { mergePages: true })).text ?? "",
  );
  assert.doesNotMatch(customerConfText, /AscendTMS|Powered by/);
  const bolDropId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 21000,
    commodity: "Fresh beef",
    rate: 3200,
    notes: "",
    special_instructions: "SAMPLE multi-drop for BOL variants.",
    appointment_notes: "",
    reference_number: "RC-BOL-DROP",
    po_number: "PO-BOL-DROP",
    reefer_setpoint_f: 26,
    trailer_number: "TR-BOL",
    status: "dispatched",
    truck_id: null,
    driver_id: denise.id,
  });
  replaceStops(bolDropId, [
    {
      kind: "pickup",
      name: "Nebraska Cold Storage",
      street: "600 E 39th St",
      city: "Hastings",
      state: "NE",
      zip: "68901",
      phone: "402-461-4442",
    },
    {
      kind: "delivery",
      name: "Westside Foods - KOSHER",
      street: "355 Food Center Dr",
      city: "Bronx",
      state: "NY",
      zip: "10474",
      cargo: "FRESH BEEF - 20952 lbs",
    },
    {
      kind: "delivery",
      name: "The Chef's Kingdom - Chestnut Ridge",
      street: "1 Alpine Ct",
      city: "Chestnut Ridge",
      state: "NY",
      zip: "10977",
    },
    {
      kind: "delivery",
      name: "Kayco-Bayonne",
      street: "72 New Hook RD",
      city: "Bayonne",
      state: "NJ",
      zip: "07002",
    },
  ]);
  const dropDocs = listDefaultedDocuments(bolDropId);
  assert.equal(dropDocs.filter((row) => row.key === "bol_third_party").length, 3);
  assert.ok(dropDocs.some((row) => row.source.includes("Nebraska Cold Storage to Westside Foods - KOSHER")));
  assert.ok(dropDocs.some((row) => row.source.includes("Nebraska Cold Storage to Kayco-Bayonne")));
  const dropMaster = await generateDefaultedDocument(bolDropId, "bol");
  const dropMasterText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(dropMaster))), { mergePages: true }))
      .text ?? "",
  );
  assert.match(dropMasterText, /Nebraska Cold Storage/);
  assert.match(dropMasterText, /600 E 39th St/);
  assert.match(dropMasterText, /Westside Foods - KOSHER/);
  assert.match(dropMasterText, /355 Food Center Dr/);
  assert.match(dropMasterText, /The Chef's Kingdom/);
  assert.match(dropMasterText, /Kayco-Bayonne/);
  const westsideLane = dropDocs.find((row) => row.key === "bol_third_party" && row.source.includes("Westside Foods"));
  assert.ok(westsideLane);
  const westsideLaneBol = await generateDefaultedDocument(bolDropId, "bol_third_party", westsideLane.stopId);
  const westsideLaneText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(westsideLaneBol))), { mergePages: true }))
      .text ?? "",
  );
  assert.match(westsideLaneText, /Westside Foods - KOSHER/);
  assert.doesNotMatch(westsideLaneText, /Kayco-Bayonne/);
  const dropBlind = await generateDefaultedDocument(bolDropId, "bol_blind");
  const dropBlindText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(dropBlind))), { mergePages: true })).text ??
      "",
  );
  assert.match(dropBlindText, /Hastings, NE/);
  assert.match(dropBlindText, /Bronx, NY/);
  assert.match(dropBlindText, /Chestnut Ridge, NY/);
  assert.match(dropBlindText, /Bayonne, NJ/);
  assert.doesNotMatch(dropBlindText, /Westside Foods|Kayco-Bayonne|Nebraska Cold Storage/);
  assert.doesNotMatch(dropBlindText, /355 Food Center|72 New Hook|1 Alpine/);
  const dropSigned = await generateDefaultedDocument(bolDropId, "bol_signatures");
  const dropSignedText = String(
    (await extractText(new Uint8Array(fs.readFileSync(filesMod.getAttachmentPath(dropSigned))), { mergePages: true })).text ??
      "",
  );
  assert.match(dropSignedText, /Westside Foods - KOSHER/);
  assert.match(dropSignedText, /Kayco-Bayonne/);
  assert.match(dropSignedText, /Driver Initials/);
  assert.match(bolText, /River City Nashville Cooler/);
  assert.match(bolText, /700 Cowan/);
  assert.match(bolText, /\(615\) 555-0144/);
  assert.match(bolText, /Dallas Cold Storage/);
  assert.match(bolText, /3500 S Lamar/);
  assert.match(bolText, /\(214\) 555-0190/);
  assert.match(bolText, /MSE-1045/);
  assert.match(bolText, /Chilled dairy/);
  assert.match(bolText, /42800/);
  assert.match(bolText, /Denise/);
  assert.match(bolText, /TR-7742/);
  assert.match(bolText, /34/);
  assert.match(bolText, /Continuous/);
  assert.match(bolText, /PO-55209/);
  assert.match(bolText, /RC-1045/);
  assert.match(bolText, /Trailer/);
  assert.doesNotMatch(bolText, /Trailer TR-7742 PO-55209|Trailer 1527/);
  assert.doesNotMatch(bolText, /Internal legs|for carrier use|Relay/i);
  assert.doesNotMatch(bolText, /Thank you for hauling|Carrier is responsible for cargo/i);

  const bolMod = await import("../lib/bol");
  const { parseBolDraftFromForm, writeBolDraftToForm } = await import("../lib/bol-shared");
  const itsDraft = {
    ...bolMod.buildBolDraftFromLoad(deniseLoad),
    thirdParty: "M & S Loads LLC - MS Express",
    seals: "S-441, S-442",
    items: [
      {
        pieces: "111",
        description: "fresh beef",
        weightLbs: "1000",
        type: "boxes",
        nmfc: "",
        hm: "No",
        classCode: "",
      },
    ],
  };
  const multiSealForm = new FormData();
  writeBolDraftToForm(multiSealForm, { ...itsDraft, seals: "" });
  multiSealForm.delete("bol_seals");
  multiSealForm.append("bol_seal", "S-441");
  multiSealForm.append("bol_seal", "S-442");
  assert.equal(parseBolDraftFromForm(multiSealForm)?.seals, "S-441, S-442");
  const itsItemsForm = new FormData();
  writeBolDraftToForm(itsItemsForm, itsDraft);
  const madeItsBol = await (await import("../lib/actions")).makeBolAction(deniseLoad.id, null, itsItemsForm);
  assert.equal(madeItsBol.ok, true);
  const itsBols = filesMod.listAttachments(deniseLoad.id).filter((file) => file.kind === "bol");
  assert.equal(itsBols.length, 6);
  const itsBolBuf = fs.readFileSync(filesMod.getAttachmentPath(itsBols[0]));
  const itsBolText = String((await extractText(new Uint8Array(itsBolBuf), { mergePages: true })).text ?? "");
  assert.match(itsBolText, /fresh beef/);
  assert.match(itsBolText, /111/);
  assert.match(itsBolText, /1000/);
  assert.match(itsBolText, /boxes/);
  assert.match(itsBolText, /Total Pieces/);
  assert.match(itsBolText, /Total Weight/);
  assert.match(itsBolText, /S-441/);
  assert.match(itsBolText, /S-442/);
  assert.match(itsBolText, /TR-7742/);
  assert.match(itsBolText, /PO-55209/);
  assert.doesNotMatch(itsBolText, /Trailer TR-7742 PO-55209|Trailer 1527/);
  assert.doesNotMatch(itsBolText, /Chilled dairy/);

  const freshCompanyId = queries.createLoad({
    customer_id: customerId,
    origin: "Atlanta, GA",
    destination: "Nashville, TN",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 18000,
    commodity: "Fresh company confirmation",
    rate: 1100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "CONF-CO",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  assert.equal(
    filesMod.listAttachments(freshCompanyId).filter((file) => file.kind === "bol").length,
    0,
    "saving a load must not auto-create a BOL",
  );
  const freshCompany = confirmation.buildConfirmationForLoad(freshCompanyId);
  assert.equal(freshCompany.style, "company_driver");
  const freshCompanyPdf = await confirmation.renderConfirmationPdf(freshCompany);
  assert.equal(freshCompanyPdf.subarray(0, 4).toString(), "%PDF");

  const confirmTruckId = queries.createTruck({
    unit_number: "CONF-1",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
  });
  const confirmOoDriverId = queries.createDriver({
    name: "OO Confirm",
    phone: "555-0188",
    license: "MS-CDL-CONF",
    pin: "8181",
    truck_id: confirmTruckId,
    status: "available",
    driver_type: "owner_operator",
    pay_percent: 80,
  });
  const freshOoId = queries.createLoad({
    customer_id: customerId,
    origin: "Memphis, TN",
    destination: "Dallas, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 22000,
    commodity: "Fresh OO confirmation",
    rate: 2100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "CONF-OO",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "assigned",
    truck_id: confirmTruckId,
    driver_id: confirmOoDriverId,
    oo_percent: 80,
  });
  const freshOo = confirmation.buildConfirmationForLoad(freshOoId);
  assert.equal(freshOo.style, "owner_operator");
  const freshOoPdf = await confirmation.renderConfirmationPdf(freshOo);
  assert.equal(freshOoPdf.subarray(0, 4).toString(), "%PDF");

  const { extraRelayCount, boardRelayLabel, formatRelayLane, formatRelayHandoff } = await import("../lib/relays");
  const relayStore = await import("../lib/relay-store");
  assert.equal(extraRelayCount(1, [{ driver_id: 1 }, { driver_id: 2 }]), 1);
  assert.equal(extraRelayCount(1, [{ driver_id: 2, from_driver_id: 1 }]), 1);
  assert.equal(boardRelayLabel(1), "+1 relay");
  assert.equal(formatRelayLane("New York, NY", "Chicago, IL"), "New York, NY → Chicago, IL");
  assert.equal(formatRelayHandoff("Able", "Baker", "Memphis, TN"), "Able → Baker at Memphis, TN");
  const relayTruckA = queries.createTruck({
    unit_number: "RA-1",
    type: "dry_van",
    capacity_lbs: 44000,
    status: "available",
  });
  const relayTruckB = queries.createTruck({
    unit_number: "RB-1",
    type: "dry_van",
    capacity_lbs: 44000,
    status: "available",
  });
  const relayDriverA = queries.createDriver({
    name: "Relay Alpha",
    phone: "555-0701",
    license: "NY-CDL-RELAYA",
    pin: "7001",
    truck_id: relayTruckA,
    status: "available",
  });
  const relayDriverB = queries.createDriver({
    name: "Relay Bravo",
    phone: "555-0702",
    license: "CO-CDL-RELAYB",
    pin: "7002",
    truck_id: relayTruckB,
    status: "available",
    driver_type: "owner_operator",
    pay_percent: 80,
  });
  const relayLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "New York, NY",
    destination: "Denver, CO",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Relay freight",
    rate: 3200,
    notes: "",
    special_instructions: "Call receiver.",
    appointment_notes: "",
    reference_number: "RC-RELAY",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "assigned",
    truck_id: relayTruckA,
    driver_id: relayDriverA,
  });
  relayStore.addRelay(relayLoadId, {
    pickup: "New York, NY",
    delivery: "Chicago, IL",
    driver_id: relayDriverA,
    truck_id: relayTruckA,
  });
  relayStore.addRelay(relayLoadId, {
    pickup: "Chicago, IL",
    delivery: "Denver, CO",
    driver_id: relayDriverB,
    truck_id: relayTruckB,
    oo_percent: 40,
    oo_pay: 900,
  });
  const relayRows = relayStore.listRelays(relayLoadId);
  assert.equal(relayRows.length, 2);
  assert.equal(relayRows[0]?.delivery, "Chicago, IL");
  assert.equal(relayRows[1]?.driver_name, "Relay Bravo");
  assert.equal(relayRows[1]?.oo_pay, 900);
  assert.equal(queries.listLoadsForDriver(relayDriverA).some((load) => load.id === relayLoadId), true);
  assert.equal(queries.listLoadsForDriver(relayDriverB).some((load) => load.id === relayLoadId), true);
  assert.equal(relayStore.extraRelayLabelsByLoad([{ id: relayLoadId, driver_id: relayDriverA }]).get(relayLoadId), "+1 relay");
  const customerPacket = confirmation.buildConfirmationForLoad(relayLoadId);
  assert.equal(customerPacket.internalLegs, "");
  assert.match(customerPacket.shipper.address, /New York/);
  assert.equal(customerPacket.agreedAmount, null);
  assert.equal(customerPacket.customerRate, 3200);
  assert.equal(customerPacket.customerRateLines.some((line) => line.name === "Flat Rate"), true);
  assert.doesNotMatch(customerPacket.dispatchNotes, /Chicago|internal \$900|Relay Bravo/i);
  const customerPacketPdf = await confirmation.renderConfirmationPdf(customerPacket);
  const customerPacketText = String(
    (await extractText(new Uint8Array(customerPacketPdf), { mergePages: true })).text ?? "",
  );
  assert.match(customerPacketText, /Customer Confirmation/);
  assert.match(customerPacketText, /3,200/);
  assert.doesNotMatch(customerPacketText, /Relay Bravo|internal \$900|Your leg/);
  const billedCustomerId = queries.createCustomer({
    name: "Westside Foods Billing Co",
    billing_notes: "4400 Packer Ave\nKansas City, MO 64120",
    contacts: [
      { name: "Avery Billing", role: "AP", phone: "816-555-0101", email: "ap@westside-smoke.example" },
    ],
  });
  const billedLoadId = queries.createLoad({
    customer_id: billedCustomerId,
    load_number: "1006153-SMOKE",
    origin: "Hastings, NE",
    destination: "Kansas City, MO",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Frozen beef",
    rate: 2000,
    notes: "",
    special_instructions: "",
    appointment_notes: "FCFS",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 26,
    reefer_mode: "continuous",
    trailer_number: "MS1519",
    status: "delivered",
    truck_id: null,
    driver_id: null,
    contact_name: "Jordan Buyer",
    contact_phone: "816-555-0199",
    contact_ext: "4401",
    contact_email: "jordan@westside-smoke.example",
    customer_reference: "WSF-1006153",
  });
  replaceStops(billedLoadId, [
    {
      kind: "pickup",
      name: "Hastings Cold Storage Smoke",
      city: "Hastings, NE",
      state: "",
      window_start: pickup.toISOString(),
      window_end: pickupEnd.toISOString(),
      notes: "FCFS",
    },
    {
      kind: "delivery",
      name: "Westside Foods Smoke Dock",
      street: "12 Test Dock Rd",
      city: "Kansas City",
      state: "MO",
      zip: "64120",
      window_start: delivery.toISOString(),
      window_end: deliveryEnd.toISOString(),
    },
  ]);
  addPayItem(billedLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Westside Foods Billing Co",
    category: "flat_rate",
    rate: 2000,
    qty: 1,
    total: 2000,
    notes: "",
  });
  addPayItem(billedLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Westside Foods Billing Co",
    category: "detention",
    rate: 150,
    qty: 1,
    total: 150,
    notes: "",
  });
  addPayItem(billedLoadId, {
    side: "expense",
    bill_to: "driver",
    payee: "OO Smoke Pay",
    category: "flat_rate",
    rate: 400,
    qty: 1,
    total: 400,
    notes: "",
  });
  const billedPacket = confirmation.buildConfirmationForLoad(billedLoadId);
  assert.equal(billedPacket.packet, "customer");
  assert.equal(billedPacket.customerName, "Westside Foods Billing Co");
  assert.match(billedPacket.customerBilling, /4400 Packer Ave/);
  assert.match(billedPacket.customerBilling, /Kansas City, MO 64120/);
  assert.equal(billedPacket.customerContact, "Jordan Buyer");
  assert.equal(billedPacket.customerPhone, "816-555-0199 x4401");
  assert.equal(queries.getCustomer(billedCustomerId)?.contacts[0]?.phone, "816-555-0101");
  assert.equal(billedPacket.customerEmail, "jordan@westside-smoke.example");
  assert.equal(billedPacket.customerReference, "WSF-1006153");
  assert.equal(billedPacket.customerRate, 2150);
  assert.deepEqual(
    billedPacket.customerRateLines.map((line) => [line.name, line.amount]),
    [
      ["Flat Rate", 2000],
      ["Detention", 150],
    ],
  );
  assert.equal(billedPacket.agreedAmount, null);
  assert.match(billedPacket.shipper.address, /600 E 39th/);
  assert.match(billedPacket.consignee.address, /12 Test Dock Rd/);
  const billedPdf = await confirmation.renderConfirmationPdf(billedPacket);
  assert.equal((await PDFDocument.load(billedPdf)).getPageCount(), 1, "customer confirmation must be one page");
  const billedText = String((await extractText(new Uint8Array(billedPdf), { mergePages: true })).text ?? "");
  assert.match(billedText, /Customer Confirmation/);
  assert.match(billedText, /Westside Foods Billing Co/);
  assert.match(billedText, /4400 Packer Ave/);
  assert.match(billedText, /Jordan Buyer/);
  assert.match(billedText, /WSF-1006153/);
  assert.match(billedText, /Flat Rate/);
  assert.match(billedText, /Detention/);
  assert.match(billedText, /2,150/);
  assert.match(billedText, /600 E 39th/);
  assert.match(billedText, /12 Test Dock Rd/);
  assert.match(billedText, /26\s*°?\s*F|26°F/);
  assert.match(billedText, /Continuous/);
  assert.doesNotMatch(billedText, /Load Confirmation|Rate & Load Confirmation/);
  assert.doesNotMatch(billedText, /OO Smoke Pay|Agreed Amount|Carrier Pay|Your leg|Internal legs/);
  assert.doesNotMatch(billedText, /customer portal|packet=|tmsCustomer|programming/i);
  const billedDriver = confirmation.buildConfirmationForLoad(billedLoadId, { packet: "internal" });
  assert.equal(billedDriver.customerRate, null);
  assert.equal(billedDriver.customerName, "");
  const billedDriverText = String(
    (await extractText(new Uint8Array(await confirmation.renderConfirmationPdf(billedDriver)), { mergePages: true }))
      .text ?? "",
  );
  assert.match(billedDriverText, /Driver Confirmation/);
  assert.doesNotMatch(billedDriverText, /Customer Confirmation|2,150|WSF-1006153/);
  const driverPoLoadId = queries.createLoad({
    customer_id: billedCustomerId,
    load_number: "1006150",
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Kosher frozen",
    rate: 4500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "12345",
    po_number: "12345",
    reefer_setpoint_f: 26,
    trailer_number: "",
    status: "assigned",
    truck_id: null,
    driver_id: null,
    customer_reference: "12345",
  });
  replaceStops(driverPoLoadId, [
    {
      kind: "pickup",
      name: "Hastings Cold Storage Smoke",
      city: "Hastings",
      state: "NE",
      reference: "STOP-PO-7",
      confirmation: "APPT-22",
      window_start: pickup.toISOString(),
      window_end: pickupEnd.toISOString(),
    },
    {
      kind: "delivery",
      name: "Bayonne Dock",
      city: "Bayonne",
      state: "NJ",
      window_start: delivery.toISOString(),
      window_end: deliveryEnd.toISOString(),
    },
  ]);
  const driverPoPacket = confirmation.buildConfirmationForLoad(driverPoLoadId, { packet: "internal" });
  assert.equal(driverPoPacket.loadNumber, "1006150");
  assert.equal(driverPoPacket.customerReference, "");
  assert.equal(driverPoPacket.stops[0]?.poNumber, "STOP-PO-7");
  assert.equal(driverPoPacket.stops[0]?.confirmationNumber, "APPT-22");
  assert.equal(driverPoPacket.stops[1]?.poNumber, "");
  assert.equal(driverPoPacket.stops[1]?.confirmationNumber, "");
  const driverPoText = String(
    (await extractText(new Uint8Array(await confirmation.renderConfirmationPdf(driverPoPacket)), { mergePages: true }))
      .text ?? "",
  );
  assert.match(driverPoText, /1006150/);
  assert.match(driverPoText, /STOP-PO-7/);
  assert.match(driverPoText, /APPT-22/);
  assert.doesNotMatch(driverPoText, /12345/);
  const customerPoPacket = confirmation.buildConfirmationForLoad(driverPoLoadId);
  assert.equal(customerPoPacket.customerReference, "12345");
  assert.equal(confirmation.driverFacingStopPo({ reference: "12345" }, { load_number: "1006150", customer_reference: "12345" }), "");
  assert.equal(confirmation.driverFacingStopPo({ reference: "1006150" }, { load_number: "1006150", customer_reference: "12345" }), "");
  assert.equal(confirmation.driverFacingStopConfirmation({ confirmation: "12345" }, { load_number: "1006150", customer_reference: "12345" }), "");
  const billedInvoice = (await import("../lib/invoice")).buildTmsInvoice(queries.getLoad(billedLoadId)!);
  assert.equal(billedInvoice.total, 2150);
  assert.equal(billedInvoice.total, billedPacket.customerRate);
  const internalPacket = confirmation.buildConfirmationForLoad(relayLoadId, {
    packet: "internal",
    driverId: relayDriverB,
  });
  assert.match(internalPacket.internalLegs, /Your leg: Chicago, IL → Denver, CO/);
  assert.match(internalPacket.internalLegs, /Relay Bravo/);
  assert.match(internalPacket.internalLegs, /900/);
  assert.equal(internalPacket.shipper.title, "Shipper 1");
  assert.equal(internalPacket.consignee.title, "Consignee 1");
  assert.doesNotMatch(internalPacket.shipper.address, /Chicago/);
  const multiDropLoadId = queries.createLoad({
    customer_id: customerId,
    load_number: "1006150-SMOKE",
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Kosher frozen",
    rate: 4500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 26,
    reefer_mode: "continuous",
    trailer_number: "",
    status: "assigned",
    truck_id: null,
    driver_id: null,
  });
  replaceStops(multiDropLoadId, [
    {
      kind: "pickup",
      name: "Nebraska Cold Storage Inc",
      city: "Hastings",
      state: "NE",
      window_start: pickup.toISOString(),
      window_end: pickupEnd.toISOString(),
    },
    {
      kind: "delivery",
      name: "Springfield Group Inc - Kosher",
      street: "5600 1st ave",
      city: "Brooklyn",
      state: "NY",
      zip: "11220",
      window_start: delivery.toISOString(),
      window_end: deliveryEnd.toISOString(),
    },
    {
      kind: "delivery",
      name: "Westside Foods - Kosher",
      city: "Bronx",
      state: "NJ",
    },
    {
      kind: "delivery",
      name: "Chef Kingdom",
      street: "1 Alpine Ct",
      city: "Chestnut Ridge",
      state: "NY",
    },
    {
      kind: "delivery",
      name: "Wakefern-Keasbey",
      street: "5000 Riverside dr",
      city: "Keasbey",
      state: "NJ",
      zip: "08832",
    },
    {
      kind: "delivery",
      name: "Kayco",
      street: "72 New Hook Rd",
      city: "Bayonne",
      state: "NJ",
      zip: "07002",
    },
  ]);
  const multiDropNames = [
    "Nebraska Cold Storage Inc",
    "Springfield Group Inc - Kosher",
    "Westside Foods - Kosher",
    "Chef Kingdom",
    "Wakefern-Keasbey",
    "Kayco",
  ];
  function assertStopsInOrder(text: string, label: string) {
    let cursor = 0;
    for (const name of multiDropNames) {
      const at = text.indexOf(name, cursor);
      assert.ok(at >= 0, `${label} is missing ${name}`);
      cursor = at + name.length;
    }
  }
  const multiInternal = confirmation.buildConfirmationForLoad(multiDropLoadId, { packet: "internal" });
  assert.equal(multiInternal.stops.length, 6);
  assert.deepEqual(
    multiInternal.stops.map((stop) => stop.title),
    ["Shipper 1", "Consignee 1", "Consignee 2", "Consignee 3", "Consignee 4", "Consignee 5"],
  );
  assert.equal(multiInternal.shipper.title, "Shipper 1");
  assert.equal(multiInternal.shipper.name, "Nebraska Cold Storage Inc");
  assert.equal(multiInternal.consignee.title, "Consignee 1");
  assert.match(multiInternal.consignee.name, /Springfield Group/);
  assert.match(multiInternal.stops[1]?.address ?? "", /5600 1st/);
  assert.match(multiInternal.stops[5]?.name ?? "", /Kayco/);
  assert.match(multiInternal.stops[5]?.address ?? "", /72 New Hook/);
  const multiInternalPdf = await confirmation.renderConfirmationPdf(multiInternal);
  const multiInternalPages = (await PDFDocument.load(multiInternalPdf)).getPageCount();
  assert.ok(multiInternalPages >= 2, "1 pickup + 5 deliveries must use extra pages, not collapse to the last drop");
  const multiInternalText = String(
    (await extractText(new Uint8Array(multiInternalPdf), { mergePages: true })).text ?? "",
  );
  assertStopsInOrder(multiInternalText, "internal driver packet");
  assert.match(multiInternalText, /Shipper 1/);
  assert.match(multiInternalText, /Consignee 1/);
  assert.match(multiInternalText, /Consignee 2/);
  assert.match(multiInternalText, /Consignee 3/);
  assert.match(multiInternalText, /Consignee 4/);
  assert.match(multiInternalText, /Consignee 5/);
  assert.match(multiInternalText, /5600 1st/);
  assert.match(multiInternalText, /1 Alpine Ct/);
  assert.match(multiInternalText, /5000 Riverside/);
  assert.match(multiInternalText, /72 New Hook/);
  assert.match(multiInternalText, /Page 1 of /);
  assert.match(multiInternalText, new RegExp(`Page ${multiInternalPages} of ${multiInternalPages}`));
  const multiCustomer = confirmation.buildConfirmationForLoad(multiDropLoadId);
  assert.equal(multiCustomer.stops.length, 6);
  assert.equal(multiCustomer.internalLegs, "");
  assert.deepEqual(
    multiCustomer.stops.map((stop) => stop.name),
    multiDropNames,
  );
  const multiCustomerPdf = await confirmation.renderConfirmationPdf(multiCustomer);
  const multiCustomerPages = (await PDFDocument.load(multiCustomerPdf)).getPageCount();
  assert.ok(multiCustomerPages >= 2, "customer confirmation must list every drop, using extra pages if needed");
  const multiCustomerText = String(
    (await extractText(new Uint8Array(multiCustomerPdf), { mergePages: true })).text ?? "",
  );
  assertStopsInOrder(multiCustomerText, "customer confirmation");
  assert.match(multiCustomerText, /Customer Confirmation/);
  assert.match(multiCustomerText, /Consignee 5/);
  assert.match(multiCustomerText, new RegExp(`Page ${multiCustomerPages} of ${multiCustomerPages}`));
  const multiMail = loadMail.buildDriverLoadDraft(queries.getLoad(multiDropLoadId)!);
  assert.match(multiMail.text, /Pickup 1/);
  assert.match(multiMail.text, /Delivery 1/);
  assert.match(multiMail.text, /Delivery 5/);
  assertStopsInOrder(multiMail.text, "driver load email");
  const qboPreview = (await import("../lib/integrations/quickbooks")).previewQuickbooksInvoice(
    queries.getLoad(relayLoadId)!,
  );
  assert.equal(qboPreview.amount, 3200);
  assert.equal(qboPreview.lane, "New York, NY → Denver, CO");
  assert.doesNotMatch(qboPreview.memo, /Chicago|internal \$900|Relay Bravo/);
  const splitLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Dallas, TX",
    destination: "Chicago, IL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Split freight",
    rate: 5000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "delivered",
    truck_id: relayTruckA,
    driver_id: relayDriverA,
  });
  relayStore.addRelay(splitLoadId, {
    pickup: "Dallas, TX",
    delivery: "Memphis, TN",
    from_driver_id: relayDriverA,
    driver_id: relayDriverB,
  });
  getDb()
    .prepare("UPDATE load_relays SET from_leg_miles = 500, to_leg_miles = 500 WHERE load_id = ?")
    .run(splitLoadId);
  const relaySplit = (await import("../lib/reports-relay-revenue")).splitLoadRevenueByRelayMiles(splitLoadId);
  assert.equal(relaySplit.length, 2);
  assert.equal(relaySplit[0]?.allocatedRevenue, 2500);
  assert.equal(relaySplit[1]?.allocatedRevenue, 2500);
  const invoiceAfterSplit = (await import("../lib/invoice")).buildTmsInvoice(queries.getLoad(splitLoadId)!);
  assert.doesNotMatch(JSON.stringify(invoiceAfterSplit.stops), /Memphis/);
  assert.doesNotMatch(invoiceAfterSplit.lines.map((line) => line.name).join(" "), /relay/i);
  const relaySms = formatLoadSummary(queries.getLoad(relayLoadId)!);
  assert.match(relaySms, /Shipper\nNew York, NY/);
  assert.match(relaySms, /Receiver\nDenver, CO/);
  assert.doesNotMatch(relaySms, /Chicago|internal \$900|Relay Bravo/);
  const relayAudit = audit.listLoadAudit(relayLoadId);
  assert.ok(relayAudit.some((row) => row.action === "relay" && row.actor));
  assert.ok(audit.listLoadLog(relayLoadId).some((row) => row.action === "relay"));
  queries.updateDriverProgress(relayLoadId, relayDriverB, "en_route_pickup");
  assert.equal(queries.getLoad(relayLoadId)?.status, "in_transit");

  const handoffTruckA = queries.createTruck({
    unit_number: "HA-1",
    type: "dry_van",
    capacity_lbs: 44000,
    status: "available",
  });
  const handoffTruckB = queries.createTruck({
    unit_number: "HB-1",
    type: "dry_van",
    capacity_lbs: 44000,
    status: "available",
  });
  const handoffPrimary = queries.createDriver({
    name: "Handoff Primary",
    phone: "555-0710",
    license: "GA-CDL-HANDP",
    pin: "7100",
    truck_id: null,
    status: "available",
  });
  const handoffDriverA = queries.createDriver({
    name: "Handoff Able",
    phone: "555-0711",
    license: "TX-CDL-HANDA",
    pin: "7101",
    truck_id: handoffTruckA,
    status: "available",
  });
  const handoffDriverB = queries.createDriver({
    name: "Handoff Baker",
    phone: "555-0712",
    license: "TN-CDL-HANDB",
    pin: "7102",
    truck_id: handoffTruckB,
    status: "available",
    driver_type: "owner_operator",
    pay_percent: 80,
  });
  const handoffLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Dallas, TX",
    destination: "Atlanta, GA",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 38000,
    commodity: "Handoff freight",
    rate: 2800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "RC-HANDOFF",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "assigned",
    truck_id: handoffTruckA,
    driver_id: handoffPrimary,
  });
  relayStore.addRelay(handoffLoadId, {
    from_driver_id: handoffDriverA,
    driver_id: handoffDriverB,
    delivery: "Memphis, TN",
  });
  const handoffRows = relayStore.listRelays(handoffLoadId);
  assert.equal(handoffRows.length, 1);
  assert.equal(handoffRows[0]?.from_driver_id, handoffDriverA);
  assert.equal(handoffRows[0]?.driver_id, handoffDriverB);
  assert.equal(handoffRows[0]?.delivery, "Memphis, TN");
  assert.equal(handoffRows[0]?.pickup, "Dallas, TX");
  assert.equal(handoffRows[0]?.from_driver_name, "Handoff Able");
  assert.equal(queries.listLoadsForDriver(handoffDriverA).some((load) => load.id === handoffLoadId), true);
  assert.equal(queries.listLoadsForDriver(handoffDriverB).some((load) => load.id === handoffLoadId), true);
  assert.throws(
    () =>
      relayStore.addRelay(handoffLoadId, {
        from_driver_id: handoffDriverB,
        driver_id: handoffDriverB,
        delivery: "Nashville, TN",
      }),
    /two different drivers/,
  );
  const handoffCustomer = confirmation.buildConfirmationForLoad(handoffLoadId);
  assert.equal(handoffCustomer.internalLegs, "");
  assert.doesNotMatch(handoffCustomer.dispatchNotes, /Memphis|Handoff Baker/i);
  const handoffQbo = (await import("../lib/integrations/quickbooks")).previewQuickbooksInvoice(
    queries.getLoad(handoffLoadId)!,
  );
  assert.doesNotMatch(handoffQbo.memo, /Memphis|Handoff Baker/);
  assert.doesNotMatch(formatLoadSummary(queries.getLoad(handoffLoadId)!), /Memphis|Handoff Baker/);

  const { pathToFileURL } = await import("node:url");
  const browserPdfkit = await import(pathToFileURL(path.join(process.cwd(), "node_modules/pdfkit/js/pdfkit.browser.mjs")).href);
  const Helvetica = (await import("pdfkit/standard-fonts/Helvetica")).default;
  const HelveticaBold = (await import("pdfkit/standard-fonts/HelveticaBold")).default;
  assert.equal(typeof browserPdfkit.registerStdFonts, "function");
  browserPdfkit.registerStdFonts(Helvetica, HelveticaBold);
  const browserPdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new browserPdfkit.PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(12).text("Load confirmation");
    doc.font("Helvetica").text("Browser-build fonts registered.");
    doc.end();
  });
  assert.equal(browserPdf.subarray(0, 4).toString(), "%PDF");

  const fleet = await samsara.getSamsaraFleet();
  assert.equal(fleet.mode, "demo");
  assert.ok(fleet.hos.some((clock) => clock.driverName === "Denise Ortega" && clock.source === "demo"));

  process.env.SAMSARA_API_TOKEN = "test-not-a-real-token";
  process.env.ORBCOMM_USERNAME = "demo-user";
  process.env.ORBCOMM_PASSWORD = "demo-pass";
  const previousAccount = process.env.ORBCOMM_ACCOUNT_ID;
  process.env.ORBCOMM_ACCOUNT_ID = "test-org";
  samsara.resetSamsaraCacheForTests();
  orbcomm.resetOrbcommCacheForTests();
  const originalFetch = globalThis.fetch;
  let orbcommTokenBody = "";
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes("generateToken")) {
      orbcommTokenBody = String(init?.body ?? "");
    }
    return new Response("unauthorized", { status: 401 });
  }) as typeof fetch;
  try {
    const failedFleet = await samsara.getSamsaraFleet();
    assert.equal(failedFleet.mode, "samsara", "Samsara 401 must not invent demo GPS");
    assert.equal(failedFleet.locations.length, 0);
    assert.equal(failedFleet.hos.length, 0);
    assert.ok(failedFleet.error && /401/.test(failedFleet.error));
    assert.doesNotMatch(failedFleet.error, /Showing demo/);

    const failedReefer = await orbcomm.getReeferSnapshots();
    assert.equal(failedReefer.mode, "orbcomm");
    assert.equal(failedReefer.credentialsSet, true);
    assert.ok(failedReefer.error && /401/.test(failedReefer.error));
    assert.match(failedReefer.note ?? "", /live Orbcomm did not update/i);
    const fallbackReading = await orbcomm.getLatestReeferForLoad(reeferLoad.id);
    assert.equal(fallbackReading?.source, "demo");
    assert.match(orbcommTokenBody, /"userName":"demo-user"/);
    assert.match(orbcommTokenBody, /"orgKey":"test-org"/);
    assert.doesNotMatch(orbcommTokenBody, /"username":/);
    assert.doesNotMatch(orbcommTokenBody, /accountId/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSamsara == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = previousSamsara;
    if (previousUser == null) delete process.env.ORBCOMM_USERNAME;
    else process.env.ORBCOMM_USERNAME = previousUser;
    if (previousPass == null) delete process.env.ORBCOMM_PASSWORD;
    else process.env.ORBCOMM_PASSWORD = previousPass;
    if (previousAccount == null) delete process.env.ORBCOMM_ACCOUNT_ID;
    else process.env.ORBCOMM_ACCOUNT_ID = previousAccount;
    samsara.resetSamsaraCacheForTests();
    orbcomm.resetOrbcommCacheForTests();
  }

  process.env.ORBCOMM_USERNAME = "demo-user";
  process.env.ORBCOMM_PASSWORD = "demo-pass";
  process.env.ORBCOMM_ACCOUNT_ID = "test-org";
  orbcomm.resetOrbcommCacheForTests();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: { accessToken: "nested-access", refreshToken: "nested-refresh" },
        message: "Success",
        code: 200,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  try {
    const nestedToken = await orbcomm.getReeferSnapshots();
    assert.equal(nestedToken.credentialsSet, true);
    assert.doesNotMatch(nestedToken.error ?? "", /did not include an access token/);
    assert.doesNotMatch(JSON.stringify(nestedToken), /nested-access|nested-refresh/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUser == null) delete process.env.ORBCOMM_USERNAME;
    else process.env.ORBCOMM_USERNAME = previousUser;
    if (previousPass == null) delete process.env.ORBCOMM_PASSWORD;
    else process.env.ORBCOMM_PASSWORD = previousPass;
    if (previousAccount == null) delete process.env.ORBCOMM_ACCOUNT_ID;
    else process.env.ORBCOMM_ACCOUNT_ID = previousAccount;
    orbcomm.resetOrbcommCacheForTests();
  }

  process.env.SAMSARA_API_TOKEN = "test-not-a-real-token";
  samsara.resetSamsaraCacheForTests();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/fleet/hos/clocks")) return new Response("not found", { status: 404 });
    if (url.includes("/fleet/vehicles/stats")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "samsara-veh-112",
              name: "112",
              gps: [{ latitude: 32.7767, longitude: -96.797, reverseGeo: { formattedLocation: "Dallas, TX" } }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/fleet/vehicles")) {
      return new Response(
        JSON.stringify({
          data: [{ id: "samsara-veh-112", name: "112", staticAssignedDriver: { id: "88668", name: "Denise Ortega" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const mixedFleet = await samsara.getSamsaraFleet();
    assert.equal(mixedFleet.mode, "samsara");
    assert.ok(mixedFleet.locations.some((item) => item.unitNumber === "112"));
    assert.equal(mixedFleet.hos.length, 0);
    assert.ok(mixedFleet.error && /404/.test(mixedFleet.error));
    assert.ok(mixedFleet.truckDrivers.some((item) => item.samsaraDriverName === "Denise Ortega"));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSamsara == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = previousSamsara;
    samsara.resetSamsaraCacheForTests();
  }

  const {
    buildOrbcommTrailerPreview,
    buildSamsaraTruckPreview,
    parseOrbcommFleetText,
    parseSamsaraVehicleRecords,
    SAMSARA_TOKEN_MISSING_MESSAGE,
    SAMSARA_ID_MISSING_MESSAGE,
    matchTruckForSamsara,
    matchTruckForSamsaraLive,
    samsaraReturnedNames,
    samsaraUnmatchedUnitsWarning,
    unitNumberFromSamsaraName,
    fleetUnitTokens,
    unionSamsaraVehicles,
    unionActiveSamsaraVehicles,
    samsaraOmittedVehiclesWarning,
    keepActiveSamsaraVehicles,
    samsaraExactUnit,
    mergeSamsaraGpsOntoVehicles,
    samsaraRecordIsActive,
    samsaraVehicleIsActive,
    canonicalFleetKey,
  } = await import("../lib/fleet-import-shared");
  assert.equal(unitNumberFromSamsaraName("Unit 777", "veh-x"), "777");
  assert.equal(unitNumberFromSamsaraName("Truck 112", "veh-x"), "112");
  assert.equal(unitNumberFromSamsaraName("Unit 12", "uuid-12"), "12");
  assert.equal(unitNumberFromSamsaraName("12", "uuid-12"), "12");
  assert.equal(unitNumberFromSamsaraName("#12", "uuid-12"), "12");
  assert.equal(unitNumberFromSamsaraName("Unit 36", "uuid-36"), "36");
  assert.equal(unitNumberFromSamsaraName("36", "uuid-36"), "36");
  assert.equal(unitNumberFromSamsaraName("#36", "uuid-36"), "36");
  assert.equal(unitNumberFromSamsaraName("28 in use", "veh-x"), "28");
  assert.equal(unitNumberFromSamsaraName("28 - Unassigned", "veh-x"), "28");
  assert.equal(unitNumberFromSamsaraName("Kenworth 28", "veh-x"), "28");
  assert.equal(unitNumberFromSamsaraName("2024 Freightliner 28", "veh-x"), "28");
  assert.equal(unitNumberFromSamsaraName("Unit 28 (in use)", "veh-x"), "28");
  assert.deepEqual(fleetUnitTokens("2024 Freightliner 28"), ["28"]);
  assert.equal(
    matchTruckForSamsara([{ id: 28, unit_number: "28", samsara_vehicle_id: "" }], {
      samsaraVehicleId: "uuid-only-28",
      unitNumber: "",
      name: "2024 Freightliner 28",
    })?.id,
    28,
    "name tokens must match a TMS stub even when the label includes a year",
  );
  assert.equal(
    matchTruckForSamsara([{ id: 28, unit_number: "28", samsara_vehicle_id: "" }], {
      samsaraVehicleId: "uuid-unassigned-28",
      unitNumber: "",
      name: "28 - Unassigned",
    })?.id,
    28,
  );
  assert.equal(
    matchTruckForSamsara([{ id: 28, unit_number: "28", samsara_vehicle_id: "" }], {
      samsaraVehicleId: "281474977075805",
      unitNumber: "",
      name: "Pete",
    }),
    null,
    "Samsara vehicle-id digits must not pair to a TMS unit",
  );
  assert.equal(samsaraExactUnit({ name: "2024 Freightliner 28" }), "28");
  assert.equal(samsaraExactUnit({ name: "38 / 28", extraKeys: ["38", "28"] }), "");
  assert.equal(
    matchTruckForSamsara(
      [
        { id: 28, unit_number: "28", samsara_vehicle_id: "" },
        { id: 38, unit_number: "38", samsara_vehicle_id: "" },
      ],
      { samsaraVehicleId: "sam-old", name: "38 / 28", extraKeys: ["38", "28"] },
    ),
    null,
    "a name that mentions two units must not attach the inactive unit to a live truck",
  );
  assert.match(SAMSARA_ID_MISSING_MESSAGE, /No Samsara ID on this truck/);
  const match36 = matchTruckForSamsara(
    [{ id: 7, unit_number: "36", samsara_vehicle_id: "36" }],
    { samsaraVehicleId: "uuid-samsara-36", unitNumber: "36", name: "Unit 36" },
  );
  assert.equal(match36?.id, 7);
  assert.ok(match36?.matchBy === "samsara_vehicle_id" || match36?.matchBy === "unit_number");
  assert.equal(
    matchTruckForSamsara([{ id: 7, unit_number: "36", samsara_vehicle_id: "" }], {
      samsaraVehicleId: "uuid-only-36",
      unitNumber: "36",
      name: "36",
    })?.id,
    7,
    "Samsara name digits must match the TMS unit number",
  );
  assert.equal(
    matchTruckForSamsara([{ id: 3, unit_number: "12", samsara_vehicle_id: "" }], {
      samsaraVehicleId: "uuid-only-12",
      unitNumber: "012",
      name: "Truck 12",
    })?.id,
    3,
    "Any unit/name/id pair matches the same way — 12 is not special-cased",
  );
  assert.equal(
    matchTruckForSamsara([{ id: 7, unit_number: "36", samsara_vehicle_id: "" }], {
      samsaraVehicleId: "uuid-padded-36",
      unitNumber: "036",
      name: "036",
    })?.id,
    7,
    "Leading zeros do not change a numeric unit",
  );
  const match112 = matchTruckForSamsara(
    [{ id: 8, unit_number: "112", samsara_vehicle_id: "112" }],
    { samsaraVehicleId: "281474977075805", unitNumber: "112", name: "112" },
  );
  assert.equal(match112?.id, 8, "unit typed as Samsara id must match without the UUID");
  assert.equal(
    matchTruckForSamsara([{ id: 7, unit_number: "36", samsara_vehicle_id: "", vin: "", plate: "" }], {
      samsaraVehicleId: "abc-36-def-uuid",
      unitNumber: "",
      name: "Pete",
    }),
    null,
    "UUID digits must not pair a Samsara vehicle to the wrong TMS unit",
  );
  const vinPair = matchTruckForSamsara(
    [
      { id: 1, unit_number: "112", samsara_vehicle_id: "", vin: "VIN112AAA", plate: "TX112" },
      { id: 2, unit_number: "36", samsara_vehicle_id: "", vin: "VIN36BBB", plate: "OK36" },
    ],
    { samsaraVehicleId: "uuid-first", unitNumber: "", name: "Pete", vin: "VIN36BBB" },
  );
  assert.equal(vinPair?.id, 2);
  assert.equal(vinPair?.matchBy, "vin");
  const mixedPreview = buildSamsaraTruckPreview(
    [
      { id: "v-pete", name: "Pete", vin: "VINPETE", year: "", make: "", model: "", licensePlate: "PPP" },
      { id: "v-36", name: "Unit 36", vin: "VIN36BBB", year: "", make: "", model: "", licensePlate: "OK36" },
    ],
    [
      { id: 1, unit_number: "112", samsara_vehicle_id: "", vin: "VIN112AAA", plate: "TX112" },
      { id: 2, unit_number: "36", samsara_vehicle_id: "", vin: "VIN36BBB", plate: "OK36" },
    ],
  );
  assert.equal(mixedPreview[0]?.action, "create", "first Samsara row must not steal the next TMS truck");
  assert.equal(mixedPreview[1]?.action, "update");
  assert.equal(mixedPreview[1]?.matchTruckId, 2);
  assert.equal(mixedPreview[1]?.tmsUnit, "36");
  const claimed = new Set<number>([2]);
  assert.equal(
    matchTruckForSamsara(
      [
        { id: 1, unit_number: "112", samsara_vehicle_id: "", vin: "", plate: "" },
        { id: 2, unit_number: "36", samsara_vehicle_id: "", vin: "", plate: "" },
      ],
      { samsaraVehicleId: "other", unitNumber: "36", name: "Unit 36" },
      claimed,
    ),
    null,
    "a Samsara vehicle must not be reused on a claimed TMS truck",
  );

  const swappedTrucks = [
    { id: 36, unit_number: "36", samsara_vehicle_id: "sam-32", vin: "VIN32", plate: "OK32" },
    { id: 32, unit_number: "32", samsara_vehicle_id: "sam-36", vin: "VIN36", plate: "NY36" },
  ];
  const swappedVehicles = [
    { id: "sam-32", name: "32", vin: "VIN32", year: "", make: "", model: "", licensePlate: "OK32", city: "Bronx, NY", latitude: 40.8448, longitude: -73.8648 },
    { id: "sam-36", name: "36", vin: "VIN36", year: "", make: "", model: "", licensePlate: "NY36", city: "Oklahoma City, OK", latitude: 35.4676, longitude: -97.5164 },
  ];
  const rematchPreview = buildSamsaraTruckPreview(swappedVehicles, swappedTrucks);
  assert.equal(
    matchTruckForSamsara(swappedTrucks, {
      samsaraVehicleId: "sam-36",
      unitNumber: "36",
      name: "36",
      vin: "VIN36",
      licensePlate: "NY36",
    })?.matchBy,
    "unit_number",
    "VIN/plate copied onto the other TMS row must not keep the swap",
  );
  assert.equal(rematchPreview.find((row) => row.samsaraVehicleId === "sam-36")?.matchTruckId, 36);
  assert.equal(rematchPreview.find((row) => row.samsaraVehicleId === "sam-36")?.tmsUnit, "36");
  assert.equal(rematchPreview.find((row) => row.samsaraVehicleId === "sam-36")?.matchBy, "unit_number");
  assert.equal(rematchPreview.find((row) => row.samsaraVehicleId === "sam-36")?.city, "Oklahoma City, OK");
  assert.equal(rematchPreview.find((row) => row.samsaraVehicleId === "sam-32")?.matchTruckId, 32);
  assert.equal(rematchPreview.find((row) => row.samsaraVehicleId === "sam-32")?.tmsUnit, "32");
  assert.notEqual(rematchPreview.find((row) => row.samsaraVehicleId === "sam-32")?.city, "Oklahoma City, OK");
  assert.equal(rematchPreview[0]?.name, "32", "list order is 32 then 36 — pairing must not follow array index");
  const swappedGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "sam-32",
        name: "32",
        vin: "VIN32",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 40.8448, longitude: -73.8648, reverseGeo: { formattedLocation: "Bronx, NY" } },
      },
      {
        id: "sam-36",
        name: "36",
        vin: "VIN36",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 35.4676, longitude: -97.5164, reverseGeo: { formattedLocation: "Oklahoma City, OK" } },
      },
    ],
    trucks: swappedTrucks,
    loads: [],
  });
  assert.equal(swappedGps.find((row) => row.unitNumber === "36")?.address, "Bronx, NY");
  assert.equal(swappedGps.find((row) => row.unitNumber === "32")?.address, "Oklahoma City, OK");
  assert.equal(swappedGps.find((row) => row.unitNumber === "36")?.vehicleId, "sam-32");
  assert.equal(swappedGps.find((row) => row.unitNumber === "32")?.vehicleId, "sam-36");
  assert.equal(
    matchTruckForSamsaraLive(
      [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-28", vin: "VIN28AAA" }],
      { samsaraVehicleId: "sam-28", name: "38 in use", vin: "VIN28AAA" },
    )?.matchBy,
    "samsara_vehicle_id",
    "stored Samsara id wins even when the payload name looks like another unit",
  );
  assert.equal(
    matchTruckForSamsaraLive(
      [{ id: 99, unit_number: "99", samsara_vehicle_id: "", vin: "VIN28AAA" }],
      { samsaraVehicleId: "sam-28", name: "Kenworth 28", vin: "VIN28AAA" },
    )?.matchBy,
    "vin",
    "VIN can attach live GPS only when the TMS truck has no stored Samsara id",
  );
  assert.equal(
    matchTruckForSamsaraLive(
      [{ id: 32, unit_number: "32", samsara_vehicle_id: "sam-32" }],
      { samsaraVehicleId: "sam-36", name: "32" },
    ),
    null,
    "live GPS must not rematch a different Samsara id by unit name",
  );
  assert.equal(
    matchTruckForSamsaraLive(
      [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-28", vin: "" }],
      { samsaraVehicleId: "other-id", name: "Pete" },
    ),
    null,
    "a loose name must not attach live GPS to a TMS unit",
  );
  const orderedGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "sam-38",
        name: "38",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 29.76, longitude: -95.36, reverseGeo: { formattedLocation: "Houston, TX" } },
      },
      {
        id: "sam-28",
        name: "28",
        vin: "VIN28AAA",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 36.15, longitude: -95.99, reverseGeo: { formattedLocation: "Tulsa, OK" } },
      },
    ],
    trucks: [
      { id: 28, unit_number: "28", samsara_vehicle_id: "sam-28", vin: "VIN28AAA", plate: "" },
      { id: 36, unit_number: "36", samsara_vehicle_id: "sam-36", vin: "", plate: "" },
    ],
    loads: [],
  });
  assert.equal(orderedGps.find((row) => row.unitNumber === "28")?.address, "Tulsa, OK");
  assert.equal(orderedGps.find((row) => row.unitNumber === "28")?.vehicleId, "sam-28");
  assert.notEqual(orderedGps.find((row) => row.unitNumber === "28")?.address, "Houston, TX");
  assert.notEqual(orderedGps.find((row) => row.unitNumber === "36")?.address, "Houston, TX");
  const noLooseGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "unrelated",
        name: "Pete",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 29.76, longitude: -95.36, reverseGeo: { formattedLocation: "Houston, TX" } },
      },
    ],
    trucks: [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-28", vin: "", plate: "" }],
    loads: [],
  });
  assert.equal(noLooseGps.find((row) => row.unitNumber === "28"), undefined);

  const {
    closestTrucksToCity,
    extractCityFromQuestion,
    findCityCenter,
    formatClosestCityReply,
    isClosestCityQuestion,
  } = await import("../lib/city-coords-shared");
  assert.ok(findCityCenter("Oklahoma City"));
  assert.ok(findCityCenter("Des Moines, Iowa"), "Des Moines, Iowa must geocode from the public city table");
  assert.ok(findCityCenter("Des Moines"));
  assert.match(extractCityFromQuestion("what truck is closest to Oklahoma City?"), /Oklahoma City/i);
  assert.match(extractCityFromQuestion("What truck is closest to Des Moines, Iowa?"), /Des Moines/i);
  assert.equal(isClosestCityQuestion("What truck is closest to Des Moines, Iowa?"), true);
  assert.equal(isClosestCityQuestion("What driver is closest to Dodge city Kansas"), true);
  assert.equal(isClosestCityQuestion("What about truck 32 in Holcomb, Kansas?"), false);
  assert.match(extractCityFromQuestion("What driver is closest to Dodge city Kansas"), /Dodge city/i);
  const closestOkc = closestTrucksToCity(
    "what truck is closest to Oklahoma City?",
    [
      { unit: "32", lat: 40.8448, lng: -73.8648, hasPosition: true, address: "Bronx, NY", samsaraVehicleId: "sam-32" },
      { unit: "36", lat: 35.4676, lng: -97.5164, hasPosition: true, address: "Oklahoma City, OK", samsaraVehicleId: "sam-36" },
      { unit: "112", lat: null, lng: null, hasPosition: false, samsaraVehicleId: "uuid-112" },
    ],
    [],
  );
  assert.equal(closestOkc?.found, true);
  assert.equal(closestOkc?.ranked[0]?.unit, "36", "Samsara vehicle named 36 has Oklahoma City; 32 must not receive that ping");
  assert.notEqual(closestOkc?.ranked[0]?.unit, "32");
  assert.equal(closestOkc?.skippedNoPing, 1);
  const desMoinesFleet = [
    { unit: "32", lat: 37.9861, lng: -100.9957, hasPosition: true, address: "Holcomb, KS", samsaraVehicleId: "sam-32" },
    { unit: "41", lat: 40.5861, lng: -98.3884, hasPosition: true, address: "Hastings, NE", samsaraVehicleId: "sam-41" },
    { unit: "28", lat: 41.9778, lng: -91.6656, hasPosition: true, address: "Cedar Rapids, IA", samsaraVehicleId: "sam-28" },
    { unit: "36", lat: 41.8781, lng: -87.6298, hasPosition: true, address: "near Chicago, IL", samsaraVehicleId: "sam-36" },
    { unit: "26", lat: 41.8781, lng: -87.6298, hasPosition: true, address: "Chicago, IL", samsaraVehicleId: "sam-26" },
    { unit: "42", lat: 25.7617, lng: -80.1918, hasPosition: true, address: "Miami, FL", samsaraVehicleId: "sam-42" },
  ];
  const closestDesMoines = closestTrucksToCity(
    "What truck is closest to Des Moines, Iowa?",
    desMoinesFleet,
    [],
  );
  assert.equal(closestDesMoines?.found, true);
  assert.equal(closestDesMoines?.ranked[0]?.unit, "28", "Iowa GPS (28) must beat Holcomb / Chicago / Florida for Des Moines");
  assert.ok((closestDesMoines?.ranked[0]?.miles ?? 9999) < 200);
  assert.notEqual(closestDesMoines?.ranked[0]?.unit, "32");
  const desMoinesReply = formatClosestCityReply(closestDesMoines);
  assert.match(desMoinesReply, /28/);
  assert.match(desMoinesReply, /\d+ miles/i);
  assert.doesNotMatch(desMoinesReply, /no trucks ranked/i);
  const closestDodge = closestTrucksToCity("So what truck is closest to Dodge city Kansas?", desMoinesFleet, []);
  assert.equal(closestDodge?.ranked[0]?.unit, "32");
  assert.ok(Number.isFinite(closestDodge?.ranked[0]?.miles));
  const unknownCity = closestTrucksToCity("What truck is closest to Xyzzyville, ZZ?", desMoinesFleet, []);
  assert.equal(unknownCity?.found, false);
  assert.equal(unknownCity?.reason, "city_not_found");
  assert.equal(unknownCity?.ranked.length, 0);
  const unknownReply = formatClosestCityReply(unknownCity);
  assert.match(unknownReply, /could not place/i);
  assert.doesNotMatch(unknownReply, /no trucks ranked/i);
  const noGpsCity = closestTrucksToCity(
    "What truck is closest to Des Moines, Iowa?",
    [{ unit: "99", lat: null, lng: null, hasPosition: false, samsaraVehicleId: "sam-99" }],
    [],
  );
  assert.equal(noGpsCity?.found, true);
  assert.equal(noGpsCity?.reason, "no_gps");
  assert.match(formatClosestCityReply(noGpsCity), /GPS ping to rank/);
  assert.doesNotMatch(formatClosestCityReply(noGpsCity), /no trucks ranked/i);
  const no112 = samsaraUnmatchedUnitsWarning(
    [{ id: 8, unit_number: "112", samsara_vehicle_id: "112" }],
    [{ id: "v-pete", name: "Pete" }, { id: "v-dallas", name: "Dallas spare" }],
  );
  assert.match(no112, /none matched these TMS units: 112/);
  assert.match(no112, /Pete/);
  assert.match(no112, /Dallas spare/);
  const no36 = samsaraUnmatchedUnitsWarning(
    [{ id: 7, unit_number: "36", samsara_vehicle_id: "36" }],
    [{ id: "v-pete", name: "Pete" }, { id: "v-112", name: "112" }],
  );
  assert.match(no36, /none matched these TMS units: 36/);
  assert.match(no36, /Pete/);
  assert.match(no36, /112/);
  assert.deepEqual(samsaraReturnedNames([{ id: "v-pete", name: "Pete" }]), ["Pete"]);
  const previewTyped112 = buildSamsaraTruckPreview(
    [{ id: "uuid-real-112", name: "112", vin: "", year: "", make: "", model: "", licensePlate: "" }],
    [{ id: 8, unit_number: "112", samsara_vehicle_id: "112" }],
  );
  assert.equal(previewTyped112[0]?.action, "update");
  assert.equal(previewTyped112[0]?.samsaraVehicleId, "uuid-real-112");
  assert.equal(previewTyped112[0]?.matchTruckId, 8);
  const parsedVehicles = parseSamsaraVehicleRecords([
    { id: "veh-777", name: "Unit 777", vin: "VIN777AAA", year: "2022", make: "Freightliner", model: "Cascadia" },
    { id: "samsara-veh-112", name: "112", vin: "SHOULDNOTOVERWRITE" },
    { id: "veh-imp1", name: "IMP1", vin: "VINIMP1" },
  ]);
  assert.equal(parsedVehicles[0]?.vin, "VIN777AAA");
  queries.createTruck({
    unit_number: "IMP1",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
    samsara_vehicle_id: "veh-imp1",
  });
  const previewTrucks = buildSamsaraTruckPreview(
    parsedVehicles,
    queries.listTrucks().map((truck) => ({
      id: truck.id,
      unit_number: truck.unit_number,
      samsara_vehicle_id: truck.samsara_vehicle_id,
    })),
  );
  assert.equal(previewTrucks.find((row) => row.samsaraVehicleId === "veh-777")?.action, "create");
  assert.equal(previewTrucks.find((row) => row.samsaraVehicleId === "samsara-veh-112")?.action, "update");
  assert.ok(
    previewTrucks.find((row) => row.samsaraVehicleId === "samsara-veh-112")?.matchBy === "samsara_vehicle_id" ||
      previewTrucks.find((row) => row.samsaraVehicleId === "samsara-veh-112")?.matchBy === "unit_number",
  );
  assert.equal(previewTrucks.find((row) => row.samsaraVehicleId === "veh-imp1")?.action, "update");

  const { applyOrbcommTrailerImport, applySamsaraTruckImport } = await import("../lib/fleet-import");
  const samsaraFirstImport = applySamsaraTruckImport(previewTrucks);
  assert.ok(samsaraFirstImport.created >= 1, "new Samsara vehicle should create a truck");
  assert.ok(samsaraFirstImport.updated >= 1, "existing Samsara vehicle id or unit # should update");
  const trucksAfter = queries.listTrucks();
  const created777 = trucksAfter.find((truck) => truck.unit_number === "777");
  assert.ok(created777, "created truck uses Samsara unit #");
  assert.equal(created777?.samsara_vehicle_id, "veh-777");
  assert.equal(created777?.vin, "VIN777AAA");
  assert.equal(created777?.type, "sleeper", "new Samsara trucks default to Sleeper cab");
  const updated112 = trucksAfter.find((truck) => truck.samsara_vehicle_id === "samsara-veh-112");
  assert.ok(updated112);
  assert.equal(
    updated112?.vin,
    "SHOULDNOTOVERWRITE",
    "rematch writes the matched Samsara VIN onto that TMS unit",
  );
  const updatedImp1 = trucksAfter.find((truck) => truck.samsara_vehicle_id === "veh-imp1");
  assert.equal(updatedImp1?.vin, "VINIMP1");
  const samsaraSecondImport = applySamsaraTruckImport(previewTrucks);
  assert.equal(samsaraSecondImport.created, 0, "second Samsara import must not duplicate");
  assert.ok(samsaraSecondImport.updated >= 1);
  assert.equal(queries.listTrucks().filter((truck) => truck.samsara_vehicle_id === "veh-777").length, 1);

  const typedUnitId = queries.createTruck({
    unit_number: "SMOKE112",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
    samsara_vehicle_id: "112",
  });
  const fillTyped = applySamsaraTruckImport([
    {
      selectKey: "uuid-filled-112",
      samsaraVehicleId: "uuid-filled-112",
      unitNumber: "112",
      name: "112",
      vin: "VINFILL112",
      year: "",
      make: "",
      model: "",
      plate: "",
      city: "",
      latitude: null,
      longitude: null,
      tmsUnit: "SMOKE112",
      matchTruckId: typedUnitId,
      matchBy: "samsara_vehicle_id",
      action: "update",
    },
  ]);
  assert.ok(fillTyped.updated >= 1);
  assert.equal(
    queries.getTruck(typedUnitId)?.samsara_vehicle_id,
    "uuid-filled-112",
    "import must replace a typed unit with the real Samsara vehicle id",
  );

  const truck36Id = queries.createTruck({
    unit_number: "36",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
    samsara_vehicle_id: "sam-32",
    vin: "VIN32",
    plate: "OK32",
  });
  const truck32Id = queries.createTruck({
    unit_number: "32",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
    samsara_vehicle_id: "sam-36",
    vin: "VIN36",
    plate: "NY36",
  });
  queries.saveTruckGps(truck36Id, {
    latitude: 40.8448,
    longitude: -73.8648,
    address: "Bronx, NY",
    recordedAt: "2026-08-23T12:00:00Z",
    source: "samsara",
  });
  queries.saveTruckGps(truck32Id, {
    latitude: 35.4676,
    longitude: -97.5164,
    address: "Oklahoma City, OK",
    recordedAt: "2026-08-23T12:00:00Z",
    source: "samsara",
  });
  const liveSwapPreview = buildSamsaraTruckPreview(
    swappedVehicles,
    queries.listTrucks().map((truck) => ({
      id: truck.id,
      unit_number: truck.unit_number,
      samsara_vehicle_id: truck.samsara_vehicle_id,
      vin: truck.vin,
      plate: truck.plate,
    })),
  );
  const swapImport = applySamsaraTruckImport(liveSwapPreview);
  assert.ok(swapImport.updated >= 2);
  assert.equal(queries.getTruck(truck36Id)?.samsara_vehicle_id, "sam-36");
  assert.equal(queries.getTruck(truck36Id)?.gps_address, "Oklahoma City, OK");
  assert.equal(queries.getTruck(truck32Id)?.samsara_vehicle_id, "sam-32");
  assert.notEqual(queries.getTruck(truck32Id)?.gps_address, "Oklahoma City, OK");
  assert.equal(queries.getTruck(truck32Id)?.gps_address, "Bronx, NY");

  const stub28Id = queries.createTruck({
    unit_number: "28",
    type: "reefer",
    capacity_lbs: 45000,
    status: "in_use",
    samsara_vehicle_id: "",
  });
  const named28Preview = buildSamsaraTruckPreview(
    [
      {
        id: "sam-28",
        name: "2024 Freightliner 28",
        vin: "VIN28AAA",
        year: "2024",
        make: "Freightliner",
        model: "Cascadia",
        licensePlate: "",
      },
      {
        id: "sam-28-use",
        name: "28 in use",
        vin: "",
        year: "",
        make: "",
        model: "",
        licensePlate: "",
      },
    ],
    queries.listTrucks().map((truck) => ({
      id: truck.id,
      unit_number: truck.unit_number,
      samsara_vehicle_id: truck.samsara_vehicle_id,
      vin: truck.vin,
      plate: truck.plate,
    })),
  );
  assert.equal(named28Preview.find((row) => row.samsaraVehicleId === "sam-28")?.matchTruckId, stub28Id);
  assert.equal(named28Preview.find((row) => row.samsaraVehicleId === "sam-28")?.action, "update");
  assert.equal(named28Preview.find((row) => row.samsaraVehicleId === "sam-28")?.unitNumber, "28");
  const attach28 = applySamsaraTruckImport(named28Preview.filter((row) => row.samsaraVehicleId === "sam-28"));
  assert.equal(attach28.updated, 1);
  assert.equal(attach28.created, 0);
  assert.equal(queries.getTruck(stub28Id)?.samsara_vehicle_id, "sam-28");
  assert.equal(queries.listTrucks().filter((truck) => truck.unit_number === "28").length, 1);
  const skipInactiveImport = applySamsaraTruckImport([
    {
      selectKey: "sam-old-38",
      samsaraVehicleId: "sam-old-38",
      unitNumber: "38",
      name: "old 38",
      vin: "VIN38OLD",
      year: "",
      make: "",
      model: "",
      plate: "",
      city: "Houston, TX",
      latitude: 29.76,
      longitude: -95.36,
      tmsUnit: "28",
      matchTruckId: stub28Id,
      matchBy: "samsara_vehicle_id",
      action: "update",
    },
  ]);
  assert.equal(skipInactiveImport.updated, 0);
  assert.equal(skipInactiveImport.created, 0);
  assert.ok(skipInactiveImport.skipped >= 1);
  assert.equal(queries.getTruck(stub28Id)?.samsara_vehicle_id, "sam-28");
  assert.equal(queries.listTrucks().filter((truck) => truck.unit_number === "38").length, 0);
  const created28Preview = buildSamsaraTruckPreview(
    [{ id: "sam-new-40", name: "Kenworth 40", vin: "", year: "", make: "", model: "", licensePlate: "" }],
    queries.listTrucks().map((truck) => ({
      id: truck.id,
      unit_number: truck.unit_number,
      samsara_vehicle_id: truck.samsara_vehicle_id,
    })),
  );
  assert.equal(created28Preview[0]?.action, "create");
  assert.equal(created28Preview[0]?.unitNumber, "40");
  const create40 = applySamsaraTruckImport(created28Preview);
  assert.equal(create40.created, 1);
  assert.equal(queries.listTrucks().find((truck) => truck.unit_number === "40")?.samsara_vehicle_id, "sam-new-40");
  assert.match(
    samsaraUnmatchedUnitsWarning(
      [{ id: stub28Id, unit_number: "28", samsara_vehicle_id: "sam-28" }],
      [{ id: "v-pete", name: "Pete" }, { id: "v-112", name: "112" }],
    ),
    /none matched these TMS units: 28/,
  );
  assert.equal(
    samsaraOmittedVehiclesWarning(
      [
        { id: "sam-28", name: "2024 Freightliner 28", vin: "", year: "", make: "", model: "", licensePlate: "" },
        { id: "missing-id", name: "Spare 99", vin: "", year: "", make: "", model: "", licensePlate: "" },
      ],
      [{ samsaraVehicleId: "sam-28", unitNumber: "28", name: "2024 Freightliner 28" }],
    ),
    "Samsara returned vehicles that were not listed for import: Spare 99.",
  );
  const unioned = unionSamsaraVehicles(
    [
      { id: "a", name: "32", vin: "", year: "", make: "", model: "", licensePlate: "" },
      { id: "b", name: "36", vin: "", year: "", make: "", model: "", licensePlate: "" },
    ],
    [
      { id: "b", name: "36", vin: "", year: "", make: "", model: "", licensePlate: "" },
      { id: "c", name: "28 in use", vin: "", year: "", make: "", model: "", licensePlate: "" },
    ],
  );
  assert.equal(unioned.length, 3);
  assert.ok(unioned.some((vehicle) => vehicle.id === "c" && vehicle.name === "28 in use"));
  assert.equal(samsaraRecordIsActive({ id: "live", name: "28 in use" }), true);
  assert.equal(samsaraRecordIsActive({ id: "old", name: "old 38" }), false);
  assert.equal(samsaraRecordIsActive({ id: "old2", name: "38", isDeactivated: true }), false);
  assert.equal(samsaraRecordIsActive({ id: "old3", name: "38", deactivatedAtTime: "2024-01-01T00:00:00Z" }), false);
  assert.equal(samsaraRecordIsActive({ id: "old4", name: "38", status: "inactive" }), false);
  assert.equal(samsaraRecordIsActive({ id: "old5", name: "38", tags: [{ name: "Retired" }] }), false);
  assert.equal(
    samsaraRecordIsActive({ id: "old6", name: "38", attributes: [{ name: "Status", stringValues: ["Inactive"] }] }),
    false,
  );
  assert.equal(samsaraRecordIsActive({ id: "live-tag", name: "28 in use", tags: [{ name: "Region West" }] }), true);
  assert.equal(samsaraVehicleIsActive({ name: "38 (inactive)" }), false);
  assert.equal(samsaraVehicleIsActive({ name: "old 38", active: true }), false);
  const mixedActive = keepActiveSamsaraVehicles([
    { id: "sam-28", name: "28 in use", vin: "", year: "", make: "", model: "", licensePlate: "", active: true },
    { id: "sam-old-38", name: "old 38", vin: "", year: "", make: "", model: "", licensePlate: "", active: false },
    { id: "sam-38-inactive", name: "38", vin: "", year: "", make: "", model: "", licensePlate: "", notes: "Retired from fleet" },
  ]);
  assert.deepEqual(mixedActive.map((vehicle) => vehicle.id), ["sam-28"]);
  assert.deepEqual(
    keepActiveSamsaraVehicles([
      { id: "sam-old-38", name: "old 38", vin: "", year: "", make: "", model: "", licensePlate: "", active: false },
      { id: "stats-38", name: "38", vin: "", year: "", make: "", model: "", licensePlate: "", active: true },
      { id: "sam-28", name: "28 in use", vin: "", year: "", make: "", model: "", licensePlate: "", active: true },
    ]).map((vehicle) => vehicle.id),
    ["sam-28"],
    "a GPS-stats echo of an inactive unit must not stay as an active vehicle",
  );
  assert.deepEqual(
    unionActiveSamsaraVehicles(
      [{ id: "sam-old-38", name: "old 38", vin: "", year: "", make: "", model: "", licensePlate: "", active: false }],
      [
        { id: "stats-38", name: "38", vin: "", year: "", make: "", model: "", licensePlate: "" },
        { id: "sam-28", name: "28 in use", vin: "", year: "", make: "", model: "", licensePlate: "" },
      ],
    ).map((vehicle) => vehicle.id),
    ["sam-28"],
  );
  const mergedByIdOnly = mergeSamsaraGpsOntoVehicles(
    [{ id: "sam-28", name: "28 in use", vin: "", year: "", make: "", model: "", licensePlate: "", city: "" }],
    [{ id: "stats-38", name: "28 in use", gps: { latitude: 29.76, longitude: -95.36, reverseGeo: { formattedLocation: "Houston, TX" } } }],
  );
  assert.equal(mergedByIdOnly[0]?.city, "", "GPS must follow Samsara vehicle id, not a similar name");
  const inactivePreview = buildSamsaraTruckPreview(
    [
      { id: "sam-28", name: "28", vin: "", year: "", make: "", model: "", licensePlate: "" },
      { id: "sam-old-38", name: "old 38", vin: "VIN38OLD", year: "", make: "", model: "", licensePlate: "" },
    ],
    [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-old-38", vin: "", plate: "" }],
  );
  assert.equal(inactivePreview.length, 1);
  assert.equal(inactivePreview[0]?.samsaraVehicleId, "sam-28");
  assert.equal(inactivePreview[0]?.matchTruckId, 28);
  const inactiveGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "sam-old-38",
        name: "old 38",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 29.76, longitude: -95.36, reverseGeo: { formattedLocation: "Houston, TX" } },
      },
      {
        id: "sam-28",
        name: "28",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 36.15, longitude: -95.99, reverseGeo: { formattedLocation: "Tulsa, OK" } },
      },
    ],
    trucks: [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-old-38", vin: "", plate: "" }],
    loads: [],
    activeVehicleIds: new Set([canonicalFleetKey("sam-28")]),
  });
  assert.equal(
    inactiveGps.find((row) => row.unitNumber === "28"),
    undefined,
    "do not guess another active vehicle onto a truck whose stored Samsara id is inactive",
  );
  const echoGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "stats-38",
        name: "38",
        gps: { time: "2026-08-24T16:00:00Z", latitude: 29.76, longitude: -95.36, reverseGeo: { formattedLocation: "Houston, TX" } },
      },
    ],
    trucks: [
      { id: 28, unit_number: "28", samsara_vehicle_id: "sam-28", vin: "", plate: "" },
      { id: 38, unit_number: "38", samsara_vehicle_id: "stats-38", vin: "", plate: "" },
    ],
    loads: [],
    activeVehicleIds: new Set([canonicalFleetKey("sam-28")]),
    inactiveVehicleIds: new Set([canonicalFleetKey("sam-old-38")]),
    inactiveUnits: new Set(["38"]),
  });
  assert.equal(echoGps.find((row) => row.unitNumber === "28"), undefined);
  assert.equal(echoGps.find((row) => row.unitNumber === "38"), undefined, "inactive unit GPS must not land on a TMS truck");

  const savedTokenForImport = process.env.SAMSARA_API_TOKEN;
  delete process.env.SAMSARA_API_TOKEN;
  const noToken = await samsara.listSamsaraVehicles();
  assert.equal(noToken.ok, false);
  if (!noToken.ok) {
    assert.equal(noToken.error, SAMSARA_TOKEN_MISSING_MESSAGE);
    assert.doesNotMatch(noToken.error, /Bearer |sk-|tok_/);
  }
  process.env.SAMSARA_API_TOKEN = "tok_smoke_not_a_real_secret";
  const importFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.match(url, /\/fleet\/vehicles/);
    assert.doesNotMatch(url, /tok_smoke_not_a_real_secret/);
    assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, "Bearer tok_smoke_not_a_real_secret");
    return Response.json({
      data: [
        { id: "veh-888", name: "888", vin: "VIN888" },
        { id: "veh-old", name: "old 38", isDeactivated: true },
        { id: "veh-retired", name: "99", notes: "Retired from fleet" },
      ],
      pagination: { hasNextPage: false },
    });
  }) as typeof fetch;
  try {
    const listed = await samsara.listSamsaraVehicles();
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.vehicles.length, 1);
      assert.equal(listed.vehicles[0]?.id, "veh-888");
      assert.equal(listed.vehicles[0]?.vin, "VIN888");
      assert.ok(!listed.vehicles.some((vehicle) => vehicle.id === "veh-old" || vehicle.id === "veh-retired"));
    }
  } finally {
    globalThis.fetch = importFetch;
    if (savedTokenForImport == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = savedTokenForImport;
  }

  process.env.SAMSARA_API_TOKEN = "tok_smoke_not_a_real_secret";
  const statsOnlyFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/fleet/vehicles/stats")) {
      return Response.json({
        data: [
          { id: "veh-888", name: "888" },
          { id: "veh-28", name: "28 in use" },
          { id: "veh-old-38", name: "old 38" },
        ],
        pagination: { hasNextPage: false },
      });
    }
    return Response.json({
      data: [{ id: "veh-888", name: "888", vin: "VIN888" }],
      pagination: { hasNextPage: false },
    });
  }) as typeof fetch;
  try {
    const listedWithStats = await samsara.listSamsaraVehicles();
    assert.equal(listedWithStats.ok, true);
    if (listedWithStats.ok) {
      assert.equal(listedWithStats.vehicles.length, 2);
      assert.ok(listedWithStats.vehicles.some((vehicle) => vehicle.id === "veh-28" && vehicle.name === "28 in use"));
      assert.ok(!listedWithStats.vehicles.some((vehicle) => vehicle.id === "veh-old-38"));
    }
  } finally {
    globalThis.fetch = statsOnlyFetch;
    if (savedTokenForImport == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = savedTokenForImport;
  }

  const orbcommCsv = parseOrbcommFleetText(
    "Asset ID,Trailer #,VIN,Type\norb-9001,TR-9001,1TRAILERVIN,Reefer\norbcomm-tr-7742,TR-7742,UPDATEDTRAILERVIN,Reefer\n",
  );
  assert.equal(orbcommCsv[0]?.assetId, "orb-9001");
  assert.equal(orbcommCsv[0]?.unitNumber, "TR-9001");
  const previewTrailers = buildOrbcommTrailerPreview(orbcommCsv, [
    { id: 42, unit_number: "TR-7742", orbcomm_asset_id: "orbcomm-tr-7742" },
  ]);
  assert.equal(previewTrailers.find((row) => row.orbcommAssetId === "orb-9001")?.action, "create");
  assert.equal(previewTrailers.find((row) => row.orbcommAssetId === "orbcomm-tr-7742")?.action, "update");
  const trailerImport = applyOrbcommTrailerImport(previewTrailers);
  assert.ok(trailerImport.created >= 1);
  assert.ok(trailerImport.updated >= 1);
  const trailersAfter = queries.listTrailers();
  const createdTrailer = trailersAfter.find((trailer) => trailer.unit_number === "TR-9001");
  assert.ok(createdTrailer);
  assert.equal(createdTrailer?.orbcomm_asset_id, "orb-9001");
  const updatedTrailer = trailersAfter.find((trailer) => trailer.orbcomm_asset_id === "orbcomm-tr-7742");
  assert.ok(updatedTrailer);
  assert.equal(updatedTrailer?.vin, "UPDATEDTRAILERVIN");
  const trailerAgain = applyOrbcommTrailerImport(previewTrailers);
  assert.equal(trailerAgain.created, 0, "second ORBCOMM import must not duplicate");
  assert.equal(queries.listTrailers().filter((trailer) => trailer.unit_number === "TR-9001").length, 1);

  const locationReport = parseOrbcommFleetText(
    [
      "Location Tracking Report",
      "Generated: 24-Aug-2026 12:34:33",
      "",
      "Trailer #,Asset ID,VIN,Latitude,Longitude,City",
      "TR-2401,orb-2401,1LOCVIN,35.4676,-97.5164,Oklahoma City",
    ].join("\n"),
  );
  assert.equal(locationReport.length, 1);
  assert.equal(locationReport[0]?.unitNumber, "TR-2401");
  assert.equal(locationReport[0]?.assetId, "orb-2401");
  assert.equal(locationReport[0]?.vin, "1LOCVIN");
  assert.equal(locationReport[0]?.city, "Oklahoma City");
  assert.equal(locationReport[0]?.latitude, 35.4676);
  const locationPreview = buildOrbcommTrailerPreview(locationReport, []);
  assert.equal(locationPreview[0]?.city, "Oklahoma City");
  const locationImport = applyOrbcommTrailerImport(locationPreview);
  assert.equal(locationImport.created, 1);
  const importedLocation = queries.listTrailers().find((trailer) => trailer.unit_number === "TR-2401");
  assert.equal(importedLocation?.orbcomm_asset_id, "orb-2401");
  assert.equal(importedLocation?.gps_address ?? "", "");
  assert.equal(importedLocation?.gps_source ?? "", "");
  assert.equal(importedLocation?.gps_latitude ?? null, null);

  const deviceReport = parseOrbcommFleetText(
    "Device ID,Vehicle,Lat,Lng,Address\ndev-88,TR-88,40.8448,-73.8648,\"Bronx, NY\"\n",
  );
  assert.equal(deviceReport[0]?.assetId, "dev-88");
  assert.equal(deviceReport[0]?.unitNumber, "TR-88");
  assert.equal(deviceReport[0]?.city, "Bronx, NY");
  const mobileReport = parseOrbcommFleetText(
    "Mobile ID,Asset Name,VIN\nmob-12,TR-12,1MOBILEVIN\n",
  );
  assert.equal(mobileReport[0]?.assetId, "mob-12");
  assert.equal(mobileReport[0]?.unitNumber, "TR-12");
  const portalTsv = parseOrbcommFleetText(
    [
      "Location Tracking Report_24-Aug-2026_12-34-33",
      "Report Generated: 24-Aug-2026 12:34:33",
      ["Vehicle Name", "Device ID", "VIN", "Last Latitude", "Last Longitude", "Last Location"].join("\t"),
      ["TR-5521", "orb-5521", "1REELVIN", "32.7791", "-96.8002", "Dallas, TX"].join("\t"),
    ].join("\n"),
  );
  assert.equal(portalTsv[0]?.unitNumber, "TR-5521");
  assert.equal(portalTsv[0]?.assetId, "orb-5521");
  assert.equal(portalTsv[0]?.vin, "1REELVIN");
  assert.equal(portalTsv[0]?.city, "Dallas, TX");
  assert.equal(portalTsv[0]?.latitude, 32.7791);
  assert.equal(portalTsv[0]?.longitude, -96.8002);

  const portalUnits = [
    "MS2201",
    "MS1518",
    "MS1527",
    "MS1533",
    "MS1540",
    "MS1602",
    "MS1611",
    "MS1704",
    "MS1808",
    "MS1901",
    "MS2003",
    "MS2012",
    "MS2106",
    "MS2119",
    "MS2304",
    "MS2310",
    "MS2408",
    "MS2501",
    "JFI4215",
  ];
  const exactPortal = parseOrbcommFleetText(
    [
      "",
      "Account: MS Express / Report: Location Tracking Report",
      "Created on: 24-Aug-2026 12:34:33",
      "Time Zone: US/Central",
      "",
      "Asset ID,Device Serial Number,Account,Parent Account,Message Time,Asset Type,Product Type,Latitude,Longitude,Address,City,State,Country,Moving,Speed,Note,Tractor ID",
      ...portalUnits.map(
        (unit, index) =>
          `${unit},GSSC${String(index + 1).padStart(4, "0")},MS Express,,2026-08-24 12:30:00,${index === 0 ? "Reefer" : "Other"},GT,35.46,-97.51,Yard,Oklahoma City,OK,USA,No,0,Unit not reporting,`,
      ),
    ].join("\n"),
  );
  assert.equal(exactPortal.length, 19, "Location Tracking Report must keep every asset after banner rows");
  assert.equal(exactPortal[0]?.unitNumber, "MS2201");
  assert.equal(exactPortal[0]?.assetId, "GSSC0001");
  assert.equal(exactPortal[0]?.type, "Reefer");
  assert.equal(exactPortal[0]?.city, "Oklahoma City");
  assert.equal(exactPortal[0]?.recordedAt, "2026-08-24 12:30:00");
  assert.equal(exactPortal[0]?.note, "Unit not reporting");
  assert.equal(exactPortal.at(-1)?.unitNumber, "JFI4215");
  assert.equal(exactPortal.at(-1)?.assetId, "GSSC0019");
  const exactPreview = buildOrbcommTrailerPreview(exactPortal, [
    { id: 900, unit_number: "JFI4215", orbcomm_asset_id: "old-serial" },
    { id: 800, unit_number: "MS2201", orbcomm_asset_id: "" },
  ]);
  assert.equal(exactPreview.length, 19);
  assert.equal(exactPreview.find((row) => row.unitNumber === "MS2201")?.matchBy, "unit_number");
  assert.equal(exactPreview.find((row) => row.unitNumber === "JFI4215")?.action, "update");
  assert.equal(exactPreview.find((row) => row.unitNumber === "MS1518")?.action, "create");
  const exactImport = applyOrbcommTrailerImport(exactPreview);
  assert.equal(exactImport.created, 19);
  const ms2201 = queries.listTrailers().find((trailer) => trailer.unit_number === "MS2201");
  assert.equal(ms2201?.orbcomm_asset_id, "GSSC0001");
  assert.equal(ms2201?.type, "reefer");
  assert.equal(ms2201?.gps_address ?? "", "", "roster import must not persist snapshot GPS");
  assert.equal(ms2201?.gps_latitude ?? null, null);
  assert.equal(ms2201?.gps_longitude ?? null, null);
  assert.equal(ms2201?.gps_recorded_at ?? "", "");
  assert.doesNotMatch(ms2201?.notes ?? "", /Unit not reporting/);
  const jfi = queries.listTrailers().find((trailer) => trailer.unit_number === "JFI4215");
  assert.equal(jfi?.orbcomm_asset_id, "GSSC0019");
  assert.equal(jfi?.type, "other");
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import.ts"), "utf8"), /Snapshot city\/GPS stay preview-only/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/fleet-import.ts"), "utf8"), /saveTrailerGps/);

  const ifta = await import("../lib/integrations/ifta");
  delete process.env.SAMSARA_API_TOKEN;
  const demoRows = ifta.buildDemoIftaBreakdown("Nashville, TN", "Dallas, TX");
  assert.ok(demoRows.some((row) => row.jurisdiction === "TN"));
  assert.ok(demoRows.some((row) => row.jurisdiction === "TX"));
  const msAl = ifta.buildDemoIftaBreakdown("Jackson, MS", "Birmingham, AL");
  assert.ok(msAl.some((row) => row.jurisdiction === "MS"));
  assert.ok(msAl.some((row) => row.jurisdiction === "AL"));
  assert.equal(ifta.metersToMiles(1609.344), 1);
  const mappedIfta = ifta.mapIftaVehicleReports({
    vehicleId: "281474977075805",
    vehicleReports: [
      {
        vehicle: { id: "281474977075805" },
        jurisdictions: [
          { jurisdiction: "TN", taxableMeters: 160934.4, totalMeters: 160934.4 },
          { jurisdiction: "AR", taxableMeters: 80467.2, totalMeters: 80467.2 },
        ],
      },
    ],
  });
  assert.equal(mappedIfta.find((row) => row.jurisdiction === "TN")?.miles, 100);
  const parsedCsv = ifta.parseIftaDetailCsv(
    "device_id,jurisdiction,distance_meters\n1,TN,16093.44\n1,TX,32186.88\n",
  );
  assert.ok(parsedCsv.some((row) => row.jurisdiction === "TX" && row.miles === 20));

  const demoIfta = await ifta.refreshIftaForLoad(reeferLoad.id);
  assert.equal(demoIfta.source, "demo");
  assert.ok(demoIfta.rows.some((row) => row.jurisdiction === "TN"));
  assert.ok(demoIfta.rows.some((row) => row.jurisdiction === "TX"));
  assert.ok(demoIfta.total_miles > 0);
  assert.ok(demoIfta.vehicle_id);
  assert.ok(demoIfta.generated_at);
  assert.ok(demoIfta.attachment_id);
  const { listAttachments: listLoadFiles } = await import("../lib/files");
  assert.ok(
    listLoadFiles(reeferLoad.id).some((file) => file.kind === "ifta" && file.original_name.includes("IFTA")),
  );

  const openForIfta = queries.listLoads({ status: "available" })[0];
  assert.ok(openForIfta);
  await assert.rejects(() => ifta.refreshIftaForLoad(openForIfta.id), /in transit or delivered/i);

  const { usStateForPoint } = await import("../lib/us-state-lookup");
  assert.equal(usStateForPoint(40.7128, -74.006)?.code, "NY");
  assert.equal(usStateForPoint(40.7357, -74.1724)?.code, "NJ");
  assert.equal(usStateForPoint(41.8781, -87.6298)?.code, "IL");
  assert.equal(usStateForPoint(39.7392, -104.9903)?.code, "CO");
  assert.equal(usStateForPoint(32.7767, -96.797)?.code, "TX");
  assert.equal(usStateForPoint(31.7619, -106.485)?.code, "TX", "El Paso is Texas, not New Mexico");
  assert.equal(usStateForPoint(31.796, -106.58)?.code, "NM", "Sunland Park stays New Mexico");
  assert.equal(usStateForPoint(32.3199, -106.7637)?.code, "NM");
  assert.equal(usStateForPoint(35.222, -101.8313)?.code, "TX", "Amarillo is Texas, not Oklahoma");
  assert.equal(usStateForPoint(36.6828, -101.4816)?.code, "OK");
  assert.equal(usStateForPoint(35.4676, -97.5164)?.code, "OK");
  assert.equal(usStateForPoint(33.9137, -98.4934)?.code, "TX");
  assert.equal(usStateForPoint(40.5861, -98.3884)?.code, "NE");
  assert.equal(usStateForPoint(40.8136, -96.7026)?.code, "NE");
  assert.equal(usStateForPoint(41.02, -96.35)?.code, "NE");
  assert.equal(usStateForPoint(41.2565, -95.9345)?.code, "NE");
  assert.equal(usStateForPoint(41.228, -95.92)?.code, "NE");
  assert.equal(usStateForPoint(41.228, -95.84)?.code, "IA");
  assert.equal(usStateForPoint(41.2619, -95.8608)?.code, "IA");
  assert.equal(usStateForPoint(41.653, -95.327)?.code, "IA");
  const routing = await import("../lib/routing");
  const sharedRouting = await import("../lib/routing-shared");
  const airHastingsHarlan = routing.estimateStateMiles(
    [
      { lat: 40.5861, lng: -98.3884 },
      { lat: 41.653, lng: -95.327 },
    ],
    210.3,
  );
  assert.deepEqual(airHastingsHarlan, [], "two-stop air hop cannot split IFTA states");
  const corridor = [
    { lat: 40.586, lng: -98.392 },
    { lat: 40.925, lng: -98.342 },
    { lat: 40.82, lng: -97.6 },
    { lat: 40.813, lng: -96.703 },
    { lat: 40.91, lng: -96.53 },
    { lat: 41.04, lng: -96.37 },
    { lat: 41.14, lng: -96.24 },
    { lat: 41.23, lng: -96.05 },
    { lat: 41.256, lng: -95.935 },
    { lat: 41.228, lng: -95.9 },
    { lat: 41.228, lng: -95.852 },
    { lat: 41.24, lng: -95.82 },
    { lat: 41.35, lng: -95.7 },
    { lat: 41.5, lng: -95.5 },
    { lat: 41.653, lng: -95.327 },
  ];
  const denseCorridor: Array<{ lat: number; lng: number }> = [];
  for (let i = 1; i < corridor.length; i += 1) {
    const a = corridor[i - 1];
    const b = corridor[i];
    for (let step = 0; step < 8; step += 1) {
      const t = step / 8;
      denseCorridor.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  denseCorridor.push(corridor[corridor.length - 1]);
  const split = routing.estimateStateMiles(denseCorridor, 210.3);
  const neMiles = split.find((row) => row.state === "NE")?.miles ?? 0;
  const iaMiles = split.find((row) => row.state === "IA")?.miles ?? 0;
  assert.ok(neMiles >= 150 && neMiles <= 170, `Hastings→Harlan NE should be ~155–160, got ${neMiles}`);
  assert.ok(iaMiles >= 40 && iaMiles <= 60, `Hastings→Harlan IA should be ~50, got ${iaMiles}`);
  assert.ok(Math.abs(neMiles + iaMiles - 210.3) < 0.2);
  const encodedGuide = routing.encodePolyline(denseCorridor);
  const fromStored = sharedRouting.routeGuideFromLoad(
    {
      route_miles: 210.3,
      route_source: "google",
      route_leg_miles: "[210.3]",
      route_polyline: encodedGuide,
      route_state_miles: JSON.stringify([
        { state: "NE", name: "Nebraska", miles: 109.4 },
        { state: "IA", name: "Iowa", miles: 100.9 },
      ]),
    },
    { stopCount: 2 },
  );
  assert.equal(fromStored.totalMiles, 210.3);
  const storedNe = fromStored.states.find((row) => row.state === "NE")?.miles ?? 0;
  assert.ok(storedNe >= 150 && storedNe <= 170, "stored 109 NE leftover must be replaced from the driving polyline");
  const elPasoCorridor = [
    { lat: 40.586, lng: -98.392 },
    { lat: 40.09, lng: -98.52 },
    { lat: 39.78, lng: -98.79 },
    { lat: 38.36, lng: -98.77 },
    { lat: 37.69, lng: -97.33 },
    { lat: 36.75, lng: -97.4 },
    { lat: 35.47, lng: -97.52 },
    { lat: 35.4, lng: -99.4 },
    { lat: 35.22, lng: -101.83 },
    { lat: 35.17, lng: -103.73 },
    { lat: 34.94, lng: -104.68 },
    { lat: 33.5, lng: -106.0 },
    { lat: 32.32, lng: -106.76 },
    { lat: 31.76, lng: -106.49 },
  ];
  const denseElPaso: Array<{ lat: number; lng: number }> = [];
  for (let i = 1; i < elPasoCorridor.length; i += 1) {
    const a = elPasoCorridor[i - 1];
    const b = elPasoCorridor[i];
    for (let step = 0; step < 8; step += 1) {
      const t = step / 8;
      denseElPaso.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  denseElPaso.push(elPasoCorridor[elPasoCorridor.length - 1]);
  const elPasoSplit = routing.estimateStateMiles(denseElPaso, 885);
  const elPasoStates = elPasoSplit.map((row) => row.state);
  assert.ok(elPasoStates.includes("TX"), `Hastings→El Paso must include Texas, got ${elPasoStates.join(",")}`);
  assert.ok(elPasoStates.includes("NE"));
  assert.ok((elPasoSplit.find((row) => row.state === "TX")?.miles ?? 0) > 0);
  const leftoverNoTx = sharedRouting.routeGuideFromLoad(
    {
      route_miles: 885,
      route_source: "google",
      route_leg_miles: "[885]",
      route_polyline: routing.encodePolyline(denseElPaso),
      route_state_miles: JSON.stringify([
        { state: "NM", name: "New Mexico", miles: 389.7 },
        { state: "KS", name: "Kansas", miles: 272.8 },
        { state: "OK", name: "Oklahoma", miles: 138.4 },
        { state: "NE", name: "Nebraska", miles: 84.1 },
      ]),
    },
    { stopCount: 2 },
  );
  assert.ok(
    leftoverNoTx.states.some((row) => row.state === "TX"),
    "stored IFTA missing TX must be replaced from the driving polyline",
  );
  const encoded = routing.encodePolyline([
    { lat: 40.71, lng: -74.0 },
    { lat: 41.88, lng: -87.63 },
  ]);
  const decoded = routing.decodePolyline(encoded);
  assert.equal(decoded.length, 2);
  assert.ok(Math.abs((decoded[0]?.lat ?? 0) - 40.71) < 0.001);
  const { ensureDefaultStops: ensureRouteStops } = await import("../lib/stops");
  const routeLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "New York, NY",
    destination: "Chicago, IL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Route freight",
    rate: 2100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "RC-ROUTE",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "assigned",
    truck_id: null,
    driver_id: null,
  });
  ensureRouteStops(routeLoadId);
  const savedMapsForRoute = process.env.GOOGLE_MAPS_API_KEY;
  const savedPlacesForRoute = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "";
  process.env.GOOGLE_PLACES_API_KEY = "";
  let googleCalls = 0;
  const prevRouteFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    googleCalls += 1;
    throw new Error("Google should not be called without a key");
  };
  getDb()
    .prepare("UPDATE loads SET route_miles = 880.7, route_source = '' WHERE id = ?")
    .run(routeLoadId);
  const missingRoute = await routing.refreshLoadRoute(routeLoadId);
  assert.equal(missingRoute.ok, true);
  assert.equal(missingRoute.configured, false);
  assert.equal(googleCalls, 0);
  assert.equal(queries.getLoad(routeLoadId)?.route_miles ?? null, null);
  getDb()
    .prepare("UPDATE loads SET route_miles = 880.7, route_source = 'google', route_polyline = '', route_leg_miles = '' WHERE id = ?")
    .run(routeLoadId);
  const fakeGoogleAir = await routing.refreshLoadRoute(routeLoadId);
  assert.equal(fakeGoogleAir.configured, false);
  assert.equal(queries.getLoad(routeLoadId)?.route_miles ?? null, null);
  getDb()
    .prepare("UPDATE loads SET route_miles = 1369.2, route_source = 'google', route_polyline = '', route_leg_miles = ? WHERE id = ?")
    .run("[1369.2]", routeLoadId);
  const leftoverLabeledGoogle = await routing.refreshLoadRoute(routeLoadId);
  assert.equal(leftoverLabeledGoogle.configured, false);
  assert.equal(queries.getLoad(routeLoadId)?.route_miles ?? null, null);
  assert.equal(queries.getLoad(routeLoadId)?.route_source, "");
  routing.saveManualRouteMiles(routeLoadId, 12.3);
  assert.equal(queries.getLoad(routeLoadId)?.route_miles, 12.3);
  assert.equal(queries.getLoad(routeLoadId)?.route_source, "manual");
  process.env.GOOGLE_MAPS_API_KEY = "test-not-a-real-maps-key";
  globalThis.fetch = async (input) => {
    googleCalls += 1;
    const url = new URL(String(input));
    assert.equal(url.hostname, "maps.googleapis.com");
    assert.match(url.pathname, /\/maps\/api\/directions\//);
    assert.doesNotMatch(url.hostname, /maps\.google\.com/);
    const points = routing.encodePolyline(
      Array.from({ length: 24 }, (_, index) => ({
        lat: 40.71 + index * 0.05,
        lng: -74.0 - index * 0.6,
      })),
    );
    return new Response(
      JSON.stringify({
        status: "OK",
        routes: [
          {
            overview_polyline: { points },
            legs: [{ distance: { value: 1287475 } }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const routed = await routing.refreshLoadRoute(routeLoadId);
  assert.equal(routed.ok, true);
  assert.equal(routed.totalMiles, 800);
  assert.equal(routed.source, "google");
  assert.ok(routed.states.some((row) => ["NY", "PA", "OH", "IN", "IL"].includes(row.state)));
  const storedRoute = queries.getLoad(routeLoadId);
  assert.equal(storedRoute?.route_miles, 800);
  assert.equal(storedRoute?.route_source, "google");
  assert.match(storedRoute?.route_state_miles ?? "", /NY|PA|OH|IN|IL/);
  assert.match(storedRoute?.route_leg_miles ?? "", /800/);
  assert.ok(String(storedRoute?.route_polyline ?? "").trim(), "Google Directions should store the route polyline");
  const { milesForStopGap, officialEmptyMiles, routeGuideFromLoad } = await import("../lib/routing-shared");
  assert.equal(milesForStopGap(0, 2, { totalMiles: 12.3, legMiles: [] }), 12.3);
  assert.equal(routeGuideFromLoad({ route_miles: 880.7, route_source: "" }).totalMiles, null);
  assert.equal(routeGuideFromLoad({ route_miles: 880.7, route_source: "google" }).totalMiles, null);
  assert.equal(
    routeGuideFromLoad({ route_miles: 880.7, route_source: "google", route_leg_miles: "[880.7]" }).totalMiles,
    null,
  );
  const drivingPoly = routing.encodePolyline(
    Array.from({ length: 24 }, (_, index) => ({
      lat: 40.71 + index * 0.05,
      lng: -74.0 - index * 0.6,
    })),
  );
  const airStopPoly = routing.encodePolyline([
    { lat: 40.59, lng: -98.39 },
    { lat: 40.65, lng: -73.99 },
    { lat: 40.85, lng: -73.91 },
    { lat: 41.08, lng: -74.15 },
    { lat: 40.56, lng: -74.3 },
    { lat: 40.67, lng: -74.11 },
  ]);
  assert.equal(
    routeGuideFromLoad({
      route_miles: 800,
      route_source: "google",
      route_leg_miles: "[800]",
      route_polyline: drivingPoly,
    }).totalMiles,
    800,
  );
  assert.equal(
    routeGuideFromLoad(
      {
        route_miles: 1539.3,
        route_source: "google",
        route_leg_miles: "[1200,80,70,90,99.3]",
        route_polyline: airStopPoly,
      },
      { stopCount: 6 },
    ).totalMiles,
    null,
  );
  assert.equal(
    routeGuideFromLoad(
      {
        route_miles: 1369.2,
        route_source: "google",
        route_leg_miles: "[1369.2]",
        route_polyline: drivingPoly,
      },
      { stopCount: 6 },
    ).totalMiles,
    null,
  );
  assert.equal(routeGuideFromLoad({ route_miles: 12.3, route_source: "manual" }).totalMiles, 12.3);
  assert.equal(officialEmptyMiles(880.7, ""), null);
  assert.equal(officialEmptyMiles(158, "google"), 158);
  assert.equal(officialEmptyMiles(0, ""), 0);
  assert.equal(milesForStopGap(0, 3, { totalMiles: 12.3, legMiles: [] }), null);
  assert.equal(milesForStopGap(1, 3, { totalMiles: 12.3, legMiles: [8, 4.3] }), 4.3);
  const officialIfta = queries.getIftaReport(reeferLoad.id);
  assert.ok(officialIfta);
  assert.notEqual(officialIfta.source, "google");
  const { replaceStops: replaceRouteStops } = await import("../lib/stops");
  const multiRouteLoadId = queries.createLoad({
    customer_id: customerId,
    load_number: "1006150-MILES",
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Kosher frozen",
    rate: 4500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 26,
    trailer_number: "",
    status: "assigned",
    truck_id: null,
    driver_id: null,
  });
  replaceRouteStops(multiRouteLoadId, [
    { kind: "pickup", name: "Nebraska Cold Storage Inc", city: "Hastings", state: "NE" },
    { kind: "delivery", name: "Springfield Group Inc - Kosher", street: "5600 1st ave", city: "Brooklyn", state: "NY", zip: "11220" },
    { kind: "delivery", name: "Westside Foods - Kosher", city: "Bronx", state: "NJ" },
    { kind: "delivery", name: "Chef Kingdom", street: "1 Alpine Ct", city: "Chestnut Ridge", state: "NY" },
    { kind: "delivery", name: "Wakefern-Keasbey", street: "5000 Riverside dr", city: "Keasbey", state: "NJ", zip: "08832" },
    { kind: "delivery", name: "Kayco", street: "72 New Hook Rd", city: "Bayonne", state: "NJ", zip: "07002" },
  ]);
  getDb()
    .prepare("UPDATE loads SET route_miles = 1539.3, route_source = 'google', route_polyline = ?, route_leg_miles = ? WHERE id = ?")
    .run(airStopPoly, "[1200,80,70,90,99.3]", multiRouteLoadId);
  assert.equal(routeGuideFromLoad(queries.getLoad(multiRouteLoadId)!, { stopCount: 6 }).totalMiles, null);
  globalThis.fetch = async (input) => {
    googleCalls += 1;
    const url = new URL(String(input));
    assert.equal(url.hostname, "maps.googleapis.com");
    assert.match(url.pathname, /\/maps\/api\/directions\//);
    assert.doesNotMatch(url.href, /maps\.google\.com/);
    const waypoints = url.searchParams.get("waypoints") ?? "";
    assert.match(waypoints, /Brooklyn|Bronx|Chestnut Ridge|Keasbey/);
    const hops = [
      { lat: 40.59, lng: -98.39 },
      { lat: 40.65, lng: -73.99 },
      { lat: 40.85, lng: -73.91 },
      { lat: 41.08, lng: -74.15 },
      { lat: 40.56, lng: -74.3 },
      { lat: 40.67, lng: -74.11 },
    ];
    const points = routing.encodePolyline(
      hops.flatMap((stop, index) => {
        if (index === hops.length - 1) return [stop];
        const next = hops[index + 1];
        return Array.from({ length: 8 }, (_, step) => ({
          lat: stop.lat + ((next.lat - stop.lat) * step) / 8,
          lng: stop.lng + ((next.lng - stop.lng) * step) / 8,
        }));
      }),
    );
    return new Response(
      JSON.stringify({
        status: "OK",
        routes: [
          {
            overview_polyline: { points },
            legs: [
              { distance: { value: 2100000 } },
              { distance: { value: 90000 } },
              { distance: { value: 80000 } },
              { distance: { value: 70000 } },
              { distance: { value: 66203 } },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const multiRouted = await routing.refreshLoadRoute(multiRouteLoadId);
  assert.equal(multiRouted.ok, true);
  assert.equal(multiRouted.source, "google");
  assert.ok((multiRouted.totalMiles ?? 0) > 1369.2, "driving miles must beat leftover air total");
  const storedMulti = queries.getLoad(multiRouteLoadId);
  const multiGuide = routeGuideFromLoad(storedMulti!, { stopCount: 6 });
  assert.equal(multiGuide.source, "google");
  assert.equal(multiGuide.legMiles.length, 5);
  assert.equal(multiGuide.totalMiles, storedMulti?.route_miles);
  assert.notEqual(multiGuide.totalMiles, 1539.3);
  assert.ok(String(storedMulti?.route_polyline ?? "").trim());
  assert.doesNotMatch(String(storedMulti?.route_leg_miles ?? ""), /1539\.3/);
  globalThis.fetch = prevRouteFetch;
  if (savedMapsForRoute == null) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = savedMapsForRoute;
  if (savedPlacesForRoute == null) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = savedPlacesForRoute;

  process.env.SAMSARA_API_TOKEN = "test-not-a-real-token";
  const beforeIftaFail = queries.getIftaReport(reeferLoad.id);
  const iftaFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(() => ifta.refreshIftaForLoad(reeferLoad.id), /401/);
    const afterIftaFail = queries.getIftaReport(reeferLoad.id);
    assert.equal(afterIftaFail?.source, "demo", "401 must not replace a report with fake live IFTA");
    assert.equal(afterIftaFail?.generated_at, beforeIftaFail?.generated_at);
  } finally {
    globalThis.fetch = iftaFetch;
    if (previousSamsara == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = previousSamsara;
  }

  queries.updateLoadStatus(loadId, "delivered");
  const delivered = queries.getLoad(loadId);
  assert.ok(delivered);
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.truck_id, truckId);
  assert.equal(queries.getTruck(truckId)?.status, "available");
  assert.equal(queries.getDriver(otherDriverId)?.status, "available");

  const boardHit = queries
    .listLoads({ status: "delivered", q: "Smoke Test Shipper" })
    .some((load) => load.id === loadId);
  assert.equal(boardHit, true, "delivered load should appear on the board when filtered");

  const locations = queries.listLocations();
  assert.ok(locations.length >= 1, "seed should include shipper/receiver locations");
  const chicagoShipper = locations.find((location) => location.city === "Chicago" && location.role === "shipper");
  assert.ok(chicagoShipper);
  assert.equal(chicagoShipper.scheduling_type, "fcfs");
  assert.match(chicagoShipper.scheduling_notes, /FCFS/i);
  const indyReceiver = locations.find((location) => location.city === "Indianapolis");
  assert.ok(indyReceiver);
  assert.equal(indyReceiver.scheduling_type, "appointment");
  const load1042 = queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1042");
  assert.ok(load1042);
  assert.equal(load1042.shipper_location_id, chicagoShipper.id);
  assert.equal(load1042.consignee_location_id, indyReceiver.id);
  const stops = queries.locationsForLoad(load1042);
  assert.ok(stops.shipper);
  assert.ok(stops.consignee);
  assert.match(stops.consignee.scheduling_notes, /Appointment required/i);

  const oneOffShipper = queries.createLocation({
    name: "Smoke One-Off Yard",
    street: "100 Test Rd",
    city: "Jackson",
    state: "MS",
    zip: "39201",
    phone: "555-0100",
    notes: "",
    role: "both",
    scheduling_type: "appointment",
    hours: "Mon–Fri 07:00–15:00",
    scheduling_notes: "Call the guard shack. Dock 3.",
  });
  const locatedId = queries.createLoad({
    customer_id: customerId,
    origin: "Jackson, MS",
    destination: "Birmingham, AL",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 20000,
    commodity: "Location smoke",
    rate: 900,
    notes: "Has a saved shipper",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "LOC-SMOKE",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: oneOffShipper,
    consignee_location_id: null,
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const located = queries.getLoad(locatedId);
  assert.ok(located);
  assert.equal(located.shipper_location_id, oneOffShipper);
  assert.equal(located.consignee_location_id, null);
  assert.equal(queries.getLocation(oneOffShipper)?.city, "Jackson");
  queries.updateLocation(oneOffShipper, {
    name: "Smoke One-Off Yard",
    street: "200 Test Rd",
    city: "Jackson",
    state: "MS",
    zip: "39201",
    phone: "555-0100",
    notes: "Updated",
    role: "shipper",
    scheduling_type: "fcfs",
    hours: "24/7",
    scheduling_notes: "FCFS after hours.",
  });
  assert.equal(queries.getLocation(oneOffShipper)?.scheduling_type, "fcfs");

  const spacedDup = queries.findDuplicateLocation({
    name: "  Smoke One-Off Yard ",
    street: "200   Test Rd",
    city: "Jackson",
    state: "ms",
  });
  assert.equal(spacedDup?.id, oneOffShipper, "extra spaces and state casing still match");
  assert.equal(
    queries.findDuplicateLocation({
      name: "Smoke One-Off Yard",
      street: "999 Other Rd",
      city: "Jackson",
      state: "MS",
    }),
    null,
    "a different street is a new location",
  );
  assert.equal(
    queries.findDuplicateLocation({
      name: "Smoke One-Off Yard",
      street: "200 Test Rd",
      city: "Gulfport",
      state: "MS",
    }),
    null,
    "a different city is a new location",
  );
  const placeDupId = queries.createLocation({
    name: "Places Dock",
    street: "1 Dock Rd",
    city: "Omaha",
    state: "NE",
    zip: "68102",
    phone: "",
    notes: "",
    role: "shipper",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    google_place_id: "place-omaha-dock",
  });
  assert.equal(
    queries.findDuplicateLocation({
      name: "Different Label",
      street: "9 Other St",
      city: "Lincoln",
      state: "NE",
      google_place_id: "place-omaha-dock",
    })?.id,
    placeDupId,
  );
  const copyId = queries.createLocation({
    name: "Smoke One-Off Yard",
    street: "200 Test Rd",
    city: "Jackson",
    state: "MS",
    zip: "39201",
    phone: "",
    notes: "",
    role: "shipper",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
  });
  assert.notEqual(copyId, oneOffShipper, "a confirmed second copy is allowed");
  const dupForm = new FormData();
  dupForm.set("name", "Smoke One-Off Yard");
  dupForm.set("street", "200 Test Rd");
  dupForm.set("city", "Jackson");
  dupForm.set("state", "MS");
  const dupWarn = await (await import("../lib/actions")).createLocationAction(null, dupForm);
  assert.equal(dupWarn.ok, false);
  if (!dupWarn.ok) {
    assert.match(dupWarn.error, /already exists/i);
    assert.equal(dupWarn.duplicate, true);
    assert.ok(dupWarn.existingId);
  }
  const locationFormDup = fs.readFileSync(path.join(process.cwd(), "components/location-form.tsx"), "utf8");
  assert.match(locationFormDup, /Location already exists/);
  assert.match(locationFormDup, /confirm_duplicate/);
  assert.match(locationFormDup, /Create anyway/);

  const locationsPage = fs.readFileSync(path.join(process.cwd(), "app/locations/page.tsx"), "utf8");
  assert.match(locationsPage, /LocationCsvImport/);
  assert.match(locationsPage, /Download all locations/);
  assert.match(locationsPage, /\/api\/locations\/export/);
  const importUi = fs.readFileSync(path.join(process.cwd(), "components/location-csv-import.tsx"), "utf8");
  assert.match(importUi, /Download template/);
  assert.match(importUi, /Download all locations/);
  assert.match(importUi, /Location spreadsheet/);
  assert.match(importUi, /Upload CSV/);
  assert.match(importUi, /\/api\/locations\/template/);
  assert.match(importUi, /\/api\/locations\/export/);
  assert.doesNotMatch(importUi, /googleapis|GOOGLE_MAPS/i);
  for (const file of [
    "app/api/locations/export/route.ts",
    "app/api/locations/template/route.ts",
    "app/api/fleet/drivers/export/route.ts",
    "app/api/fleet/trucks/export/route.ts",
    "app/api/fleet/trailers/export/route.ts",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.match(source, /dispatcherCsvResponse/);
  }

  const {
    ASCEND_LOCATION_HEADERS,
    csvEscape,
    decodeCsvBuffer,
    parseAscendLocationCsv,
    renderAscendLocationCsv,
    renderAscendLocationTemplate,
  } = await import("../lib/location-csv");
  assert.deepEqual(ASCEND_LOCATION_HEADERS, [
    "Location Name",
    "Address Line 1",
    "Address Line 2",
    "City",
    "State",
    "Zip/Postal Code",
    "Phone number",
    "Phone Ext.",
    "Location Type",
    "Location Code",
    "Primary Contact Name",
    "Primary Contact Phone Number",
    "Primary Contact Ext.",
    "Primary Contact Email",
    "Primary Contact Fax",
    "Secondary Contact Name",
    "Secondary Contact Phone Number",
    "Secondary Contact Ext.",
    "Secondary Contact Email",
    "Secondary Contact Fax",
    "Location Private notes",
    "Location Public notes",
  ]);
  const template = renderAscendLocationTemplate();
  assert.equal(template.startsWith("\uFEFF"), true);
  assert.match(template, /\r\n$/);
  assert.equal(template.replace(/^\uFEFF/, "").trim(), ASCEND_LOCATION_HEADERS.join(","));

  const locationCsvLine = (values: Partial<Record<(typeof ASCEND_LOCATION_HEADERS)[number], string>>) =>
    ASCEND_LOCATION_HEADERS.map((header) => csvEscape(values[header] ?? "")).join(",");
  const locationCsv = (...rows: Partial<Record<(typeof ASCEND_LOCATION_HEADERS)[number], string>>[]) =>
    [ASCEND_LOCATION_HEADERS.join(","), ...rows.map(locationCsvLine)].join("\r\n");

  const parsedImport = parseAscendLocationCsv(
    locationCsv(
      {
        "Location Name": "New Import DC",
        "Address Line 1": "100 Import Rd",
        City: "Jackson",
        State: "ms",
        "Zip/Postal Code": "39201",
        "Phone number": "555-0199",
        "Phone Ext.": "12",
        "Location Type": "SHIPPER",
        "Location Code": "IMP-1",
        "Primary Contact Name": "Pat Contact",
        "Primary Contact Phone Number": "555-0200",
        "Primary Contact Ext.": "3",
        "Primary Contact Email": "pat@example.com",
        "Primary Contact Fax": "555-0201",
        "Location Private notes": "Private note here",
        "Location Public notes": "Dock 4 appointment",
      },
      {
        "Address Line 1": "orphan address",
        City: "Nowhere",
      },
      {
        "Location Name": "Bad Type Yard",
        "Address Line 1": "1 Main",
        City: "Dallas",
        State: "TX",
        "Location Type": "warehouse",
      },
      {
        "Location Name": "Quoted Name",
        "Address Line 1": '200 "A" St',
        "Address Line 2": "Suite 2",
        City: "Chicago",
        State: "IL",
        "Zip/Postal Code": "60601",
        "Location Type": "both",
        "Location Public notes": "Public hours",
      },
    ),
  );
  assert.equal(parsedImport.skipped, 1);
  assert.equal(parsedImport.errors.length, 1);
  assert.equal(parsedImport.errors[0]?.row, 4);
  assert.match(parsedImport.errors[0]?.error ?? "", /shipper, receiver, or both/i);
  assert.equal(parsedImport.rows.length, 2);
  assert.equal(parsedImport.rows[0]?.input.role, "shipper");
  assert.equal(parsedImport.rows[0]?.input.phone, "555-0199 x12");
  assert.equal(parsedImport.rows[0]?.input.state, "MS");
  assert.match(parsedImport.rows[0]?.input.notes ?? "", /Private note here/);
  assert.match(parsedImport.rows[0]?.input.notes ?? "", /Code: IMP-1/);
  assert.match(parsedImport.rows[0]?.input.notes ?? "", /Primary: Pat Contact/);
  assert.match(parsedImport.rows[0]?.input.notes ?? "", /555-0200 x3/);
  assert.equal(parsedImport.rows[0]?.input.scheduling_notes, "Dock 4 appointment");
  assert.equal(parsedImport.rows[1]?.input.name, "Quoted Name");
  assert.equal(parsedImport.rows[1]?.input.street, '200 "A" St, Suite 2');

  const blankType = parseAscendLocationCsv(
    locationCsv({
      "Location Name": "Blank Type DC",
      "Address Line 1": "9 Oak",
      City: "Austin",
      State: "TX",
    }),
  );
  assert.equal(blankType.rows[0]?.input.role, "both");
  const consigneeType = parseAscendLocationCsv(
    locationCsv({
      "Location Name": "Recv DC",
      "Address Line 1": "1 St",
      City: "Austin",
      State: "TX",
      "Location Type": "consignee",
    }),
  );
  assert.equal(consigneeType.rows[0]?.input.role, "receiver");

  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(`${ASCEND_LOCATION_HEADERS.join(",")}\nUtf16 Yard,1 A,,Dallas,TX,75001,,,,,,\n`, "utf16le"),
  ]);
  const decodedUtf16 = decodeCsvBuffer(utf16);
  assert.match(decodedUtf16, /Utf16 Yard/);
  const bomUtf8 = decodeCsvBuffer(Buffer.from(`\uFEFF${ASCEND_LOCATION_HEADERS.join(",")}\nBom Yard,2 B,,Dallas,TX,75001,,,,,,\n`, "utf8"));
  assert.equal(bomUtf8.includes("\uFEFF"), false);
  assert.equal(parseAscendLocationCsv(bomUtf8).rows[0]?.input.name, "Bom Yard");

  const firstImport = queries.importLocationsFromCsv(
    locationCsv(
      {
        "Location Name": "New Import DC",
        "Address Line 1": "100 Import Rd",
        City: "Jackson",
        State: "MS",
        "Zip/Postal Code": "39201",
        "Phone number": "555-0199",
        "Phone Ext.": "12",
        "Location Type": "shipper",
        "Location Code": "IMP-1",
        "Location Private notes": "Private note here",
        "Location Public notes": "Dock 4 appointment",
      },
      {
        "Address Line 1": "orphan address",
        City: "Nowhere",
      },
      {
        "Location Name": "Bad Type Yard",
        "Address Line 1": "1 Main",
        City: "Dallas",
        State: "TX",
        "Location Type": "warehouse",
      },
    ),
  );
  assert.equal(firstImport.created, 1);
  assert.equal(firstImport.updated, 0);
  assert.equal(firstImport.skipped, 1);
  assert.equal(firstImport.errors.length, 1);
  const imported = queries.findLocationByNameAddress("New Import DC", "100 Import Rd", "Jackson", "MS", "39201");
  assert.ok(imported);
  assert.equal(imported.role, "shipper");
  assert.equal(imported.phone, "555-0199 x12");
  assert.match(imported.notes, /Private note here/);
  assert.match(imported.scheduling_notes, /Dock 4/);
  const importedRoundTrip = parseAscendLocationCsv(renderAscendLocationCsv([imported])).rows[0];
  assert.ok(importedRoundTrip);
  assert.equal(importedRoundTrip.input.name, imported.name);
  assert.equal(importedRoundTrip.input.phone, imported.phone);
  assert.equal(importedRoundTrip.input.notes, imported.notes);
  assert.equal(importedRoundTrip.input.scheduling_notes, imported.scheduling_notes);
  queries.updateLocation(imported.id, {
    ...imported,
    hours: "Mon–Fri 07:00–15:00",
    scheduling_type: "appointment",
    latitude: 32.3,
    longitude: -90.2,
  });

  const secondImport = queries.importLocationsFromCsv(
    locationCsv({
      "Location Name": "new import dc",
      "Address Line 1": "100 Import Rd",
      City: "Jackson",
      State: "ms",
      "Zip/Postal Code": "39201",
      "Phone number": "555-9999",
      "Location Type": "both",
      "Location Public notes": "Updated public",
    }),
  );
  assert.equal(secondImport.created, 0);
  assert.equal(secondImport.updated, 1);
  const afterUpdate = queries.getLocation(imported.id);
  assert.ok(afterUpdate);
  assert.equal(afterUpdate.name, "New Import DC");
  assert.equal(afterUpdate.role, "both");
  assert.equal(afterUpdate.phone, "555-9999");
  assert.equal(afterUpdate.scheduling_notes, "Updated public");
  assert.equal(afterUpdate.scheduling_type, "appointment");
  assert.equal(afterUpdate.hours, "Mon–Fri 07:00–15:00");
  assert.equal(afterUpdate.latitude, 32.3);
  assert.equal(afterUpdate.longitude, -90.2);
  assert.equal(
    queries.listLocations().filter((location) => location.name.toLowerCase() === "new import dc").length,
    1,
  );

  const sameCsvDup = queries.importLocationsFromCsv(
    locationCsv(
      {
        "Location Name": "Dup Yard",
        "Address Line 1": "1 A St",
        City: "Dallas",
        State: "TX",
        "Zip/Postal Code": "75001",
        "Phone number": "111",
        "Location Type": "shipper",
        "Location Public notes": "First",
      },
      {
        "Location Name": "Dup Yard",
        "Address Line 1": "1 A St",
        City: "Dallas",
        State: "TX",
        "Zip/Postal Code": "75001",
        "Phone number": "222",
        "Location Type": "receiver",
        "Location Public notes": "Second",
      },
    ),
  );
  assert.equal(sameCsvDup.created, 1);
  assert.equal(sameCsvDup.updated, 1);
  const dupLoc = queries.findLocationByNameAddress("Dup Yard", "1 A St", "Dallas", "TX", "75001");
  assert.ok(dupLoc);
  assert.equal(dupLoc.role, "receiver");
  assert.equal(dupLoc.phone, "222");
  assert.equal(dupLoc.scheduling_notes, "Second");

  const allLocations = queries.listLocations();
  const exportedLocations = renderAscendLocationCsv(allLocations);
  assert.equal(exportedLocations.startsWith("\uFEFF"), true);
  assert.equal(exportedLocations.replace(/^\uFEFF/, "").split(/\r\n/)[0], ASCEND_LOCATION_HEADERS.join(","));
  const exportedRows = parseAscendLocationCsv(exportedLocations);
  assert.equal(exportedRows.rows.length, allLocations.length);
  assert.equal(exportedRows.skipped, 0);
  assert.equal(exportedRows.errors.length, 0);
  const exportedImport = exportedRows.rows.find((row) => row.input.name === "New Import DC");
  assert.ok(exportedImport);
  assert.equal(exportedImport.input.phone, "555-9999");
  assert.equal(exportedImport.input.role, "both");
  assert.equal(exportedImport.input.scheduling_notes, "Updated public");
  const exportedDup = exportedRows.rows.find((row) => row.input.name === "Dup Yard");
  assert.ok(exportedDup);
  assert.equal(exportedDup.input.role, "receiver");
  assert.equal(exportedDup.input.phone, "222");
  const reimport = queries.importLocationsFromCsv(exportedLocations);
  assert.equal(reimport.created, 0);
  assert.equal(reimport.updated, allLocations.length);

  const { renderDriversCsv, renderTrailersCsv, renderTrucksCsv, DRIVER_CSV_HEADERS } =
    await import("../lib/fleet-csv");
  const driversPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/page.tsx"), "utf8");
  const trucksPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/page.tsx"), "utf8");
  const trailersPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/trailers/page.tsx"), "utf8");
  assert.match(driversPage, /\/api\/fleet\/drivers\/export/);
  assert.match(trucksPage, /\/api\/fleet\/trucks\/export/);
  assert.match(trailersPage, /\/api\/fleet\/trailers\/export/);
  const driversCsv = renderDriversCsv(queries.listDrivers());
  assert.equal(driversCsv.replace(/^\uFEFF/, "").split(/\r\n/)[0], DRIVER_CSV_HEADERS.join(","));
  assert.match(driversCsv, /Denise Ortega/);
  assert.doesNotMatch(driversCsv, /1125/);
  assert.doesNotMatch(driversCsv, /4020/);
  for (const driver of queries.listDrivers()) {
    if (driver.pin) assert.doesNotMatch(driversCsv, new RegExp(driver.pin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const trucksCsv = renderTrucksCsv(queries.listTrucks());
  assert.match(trucksCsv, /Unit/);
  assert.ok(queries.listTrucks().every((truck) => trucksCsv.includes(truck.unit_number)));
  const trailersCsv = renderTrailersCsv(queries.listTrailers());
  assert.ok(queries.listTrailers().every((trailer) => trailersCsv.includes(trailer.unit_number)));

  const fuelPage = fs.readFileSync(path.join(process.cwd(), "app/fuel/page.tsx"), "utf8");
  const fuelImportUi = fs.readFileSync(path.join(process.cwd(), "components/fuel-csv-import.tsx"), "utf8");
  assert.match(fuelImportUi, /Already on file/);
  assert.match(fuelImportUi, /Nothing new to add/);
  assert.match(fuelImportUi, /fuelImportOkMessage/);
  const { fuelImportOkMessage } = await import("../components/fuel-csv-import");
  assert.equal(
    fuelImportOkMessage({ ok: true, created: 0, skipped: 28, unmatched: 0 }),
    "Already on file: 28 lines. Nothing new to add.",
  );
  assert.match(fuelImportOkMessage({ ok: true, created: 2, skipped: 3, unmatched: 1 }), /Created 2, already on file 3, unmatched 1/);
  const driversListPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/page.tsx"), "utf8");
  const driverEditPage = fs.readFileSync(path.join(process.cwd(), "app/fleet/drivers/[id]/page.tsx"), "utf8");
  assert.match(fuelPage, /FuelCsvImport/);
  assert.match(fuelPage, /FuelWeekStrip/);
  assert.match(fuelPage, /FuelMpgTable/);
  assert.match(fuelPage, /FuelTransactionLists/);
  assert.match(fuelPage, /FuelViewTabs/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-transaction-lists.tsx"), "utf8"), /data-fuel-view-tabs/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-transaction-lists.tsx"), "utf8"), /data-fuel-tx-tabs/);
  assert.equal(fs.existsSync(path.join(process.cwd(), "app/fuel/diesel")), false);
  assert.equal(fs.existsSync(path.join(process.cwd(), "app/fuel/money")), false);
  assert.doesNotMatch(navSource, /\/fuel\/(diesel|reefer|scale|money)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel.ts"), "utf8"), /label: "Money code"/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "components/fuel-transaction-lists.tsx"), "utf8"),
    /EFS vs FleetOne|FleetOne|first-class/i,
  );
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-mpg-table.tsx"), "utf8"), /data-fuel-mpg/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-mpg-table.tsx"), "utf8"), /Drivers MPG/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "components/fuel-mpg-table.tsx"), "utf8") +
      fs.readFileSync(path.join(process.cwd(), "lib/fuel-mpg.ts"), "utf8"),
    /maps\.google|pin-to-pin|Official IFTA|first-class|haversine/i,
  );
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel-mpg.ts"), "utf8"), /googleMilesForDriverInRange/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel-mpg.ts"), "utf8"), /officialGoogleMilesForLoad/);
  const fuelMatchUi = fs.readFileSync(path.join(process.cwd(), "components/fuel-match-queue.tsx"), "utf8");
  assert.match(fuelPage, /FuelMatchQueue/);
  assert.match(fuelMatchUi, /data-fuel-match-queue/);
  assert.match(fuelMatchUi, /Receipt match/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /data-fuel-week-strip/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /data-fuel-week-reports/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /Saved weeks/);
  assert.match(fuelPage, /loadFuelWeekView/);
  assert.match(fuelPage, /week\?:/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-transaction-lists.tsx"), "utf8"), /week\?:/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /Lowest paid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /Highest paid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /Average paid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel.ts"), "utf8"), /fuelWeekPaidStats/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/types.ts"), "utf8"), /fuel_receipt/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-upload.tsx"), "utf8"), /fuel_receipt/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-upload.tsx"), "utf8"), /Document type/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-upload.tsx"), "utf8"), /data-driver-upload/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "components/driver-upload.tsx"), "utf8"),
    /Or upload a file you already have|Take a document photo/,
  );
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/manage-report-form.tsx"), "utf8"), /REPORT_EXPORT_COLUMNS/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/manage-report-form.tsx"), "utf8"), /data-column-chooser/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/reports/statistics/page.tsx"), "utf8"), /buildStatistics/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/reports/statistics/page.tsx"), "utf8"), /data-stats-matrix/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/reports/statistics/page.tsx"), "utf8"), /Gross Rev/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/reports/statistics/page.tsx"), "utf8"), /data-stats-chart/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/reports/statistics/page.tsx"), "utf8"), /Breakdown/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/manage-report-form.tsx"), "utf8"), /Display Options/);
  assert.match(fuelMatchUi, /data-fuel-status/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/relay-routing.ts"), "utf8"), /maps\.googleapis\.com\/maps\/api\/directions\/json/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/relay-routing.ts"), "utf8"), /maps\.google\.com\/maps\?/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/invoice.ts"), "utf8"), /listRelays|splitLoadRevenue/);
  assert.match(fuelPage, /Unassigned/);
  assert.match(fuelPage, /Per-truck totals/);
  const fuelRollupUi = fs.readFileSync(path.join(process.cwd(), "components/fuel-rollup-table.tsx"), "utf8");
  const fuelLabels = fs.readFileSync(path.join(process.cwd(), "lib/fuel.ts"), "utf8");
  assert.doesNotMatch(fuelRollupUi, /Four first-class buckets|Never lumped into Other|first-class/);
  assert.doesNotMatch(fuelRollupUi, /<p className="mt-1 text-xs text-slate-500">/);
  assert.match(fuelRollupUi + fuelLabels, /Truck diesel/);
  assert.match(fuelRollupUi + fuelLabels, /Reefer diesel|reefer diesel/);
  assert.match(fuelRollupUi + fuelLabels, /DEF/);
  assert.match(fuelRollupUi + fuelLabels, /Scale/);
  assert.match(fuelRollupUi, /FUEL_BUCKETS/);
  assert.match(fuelImportUi, /\/api\/fuel\/template/);
  assert.match(fuelImportUi, /\/api\/fuel\/export/);
  assert.match(fuelImportUi, /Fuel file/);
  assert.doesNotMatch(fuelImportUi, /Official IFTA|Ascend|<code>\.env/);
  assert.match(driversListPage, /href="\/fuel"/);
  assert.match(driverEditPage, /DriverFuelCard/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/trucks/page.tsx"), "utf8"), /href="\/fuel"/);
  assert.doesNotMatch(fuelPage + fuelImportUi, /Comdata|WEX/i);
  for (const file of ["app/api/fuel/template/route.ts", "app/api/fuel/export/route.ts"]) {
    assert.match(fs.readFileSync(path.join(process.cwd(), file), "utf8"), /dispatcherCsvResponse/);
  }

  const {
    cardLast4From,
    matchFuelDriver,
    classifyFuelCategory,
    fuelWeekPaidStats,
    fuelWeekPaidStatsForWeek,
    isTruckDieselCategory,
    fuelTxListKind,
    parseEfsFuelText,
    looksLikeEfsReport,
    isFuelBucket,
    labelForFuelBucket,
    parseFuelCsv,
    parseFuelReport,
    parseFuelWhen,
    parseFuelWeekStart,
    renderFuelExportCsv,
    renderFuelTemplate,
    localWeekRange,
    startOfLocalMonth,
    startOfLocalWeek,
    FUEL_CSV_HEADERS,
    FUEL_BUCKETS,
  } = await import("../lib/fuel");
  const { DISPLAY_TIME_ZONE, ymdInTimeZone } = await import("../lib/format");
  const fuelStore = await import("../lib/fuel-store");
  assert.deepEqual(
    FUEL_BUCKETS.map((bucket) => bucket.value),
    ["truck_diesel", "reefer_diesel", "def", "scale"],
  );
  assert.equal(renderFuelTemplate().replace(/^\uFEFF/, "").trim(), FUEL_CSV_HEADERS.join(","));
  const noon = parseFuelWhen("08/21/2026", "2:32 PM");
  assert.ok(noon);
  assert.equal(noon.getMonth(), 7);
  assert.equal(noon.getDate(), 21);
  assert.equal(noon.getHours(), 14);
  assert.equal(cardLast4From("************4321"), "4321");
  const wedNy = new Date("2026-08-26T15:00:00.000Z");
  assert.equal(ymdInTimeZone(startOfLocalWeek(wedNy), DISPLAY_TIME_ZONE), "2026-08-24");
  assert.equal(ymdInTimeZone(startOfLocalWeek(new Date("2026-08-30T22:00:00.000Z")), DISPLAY_TIME_ZONE), "2026-08-24");
  assert.equal(ymdInTimeZone(startOfLocalWeek(new Date("2026-08-31T08:00:00.000Z")), DISPLAY_TIME_ZONE), "2026-08-31");
  const weekPaid = fuelWeekPaidStats(
    [
      { occurred_at: "2026-08-25T14:00:00.000Z", category: "truck_diesel", amount: 100, price_per_gallon: 3 },
      { occurred_at: "2026-08-26T14:00:00.000Z", category: "reefer_diesel", amount: 300, price_per_gallon: 4 },
      { occurred_at: "2026-08-26T12:00:00.000Z", category: "Truck diesel", amount: 200, price_per_gallon: 3.5 },
      { occurred_at: "2026-08-26T14:00:00.000Z", category: "money_code", amount: 500, price_per_gallon: null },
      { occurred_at: "2026-08-26T14:00:00.000Z", category: "def", amount: 20, price_per_gallon: null },
      { occurred_at: "2026-08-26T14:00:00.000Z", category: "scale", amount: 18, price_per_gallon: null },
      { occurred_at: "2026-08-26T14:00:00.000Z", category: "", amount: 999, price_per_gallon: null },
      { occurred_at: "2026-08-20T14:00:00.000Z", category: "truck_diesel", amount: 50, price_per_gallon: 2 },
    ],
    wedNy,
  );
  assert.equal(weekPaid.count, 2);
  assert.equal(weekPaid.minAmount, 100);
  assert.equal(weekPaid.maxAmount, 200);
  assert.equal(weekPaid.avgAmount, 150);
  assert.equal(weekPaid.minPpg, 3);
  assert.equal(weekPaid.maxPpg, 3.5);
  assert.equal(weekPaid.avgPpg, 3.25);
  assert.equal(parseFuelWeekStart("2026-08-20", wedNy), "2026-08-17");
  assert.equal(parseFuelWeekStart(undefined, wedNy), "2026-08-24");
  assert.equal(parseFuelWeekStart("nope", wedNy), "2026-08-24");
  const priorWeekPaid = fuelWeekPaidStatsForWeek(
    [
      { occurred_at: "2026-08-25T14:00:00.000Z", category: "truck_diesel", amount: 100, price_per_gallon: 3 },
      { occurred_at: "2026-08-20T14:00:00.000Z", category: "truck_diesel", amount: 50, price_per_gallon: 2 },
    ],
    "2026-08-17",
  );
  assert.equal(priorWeekPaid.count, 1);
  assert.equal(priorWeekPaid.minAmount, 50);
  assert.equal(priorWeekPaid.weekStartYmd, "2026-08-17");
  assert.equal(priorWeekPaid.weekEndYmd, "2026-08-23");
  const { fuelPageHref } = await import("../components/fuel-transaction-lists");
  assert.equal(fuelPageHref({ week: "2026-08-17" }), "/fuel?week=2026-08-17");
  assert.equal(fuelPageHref({ week: "2026-08-17", driverId: 4 }), "/fuel?driver=4&week=2026-08-17");
  fuelStore.importFuelFromCsv(
    [
      "Date,Time,Driver Name,Unit,Category,Gallons,Price,Total,Invoice",
      "07/02/2026,10:00,Denise Ortega,112,Diesel,11,3.00,33.00,WEEK-SAVE-1",
    ].join("\n"),
    "saved-week.csv",
  );
  const savedWeekStart = localWeekRange("2026-07-02").startYmd;
  assert.equal(savedWeekStart, "2026-06-29");
  const savedWeekRows = fuelStore.listFuelTransactions({
    fromIso: localWeekRange(savedWeekStart).start.toISOString(),
    toIso: localWeekRange(savedWeekStart).end.toISOString(),
  });
  assert.ok(savedWeekRows.some((row) => row.source_file === "saved-week.csv"));
  const syncedWeeks = fuelStore.syncFuelWeekReports(wedNy);
  const savedWeek = syncedWeeks.find((row) => row.weekStartYmd === savedWeekStart);
  assert.ok(savedWeek);
  assert.equal(savedWeek.weekEndYmd, "2026-07-05");
  assert.ok(savedWeek.txCount >= 1);
  assert.equal(savedWeek.stats.minAmount, 33);
  const savedWeekTx = fuelStore.listFuelTransactions().find((row) => row.source_file === "saved-week.csv");
  assert.ok(savedWeekTx);
  fuelStore.deleteFuelTransaction(savedWeekTx.id);
  fuelStore.syncFuelWeekReports(wedNy);
  const keptWeek = fuelStore.getFuelWeekReport(savedWeekStart);
  assert.ok(keptWeek);
  assert.equal(keptWeek.txCount, savedWeek.txCount);
  assert.equal(keptWeek.stats.minAmount, 33);
  assert.equal(fuelStore.getFuelWeekPaidStats(savedWeekStart, wedNy).minAmount, 33);
  assert.equal(isTruckDieselCategory("truck_diesel"), true);
  assert.equal(isTruckDieselCategory("Truck diesel"), true);
  assert.equal(isTruckDieselCategory("reefer_diesel"), false);
  assert.equal(isTruckDieselCategory("money_code"), false);
  assert.equal(fuelTxListKind("truck_diesel"), "truck_diesel");
  assert.equal(fuelTxListKind("reefer_diesel"), "reefer");
  assert.equal(fuelTxListKind("scale"), "scale");
  assert.equal(fuelTxListKind("money_code"), "money_code");
  assert.equal(fuelTxListKind("cash advance"), "money_code");
  assert.equal(fuelTxListKind("def"), "def");
  assert.equal(fuelTxListKind("DATE DB CATEGORY"), null);
  const fuelWhen = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const [fuelYear, fuelMonth, fuelDay] = ymdInTimeZone(fuelWhen, DISPLAY_TIME_ZONE).split("-").map(Number);
  const fuelDate = `${fuelMonth}/${fuelDay}/${fuelYear}`;
  const fuelHour = String(fuelWhen.getHours()).padStart(2, "0");
  const fuelCsv = [
    "Date,Time,Driver Name,Driver ID,Unit,Location,Category,Gallons,Price,Total,Card Number",
    `${fuelDate},${fuelHour}:32,Denise Ortega,,112,Memphis TN,Diesel,100,3.499,349.90,****4321`,
    `${fuelDate},${fuelHour}:40,, ,101,Indianapolis,Diesel,80,3.40,272.00,1111`,
    `${fuelDate},${fuelHour}:50,Unknown Driver,,8888,Nowhere,Diesel,40,3.10,124.00,2222`,
    `${fuelDate},${fuelHour}:32,Denise Ortega,,112,Memphis TN,Diesel,100,3.499,349.90,****4321`,
    ",,,,,",
  ].join("\r\n");
  const parsedFuel = parseFuelCsv(fuelCsv);
  assert.equal(parsedFuel.rows.length, 4);
  assert.equal(parsedFuel.skipped, 0);
  const deniseMatch = matchFuelDriver(parsedFuel.rows[0]!, queries.listDrivers(), queries.listTrucks());
  assert.equal(queries.getDriver(deniseMatch.driverId ?? 0)?.name, "Denise Ortega");
  const unitMatch = matchFuelDriver(parsedFuel.rows[1]!, queries.listDrivers(), queries.listTrucks());
  assert.equal(unitMatch.driverId, null);
  const unknownMatch = matchFuelDriver(parsedFuel.rows[2]!, queries.listDrivers(), queries.listTrucks());
  assert.equal(unknownMatch.driverId, null);

  const firstFuel = fuelStore.importFuelFromCsv(fuelCsv, "daily.csv");
  assert.equal(firstFuel.created, 1);
  assert.equal(firstFuel.unmatched, 2);
  assert.equal(firstFuel.skipped, 1);
  const secondFuel = fuelStore.importFuelFromCsv(fuelCsv, "daily-again.csv");
  assert.equal(secondFuel.created, 0);
  assert.equal(secondFuel.unmatched, 0);
  assert.equal(secondFuel.skipped, 4);
  const unmatchedFuel = fuelStore.listFuelTransactions({ unmatchedOnly: true });
  assert.equal(unmatchedFuel.length, 2);
  const unknownFuel = unmatchedFuel.find((row) => row.driver_name_raw === "Unknown Driver");
  assert.ok(unknownFuel);
  const fuelTyrell = queries.listDrivers().find((driver) => driver.name === "Tyrell Brooks");
  assert.ok(fuelTyrell);
  fuelStore.assignFuelTransactionDriver(unknownFuel.id, fuelTyrell.id);
  assert.equal(fuelStore.listFuelTransactions({ unmatchedOnly: true }).length, 1);
  const fuelDenise = queries.listDrivers().find((driver) => driver.name === "Denise Ortega");
  assert.ok(fuelDenise);
  const deniseFuel = fuelStore.getDriverFuelRollup(fuelDenise.id);
  assert.ok(deniseFuel);
  assert.equal(deniseFuel.weekGallons, 100);
  assert.equal(deniseFuel.monthAmount, 349.9);
  assert.equal(deniseFuel.week.truck_diesel.gallons, 100);
  assert.equal(deniseFuel.week.reefer_diesel.gallons, 0);
  assert.equal(deniseFuel.week.def.gallons, 0);
  assert.equal(deniseFuel.week.scale.amount, 0);
  const {
    listDriverMpg,
    odometerDeltaMiles,
    officialGoogleMilesForLoad,
    googleMilesForDriverInRange,
    loadTouchesMpgWindow,
  } = await import("../lib/fuel-mpg");
  const mpgNow = new Date();
  const mpgBoard = listDriverMpg("week", mpgNow);
  const activeRoster = queries.listDrivers().filter((driver) => queries.isDriverLoginEligible(driver));
  assert.equal(mpgBoard.rows.length, activeRoster.length);
  assert.ok(mpgBoard.rows.every((row) => activeRoster.some((driver) => driver.id === row.driverId)));
  const deniseMpg = mpgBoard.rows.find((row) => row.driverName === "Denise Ortega");
  assert.ok(deniseMpg);
  assert.equal(deniseMpg.gallons, 100);
  assert.equal(deniseMpg.miles, null);
  assert.equal(deniseMpg.mpg, null);
  const { encodePolyline } = await import("../lib/routing");
  const mpgPoly = encodePolyline(
    Array.from({ length: 24 }, (_, index) => ({ lat: 40.5 + index * 0.02, lng: -98.4 + index * 0.04 })),
  );
  assert.equal(
    officialGoogleMilesForLoad({
      route_miles: 210.3,
      route_source: "google",
      route_leg_miles: "[210.3]",
      route_polyline: mpgPoly,
      empty_miles: 50.1,
      empty_source: "google",
    }),
    260.4,
  );
  assert.equal(
    officialGoogleMilesForLoad({
      route_miles: 210.3,
      route_source: "google",
      route_leg_miles: "",
      route_polyline: "",
      empty_miles: 50.1,
      empty_source: "",
    }),
    210.3,
  );
  assert.equal(
    loadTouchesMpgWindow(
      {
        pickup_start: startOfLocalWeek(mpgNow).toISOString(),
        pickup_end: "",
        delivery_start: "",
        delivery_end: mpgNow.toISOString(),
        status: "delivered",
      },
      startOfLocalWeek(mpgNow).toISOString(),
      mpgNow.toISOString(),
    ),
    true,
  );
  const mpgJames = queries.listDrivers().find((driver) => driver.name === "James Whitaker Smoke");
  assert.ok(mpgJames);
  const mpgTruckId = queries.createTruck({
    unit_number: "MPG-27",
    type: "sleeper",
    capacity_lbs: 80000,
    status: "available",
    plate: "MPG-27",
    vin: "MPGSMOKEVIN000027",
    assigned_driver_id: mpgJames.id,
  });
  const mpgCustomer = queries.listCustomers()[0];
  assert.ok(mpgCustomer);
  const mpgLoadId = queries.createLoad({
    customer_id: mpgCustomer.id,
    origin: "Hastings, NE",
    destination: "Harlan, IA",
    pickup_start: startOfLocalWeek(mpgNow).toISOString(),
    pickup_end: mpgNow.toISOString(),
    delivery_start: mpgNow.toISOString(),
    delivery_end: mpgNow.toISOString(),
    weight: 40000,
    commodity: "Beef",
    rate: 900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "MPG-GOOGLE",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  queries.assignLoad(mpgLoadId, mpgTruckId, mpgJames.id);
  getDb()
    .prepare(
      `UPDATE loads SET route_miles = 210.3, route_source = 'google', route_leg_miles = '[210.3]', route_polyline = ?, empty_miles = 50.1, empty_source = 'google' WHERE id = ?`,
    )
    .run(mpgPoly, mpgLoadId);
  const mpgJamesLoad = queries.getLoad(mpgLoadId);
  assert.ok(mpgJamesLoad);
  assert.equal(
    googleMilesForDriverInRange(
      [mpgJamesLoad],
      mpgJames.id,
      mpgTruckId,
      startOfLocalWeek(mpgNow).toISOString(),
      mpgNow.toISOString(),
    ),
    260.4,
  );
  const jamesMpg = listDriverMpg("week", mpgNow).rows.find((row) => row.driverName === "James Whitaker Smoke");
  assert.ok(jamesMpg);
  assert.equal(jamesMpg.miles, 260.4);
  assert.equal(jamesMpg.mpg, null);
  assert.equal(listDriverMpg("week", mpgNow).rows.find((row) => row.driverName === "Denise Ortega")?.miles, null);
  const deniseTruck = queries.listTrucks().find((truck) => truck.unit_number === "112");
  assert.ok(deniseTruck);
  queries.saveTruckOdometer(deniseTruck.id, {
    miles: 1000,
    recordedAt: startOfLocalWeek(mpgNow).toISOString(),
    source: "samsara",
  });
  queries.saveTruckOdometer(deniseTruck.id, {
    miles: 1600,
    recordedAt: mpgNow.toISOString(),
    source: "samsara",
  });
  const deniseMpgLive = listDriverMpg("week", mpgNow).rows.find((row) => row.driverName === "Denise Ortega");
  assert.ok(deniseMpgLive);
  assert.equal(deniseMpgLive.miles, 600);
  assert.equal(deniseMpgLive.mpg, 6);
  assert.equal(listDriverMpg("week", mpgNow).rows[0]?.driverName, "Denise Ortega");
  fuelStore.importFuelFromCsv(
    [
      "Date,Time,Driver Name,Unit,Category,Gallons,Price,Total",
      `${fuelDate},17:00,Denise Ortega,112,REEFER ULTRA LOW SULFUR,20,3.40,68.00`,
    ].join("\n"),
    "reefer-mpg.csv",
  );
  assert.equal(listDriverMpg("week", mpgNow).rows.find((row) => row.driverName === "Denise Ortega")?.gallons, 100);
  const reeferMpgRow = fuelStore
    .listFuelTransactions()
    .find((row) => row.category === "reefer_diesel" && row.driver_id === fuelDenise.id);
  if (reeferMpgRow) fuelStore.deleteFuelTransaction(reeferMpgRow.id);
  assert.equal(
    odometerDeltaMiles(
      [
        { id: 1, truck_id: 1, recorded_at: "2026-08-24T04:00:00.000Z", miles: 10, source: "samsara" },
        { id: 2, truck_id: 1, recorded_at: "2026-08-26T15:00:00.000Z", miles: 110, source: "samsara" },
      ],
      "2026-08-24T04:00:00.000Z",
      "2026-08-26T15:00:00.000Z",
    ),
    100,
  );
  const exportedFuel = renderFuelExportCsv(fuelStore.listFuelTransactions());
  assert.match(exportedFuel, /Denise Ortega/);
  assert.match(exportedFuel, /4321/);
  assert.doesNotMatch(exportedFuel, /1125/);
  assert.equal(fuelStore.listFuelTransactions().length, 3);
  assert.equal(classifyFuelCategory("ULTRA LOW SULFUR DIESEL"), "truck_diesel");
  assert.equal(classifyFuelCategory("REEFER ULTRA LOW SULFUR"), "reefer_diesel");
  assert.equal(classifyFuelCategory("CAT SCALES"), "scale");
  assert.equal(classifyFuelCategory("DIESEL EXHAUST FLUID"), "def");
  assert.equal(classifyFuelCategory("candy"), "");
  const fourCsv = parseFuelCsv(
    [
      "Date,Driver Name,Unit,Category,Invoice,Gallons,Total",
      `${fuelDate},Christopher Howell,32,ULTRA LOW SULFUR DIESEL,CSV-1,10,30`,
      `${fuelDate},Christopher Howell,32,REEFER ULTRA LOW SULFUR,CSV-2,5,15`,
      `${fuelDate},Christopher Howell,32,DIESEL EXHAUST FLUID,CSV-3,1,4`,
      `${fuelDate},Christopher Howell,32,CAT SCALES,CSV-4,1,18`,
    ].join("\n"),
  );
  assert.deepEqual(
    fourCsv.rows.map((row) => row.category),
    ["truck_diesel", "reefer_diesel", "def", "scale"],
  );

  const efsNow = new Date();
  const [efsYear, efsMonth, efsDay] = ymdInTimeZone(efsNow, DISPLAY_TIME_ZONE).split("-").map(Number);
  const efsStamp = `${String(efsMonth).padStart(2, "0")}/${String(efsDay).padStart(2, "0")}/${String(efsYear).slice(-2)}`;
  const efsReportDate = `${String(efsMonth).padStart(2, "0")}/${String(efsDay).padStart(2, "0")}/${efsYear}`;
  const efsReport = [
    "/Dm201902",
    "M&S LOADS",
    "CUSTOMER 3770001903818",
    "TRANSACTION ACTIVITY REPORT",
    `REPORT DATE ${efsReportDate}`,
    "",
    "NName: HOWELL, CHRISTOPHER",
    `${efsStamp} 556712341111 DIESEL ULTRA LOW SULFUR DIESEL 32 32 900111 1011 MEMPHIS TN LOVES 102.340 3.459 8.20 353.90 0.00 1.00 355.10`,
    `${efsStamp} 556712341111 REEFER REEFER ULTRA LOW SULFUR 32 32 900112 1011 MEMPHIS TN LOVES 20.000 3.459 1.50 69.18 0.00 0.00 69.18`,
    `${efsStamp} 556712341111 DEF DIESEL EXHAUST FLUID 32 32 900113 1011 MEMPHIS TN LOVES 5.000 4.199 0.40 21.00 0.00 0.00 21.00`,
    "",
    "NName: ELLER, STEVE",
    `${efsStamp} 556712342222 SCALE CAT SCALES 26 26 900221 2022 JACKSON MS CAT SCALE 1.000 0.000 0.00 18.50 0.00 0.00 18.50`,
    "",
    "NName: WHALEY, KELVIN",
    `${efsStamp} 556712343333 DIESEL ULTRA LOW SULFUR DIESEL 28 28 900331 3033 NASHVILLE TN PILOT 88.100 3.399 6.10 299.45 0.00 0.00 299.45`,
  ].join("\n");
  const efsParsed = parseEfsFuelText(efsReport);
  const efsWhen = parseFuelWhen(efsStamp, "");
  assert.ok(efsWhen);
  assert.equal(
    ymdInTimeZone(efsWhen, DISPLAY_TIME_ZONE),
    `${efsYear}-${String(efsMonth).padStart(2, "0")}-${String(efsDay).padStart(2, "0")}`,
  );
  assert.ok(efsWhen.getTime() <= Date.now(), "date-only EFS stamp must not be in the future");
  assert.ok(
    efsWhen.getTime() >= startOfLocalMonth(efsNow).getTime(),
    "date-only EFS stamp must stay in the current office month",
  );
  assert.equal(looksLikeEfsReport(efsReport), true);
  const { looksLikeFleetOneReport } = await import("../lib/fuel-fleetone");
  assert.equal(looksLikeFleetOneReport(efsReport), false, "EFS nname / report id must stay on the EFS path");
  assert.equal(efsParsed.rows.length, 5);
  assert.equal(efsParsed.rows[0]?.driverName, "Christopher Howell");
  assert.equal(efsParsed.rows[0]?.category, "truck_diesel");
  assert.equal(efsParsed.rows[0]?.unitNumber, "32");
  assert.equal(efsParsed.rows[0]?.invoice, "900111");
  assert.equal(efsParsed.rows[1]?.category, "reefer_diesel");
  assert.equal(efsParsed.rows[2]?.category, "def");
  assert.equal(efsParsed.rows[3]?.driverName, "Steve Eller");
  assert.equal(efsParsed.rows[3]?.category, "scale");
  assert.equal(efsParsed.rows[4]?.driverName, "Kelvin Whaley");
  assert.equal(efsParsed.rows[4]?.unitNumber, "28");

  const truck32 =
    queries.listTrucks().find((truck) => truck.unit_number === "32")?.id ??
    queries.createTruck({ unit_number: "32", type: "reefer", capacity_lbs: 44000, status: "available" });
  const truck26 = queries.createTruck({ unit_number: "26", type: "reefer", capacity_lbs: 44000, status: "available" });
  const truck28 =
    queries.listTrucks().find((truck) => truck.unit_number === "28")?.id ??
    queries.createTruck({ unit_number: "28", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const howellId = queries.createDriver({
    name: "Christopher Howell",
    phone: "555-0032",
    license: "TN-CDL-HOWELL",
    truck_id: truck32,
    status: "available",
  });
  const ellerId = queries.createDriver({
    name: "Steve Eller",
    phone: "555-0026",
    license: "MS-CDL-ELLER",
    truck_id: truck26,
    status: "available",
  });
  const whaleyId = queries.createDriver({
    name: "Kelvin Whaley",
    phone: "555-0028",
    license: "TN-CDL-WHALEY",
    truck_id: truck28,
    status: "available",
  });
  const efsImport = fuelStore.importFuelFromText(efsReport, "activity.pdf");
  assert.equal(efsImport.created, 5);
  assert.equal(efsImport.unmatched, 0);
  const efsAgain = fuelStore.importFuelFromText(efsReport, "activity-again.pdf");
  assert.equal(efsAgain.created, 0);
  assert.equal(efsAgain.skipped, 5);
  const howellRollup = fuelStore.getDriverFuelRollup(howellId);
  assert.equal(howellRollup.month.truck_diesel.gallons, 102.34);
  assert.equal(howellRollup.month.reefer_diesel.gallons, 20);
  assert.equal(howellRollup.month.def.gallons, 5);
  assert.equal(howellRollup.month.truck_diesel.gallons === howellRollup.monthGallons, false);
  assert.equal(howellRollup.month.scale.gallons, 0);
  assert.equal(howellRollup.month.scale.amount, 0);
  for (const key of ["truck_diesel", "reefer_diesel", "def", "scale"] as const) {
    assert.ok(howellRollup.month[key]);
    assert.ok(howellRollup.week[key]);
  }
  const ellerRollup = fuelStore.getDriverFuelRollup(ellerId);
  assert.equal(ellerRollup.month.scale.amount, 18.5);
  assert.equal(ellerRollup.month.truck_diesel.gallons, 0);
  const truckRollups = fuelStore.listTruckFuelRollups();
  assert.ok(truckRollups.some((row) => row.name === "32" && row.month.def.gallons === 5));
  assert.ok(truckRollups.some((row) => row.name === "28" && row.month.truck_diesel.gallons === 88.1));
  assert.equal(queries.getDriver(howellId)?.name, "Christopher Howell");
  assert.equal(queries.getDriver(whaleyId)?.name, "Kelvin Whaley");

  const { StandardFonts } = await import("pdf-lib");
  const efsPdf = await PDFDocument.create();
  const efsPage = efsPdf.addPage([612, 792]);
  const efsFont = await efsPdf.embedFont(StandardFonts.Courier);
  efsReport.split("\n").forEach((line, index) => {
    efsPage.drawText(line || " ", { x: 36, y: 760 - index * 12, size: 9, font: efsFont });
  });
  const efsPdfBytes = Buffer.from(await efsPdf.save());
  const { extractDocumentText } = await import("../lib/rate-con");
  const efsPdfText = await extractDocumentText(efsPdfBytes, "application/pdf", "activity.pdf");
  const fromPdf = parseFuelReport(efsPdfText);
  assert.ok(fromPdf.rows.length >= 5, "PDF extract should keep activity lines");
  assert.ok(fromPdf.rows.some((row) => row.category === "def"));
  assert.ok(fromPdf.rows.some((row) => row.driverName.toUpperCase().includes("HOWELL")));

  const { extractStateCode } = await import("../lib/locations");
  assert.equal(extractStateCode("Chicago, IL"), "IL");
  assert.equal(extractStateCode("Dallas, TX 75215"), "TX");
  const { ACTIVE_LOAD_STATUSES, isClosedStatus } = await import("../lib/types");
  assert.ok(LOAD_STATUSES.includes("dispatched"));
  assert.ok(LOAD_STATUSES.includes("at_pickup"));
  assert.ok(LOAD_STATUSES.includes("completed"));
  const liveOnly = queries.searchLoads({ includeLive: true, includeArchived: false, includeCancelled: false });
  assert.ok(
    liveOnly.every(
      (load) =>
        (ACTIVE_LOAD_STATUSES as readonly string[]).includes(load.status) || load.status === "accounting",
    ),
  );
  assert.ok(liveOnly.some((load) => load.load_number === "MSE-1045"));
  assert.equal(liveOnly.some((load) => load.load_number === "MSE-1047"), false, "delivered is archived");
  assert.equal(liveOnly.some((load) => load.load_number === "MSE-1049"), false, "cancelled excluded by default");
  const archived = queries.searchLoads({
    includeLive: false,
    includeArchived: true,
    includeCancelled: false,
  });
  assert.ok(archived.some((load) => load.load_number === "MSE-1047"));
  const cancelled = queries.searchLoads({
    includeLive: false,
    includeArchived: false,
    includeCancelled: true,
  });
  assert.ok(cancelled.some((load) => load.load_number === "MSE-1049"));
  const illinoisOrigin = queries.searchLoads({
    includeLive: true,
    includeArchived: true,
    includeCancelled: true,
    originState: "IL",
  });
  assert.ok(illinoisOrigin.every((load) => extractStateCode(load.origin) === "IL"));
  assert.ok(illinoisOrigin.some((load) => load.load_number === "MSE-1042"));
  const heartlandSearch = queries.searchLoads({
    includeLive: true,
    includeArchived: true,
    includeCancelled: true,
    customerId: load1042.customer_id,
    q: "MSE-1042",
  });
  assert.equal(heartlandSearch.some((load) => load.id === load1042.id), true);
  const { weekDateRange, monthDateRange, defaultSearchColumns, defaultSearchCriteria } = await import("../lib/search");
  const week = weekDateRange();
  assert.match(week.dateFrom, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(week.dateTo, /^\d{4}-\d{2}-\d{2}$/);
  const month = monthDateRange();
  assert.ok(month.dateFrom <= month.dateTo);
  const reportId = queries.createSavedReport({
    name: "Live Illinois pickups",
    filters: {
      ...defaultSearchCriteria(),
      originState: "IL",
      includeLive: true,
      includeArchived: false,
      includeCancelled: false,
    },
    columns: defaultSearchColumns(),
  });
  const saved = queries.getSavedReport(reportId);
  assert.ok(saved);
  assert.equal(saved.name, "Live Illinois pickups");
  assert.match(saved.filters_json, /"originState":"IL"/);
  queries.deleteSavedReport(reportId);
  assert.equal(queries.getSavedReport(reportId), null);

  assert.equal(audit.listLoadAudit(load1042.id).length, 0, "clone source seed load stays unbackfilled until clone");
  const clonedId = queries.cloneLoad(load1042.id);
  const cloned = queries.getLoad(clonedId);
  assert.ok(cloned);
  assert.equal(cloned.status, "available");
  assert.equal(cloned.origin, load1042.origin);
  assert.equal(cloned.destination, load1042.destination);
  assert.equal(cloned.cloned_from_id, load1042.id);
  assert.ok(audit.listLoadAudit(clonedId).some((row) => row.action === "clone" && row.field === "cloned_from"));
  assert.ok(audit.listLoadAudit(load1042.id).some((row) => row.action === "clone" && row.field === "cloned_to"));
  queries.updateLoadStatus(clonedId, "hold");
  assert.equal(queries.getLoad(clonedId)?.status, "hold");
  queries.updateLoadDetails(clonedId, {
    status_reason: "wait",
    equipment: "reefer_53",
    hazmat: true,
    team: true,
    seal_numbers: "S-SMOKE",
    appointment_confirmation: "APPT-1",
  });
  const detailed = queries.getLoad(clonedId);
  assert.equal(detailed?.status_reason, "wait");
  assert.equal(detailed?.equipment, "reefer_53");
  assert.equal(detailed?.hazmat, 1);
  assert.equal(detailed?.team, 1);
  assert.equal(detailed?.seal_numbers, "S-SMOKE");

  const loadStops = await import("../lib/stops");
  const typeOrder = [
    { id: 1, kind: "delivery" },
    { id: 2, kind: "pickup" },
    { id: 3, kind: "delivery" },
    { id: 4, kind: "delivery" },
  ];
  assert.equal(loadStops.stopTypeNumber(typeOrder, 1), 1);
  assert.equal(loadStops.stopTypeNumber(typeOrder, 2), 1);
  assert.equal(loadStops.stopTypeNumber(typeOrder, 3), 2);
  assert.equal(loadStops.stopTypeNumber(typeOrder, 4), 3);
  assert.equal(loadStops.stopTypeLabel("delivery", 1), "Delivery 1");
  assert.equal(loadStops.stopTypeLabel("pickup", 2), "Pickup 2");
  assert.equal(loadStops.stopMapMarkerText("pickup", 1), "P1");
  assert.equal(loadStops.stopMapMarkerText("delivery", 5), "D5");
  const defaultStops = loadStops.ensureDefaultStops(clonedId);
  assert.ok(defaultStops.length >= 2);
  loadStops.addStop(clonedId, {
    kind: "pickup",
    name: "Nashville DC",
    street: "500 Cold Storage Rd",
    city: "Nashville",
    state: "TN",
    zip: "37201",
    phone: "615-555-0100",
  });
  assert.equal(loadStops.listStops(clonedId).length, defaultStops.length + 1);

  const templates = await import("../lib/templates");
  const listedTemplates = templates.listTemplates();
  assert.ok(listedTemplates.some((row) => /Heartland/i.test(row.name)));
  const bookable = listedTemplates.find((row) => row.customer_id);
  assert.ok(bookable);
  const bookedFromTemplate = templates.createLoadFromTemplate(bookable.id);
  const bookedLoad = queries.getLoad(bookedFromTemplate);
  assert.ok(bookedLoad);
  assert.notEqual(bookedLoad.load_number, load1042.load_number);

  const templateId = templates.saveTemplateFromLoad(clonedId, "Smoke Westside lane");
  const fromTemplate = templates.listTemplates().find((row) => row.id === templateId);
  assert.ok(fromTemplate);
  assert.ok(fromTemplate.pick_count + fromTemplate.drop_count >= 2);
  assert.match(fromTemplate.customer_name, /\S/);
  const bookedLane = templates.createLoadFromTemplate(templateId);
  const bookedLaneLoad = queries.getLoad(bookedLane);
  assert.ok(bookedLaneLoad);
  assert.equal(bookedLaneLoad.rate, null);
  assert.notEqual(bookedLaneLoad.load_number, queries.getLoad(clonedId)?.load_number);
  assert.ok(loadStops.listStops(bookedLane).length >= 2);
  assert.ok(
    loadStops.listStops(bookedLane).some(
      (stop) => stop.street === "500 Cold Storage Rd" && stop.phone === "615-555-0100" && stop.zip === "37201",
    ),
    "template booking must copy full stop addresses",
  );
  assert.equal((await import("../lib/pay-items")).listPayItems(bookedLane).length, 0);

  const rules = await import("../lib/location-rules-shared");
  assert.deepEqual(rules.locationRuleLabels({ scheduling_type: "appointment", call_before: 1 }), [
    "Appointment required",
    "Call before pickup/delivery",
  ]);
  assert.doesNotMatch(rules.locationRuleLabels({ scheduling_type: "fcfs", call_before: 0 }).join(" "), /liftgate|inside/i);

  const nebraskaCold = {
    id: 1,
    name: "Nebraska Cold Storage",
    street: "4100 Industrial Rd",
    city: "Hastings",
    state: "NE",
    zip: "68901",
  };
  const heartland = {
    id: 2,
    name: "Heartland Logistics",
    street: "3900 Westside Ave",
    city: "Chicago",
    state: "IL",
    zip: "60632",
  };
  const westside = {
    id: 3,
    name: "Westside Frozen",
    street: "9 Quiet St",
    city: "Omaha",
    state: "NE",
    zip: "68102",
  };
  const tysonDakota = {
    id: 4,
    name: "Tyson Fresh Meats",
    street: "800 39th Ave",
    city: "Dakota City",
    state: "NE",
    zip: "68731",
  };
  const book = [nebraskaCold, heartland, westside, tysonDakota];
  const locSearch = await import("../lib/locations");
  const firstAssign = await import("../lib/first-assign");
  assert.equal(firstAssign.isFirstAssign(null, "12"), true);
  assert.equal(firstAssign.isFirstAssign("", "12"), true);
  assert.equal(firstAssign.isFirstAssign(12, "15"), false);
  assert.equal(firstAssign.isFirstAssign(12, ""), false);
  assert.equal(firstAssign.isAssignEdit(null, "12"), false);
  assert.equal(firstAssign.isAssignEdit("", "12"), false);
  assert.equal(firstAssign.isAssignEdit(12, "15"), true);
  assert.equal(firstAssign.isAssignEdit(12, "12"), false);
  assert.equal(firstAssign.isAssignEdit(12, ""), true);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "cold").map((row) => row.id), [1]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "heart").map((row) => row.id), [2]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "westside").map((row) => row.id), [2, 3]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "Hastings").map((row) => row.id), [1]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "39th").map((row) => row.id), [4]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "tyso").map((row) => row.id), [4]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "t y s o").map((row) => row.id), [4]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, "Nebraska"), [nebraskaCold]);
  assert.deepEqual(locSearch.filterLocationsForPicker(book, ""), []);
  assert.match(locSearch.formatLocationAddress(nebraskaCold), /4100 Industrial Rd/);
  assert.match(locSearch.formatLocationAddress(nebraskaCold), /Hastings, NE 68901/);
  assert.match(locSearch.formatLocationAddress(heartland), /3900 Westside Ave/);

  const autoSaveLoc = queries.createLocation({
    name: "Auto Save Cold",
    street: "100 Dock Rd",
    city: "Lincoln",
    state: "NE",
    zip: "68501",
    phone: "402-555-0199",
    notes: "",
    role: "both",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    call_before: 1,
  });
  const autoSaveLoad = queries.createLoad({
    customer_id: customerId,
    origin: "Lincoln, NE",
    destination: "Omaha, NE",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 10000,
    commodity: "Auto-save stop",
    rate: 400,
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
  });
  const blankStopId = loadStops.addStop(autoSaveLoad, {
    kind: "pickup",
    name: "Pickup",
    city: "",
    state: "",
  });
  assert.equal(loadStops.listStops(autoSaveLoad).find((row) => row.id === blankStopId)?.location_id ?? null, null);
  const pickedRow = queries.getLocation(autoSaveLoc);
  assert.ok(pickedRow);
  loadStops.updateStop(blankStopId, {
    kind: "pickup",
    name: pickedRow.name,
    street: pickedRow.street,
    city: pickedRow.city,
    state: pickedRow.state,
    zip: pickedRow.zip,
    phone: pickedRow.phone,
    location_id: pickedRow.id,
  });
  const savedPick = loadStops.listStops(autoSaveLoad).find((row) => row.id === blankStopId);
  assert.equal(savedPick?.location_id, autoSaveLoc, "picking a location persists location_id on the stop");
  assert.equal(savedPick?.name, "Auto Save Cold");
  assert.equal(savedPick?.street, "100 Dock Rd");
  assert.equal(savedPick?.city, "Lincoln");
  assert.equal(savedPick?.state, "NE");
  assert.equal(savedPick?.zip, "68501");
  assert.equal(savedPick?.phone, "402-555-0199");
  loadStops.updateStop(blankStopId, {
    kind: "delivery",
    name: pickedRow.name,
    street: pickedRow.street,
    city: pickedRow.city,
    state: pickedRow.state,
    zip: pickedRow.zip,
    phone: pickedRow.phone,
    location_id: pickedRow.id,
  });
  const flippedKind = loadStops.getStop(blankStopId);
  assert.equal(flippedKind?.kind, "delivery");
  const afterFlip = loadStops.listStops(autoSaveLoad);
  assert.equal(loadStops.stopTypeLabel(flippedKind.kind, loadStops.stopTypeNumber(afterFlip, blankStopId)), "Delivery 1");
  loadStops.ensureDefaultStops(autoSaveLoad);
  assert.equal(loadStops.getStop(blankStopId)?.kind, "delivery");
  loadStops.updateStop(blankStopId, {
    kind: "pickup",
    name: pickedRow.name,
    street: pickedRow.street,
    city: pickedRow.city,
    state: pickedRow.state,
    zip: pickedRow.zip,
    phone: pickedRow.phone,
    location_id: pickedRow.id,
  });
  assert.equal(loadStops.getStop(blankStopId)?.kind, "pickup");

  const secretLocation = queries.createLocation({
    name: "Notes Leak Yard",
    street: "9 Quiet St",
    city: "Omaha",
    state: "NE",
    zip: "68102",
    phone: "402-555-0100",
    notes: "PRIVATE LOCATION NOTE",
    role: "both",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "Public dock hours",
    call_before: 1,
  });
  const notesLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Omaha, NE",
    destination: "Lincoln, NE",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 10000,
    commodity: "Notes smoke",
    rate: 500,
    notes: "PRIVATE LOAD NOTE",
    public_notes: "PUBLIC LOAD NOTE",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: secretLocation,
    consignee_location_id: secretLocation,
    status: "delivered",
    truck_id: null,
    driver_id: null,
  });
  const notesConfirm = (await import("../lib/load-confirmation")).buildConfirmationModel(queries.getLoad(notesLoadId)!);
  assert.match(notesConfirm.dispatchNotes, /PUBLIC LOAD NOTE/);
  assert.doesNotMatch(notesConfirm.dispatchNotes, /PRIVATE LOAD NOTE/);
  assert.doesNotMatch(notesConfirm.shipper.extra, /PRIVATE LOCATION NOTE/);
  assert.match(notesConfirm.shipper.extra, /Call before pickup\/delivery|Appointment required/);
  const notesInvoice = (await import("../lib/invoice")).buildTmsInvoice(queries.getLoad(notesLoadId)!);
  assert.match(notesInvoice.publicNotes ?? "", /PUBLIC LOAD NOTE/);
  assert.doesNotMatch(notesInvoice.publicNotes ?? "", /PRIVATE/);

  const truckWithGps = queries.listTrucks().find((truck) => truck.active);
  const driverForGps = queries.listDrivers().find((driver) => driver.status !== "off_duty");
  if (truckWithGps && driverForGps) {
    queries.saveTruckGps(truckWithGps.id, {
      latitude: 41.25,
      longitude: -95.93,
      address: "Omaha, NE",
      recordedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
      source: "samsara",
    });
    queries.assignLoad(bookedFromTemplate, truckWithGps.id, driverForGps.id);
    queries.updateLoadStatus(bookedFromTemplate, "in_transit");
    const quietInbox = (await import("../lib/exceptions")).listExceptionInbox();
    assert.ok(quietInbox.items.some((item) => item.kind === "gps_quiet"));
  }

  const accountingPay = await import("../lib/accounting");
  const driverPayRows = accountingPay.listDriverPay();
  assert.ok(Array.isArray(driverPayRows));
  const aging = await import("../lib/accounting-aging");
  assert.equal(aging.paymentTermsDays("Net 30"), 30);
  assert.equal(aging.paymentTermsDays("30 days"), 30);
  assert.equal(aging.paymentTermsDays(""), 30);
  assert.equal(aging.agingAmounts(100, 0).current, 100);
  assert.equal(aging.agingAmounts(100, 12).aging0to29, 100);
  assert.equal(aging.agingAmounts(100, 40).aging30, 100);
  assert.equal(aging.qboInvoiceExportStatus({ qbo_invoice_id: "", qbo_sent_at: "" }).invoiceLine, "Unsent");
  assert.match(
    aging.qboInvoiceExportStatus({ qbo_invoice_id: "1", qbo_sent_at: "2026-08-30T13:24:00.000Z", paid: false }).invoiceLine,
    /Invoice Exported/,
  );
  const mapShared = await import("../lib/load-map-shared");
  assert.match(mapShared.stopAddressLine({ street: "1 Main", city: "Hastings", state: "NE", zip: "68901" }), /1 Main/);
  const mapLib = await import("../lib/load-map");
  const mapPickupLoc = queries.createLocation({
    name: "Map Pickup Yard",
    street: "100 Cold Storage Rd",
    city: "Nashville",
    state: "TN",
    zip: "37201",
    phone: "",
    notes: "",
    role: "shipper",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: 36.1627,
    longitude: -86.7816,
  });
  const mapDropLoc = queries.createLocation({
    name: "Map Delivery Dock",
    street: "200 Commerce St",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: 32.7767,
    longitude: -96.797,
  });
  const mapLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Nashville, TN",
    destination: "Dallas, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 20000,
    commodity: "Map smoke",
    rate: 1000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: mapPickupLoc,
    consignee_location_id: mapDropLoc,
    status: "assigned",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(mapLoadId, {
    kind: "pickup",
    name: "Map Pickup Yard",
    city: "Nashville",
    state: "TN",
    location_id: mapPickupLoc,
  });
  loadStops.addStop(mapLoadId, {
    kind: "delivery",
    name: "Map Delivery Dock",
    city: "Dallas",
    state: "TX",
    location_id: mapDropLoc,
  });
  const stopOnlyPoints = await mapLib.buildLoadMapPoints(mapLoadId);
  assert.ok(stopOnlyPoints.some((point) => point.kind === "pickup" && point.lat === 36.1627));
  assert.ok(stopOnlyPoints.some((point) => point.kind === "delivery" && point.lat === 32.7767));
  assert.ok(stopOnlyPoints.some((point) => point.kind === "pickup" && point.markerText === "P1" && /Pickup 1/.test(point.label)));
  assert.ok(stopOnlyPoints.some((point) => point.kind === "delivery" && point.markerText === "D1" && /Delivery 1/.test(point.label)));
  assert.equal(stopOnlyPoints.some((point) => point.kind === "truck"), false);
  const mapTruckId = queries.createTruck({
    unit_number: "MAP-77",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
  });
  const mapDriverId = queries.createDriver({
    name: "Map Smoke Driver",
    phone: "555-0177",
    license: "NE-CDL-MAP",
    pin: "1777",
    truck_id: mapTruckId,
    status: "available",
  });
  queries.assignLoad(mapLoadId, mapTruckId, mapDriverId);
  const assignedNoGps = await mapLib.buildLoadMapPoints(mapLoadId);
  assert.equal(
    assignedNoGps.some((point) => point.kind === "truck"),
    false,
    "do not invent a truck pin without stored Samsara GPS",
  );
  queries.saveTruckGps(mapTruckId, {
    latitude: 41.25,
    longitude: -95.93,
    address: "Omaha, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
  });
  const withTruck = await mapLib.buildLoadMapPoints(mapLoadId);
  const truckPin = withTruck.find((point) => point.kind === "truck");
  assert.ok(truckPin);
  assert.equal(truckPin?.lat, 41.25);
  assert.equal(truckPin?.lng, -95.93);
  const { ORBCOMM_REEFER_PIN_COLOR: loadMapReeferColor, SAMSARA_TRUCK_OFF_COLOR: loadMapTruckOff, SAMSARA_TRUCK_ON_COLOR: loadMapTruckOn } =
    await import("../lib/fleet-map-shared");
  assert.equal(truckPin?.pinColor, loadMapTruckOff);
  queries.saveTruckGps(mapTruckId, {
    latitude: 41.25,
    longitude: -95.93,
    address: "Omaha, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
    speedMph: 0,
    engineOn: true,
  });
  const truckOnPin = (await mapLib.buildLoadMapPoints(mapLoadId)).find((point) => point.kind === "truck");
  assert.equal(truckOnPin?.pinColor, loadMapTruckOn);
  const mapTrailerId = queries.createTrailer({
    unit_number: "MAP-TR-PIN",
    type: "reefer",
    orbcomm_asset_id: "orbcomm-map-tr-pin",
  });
  queries.saveTrailerGps(mapTrailerId, {
    latitude: 40.81,
    longitude: -96.7,
    address: "Lincoln, NE",
    recordedAt: "2026-08-20T14:30:00.000Z",
    source: "orbcomm",
  });
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "MAP-TR-PIN",
    setpoint_f: 34,
    temperature_f: 34,
    return_air_f: null,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "Shutdown",
    latitude: 40.81,
    longitude: -96.7,
    address: "Lincoln, NE",
    source: "orbcomm",
    recorded_at: "2026-08-20T14:30:00.000Z",
  });
  const mapTrailerLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Lincoln, NE",
    destination: "Omaha, NE",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Beef",
    rate: 1500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    trailer_id: mapTrailerId,
    status: "assigned",
    truck_id: null,
    driver_id: null,
  });
  const loadTrailerPin = (await mapLib.buildLoadMapPoints(mapTrailerLoadId)).find((point) => point.kind === "trailer");
  assert.equal(loadTrailerPin?.lat, 40.81);
  assert.equal(loadTrailerPin?.pinColor, loadMapReeferColor.shutdown);
  assert.equal(loadTrailerPin?.pinColor, "#dc2626");

  const previousOrbcommUser = process.env.ORBCOMM_USERNAME;
  const previousOrbcommPass = process.env.ORBCOMM_PASSWORD;
  delete process.env.ORBCOMM_USERNAME;
  delete process.env.ORBCOMM_PASSWORD;
  const fleetMap = await import("../lib/fleet-map");
  const { isPlottableCoord, ORBCOMM_REEFER_PIN_COLOR } = await import("../lib/fleet-map-shared");
  assert.equal(isPlottableCoord(41.25, -95.93), true);
  assert.equal(isPlottableCoord(null, -95.93), false);
  assert.equal(isPlottableCoord(Number.NaN, -95.93), false);
  const fleetMapTruckId = queries.createTruck({
    unit_number: "FM-SAM-1",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: "sam-fm-1",
  });
  queries.saveTruckGps(fleetMapTruckId, {
    latitude: 41.2565,
    longitude: -95.9345,
    address: "Omaha, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
    speedMph: 0,
    headingDeg: 10,
    engineOn: true,
  });
  queries.saveTruckOdometer(fleetMapTruckId, {
    miles: 188432,
    recordedAt: "2026-08-31T12:00:00.000Z",
    source: "samsara",
  });
  const fleetMapMoveId = queries.createTruck({
    unit_number: "FM-SAM-GO",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: "sam-fm-go",
  });
  queries.saveTruckGps(fleetMapMoveId, {
    latitude: 41.26,
    longitude: -95.94,
    address: "Omaha, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
    speedMph: 62,
    headingDeg: 85,
  });
  const fleetMapOldId = queries.createTruck({
    unit_number: "FM-OLD",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: "sam-fm-old",
  });
  queries.saveTruckGps(fleetMapOldId, {
    latitude: 32.7767,
    longitude: -96.797,
    address: "Dallas, TX",
    recordedAt: new Date().toISOString(),
    source: "samsara",
  });
  queries.setTruckActive(fleetMapOldId, false);
  const fleetMapEmptyId = queries.createTruck({
    unit_number: "FM-EMPTY",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const fleetMap41Id = queries.createTruck({
    unit_number: "41",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: "sam-fm-41",
  });
  queries.saveTruckGps(fleetMap41Id, {
    latitude: 37.9289,
    longitude: -100.9857,
    address: "Holcomb, KS",
    recordedAt: new Date().toISOString(),
    source: "samsara",
    speedMph: 0,
    headingDeg: 15,
    engineOn: false,
  });
  const fleetMap42Id = queries.createTruck({
    unit_number: "42",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: "sam-fm-42",
  });
  queries.saveTruckGps(fleetMap42Id, {
    latitude: 41.2565,
    longitude: -95.9345,
    address: "Omaha, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
    speedMph: 54,
    headingDeg: 120,
  });
  const samsaraFleetMap = await fleetMap.buildSamsaraFleetMap();
  const liveTruckPin = samsaraFleetMap.pins.find((pin) => pin.label === "FM-SAM-1");
  assert.ok(liveTruckPin, "active truck with stored Samsara GPS must plot");
  assert.equal(liveTruckPin?.lat, 41.2565);
  assert.equal(liveTruckPin?.lng, -95.9345);
  assert.equal(liveTruckPin?.href, `/fleet/trucks/${fleetMapTruckId}`);
  assert.equal(liveTruckPin?.reeferStatus, undefined);
  const { loadMapPinFill, loadMapPinSvg } = await import("../lib/load-map-shared");
  const { SAMSARA_TRUCK_OFF_COLOR, SAMSARA_TRUCK_ON_COLOR, samsaraTruckPinStyle } = await import(
    "../lib/fleet-map-shared"
  );
  assert.deepEqual(samsaraTruckPinStyle({ speedMph: 0, engineOn: true }), {
    pinColor: SAMSARA_TRUCK_ON_COLOR,
    pinShape: "circle",
    motion: "Parked",
  });
  assert.deepEqual(samsaraTruckPinStyle({ speedMph: 54, engineOn: false }), {
    pinColor: SAMSARA_TRUCK_ON_COLOR,
    pinShape: "arrow",
    motion: "Moving",
  });
  assert.deepEqual(samsaraTruckPinStyle({ speedMph: 0, engineOn: false }), {
    pinColor: SAMSARA_TRUCK_OFF_COLOR,
    pinShape: "circle",
    motion: "Parked",
  });
  assert.equal(liveTruckPin?.pinColor, SAMSARA_TRUCK_ON_COLOR);
  assert.equal(liveTruckPin?.pinColor, "#22c55e");
  assert.equal(liveTruckPin?.pinShape, "circle");
  assert.equal(liveTruckPin?.motion, "Parked");
  assert.match(loadMapPinSvg({ kind: "truck", pinColor: liveTruckPin?.pinColor, pinShape: "circle" }), /#22c55e/);
  assert.match(loadMapPinSvg({ kind: "truck", pinColor: liveTruckPin?.pinColor, pinShape: "circle" }), /circle cx="5" cy="5" r="4"/);
  assert.doesNotMatch(loadMapPinSvg({ kind: "truck", pinColor: liveTruckPin?.pinColor, pinShape: "circle" }), /M11 1.4|L13\.1 6\.8|M14 2\.2/);
  assert.equal(loadMapPinFill({ kind: "truck", pinColor: liveTruckPin?.pinColor }), SAMSARA_TRUCK_ON_COLOR);
  const movingTruckPin = samsaraFleetMap.pins.find((pin) => pin.label === "FM-SAM-GO");
  assert.equal(movingTruckPin?.pinShape, "arrow");
  assert.equal(movingTruckPin?.headingDeg, 85);
  assert.equal(movingTruckPin?.pinColor, SAMSARA_TRUCK_ON_COLOR);
  assert.equal(movingTruckPin?.motion, "Moving");
  assert.match(loadMapPinSvg({ kind: "truck", pinColor: movingTruckPin?.pinColor, pinShape: "arrow", headingDeg: 85 }), /#22c55e/);
  assert.match(loadMapPinSvg({ kind: "truck", pinColor: movingTruckPin?.pinColor, pinShape: "arrow", headingDeg: 85 }), /rotate\(85/);
  assert.match(loadMapPinSvg({ kind: "truck", pinColor: movingTruckPin?.pinColor, pinShape: "arrow", headingDeg: 85 }), /M7 1\.2 L12\.6 12\.6/);
  assert.doesNotMatch(loadMapPinSvg({ kind: "truck", pinColor: movingTruckPin?.pinColor, pinShape: "arrow", headingDeg: 85 }), /M11 1.4|L13\.1 6\.8|M14 2\.2|stroke-width="4\.2"/);
  assert.equal(
    samsaraFleetMap.pins.some((pin) => pin.label === "FM-OLD"),
    false,
    "deactivated trucks stay off the live Samsara map",
  );
  assert.ok(samsaraFleetMap.missing.some((item) => item.label === "FM-EMPTY" && item.id === fleetMapEmptyId));
  const samsaraStatus = samsaraFleetMap.truckStatusRows?.find((row) => row.truck === "FM-SAM-1");
  assert.ok(samsaraStatus, "Samsara page lists every active truck under the map");
  assert.match(samsaraStatus.location, /Omaha/);
  assert.equal(samsaraStatus.miles, 188432);
  assert.equal(samsaraStatus.driver, "");
  assert.ok(samsaraFleetMap.truckStatusRows?.some((row) => row.truck === "FM-EMPTY" && !row.location && row.miles == null));
  assert.equal(samsaraFleetMap.truckStatusRows?.some((row) => row.truck === "FM-OLD"), false);
  queries.assignLoad(mapLoadId, fleetMapTruckId, mapDriverId);
  const assignedSamsaraMap = await fleetMap.buildSamsaraFleetMap();
  assert.equal(
    assignedSamsaraMap.pins.find((pin) => pin.label === "FM-SAM-1")?.href,
    `/loads/${mapLoadId}`,
  );
  const fleetReeferId = queries.createTrailer({
    unit_number: "FM-R1",
    type: "reefer",
    orbcomm_asset_id: "orb-fm-r1",
  });
  queries.saveTrailerGps(fleetReeferId, {
    latitude: 39.7684,
    longitude: -86.1581,
    address: "Indianapolis, IN",
    recordedAt: new Date().toISOString(),
    source: "orbcomm",
  });
  const fleetDryId = queries.createTrailer({
    unit_number: "FM-DRY",
    type: "dry_van",
    orbcomm_asset_id: "orb-fm-dry",
  });
  queries.saveTrailerGps(fleetDryId, {
    latitude: 36.1627,
    longitude: -86.7816,
    address: "Nashville, TN",
    recordedAt: new Date().toISOString(),
    source: "orbcomm",
  });
  const fleetEmptyReeferId = queries.createTrailer({
    unit_number: "FM-R0",
    type: "reefer",
  });
  const orbcommFleetMap = await fleetMap.buildOrbcommFleetMap();
  const reeferPin = orbcommFleetMap.pins.find((pin) => pin.label === "FM-R1");
  assert.ok(reeferPin, "reefer with stored ORBCOMM GPS must plot");
  assert.equal(reeferPin?.lat, 39.7684);
  assert.equal(reeferPin?.lng, -86.1581);
  assert.equal(reeferPin?.href, `/fleet/trailers/${fleetReeferId}`);
  assert.ok(reeferPin?.recordedAt, "pin list should carry the Orbcomm message time");
  assert.equal(reeferPin?.reeferStatus, "unknown", "missing Orbcomm mode stays a default pin");
  assert.equal(reeferPin?.pinColor, ORBCOMM_REEFER_PIN_COLOR.unknown);
  assert.notEqual(reeferPin?.pinColor, ORBCOMM_REEFER_PIN_COLOR.running);
  const reeferStatus = orbcommFleetMap.statusRows?.find((row) => row.trailer === "FM-R1");
  assert.ok(reeferStatus?.messageAt, "status row should show the Orbcomm message time");
  const emptyStatus = orbcommFleetMap.statusRows?.find((row) => row.trailer === "FM-R0");
  assert.equal(emptyStatus?.messageAt ?? "", "", "no message yet stays blank");
  assert.equal(orbcommFleetMap.pins.some((pin) => pin.label === "FM-DRY"), false, "dry-van trailers stay off the reefer map");
  assert.ok(orbcommFleetMap.missing.some((item) => item.label === "FM-R0" && item.id === fleetEmptyReeferId));
  assert.match(orbcommFleetMap.sourceNote, /stored|not connected/i);
  for (const row of [
    { unit: "FM-RUN", lat: 40.586, lng: -98.39, mode: "Running", status: "running" as const },
    { unit: "FM-OFF", lat: 40.587, lng: -98.391, mode: "Power Off", status: "off" as const },
    { unit: "FM-SD", lat: 40.588, lng: -98.392, mode: "Shutdown", status: "shutdown" as const },
  ]) {
    queries.createTrailer({ unit_number: row.unit, type: "reefer" });
    orbcomm.insertReeferReading({
      load_id: null,
      truck_id: null,
      trailer_id: row.unit,
      setpoint_f: 34,
      temperature_f: 34,
      return_air_f: 34,
      supply_air_f: null,
      door_open: 0,
      alarm: "",
      operating_mode: row.mode,
      latitude: row.lat,
      longitude: row.lng,
      address: "Hastings, NE",
      source: "orbcomm",
      recorded_at: "2026-08-25T12:00:00Z",
    });
  }
  queries.createTrailer({ unit_number: "FM-MOVE", type: "reefer" });
  queries.createTrailer({ unit_number: "FM-STOP", type: "reefer" });
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "FM-MOVE",
    setpoint_f: 34,
    temperature_f: 34,
    return_air_f: 34,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "Running",
    latitude: 40.59,
    longitude: -98.4,
    address: "Hastings, NE",
    source: "orbcomm",
    recorded_at: "2026-08-25T12:05:00Z",
    speed_mph: 62,
    heading_deg: 85,
  });
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "FM-STOP",
    setpoint_f: 34,
    temperature_f: 34,
    return_air_f: 34,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "Running",
    latitude: 40.591,
    longitude: -98.401,
    address: "Hastings, NE",
    source: "orbcomm",
    recorded_at: "2026-08-25T12:06:00Z",
    speed_mph: 3,
    heading_deg: 10,
  });
  const { orbcommPinShape, orbcommTrailerMoving, clusterPinLabelSlots, unitLabelBesideOrigin, fleetMapDisplayPoints } =
    await import("../lib/fleet-map-shared");
  assert.equal(orbcommTrailerMoving(5), true);
  assert.equal(orbcommTrailerMoving(4), false);
  assert.equal(orbcommTrailerMoving(null), false);
  assert.equal(orbcommPinShape(62), "arrow");
  assert.equal(orbcommPinShape(3), "circle");
  const besideShort = unitLabelBesideOrigin("27", 0);
  const besideLong = unitLabelBesideOrigin("MS1522", 0);
  const besideOverlap = unitLabelBesideOrigin("28", 1);
  assert.ok(besideShort.x > 0, "unit number sits to the right of a lone pin");
  assert.ok(besideLong.x > besideShort.x, "longer trailer numbers sit farther beside the pin");
  assert.ok(besideOverlap.x < 0, "overlapping pins offset the next label to the other side");
  assert.notEqual(besideOverlap.x, besideShort.x);
  const overlapSlots = clusterPinLabelSlots([
    { id: "a", lat: 40.586, lng: -98.39, label: "27" },
    { id: "b", lat: 40.586, lng: -98.39, label: "28" },
    { id: "c", lat: 41.2565, lng: -95.9345, label: "42" },
  ]);
  assert.equal(overlapSlots.get("a") === overlapSlots.get("b"), false);
  assert.equal(overlapSlots.get("c"), 0);
  const fortyOneFortyTwo = clusterPinLabelSlots([
    { id: "truck-41", lat: 37.9289, lng: -100.9857, label: "41" },
    { id: "truck-42", lat: 41.2565, lng: -95.9345, label: "42" },
  ]);
  assert.equal(fortyOneFortyTwo.get("truck-41"), 0);
  assert.equal(fortyOneFortyTwo.get("truck-42"), 0);
  const pin41 = samsaraFleetMap.pins.filter((pin) => pin.label === "41");
  const pin42 = samsaraFleetMap.pins.filter((pin) => pin.label === "42");
  assert.equal(pin41.length, 1, "truck 41 plots once");
  assert.equal(pin42.length, 1, "truck 42 plots once");
  assert.notEqual(pin41[0]?.id, pin42[0]?.id);
  assert.notEqual(pin41[0]?.lat, pin42[0]?.lat);
  assert.equal(pin41[0]?.pinColor, SAMSARA_TRUCK_OFF_COLOR);
  assert.equal(pin42[0]?.pinColor, SAMSARA_TRUCK_ON_COLOR);
  assert.equal(pin41[0]?.pinShape, "circle");
  assert.equal(pin42[0]?.pinShape, "arrow");
  assert.equal(pin41[0]?.motion, "Parked");
  assert.equal(pin42[0]?.motion, "Moving");
  const samsaraLabels = fleetMapDisplayPoints(samsaraFleetMap.pins);
  const labeledLiveTruck = samsaraLabels.find((pin) => pin.label === "FM-SAM-1");
  assert.equal(labeledLiveTruck?.markerText, "FM-SAM-1");
  assert.equal(labeledLiveTruck?.labelClassName, "fleet-pin-label");
  assert.ok(labeledLiveTruck?.labelOrigin && labeledLiveTruck.labelOrigin.x !== 0);
  assert.doesNotMatch(labeledLiveTruck?.markerText ?? "", /Dallas|Omaha|Indianapolis|Hastings|, TX|, NE/);
  const labeledMovingTruck = samsaraLabels.find((pin) => pin.label === "FM-SAM-GO");
  assert.equal(labeledMovingTruck?.markerText, "FM-SAM-GO");
  assert.equal(labeledMovingTruck?.pinShape, "arrow");
  assert.equal(orbcomm.parseOrbcommSpeedMph({ speedMph: 58 }), 58);
  assert.equal(orbcomm.parseOrbcommHeadingDeg({ course: 90 }), 90);
  const coloredOrbcommMap = await fleetMap.buildOrbcommFleetMap();
  assert.equal(coloredOrbcommMap.pins.find((item) => item.label === "FM-MOVE")?.pinShape, "arrow");
  assert.equal(coloredOrbcommMap.pins.find((item) => item.label === "FM-MOVE")?.headingDeg, 85);
  assert.equal(coloredOrbcommMap.pins.find((item) => item.label === "FM-STOP")?.pinShape, "circle");
  const orbcommLabels = fleetMapDisplayPoints(coloredOrbcommMap.pins);
  const labeledMove = orbcommLabels.find((pin) => pin.label === "FM-MOVE");
  const labeledStop = orbcommLabels.find((pin) => pin.label === "FM-STOP");
  assert.equal(labeledMove?.markerText, "FM-MOVE");
  assert.equal(labeledStop?.markerText, "FM-STOP");
  assert.equal(labeledMove?.pinShape, "arrow");
  assert.equal(labeledStop?.pinShape, "circle");
  assert.equal(labeledMove?.pinColor, ORBCOMM_REEFER_PIN_COLOR.running);
  assert.doesNotMatch(labeledMove?.markerText ?? "", /Hastings|Indianapolis|, IN|, NE/);
  for (const row of [
    { unit: "FM-RUN", status: "running" as const },
    { unit: "FM-OFF", status: "off" as const },
    { unit: "FM-SD", status: "shutdown" as const },
  ]) {
    const pin = coloredOrbcommMap.pins.find((item) => item.label === row.unit);
    assert.equal(pin?.reeferStatus, row.status, `${row.unit} pin uses stored Orbcomm mode`);
    assert.equal(pin?.pinColor, ORBCOMM_REEFER_PIN_COLOR[row.status]);
    assert.equal(
      coloredOrbcommMap.statusRows?.find((item) => item.trailer === row.unit)?.power,
      row.status === "running" ? "On" : row.status === "off" ? "Off" : "Shutdown",
    );
  }
  queries.assignLoad(mapLoadId, fleetMapTruckId, mapDriverId, fleetReeferId);
  const assignedOrbcommMap = await fleetMap.buildOrbcommFleetMap();
  assert.equal(assignedOrbcommMap.pins.find((pin) => pin.label === "FM-R1")?.href, `/loads/${mapLoadId}`);
  if (previousOrbcommUser == null) delete process.env.ORBCOMM_USERNAME;
  else process.env.ORBCOMM_USERNAME = previousOrbcommUser;
  if (previousOrbcommPass == null) delete process.env.ORBCOMM_PASSWORD;
  else process.env.ORBCOMM_PASSWORD = previousOrbcommPass;

  const reorderIds = loadStops.listStops(mapLoadId).map((stop) => stop.id);
  if (reorderIds.length >= 2) {
    loadStops.reorderStops(mapLoadId, [reorderIds[1], reorderIds[0], ...reorderIds.slice(2)]);
    const reordered = loadStops.listStops(mapLoadId);
    assert.equal(reordered[0]?.id, reorderIds[1]);
    assert.equal(reordered[1]?.id, reorderIds[0]);
    loadStops.reorderStops(mapLoadId, reorderIds);
  }

  const oneStopLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Nashville, TN",
    destination: "Nashville, TN",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 1000,
    commodity: "One pin",
    rate: 100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    shipper_location_id: mapPickupLoc,
    consignee_location_id: null,
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(oneStopLoadId, {
    kind: "pickup",
    name: "Map Pickup Yard",
    city: "Nashville",
    state: "TN",
    location_id: mapPickupLoc,
  });
  const onePoint = await mapLib.buildLoadMapPoints(oneStopLoadId);
  assert.equal(onePoint.length, 1);
  assert.equal(onePoint[0].kind, "pickup");
  audit.runWithAuditActor({ name: "MS Test", kind: "dispatcher" }, () => {
    audit.recordLoadAudit({
      loadId: mapLoadId,
      action: "check_call",
      field: "notes",
      oldValue: "2026-08-25T12:00:00.000Z",
      newValue: "Rolling I-80, on time",
    });
  });
  const mapEvents = await mapLib.listLoadTrackingEvents(mapLoadId);
  assert.ok(mapEvents.some((event) => event.source === "check_call" && event.note === "Rolling I-80, on time"));
  assert.ok(mapEvents.some((event) => event.source === "samsara" && event.gps?.includes("41.25")));
  assert.equal(mapEvents.some((event) => event.source === "samsara" && event.note.includes("Dallas")), false);

  const settlementPayItems = await import("../lib/pay-items");
  const invoiceGuard = await import("../lib/invoice");
  queries.updateLoadStatus(mapLoadId, "delivered");
  const { sendLoadToAccounting } = await import("../lib/accounting-desk");
  sendLoadToAccounting(mapLoadId);
  const driverPayItemId = settlementPayItems.addPayItem(mapLoadId, {
    side: "expense",
    bill_to: "driver",
    payee: "Map Smoke Driver",
    category: "flat_rate",
    rate: 250,
    qty: 1,
    total: 250,
    notes: "Driver settlement only",
  });
  const customerRateItemId = settlementPayItems.addPayItem(mapLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Map Customer",
    category: "flat_rate",
    rate: 1000,
    qty: 1,
    total: 1000,
    notes: "Customer freight",
  });
  const payLines = accountingPay.listDriverPay();
  assert.ok(payLines.some((line) => line.payItem?.id === driverPayItemId && line.status === "open"));
  assert.equal(payLines.some((line) => line.payItem?.id === customerRateItemId), false);
  const invoiceModel = invoiceGuard.buildTmsInvoice(queries.getLoad(mapLoadId)!);
  assert.doesNotMatch(JSON.stringify(invoiceModel), /Driver settlement only/);
  assert.doesNotMatch(invoiceModel.publicNotes ?? "", /PRIVATE/);
  settlementPayItems.markPayItemPaid(driverPayItemId);
  assert.ok(accountingPay.listDriverPay().some((line) => line.payItem?.id === driverPayItemId && line.status === "paid"));
  const payXlsx = accountingPay.renderDriverPayXlsx(accountingPay.listDriverPay());
  const paySheet = (await import("../lib/xlsx-first-sheet")).recordsFromFirstSheet(payXlsx);
  assert.ok(paySheet.some((row) => String(row["Load #"] ?? "").includes(queries.getLoad(mapLoadId)?.load_number ?? "___")));
  const payDay = (delivery.toISOString() || "").slice(0, 10);
  const closed = accountingPay.closeDriverPayPeriod(payDay, payDay);
  assert.ok(closed >= 0);

  const session = await import("../lib/dispatcher-session");
  const msTest = session.listDispatchers().find((row) => row.name === "MS Test");
  assert.ok(msTest);
  assert.equal(session.listDispatchers().some((row) => row.name === "Ana G"), false);
  assert.equal(msTest.totp_enrolled, false);
  assert.equal("pin" in msTest, false);
  assert.equal("password_hash" in msTest, false);
  assert.equal("totp_secret" in msTest, false);
  assert.throws(() => session.authenticateDispatcher(msTest.id, "4020"), /Administrator|Forgot password|not recognized/);
  assert.throws(() => session.authenticateDispatcher(msTest.id, "0000"), /Administrator|Forgot password|not recognized/);
  settingsMod.updateDispatcherUser(msTest.id, {
    name: msTest.name,
    role: msTest.role,
    email: msTest.email,
    phone: "4025550100",
    password: "Office1$ab",
  });
  assert.equal(session.authenticateDispatcher(msTest.id, "Office1$ab").role, "manager");
  settingsMod.updateDispatcherUser(msTest.id, {
    name: msTest.name,
    role: msTest.role,
    email: "office.login@msloads.com",
    phone: "4025550100",
  });
  assert.equal(session.authenticateDispatcherByEmail("office.login@msloads.com", "Office1$ab").id, msTest.id);
  assert.throws(() => session.authenticateDispatcherByEmail("nobody@msloads.com", "Office1$ab"), /not recognized/);
  assert.throws(() => session.authenticateDispatcher(msTest.id, "4020"), /not recognized/);
  assert.ok(session.parseSessionValue(`${msTest.id}.${Date.now()}`));
  assert.equal(session.parseSessionValue(`${msTest.id}.${Date.now() - session.DISPATCHER_SESSION_MS - 1}`), null);

  const accounting = await import("../lib/accounting");
  assert.ok(accounting.listBills().some((bill) => /Lumper/i.test(bill.vendor)));
  const deliveredForBooks = queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1047");
  assert.ok(deliveredForBooks);
  assert.equal(deliveredForBooks.status, "delivered");
  assert.equal(accounting.listReceivables().some((row) => row.id === deliveredForBooks.id), false);
  const deskMod = await import("../lib/accounting-desk");
  const sentBooks = deskMod.sendLoadToAccounting(deliveredForBooks.id);
  assert.equal(sentBooks.status, "accounting");
  assert.equal(sentBooks.accounting_desk, "accounting");
  assert.equal(queries.listLoads({ status: "active" }).some((load) => load.id === deliveredForBooks.id), false);
  assert.equal(queries.listLoads().some((load) => load.id === deliveredForBooks.id), false);
  assert.equal(queries.listLoads({ status: "accounting" }).some((load) => load.id === sentBooks.id), true);
  assert.equal(queries.listLoads({ status: "misc" }).some((load) => load.id === sentBooks.id), false);
  const { isActiveLoadStatus } = await import("../lib/types");
  const { loadShowsOnDispatchBoard } = await import("../lib/load-list-shared");
  assert.equal(isActiveLoadStatus(sentBooks.status), false);
  assert.equal(loadShowsOnDispatchBoard(sentBooks.status), false);
  if (sentBooks.driver_id) {
    assert.equal(
      queries
        .listLoadsForDriver(sentBooks.driver_id)
        .filter((load) => isActiveLoadStatus(load.status))
        .some((load) => load.id === sentBooks.id),
      false,
    );
  }
  assert.ok(accounting.listReceivables().some((row) => row.id === deliveredForBooks.id));
  assert.ok(
    queries.searchLoads({ includeLive: true, includeArchived: false, q: "MSE-1047" }).some(
      (load) => load.id === deliveredForBooks.id,
    ),
  );
  const archivedBooks = deskMod.archiveAccountingLoad(deliveredForBooks.id);
  assert.equal(archivedBooks.accounting_desk, "archived");
  assert.equal(accounting.listReceivables().some((row) => row.id === deliveredForBooks.id), false);
  deskMod.unarchiveAccountingLoad(deliveredForBooks.id);
  const backToOps = deskMod.returnLoadToOperations(deliveredForBooks.id);
  assert.equal(backToOps.status, "delivered");
  assert.equal(backToOps.accounting_desk, "operations");
  assert.ok(accounting.listCommissions().length >= 1);

  const desk = await import("../lib/desk");
  const firstException = inbox.items[0];
  desk.setExceptionState(firstException.id, "resolved", "smoke");
  const liveInbox = desk.listLiveExceptionInbox();
  assert.equal(liveInbox.items.some((item) => item.id === firstException.id), false);
  assert.equal(liveInbox.attentionCount, new Set(liveInbox.items.map((item) => item.loadId)).size);
  desk.setHandoffNote("Smoke handoff");
  assert.equal(desk.getHandoffNote(), "Smoke handoff");
  queries.setLoadWatched(load1042.id, true);
  assert.ok(queries.listWatchedLoads().some((load) => load.id === load1042.id));

  const holdCustomer = queries.getCustomer(customerId);
  assert.ok(holdCustomer);
  queries.updateCustomer(customerId, {
    name: holdCustomer.name,
    billing_notes: holdCustomer.billing_notes,
    credit_hold: true,
    payment_terms: "Net 15",
    contacts: holdCustomer.contacts,
  });
  assert.equal(queries.getCustomer(customerId)?.credit_hold, 1);
  assert.equal(queries.getCustomer(customerId)?.payment_terms, "Net 15");

  const smokeTruck = queries.getTruck(truckId);
  assert.ok(smokeTruck);
  queries.updateTruck(truckId, {
    unit_number: smokeTruck.unit_number,
    type: smokeTruck.type,
    capacity_lbs: smokeTruck.capacity_lbs,
    status: smokeTruck.status,
    vin: "1FTSW21P04EB12345",
    plate: "TN-SMOKE",
    year: "2022",
    make: "Freightliner",
    model: "Cascadia",
    notes: "Shop next week",
    active: 1,
  });
  assert.equal(queries.getTruck(truckId)?.vin, "1FTSW21P04EB12345");
  assert.equal(queries.getTruck(truckId)?.model, "Cascadia");
  assert.equal(queries.getTruck(truckId)?.notes, "Shop next week");
  queries.updateTruck(truckId, {
    unit_number: smokeTruck.unit_number,
    type: "reefer",
    capacity_lbs: smokeTruck.capacity_lbs,
    status: smokeTruck.status,
    vin: "1FTSW21P04EB12345",
    plate: "TN-SMOKE",
    year: "2022",
    make: "Freightliner",
    model: "Cascadia",
    notes: "Shop next week",
    active: 1,
  });
  assert.equal(queries.getTruck(truckId)?.type, "sleeper", "tractor type is cab, not trailer equipment");
  const { parseTrailerType, parseTruckType } = await import("../lib/fleet-form-shared");
  assert.equal(parseTruckType(""), "sleeper");
  assert.equal(parseTrailerType(""), "reefer");
  assert.equal(parseTruckType("reefer"), "sleeper");
  const persistTypeId = queries.createTruck({
    unit_number: "TYPE-SAVE",
    type: "dry_van",
    capacity_lbs: 45000,
    status: "available",
  });
  const persistTypeTruck = queries.getTruck(persistTypeId);
  assert.ok(persistTypeTruck);
  const truckTypeForm = new FormData();
  truckTypeForm.set("id", String(persistTypeId));
  truckTypeForm.set("unit_number", persistTypeTruck.unit_number);
  truckTypeForm.set("type", "reefer");
  truckTypeForm.set("capacity_lbs", String(persistTypeTruck.capacity_lbs));
  truckTypeForm.set("status", persistTypeTruck.status);
  queries.updateTruck(persistTypeId, {
    unit_number: String(truckTypeForm.get("unit_number")),
    type: parseTruckType(truckTypeForm.get("type")),
    capacity_lbs: persistTypeTruck.capacity_lbs,
    status: persistTypeTruck.status,
    vin: persistTypeTruck.vin,
    plate: persistTypeTruck.plate,
    year: persistTypeTruck.year,
    make: persistTypeTruck.make,
    model: persistTypeTruck.model,
    notes: persistTypeTruck.notes,
    active: persistTypeTruck.active,
  });
  assert.equal(queries.getTruck(persistTypeId)?.type, "sleeper", "saving a tractor type stores cab, not Reefer");
  const typeTrailerId = queries.createTrailer({
    unit_number: "REEF-SAVE",
    type: "dry_van",
    status: "available",
  });
  const typeTrailer = queries.getTrailer(typeTrailerId);
  assert.ok(typeTrailer);
  const trailerTypeForm = new FormData();
  trailerTypeForm.set("id", String(typeTrailerId));
  trailerTypeForm.set("unit_number", typeTrailer.unit_number);
  trailerTypeForm.set("type", "reefer");
  queries.updateTrailer(typeTrailerId, {
    unit_number: String(trailerTypeForm.get("unit_number")),
    type: parseTrailerType(trailerTypeForm.get("type")),
    orbcomm_asset_id: typeTrailer.orbcomm_asset_id,
    registration_issued: typeTrailer.registration_issued,
    registration_expires: typeTrailer.registration_expires,
    dot_inspected_on: typeTrailer.dot_inspected_on,
    dot_expires: typeTrailer.dot_expires,
    status: typeTrailer.status,
    vin: typeTrailer.vin,
    plate: typeTrailer.plate,
    truck_id: typeTrailer.truck_id,
    notes: typeTrailer.notes,
    reefer_setpoint_f: typeTrailer.reefer_setpoint_f,
    active: typeTrailer.active,
  });
  assert.equal(queries.getTrailer(typeTrailerId)?.type, "reefer", "saving trailer Reefer stays Reefer");
  const truckFormSrc = fs.readFileSync(path.join(process.cwd(), "components/truck-form.tsx"), "utf8");
  const trailerFormSrc = fs.readFileSync(path.join(process.cwd(), "components/trailer-form.tsx"), "utf8");
  assert.match(truckFormSrc, /formData\.set\("type"/);
  assert.match(trailerFormSrc, /formData\.set\("type"/);
  assert.match(truckFormSrc, /DEFAULT_CAB_TYPE/);
  assert.match(trailerFormSrc, /DEFAULT_FLEET_TYPE/);
  assert.match(basicsChunk, /DEFAULT_LOAD_EQUIPMENT/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/types.ts"), "utf8"), /DEFAULT_LOAD_EQUIPMENT = "reefer_53"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-input.ts"), "utf8"), /DEFAULT_LOAD_EQUIPMENT/);
  const fleetFormShared = fs.readFileSync(path.join(process.cwd(), "lib/fleet-form-shared.ts"), "utf8");
  assert.match(fleetFormShared, /DEFAULT_FLEET_TYPE/);
  assert.doesNotMatch(fleetFormShared, /\|\| "dry_van"/);
  assert.equal(isClosedStatus("completed"), true);

  queries.deleteLocation(oneOffShipper);
  assert.equal(queries.getLocation(oneOffShipper), null);
  assert.equal(queries.getLoad(locatedId)?.shipper_location_id, null, "delete location unlinks loads");

  const qbo = await import("../lib/integrations/quickbooks");
  const qboEnvKeys = [
    "QUICKBOOKS_CLIENT_ID",
    "QUICKBOOKS_CLIENT_SECRET",
    "QUICKBOOKS_REFRESH_TOKEN",
    "QUICKBOOKS_REALM_ID",
    "QUICKBOOKS_ENVIRONMENT",
    "QBO_CLIENT_ID",
    "QBO_CLIENT_SECRET",
    "QBO_REDIRECT_URI",
    "QBO_REFRESH_TOKEN",
    "QBO_REALM_ID",
    "QBO_SANDBOX",
  ] as const;
  const previousQbo = Object.fromEntries(qboEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of qboEnvKeys) delete process.env[key];
  process.env.TMS_QBO_REFRESH_PATH = path.join(os.tmpdir(), `qbo-refresh-smoke-${Date.now()}.json`);
  qbo.resetQuickbooksForTests();

  try {
    queries.updateLoadStatus(coleLoad.id, "delivered");
    const coleDelivered = queries.getLoad(coleLoad.id);
    assert.ok(coleDelivered);
    assert.ok(coleDelivered.rate != null);
    assert.ok(coleDelivered.oo_pay != null);
    const ooPreview = qbo.previewQuickbooksInvoice(coleDelivered);
    assert.equal(ooPreview.mode, "demo");
    assert.equal(ooPreview.amount, coleDelivered.rate, "QBO invoice uses customer rate, not OO pay");
    assert.notEqual(ooPreview.amount, coleDelivered.oo_pay);
    assert.match(ooPreview.memo, /Customer invoice only/);
    assert.equal(
      ooPreview.lines.some((line) => /relay|owner-operator|oo pay/i.test(`${line.name} ${line.description}`)),
      false,
    );
    const lumperLines = qbo.buildInvoiceLines({ ...coleDelivered, lumper_actual: 150 });
    assert.equal(lumperLines.reduce((sum, line) => sum + line.amount, 0), (coleDelivered.rate ?? 0) + 150);
    assert.ok(lumperLines.some((line) => line.name === "Lumper"));
    assert.equal(qbo.oauthStatesMatch("abc123", "abc123"), true);
    assert.equal(qbo.oauthStatesMatch("abc123", "abc124"), false);

    const available = queries.listLoads({ status: "available" })[0];
    assert.ok(available);
    await assert.rejects(() => qbo.sendLoadToQuickbooks(available.id), /Delivered/);

    const deliveredLoad = queries.getLoad(loadId);
    assert.ok(deliveredLoad);
    const preview = qbo.previewQuickbooksInvoice(deliveredLoad);
    assert.equal(preview.mode, "demo");
    assert.equal(preview.amount, 1400);
    assert.match(preview.lane, /Jackson, MS/);
    assert.match(preview.memo, /RC-SMOKE/);

    const demoSent = await qbo.sendLoadToQuickbooks(loadId);
    assert.equal(demoSent.source, "demo");
    assert.match(demoSent.invoiceId, /^demo-MSE-\d+-\d+$/);
    const afterDemo = queries.getLoad(loadId);
    assert.ok(afterDemo);
    assert.equal(afterDemo.qbo_invoice_id, demoSent.invoiceId);
    assert.ok(afterDemo.qbo_sent_at);
    assert.equal(afterDemo.qbo_source, "demo");

    await assert.rejects(() => qbo.sendLoadToQuickbooks(loadId), /already sent/i);

    const demoResent = await qbo.sendLoadToQuickbooks(loadId, { confirmResend: true });
    assert.notEqual(demoResent.invoiceId, demoSent.invoiceId);

    const unbilledZeroId = queries.createLoad({
      customer_id: customerId,
      origin: "Hastings, NE",
      destination: "Bronx, NY",
      pickup_start: pickup.toISOString(),
      pickup_end: pickupEnd.toISOString(),
      delivery_start: delivery.toISOString(),
      delivery_end: deliveryEnd.toISOString(),
      weight: 40000,
      commodity: "Unbilled zero",
      rate: 0,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "accounting",
      truck_id: null,
      driver_id: null,
    });
    const unbilledZero = queries.getLoad(unbilledZeroId);
    assert.ok(unbilledZero);
    const zeroPreview = qbo.previewQuickbooksInvoice(unbilledZero);
    assert.equal(zeroPreview.amount, 0);
    assert.equal(zeroPreview.lines.length, 0);
    await assert.rejects(() => qbo.sendLoadToQuickbooks(unbilledZeroId), /no customer billed rate/i);
    const { sendToQuickbooksAction, sendToQuickbooksFormAction } = await import("../lib/actions");
    const zeroForm = new FormData();
    zeroForm.set("load_id", String(unbilledZeroId));
    const zeroResult = await sendToQuickbooksAction(null, zeroForm);
    assert.equal(zeroResult.ok, false);
    assert.match(zeroResult.error, /no customer billed rate/i);
    await sendToQuickbooksFormAction(zeroForm);
    assert.ok(!queries.getLoad(unbilledZeroId)?.qbo_invoice_id);

    const coleForm = new FormData();
    coleForm.set("load_id", String(coleLoad.id));
    const coleSend = await sendToQuickbooksAction(null, coleForm);
    assert.equal(coleSend.ok, true);
    assert.match(String(coleSend.message), /Invoice sent to QuickBooks/);
    const coleAgainSilent = await sendToQuickbooksAction(null, coleForm);
    assert.equal(coleAgainSilent.ok, false);
    assert.match(coleAgainSilent.error, /already sent|send again/i);
    coleForm.set("confirm_resend", "1");
    const coleAgain = await sendToQuickbooksAction(null, coleForm);
    assert.equal(coleAgain.ok, true);
    assert.match(String(coleAgain.message), /sent again/i);

    const qboStatus = await qbo.getQuickbooksStatus();
    assert.equal(qboStatus.configured, false);
    assert.equal(qboStatus.status, "Demo");
    assert.equal(qboStatus.oauthReady, false);

    process.env.QBO_CLIENT_ID = "alias-client";
    process.env.QBO_CLIENT_SECRET = "alias-secret";
    process.env.QBO_SANDBOX = "true";
    const envMod = await import("../lib/env");
    assert.equal(envMod.getQuickbooksClientId(), "alias-client");
    assert.equal(envMod.getQuickbooksEnvironment(), "sandbox");
    assert.equal(envMod.isQuickbooksOAuthReady(), true);
    const needsConnect = await qbo.getQuickbooksStatus();
    assert.equal(needsConnect.status, "Needs connect");
    assert.match(qbo.buildQuickbooksAuthorizeUrl("state-xyz"), /appcenter\.intuit\.com\/connect\/oauth2/);
    assert.match(qbo.buildQuickbooksAuthorizeUrl("state-xyz"), /state-xyz/);
    delete process.env.QBO_CLIENT_ID;
    delete process.env.QBO_CLIENT_SECRET;
    delete process.env.QBO_SANDBOX;

    process.env.QUICKBOOKS_CLIENT_ID = "test-not-a-real-client-id";
    process.env.QUICKBOOKS_CLIENT_SECRET = "test-not-a-real-client-secret";
    process.env.QUICKBOOKS_REFRESH_TOKEN = "test-not-a-real-refresh-token";
    process.env.QUICKBOOKS_REALM_ID = "1234567890";
    process.env.QUICKBOOKS_ENVIRONMENT = "sandbox";
    qbo.resetQuickbooksForTests();
    const originalQboFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    try {
      const beforeFail = queries.getLoad(loadId);
      await assert.rejects(() => qbo.sendLoadToQuickbooks(loadId, { confirmResend: true }), /401/);
      const afterFail = queries.getLoad(loadId);
      assert.equal(afterFail?.qbo_invoice_id, beforeFail?.qbo_invoice_id, "401 must not mark the load sent");
      const failedStatus = await qbo.getQuickbooksStatus();
      assert.equal(failedStatus.status, "API error");
      assert.ok(failedStatus.error && /401/.test(failedStatus.error));
    } finally {
      globalThis.fetch = originalQboFetch;
    }

    const originalConnectFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ refresh_token: "stored-refresh", access_token: "stored-access", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    try {
      delete process.env.QUICKBOOKS_REFRESH_TOKEN;
      delete process.env.QUICKBOOKS_REALM_ID;
      await qbo.completeQuickbooksOAuth({ code: "auth-code", realmId: "realm-99" });
      assert.equal(qbo.hasQuickbooksSession(), true);
      qbo.clearStoredQuickbooksTokens();
      qbo.resetQuickbooksForTests();
      assert.equal(qbo.hasQuickbooksSession(), false);
    } finally {
      globalThis.fetch = originalConnectFetch;
    }

    queries.markCustomerNeedsQbo(customerId);
    assert.ok(queries.listCustomersNeedingQbo().some((row) => row.id === customerId));
  } finally {
    for (const key of qboEnvKeys) {
      const value = previousQbo[key];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    if (process.env.TMS_QBO_REFRESH_PATH) {
      fs.rmSync(process.env.TMS_QBO_REFRESH_PATH, { force: true });
      delete process.env.TMS_QBO_REFRESH_PATH;
    }
    qbo.resetQuickbooksForTests();
  }

  const settings = await import("../lib/settings");
  assert.ok(settings.SETTINGS_SECTIONS.some((section) => section.title === "Company Settings"));
  assert.ok(
    settings.SETTINGS_SECTIONS.some((section) =>
      section.items.some((item) => item.href === "/settings/alerts" && item.label === "Automated Alerting"),
    ),
  );
  assert.equal(
    settings.SETTINGS_SECTIONS.some((section) => /Business Center|Pro Plan|Find New Shippers/i.test(section.title)),
    false,
  );
  assert.ok(settings.SETTINGS_SECTIONS.some((section) => section.title === "Users"));
  assert.ok(
    settings.SETTINGS_SECTIONS.some((section) => section.items.some((item) => item.href === "/users")),
  );
  assert.ok(
    settings.SETTINGS_SECTIONS.some((section) => section.items.some((item) => item.href === "/settings/sign-in")),
  );
  assert.ok(
    settings.SETTINGS_SECTIONS.some((section) =>
      section.items.some((item) => item.href === "/settings/invoice-email" && item.label === "Invoice email"),
    ),
  );
  assert.match(settings.getInvoiceEmailBody(), /Dear \[customer_name\]/);
  settings.updateInvoiceEmailBody("Hello [customer_name].");
  assert.equal(settings.getInvoiceEmailBody(), "Hello [customer_name].");
  settings.updateInvoiceEmailBody("");
  assert.match(settings.getInvoiceEmailBody(), /Dear \[customer_name\]/);
  assert.equal(settings.roleLabel("admin"), "Administrator");
  assert.equal(settings.roleLabel("manager"), "Administrator");
  assert.equal(settings.roleLabel("dispatcher"), "Standard");
  assert.equal(settings.roleLabel("accounting"), "Accounting");
  assert.ok(settings.DISPATCHER_ROLES.some((role) => role.value === "accounting"));
  assert.equal(settings.canManageUsers("manager"), true);
  assert.equal(settings.canManageUsers("accounting"), false);
  assert.equal(settings.canAccessAccounting("accounting"), true);
  assert.equal(settings.canAccessAccounting("dispatcher"), false);
  assert.equal(settings.canAssignLoads("dispatcher"), true);
  assert.equal(settings.canAssignLoads("accounting"), false);
  assert.equal(settings.canEditLoads("accounting"), true);
  assert.equal(settings.canEmailInvoice("accounting"), true);
  assert.equal(settings.canEmailInvoice("dispatcher"), true);
  assert.equal(settings.canEmailInvoice("admin"), true);
  assert.equal(settings.canEmailInvoice("read_only"), false);
  assert.equal(settings.canEditSettings("dispatcher"), false);
  assert.equal(settings.canEditSettings("accounting"), false);
  assert.equal(settings.canEditSettings("manager"), true);
  assert.equal(settings.canImportLocations("dispatcher"), false);
  assert.equal(settings.canImportLocations("manager"), true);
  assert.equal(settings.canViewLoadFinancials("dispatcher"), true);
  assert.equal(settings.canViewLoadFinancials("accounting"), true);
  assert.equal(settings.canViewAudit("dispatcher"), false);
  assert.equal(settings.canViewAudit("accounting"), true);
  assert.equal(settings.canViewReports("dispatcher"), false);
  assert.equal(settings.canDeleteDocuments("dispatcher"), false);
  assert.equal(settings.canConnectQuickbooks("accounting"), false);
  assert.equal(settings.canSeeNavHref("dispatcher", "/ifta"), true);
  assert.equal(settings.canSeeNavHref("accounting", "/ifta"), true);
  assert.equal(settings.canSeeNavHref("dispatcher", "/accounting"), false);
  assert.equal(settings.canSeeNavHref("dispatcher", "/settings"), false);
  assert.equal(settings.canSeeNavHref("dispatcher", "/users"), false);
  assert.equal(settings.canSeeNavHref("dispatcher", "/settings/sign-in"), false);
  assert.equal(settings.canSeeNavHref("accounting", "/settings/sign-in"), false);
  assert.equal(settings.canSeeNavHref("manager", "/settings/sign-in"), true);
  assert.equal(settings.canSeeNavHref("dispatcher", "/audit"), false);
  assert.equal(settings.canSeeNavHref("accounting", "/accounting"), true);
  assert.equal(settings.canSeeNavHref("accounting", "/settings"), false);
  assert.equal(settings.canSeeNavHref("accounting", "/users"), false);
  assert.equal(settings.canSeeNavHref("accounting", "/fleet"), false);
  assert.equal(settings.canDeleteFleet("accounting"), false);
  assert.equal(settings.canDeleteFleet("admin"), true);
  assert.equal(settings.canDeleteFleet("manager"), true);
  assert.equal(settings.canDeleteFleet("dispatcher"), true);
  assert.equal(settings.canSeeNavHref("manager", "/users"), true);
  assert.equal(settings.canSeeNavHref("manager", "/settings"), true);
  assert.equal(settings.canSeeNavHref("manager", "/reports/manage"), true);
  assert.equal(settings.canSeeNavHref("manager", "/reports/statistics"), true);
  assert.equal(settings.canSeeNavHref("dispatcher", "/reports/statistics"), false);
  assert.equal(settings.canSeeNavHref("manager", "/claims"), true);
  assert.equal(settings.canSeeNavHref("dispatcher", "/claims"), true);
  assert.equal(session.roleLabel("manager"), "Administrator");
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/sign-in/page.tsx"), "utf8"), /data-sign-in-log/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/sign-in/page.tsx"), "utf8"), /Sign-in log/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/sign-in-audit-table.tsx"), "utf8"), /data-sign-in-outcome/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /recordLoginAttemptFromRequest/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/driver-actions.ts"), "utf8"), /recordLoginAttemptFromRequest/);
  const usersPage = fs.readFileSync(path.join(process.cwd(), "app/users/page.tsx"), "utf8");
  assert.match(usersPage, /Add user/);
  assert.match(usersPage, /Sign-in log/);
  assert.match(usersPage, /listDispatcherUsers/);
  assert.match(usersPage, /currentUserId/);
  const usersTable = fs.readFileSync(path.join(process.cwd(), "components/users-table.tsx"), "utf8");
  assert.match(usersTable, /"Edit"/);
  assert.match(usersTable, /DeleteUserForm/);
  assert.match(usersTable, /data-users-list/);
  assert.doesNotMatch(usersTable, /overflow-hidden/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/delete-user-form.tsx"), "utf8"), /deleteDispatcherUserAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/users/[id]/page.tsx"), "utf8"), /Delete user/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/settings-actions.ts"), "utf8"), /deleteDispatcherUserAction/);
  assert.equal(
    settings.canDeleteDispatcherUser({
      targetId: 1,
      targetRole: "admin",
      targetActive: true,
      actorId: 1,
      otherActiveAdmins: 2,
    }).ok,
    false,
  );
  assert.equal(
    settings.canDeleteDispatcherUser({
      targetId: 2,
      targetRole: "admin",
      targetActive: true,
      actorId: 1,
      otherActiveAdmins: 0,
    }).ok,
    false,
  );
  assert.equal(
    settings.canDeleteDispatcherUser({
      targetId: 3,
      targetRole: "dispatcher",
      targetActive: true,
      actorId: 1,
      otherActiveAdmins: 2,
    }).ok,
    true,
  );
  const removableUserId = settings.createDispatcherUser({
    name: "Temp Desk User",
    password: "Temp1$ab",
    role: "dispatcher",
    email: "temp-desk@msloads.com",
  });
  settings.deleteDispatcherUser(removableUserId);
  assert.equal(settings.getDispatcherUser(removableUserId), null);
  const selfId = settings.createDispatcherUser({
    name: "Self Desk User",
    password: "Self1$ab",
    role: "dispatcher",
    email: "self-desk@msloads.com",
  });
  assert.throws(() => settings.deleteDispatcherUser(selfId, selfId), /your own login/);
  settings.deleteDispatcherUser(selfId);
  const customersPage = fs.readFileSync(path.join(process.cwd(), "app/customers/page.tsx"), "utf8");
  assert.match(customersPage, /New customer/);
  assert.match(customersPage, /CustomersTable/);
  const customersTable = fs.readFileSync(path.join(process.cwd(), "components/customers-table.tsx"), "utf8");
  assert.match(customersTable, /"Edit"/);
  assert.match(customersTable, /DeleteCustomerForm/);
  assert.match(customersTable, /data-customers-list/);
  assert.doesNotMatch(customersTable, /overflow-hidden/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/delete-customer-form.tsx"), "utf8"), /deleteCustomerAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/customers/[id]/page.tsx"), "utf8"), /Delete customer/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8"), /deleteCustomerAction/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/queries.ts"), "utf8"), /CUSTOMER_HAS_LOADS_DELETE/);
  const tempCustomerId = queries.createCustomer({
    name: "Temp Customer Delete Me",
    billing_notes: "",
    contacts: [{ name: "Pat", role: "", phone: "", email: "" }],
  });
  queries.deleteCustomer(tempCustomerId);
  assert.equal(queries.getCustomer(tempCustomerId), null);
  const customerWithLoads = queries.listCustomers().find((row) => queries.countLoadsForCustomer(row.id) > 0);
  assert.ok(customerWithLoads);
  assert.throws(() => queries.deleteCustomer(customerWithLoads.id), /has loads/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/users/page.tsx"), "utf8"), /redirect\("\/users"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/company/page.tsx"), "utf8"), /SettingsAdminGate/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/settings-admin-gate.tsx"), "utf8"), /Only an Administrator can change Settings/);
  const userForm = fs.readFileSync(path.join(process.cwd(), "components/dispatcher-user-form.tsx"), "utf8");
  assert.doesNotMatch(userForm, /user\?\.pin|name="pin"/);
  assert.match(userForm, /name="password"/);
  assert.match(userForm, /PasswordField/);
  assert.match(userForm, /name="phone"/);
  assert.match(userForm, /defaultValue=""/);
  assert.match(userForm, /leave blank to keep/);
  assert.match(userForm, /temporary password/);
  assert.match(userForm, /2-step verification/);
  assert.match(userForm, /Add an email on this user/);
  assert.ok(
    settings.SETTINGS_SECTIONS.some((section) =>
      section.items.some((item) => item.href === "/settings/quickbooks"),
    ),
  );
  assert.ok(
    settings.SETTINGS_SECTIONS.some((section) =>
      section.items.some((item) => item.href === "/settings/security"),
    ),
  );
  settings.updateCompanyContact({
    company_name: "M&S Loads",
    dispatcher_name: "MS Test",
    dispatcher_phone: "402-302-0097",
    dispatcher_fax: "",
    dispatcher_email: "ana@msloads.com",
    street: "100 Fleet Way",
    city: "Omaha",
    state: "NE",
    zip: "68102",
  });
  assert.equal(settings.getCompanySettings().street, "100 Fleet Way");
  settings.updateInsuranceSettings({
    insurance_provider: "Great West",
    insurance_policy: "POL-100",
    insurance_coverage: "Auto and cargo",
    insurance_expires: "2027-06-01",
  });
  assert.equal(settings.getCompanySettings().insurance_policy, "POL-100");
  settings.updateUnitSettings({ currency: "CAD", weight_unit: "kg" });
  assert.equal(settings.getCompanySettings().currency, "CAD");
  settings.updateTaxSettings({ tax_enabled: true, tax_kind: "gst", tax_rate: 5 });
  assert.equal(settings.taxOnAmount(200).tax, 10);
  settings.updateAlertSettings({
    alert_driver_days: 30,
    alert_registration_days: 45,
    alert_dot_days: 21,
    alert_emails_enabled: true,
  });
  assert.equal(settings.getCompanySettings().alert_driver_days, 30);
  const alertRules = await import("../lib/alert-rules");
  assert.equal(alertRules.alertCatalogHasNoBrokerageTriggers(), true);
  const officeUsers = settings.listDispatcherUsers(false);
  assert.ok(officeUsers.length >= 1);
  const createdRule = alertRules.createAlertRule({
    name: "License watch",
    triggerKey: "driver_license",
    recipientIds: [officeUsers[0].id],
    message: "Call safety.",
  });
  assert.equal(createdRule.name, "License watch");
  assert.ok(alertRules.listAlertRules().some((rule) => rule.id === createdRule.id));
  assert.ok(
    alertRules.alertRuleListRows().some((row) => row.watching === "Driver license" && row.name === "License watch"),
  );
  const fired = alertRules.syncAlertNotifications();
  assert.ok(fired.created >= 1, "expired or due license should notify the selected office user");
  const notices = alertRules.listOfficeNotifications(officeUsers[0].id);
  assert.ok(notices.some((item) => item.title === "License watch" && /license/i.test(item.body)));
  assert.throws(
    () => alertRules.createAlertRule({ name: "EDI watch", triggerKey: "incoming_810", recipientIds: [officeUsers[0].id] }),
    /trucking alert trigger/,
  );
  settings.updateRoutingNotes("Call 30 minutes out.");
  settings.updatePaySettings({
    default_oo_percent: 80,
    default_gross_margin_percent: 20,
    carrier_pay_method: "check",
    carrier_pay_notes: "Friday after POD",
  });
  assert.equal(settings.defaultOoPercent(), 80);
  settings.updateDocumentDefaults({
    doc_type: "load_confirmation",
    header_text: "Smoke confirmation",
    footer_text: "Smoke footer",
    terms_text: "Smoke terms",
    font_size: 11,
  });
  assert.equal(settings.getDocumentDefaults("load_confirmation").header_text, "Smoke confirmation");
  settings.updateDocumentDefaults({
    doc_type: "invoice",
    header_text: "Invoice",
    footer_text: "Payment due per customer terms.",
    terms_text: "Linehaul is the customer rate. Accessorials are billed separately when recorded.",
    font_size: 10,
  });
  assert.equal(settings.getDocumentDefaults("invoice").footer_text, "");
  assert.equal(settings.getDocumentDefaults("invoice").terms_text, "");
  const { printablePaperworkCopy } = await import("../lib/paperwork-copy");
  assert.equal(printablePaperworkCopy("Thank you for hauling with us."), "");
  assert.equal(
    printablePaperworkCopy("Carrier is responsible for cargo while in its possession. Report exceptions at pickup."),
    "",
  );
  assert.equal(printablePaperworkCopy("Keep this note. Thank you for hauling with us."), "Keep this note.");
  const commodityId = settings.addDropdownOption({ kind: "commodity", value: "", label: "Smoke commodity" });
  assert.ok(settings.commoditySuggestions().includes("Smoke commodity"));
  settings.setDropdownOptionActive(commodityId, false);
  assert.equal(settings.commoditySuggestions().includes("Smoke commodity"), false);
  settings.addDropdownOption({ kind: "load_status", value: "waiting_paper", label: "Waiting paper" });
  assert.equal(settings.isKnownLoadStatus("waiting_paper"), true);
  const userId = settings.createDispatcherUser({
    name: "Smoke Desk",
    password: "Desk1$ab",
    role: "dispatcher",
    email: "smoke@msloads.com",
    permission_group: "billing",
  });
  assert.equal(settings.getDispatcherUser(userId)?.permission_group, "billing");
  const booksId = settings.createDispatcherUser({
    name: "Smoke Books",
    password: "Books1$ab",
    role: "accounting",
    email: "books@msloads.com",
  });
  assert.equal(settings.getDispatcherUser(booksId)?.role, "accounting");
  assert.equal(settings.getDispatcherUser(booksId)?.permission_group, "billing");
  assert.equal("pin" in (session.listDispatchers().find((row) => row.id === booksId) ?? {}), false);
  const jordan = session.listDispatchers().find((row) => row.name === "Jordan Lee");
  assert.ok(jordan);
  assert.equal(jordan.role, "dispatcher");
  const casey = session.listDispatchers().find((row) => row.name === "Casey Ortiz");
  assert.ok(casey);
  assert.equal(casey.role, "accounting");
  assert.equal(session.roleLabel(casey.role), "Accounting");
  assert.equal(settings.getCompanySettings().require_dispatcher_2fa, 1);
  assert.equal(settings.isDispatcherTwoFactorRequired(), true);
  settings.updateTwoFactorPolicy(true);
  assert.equal(settings.isDispatcherTwoFactorRequired(), true);
  settings.updateTwoFactorPolicy(false);
  assert.equal(settings.isDispatcherTwoFactorRequired(), false);
  const emailOtp = await import("../lib/dispatcher-email-otp");
  assert.equal(emailOtp.maskEmail("ana@msloads.com"), "a••@msloads.com");
  const signInMail = emailOtp.composeSignInCodeEmail({ code: "482193", officePhone: "402-302-0097" });
  assert.match(signInMail.subject, /MS Express TMS sign-in code/);
  assert.match(signInMail.text, /482193/);
  assert.match(signInMail.text, /Do not reply/);
  assert.match(signInMail.text, /not monitored/);
  assert.match(signInMail.text, /402-302-0097/);
  assert.doesNotMatch(signInMail.text, /Twilio|SendGrid|SMTP_/);
  const otpUserId = settings.createDispatcherUser({
    name: "Email Code Desk",
    password: "Otp1$abc",
    role: "dispatcher",
    email: "otp-desk@msloads.com",
  });
  const issued = emailOtp.issueEmailOtp(otpUserId);
  assert.match(issued.code, /^\d{6}$/);
  assert.equal(issued.email, "otp-desk@msloads.com");
  assert.throws(() => emailOtp.issueEmailOtp(otpUserId, { resend: true }), /Wait before/);
  emailOtp.verifyEmailOtp(otpUserId, issued.code);
  assert.throws(() => emailOtp.verifyEmailOtp(otpUserId, issued.code), /expired|not valid/);
  const noMailId = settings.createDispatcherUser({
    name: "No Email Desk",
    password: "None1$ab",
    role: "dispatcher",
    email: "",
  });
  assert.throws(() => emailOtp.issueEmailOtp(noMailId), /Add an email on this user/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /needsEmailCode/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /sendMail/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /console\.log/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-email-otp.ts"), "utf8"), /console\.log/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/security/page.tsx"), "utf8"), /one-time code/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/shell-switch.tsx"), "utf8"), /mustEnroll|2-step setup/);
  const passwordRules = await import("../lib/dispatcher-password-shared");
  assert.equal(passwordRules.isQualifyingDispatcherPassword("Office1$ab"), true);
  assert.equal(passwordRules.isQualifyingDispatcherPassword("office1$ab"), false);
  assert.equal(passwordRules.isQualifyingDispatcherPassword("OFFICE1$AB"), false);
  assert.equal(passwordRules.isQualifyingDispatcherPassword("Office$ab"), false);
  assert.equal(passwordRules.isQualifyingDispatcherPassword("Office1ab"), false);
  assert.equal(passwordRules.isQualifyingDispatcherPassword("Office1-ab"), false);
  assert.equal(passwordRules.isQualifyingDispatcherPassword("Short1$"), false);
  const passwords = await import("../lib/dispatcher-password");
  assert.equal(passwords.maskPhone("402-555-0199"), "•••-•••-0199");
  assert.match(passwords.composePasswordChangeSms({ code: "123456", officePhone: "402-302-0097" }), /123456/);
  assert.doesNotMatch(passwords.composePasswordChangeSms({ code: "123456" }), /TWILIO_|Auth Token/);
  const resetMail = passwords.composePasswordResetEmail({
    resetUrl: "https://desk.example/login/reset?token=abc",
    officePhone: "402-302-0097",
  });
  assert.match(resetMail.subject, /Reset your MS Express TMS password/);
  assert.match(resetMail.text, /desk\.example\/login\/reset/);
  assert.match(resetMail.text, /Do not reply/);
  assert.match(resetMail.text, /not monitored/);
  assert.doesNotMatch(resetMail.text, /TWILIO_|SMTP_|SendGrid/);
  const historyUserId = settings.createDispatcherUser({
    name: "Password History Desk",
    password: "First1$ab",
    role: "dispatcher",
    email: "history-desk@msloads.com",
    phone: "4025550199",
  });
  assert.throws(
    () => settings.updateDispatcherUser(historyUserId, {
      name: "Password History Desk",
      role: "dispatcher",
      email: "history-desk@msloads.com",
      phone: "4025550199",
      password: "First1$ab",
    }),
    /used before/,
  );
  settings.updateDispatcherUser(historyUserId, {
    name: "Password History Desk",
    role: "dispatcher",
    email: "history-desk@msloads.com",
    phone: "4025550199",
    password: "Second2$ab",
  });
  assert.equal(session.authenticateDispatcher(historyUserId, "Second2$ab").id, historyUserId);
  assert.throws(
    () => settings.updateDispatcherUser(historyUserId, {
      name: "Password History Desk",
      role: "dispatcher",
      email: "history-desk@msloads.com",
      phone: "4025550199",
      password: "First1$ab",
    }),
    /used before/,
  );
  const resetToken = passwords.createPasswordResetToken(historyUserId);
  passwords.resetPasswordWithToken(resetToken, "Third3$ab");
  assert.equal(session.authenticateDispatcher(historyUserId, "Third3$ab").id, historyUserId);
  assert.throws(() => passwords.resetPasswordWithToken(resetToken, "Fourth4$ab"), /not valid|expired/);
  assert.throws(() => passwords.issuePasswordSmsOtp(noMailId), /phone number/);
  const smsIssued = passwords.issuePasswordSmsOtp(historyUserId);
  assert.match(smsIssued.code, /^\d{6}$/);
  assert.equal(smsIssued.phone, "4025550199");
  assert.throws(() => passwords.issuePasswordSmsOtp(historyUserId, { resend: true }), /Wait before/);
  passwords.verifyPasswordSmsOtp(historyUserId, smsIssued.code);
  assert.throws(() => passwords.verifyPasswordSmsOtp(historyUserId, smsIssued.code), /expired|not valid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-password-actions.ts"), "utf8"), /sendMail/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-password-actions.ts"), "utf8"), /sendTwilioSms/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-password-actions.ts"), "utf8"), /currentBrowserOrigin/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-password.ts"), "utf8"), /console\.log/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-password-actions.ts"), "utf8"), /console\.log/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-change-password-form.tsx"), "utf8"), /sms_code/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-change-password-form.tsx"), "utf8"), /No phone is on this user/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /formData\.get\("password"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /authenticateDispatcherByEmail/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /formData\.get\("email"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /login\/change-password/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /EMAIL_OTP_NO_EMAIL/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /formData\.get\("pin"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/change-password/page.tsx"), "utf8"), /Set your password/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-forgot-form.tsx"), "utf8"), /temporary password/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/shell-switch.tsx"), "utf8"), /must_change_password/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/app-shell.tsx"), "utf8"), /Add an email on this user/);
  assert.equal(settings.getDispatcherUser(noMailId)?.must_change_password, 1);
  assert.equal(session.authenticateDispatcher(noMailId, "None1$ab").id, noMailId);
  assert.equal(session.authenticateDispatcher(noMailId, "None1$ab").must_change_password, true);
  passwords.setDispatcherPassword(noMailId, "None2$cd");
  assert.equal(settings.getDispatcherUser(noMailId)?.must_change_password, 0);
  assert.equal(session.authenticateDispatcher(noMailId, "None2$cd").id, noMailId);
  assert.equal(session.authenticateDispatcher(noMailId, "None2$cd").must_change_password, false);
  const pinDriver = queries.listDrivers().find((driver) => driver.pin);
  assert.ok(pinDriver, "driver PIN login stays on the driver record");
  const loginAudit = await import("../lib/login-audit");
  const failedLogin = loginAudit.recordLoginAttempt({
    kind: "office",
    outcome: "failure",
    step: "password",
    userId: noMailId,
    ipAddress: "203.0.113.44",
    detail: "password=Office1$ab",
  });
  assert.equal(failedLogin.user_name, "No Email Desk");
  assert.equal(failedLogin.ip_address, "203.0.113.44");
  assert.equal(failedLogin.detail, "[redacted]");
  assert.doesNotMatch(failedLogin.detail, /Office1\$ab/);
  const signedIn = loginAudit.recordLoginAttempt({
    kind: "office",
    outcome: "success",
    step: "password",
    userId: noMailId,
    ipAddress: "198.51.100.10",
  });
  assert.equal(signedIn.outcome, "success");
  const driverFail = loginAudit.recordLoginAttempt({
    kind: "driver",
    outcome: "failure",
    step: "pin",
    userId: pinDriver.id,
    ipAddress: "192.0.2.8",
    detail: "Driver or PIN is not recognized.",
  });
  assert.equal(driverFail.kind, "driver");
  assert.match(driverFail.detail, /not recognized/);
  const listed = loginAudit.listLoginAudit({ user: "No Email Desk", outcome: "failure" });
  assert.ok(listed.some((row) => row.ip_address === "203.0.113.44" && row.outcome === "failure"));
  const byIp = loginAudit.listLoginAudit({ outcome: "success" }).find((row) => row.ip_address === "198.51.100.10");
  assert.ok(byIp);
  const { dispatcherLoginAction } = await import("../lib/dispatcher-actions");
  const badLogin = new FormData();
  badLogin.set("dispatcher_id", String(noMailId));
  badLogin.set("password", "Wrong1$zz");
  const badResult = await dispatcherLoginAction(null, badLogin);
  assert.equal(badResult.ok, false);
  const devices = await import("../lib/dispatcher-device");
  assert.equal(devices.DEVICE_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(devices.DEVICE_COOKIE, "tms_device");
  const rememberOn = new FormData();
  rememberOn.set("remember_device", "1");
  assert.equal(devices.isRememberDeviceRequested(rememberOn), true);
  assert.equal(devices.isRememberDeviceRequested(new FormData()), false);
  const issuedDevice = devices.createTrustedDevice(noMailId);
  assert.match(issuedDevice.cookie, new RegExp(`^${noMailId}\\.[0-9a-f]{64}$`));
  assert.ok(devices.findTrustedDevice(issuedDevice.cookie, noMailId));
  assert.equal(devices.findTrustedDevice(issuedDevice.cookie, noMailId + 999), null);
  assert.equal(devices.findTrustedDevice(`${noMailId}.deadbeef`, noMailId), null);
  assert.equal(devices.countTrustedDevices(noMailId), 1);
  const storedDevice = getDb()
    .prepare("SELECT token_hash FROM dispatcher_trusted_devices WHERE dispatcher_id = ?")
    .get(noMailId) as { token_hash: string };
  assert.equal(storedDevice.token_hash.length, 64);
  assert.notEqual(storedDevice.token_hash, issuedDevice.cookie.split(".")[1]);
  assert.equal(storedDevice.token_hash, devices.hashDeviceToken(issuedDevice.cookie.split(".")[1] ?? ""));
  getDb()
    .prepare("UPDATE dispatcher_trusted_devices SET expires_at = ? WHERE dispatcher_id = ?")
    .run("2000-01-01T00:00:00.000Z", noMailId);
  assert.equal(devices.findTrustedDevice(issuedDevice.cookie, noMailId), null);
  const liveDevice = devices.createTrustedDevice(noMailId);
  assert.ok(devices.findTrustedDevice(liveDevice.cookie, noMailId));
  passwords.setDispatcherPassword(noMailId, "None3$ef");
  assert.equal(devices.countTrustedDevices(noMailId), 0);
  assert.equal(devices.findTrustedDevice(liveDevice.cookie, noMailId), null);
  assert.equal(session.authenticateDispatcher(noMailId, "None3$ef").id, noMailId);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /remember_device|isRememberDeviceRequested/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"), /findTrustedDevice/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8"), /dispatcher_trusted_devices/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-device.ts"), "utf8"), /console\.log/);
  assert.ok(
    loginAudit.listLoginAudit({ user: "No Email Desk", outcome: "failure" }).some((row) => row.step === "password"),
  );
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/audit/page.tsx"), "utf8"), /settings\/sign-in/);
  settings.updateOwnDispatcherContact(noMailId, { email: "none2@msloads.com", phone: "" });
  assert.equal(settings.getDispatcherUser(noMailId)?.email, "none2@msloads.com");
  const afterEmail = emailOtp.issueEmailOtp(noMailId);
  emailOtp.verifyEmailOtp(noMailId, afterEmail.code);
  assert.equal(queries.authenticateDriver(pinDriver.id, pinDriver.pin).id, pinDriver.id);
  assert.throws(() => queries.authenticateDriver(pinDriver.id, "0000"));
  settings.updateTwoFactorPolicy(true);
  const totp = await import("../lib/totp");
  const dispatcherTotp = await import("../lib/dispatcher-totp");
  const generatedSecret = totp.generateTotpSecret();
  const liveCode = totp.generateTotpCode(generatedSecret);
  assert.equal(totp.verifyTotpCode(generatedSecret, liveCode), true);
  assert.equal(totp.verifyTotpCode(generatedSecret, "000000"), false);
  assert.equal(dispatcherTotp.isDispatcherTotpEnrolled(userId), false);
  const enrollment = dispatcherTotp.beginTotpEnrollment(userId);
  const recoveryCodes = dispatcherTotp.confirmTotpEnrollment(userId, totp.generateTotpCode(enrollment.secret));
  assert.equal(dispatcherTotp.isDispatcherTotpEnrolled(userId), true);
  assert.equal(recoveryCodes.length, 10);
  assert.equal(settings.getDispatcherUser(userId)?.totp_enrolled, 1);
  assert.equal("totp_secret" in (settings.getDispatcherUser(userId) ?? {}), false);
  dispatcherTotp.consumeRecoveryCode(userId, recoveryCodes[0]);
  assert.throws(() => dispatcherTotp.consumeRecoveryCode(userId, recoveryCodes[0]));
  const auditRows = (await import("../lib/desk")).listAudit(20);
  assert.ok(auditRows.some((row) => row.action === "totp_enroll"));
  assert.ok(
    auditRows.every((row) => !new RegExp(enrollment.secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(row.detail)),
  );
  dispatcherTotp.resetDispatcherTotp(userId, "MS Test");
  assert.equal(dispatcherTotp.isDispatcherTotpEnrolled(userId), false);
  settings.updateLoadManagementSettings({
    load_number_prefix: "ABC",
    load_number_next: 2000,
    show_sample_data: true,
  });
  assert.equal(settings.peekNextLoadNumber(), "ABC-2000");
  const numberedId = queries.createLoad({
    customer_id: customerId,
    origin: "Omaha, NE",
    destination: "Lincoln, NE",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 10000,
    commodity: "Settings smoke",
    rate: 900,
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
  });
  assert.equal(queries.getLoad(numberedId)?.load_number, "ABC-2000");
  assert.equal(settings.peekNextLoadNumber(), "ABC-2001");
  settings.updateLoadManagementSettings({
    load_number_prefix: "ABC",
    load_number_next: 2001,
    show_sample_data: false,
  });
  assert.equal(
    queries.listLoads({ status: "all" }).some((load) => load.load_number === "MSE-1042"),
    false,
    "sample loads hide when the toggle is off",
  );
  settings.updateLoadManagementSettings({
    load_number_prefix: "MSE",
    load_number_next: 3000,
    show_sample_data: true,
  });
  assert.ok(queries.listLoads({ status: "all" }).some((load) => load.load_number === "MSE-1042"));

  const fleetDriverId = queries.createDriver({
    name: "Fleet Smoke",
    phone: "555-0144",
    email: "fleet@msloads.com",
    notes: "Nights",
    license: "NE-CDL-FLEET",
    pin: "3333",
    truck_id: null,
    status: "available",
    country: "USA",
    state: "NE",
    city: "Hastings",
    date_of_birth: "0000-00-00",
    date_of_hire: "2020-03-15",
    drug_test_last: "",
  });
  const fleetCreated = queries.getDriver(fleetDriverId);
  assert.equal(fleetCreated?.country, "USA");
  assert.equal(fleetCreated?.state, "NE");
  assert.equal(fleetCreated?.city, "Hastings");
  assert.equal(fleetCreated?.date_of_birth, "");
  assert.notEqual(fleetCreated?.date_of_birth, "0000-00-00");
  assert.equal(fleetCreated?.date_of_hire, "2020-03-15");
  const singleId = queries.createDriver({
    name: "Single Driver",
    phone: "555-0100",
    license: "",
    driver_type: "single",
    truck_id: null,
    status: "available",
    city: "Tulsa",
    state: "OK",
    country: "USA",
  });
  assert.equal(queries.getDriver(singleId)?.driver_type, "company_driver");

  const {
    ASCEND_DRIVER_FIXTURE_NAMES,
    parseDriverRosterText,
    buildDriverImportPreview,
    cleanImportedDate,
    licenseNumberText,
    parseImportedDriverType,
  } = await import("../lib/driver-import-shared");
  const { applyDriverImport, previewDriversFromXlsx } = await import("../lib/driver-import");
  const { buildXlsxFromGrid, buildXlsxFromSheets, recordsFromFirstSheet, recordsFromLoadWorkbook } =
    await import("../lib/xlsx-first-sheet");
  assert.equal(parseImportedDriverType("single"), "company_driver");
  assert.equal(parseImportedDriverType(""), "company_driver");
  assert.equal(parseImportedDriverType("owner-operator"), "owner_operator");
  assert.equal(parseImportedDriverType("OO"), "owner_operator");
  assert.equal(ASCEND_DRIVER_FIXTURE_NAMES.length, 8);
  assert.equal(cleanImportedDate("0000-00-00"), "");
  assert.equal(cleanImportedDate("-"), "");
  assert.equal(cleanImportedDate("2020-03-15"), "2020-03-15");
  assert.equal(licenseNumberText(123456789), "123456789");
  const driverRosterCsv = [
    "Status,Team,Name,Telephone,Alternate Telephone,Cell,Pager,E-mail,DOB,DOH,Address,City,Postal/Zip Code,Country,Province,License Number,License Expiry,Medical Date,Next Medical,Drug Test,Next Drug Test,Notes,Termination Date,Show Pay,Last Pay,Paid Driver Type,Passport Expiry,Fast Card Expiry,Hazmat Expiry,Name 2,Telephone 2",
    'Active,single,Christopher Howell,555-1001,555-2001,555-3001,,howell@msloads.com,1984-01-02,2018-06-01,1 Main,Hastings,68901,USA,NE,123456789,2027-04-01,2025-01-01,2027-01-01,2025-02-01,2026-02-01,Nights,,1,99,company,2030-01-01,2030-01-01,2030-01-01,Ghost Driver,555-9999',
    "Active,single,German Avila,555-1002,,,,,,0000-00-00,-,,Dallas,75201,USA,TX,AVILA-1,,,,,,,,,",
    "Active,single,Jose Luis Torres,555-1003,,,,,,,,,,USA,TX,,,,,,,,,,",
    "Active,single,Kelvin Whaley,555-1004,,,,,,,,,,USA,TN,,,,,,,,,,",
    "Active,single,Lukas Olson,555-1005,,,,,,,,,,USA,NE,,,,,,,,,,",
    "Active,single,Pike Osborne,555-1006,,,,,,,,,,USA,OK,,,,,,,,,,",
    "Active,single,Steve Eller,555-1007,,,,,,,,,,USA,MS,,,,,,,,,,",
    "Active,single,Yoel Feder,555-1008,,,,,,,,,,USA,FL,,,,,,,,,,",
  ].join("\n");
  const parsedRoster = parseDriverRosterText(driverRosterCsv);
  assert.equal(parsedRoster.length, 8);
  assert.deepEqual(
    parsedRoster.map((row) => row.name),
    [...ASCEND_DRIVER_FIXTURE_NAMES],
  );
  assert.equal(parsedRoster.some((row) => row.name === "Ghost Driver"), false);
  const howellRow = parsedRoster.find((row) => row.name === "Christopher Howell");
  assert.equal(howellRow?.driver_type, "company_driver");
  assert.equal(howellRow?.alt_phone, "555-2001");
  assert.equal(howellRow?.cell_phone, "555-3001");
  assert.equal(howellRow?.license_number, "123456789");
  assert.equal(howellRow?.date_of_birth, "1984-01-02");
  assert.equal(parsedRoster.find((row) => row.name === "German Avila")?.date_of_birth, "");
  assert.equal(parsedRoster.find((row) => row.name === "German Avila")?.date_of_hire, "");
  const rosterPreview = buildDriverImportPreview(parsedRoster, [
    { id: howellId, name: "christopher howell" },
    { id: ellerId, name: "Steve Eller" },
    { id: whaleyId, name: "Kelvin Whaley" },
  ]);
  assert.equal(rosterPreview.filter((row) => row.action === "update").length, 3);
  assert.equal(rosterPreview.filter((row) => row.action === "create").length, 5);
  const howellBefore = queries.getDriver(howellId);
  const rosterImport = applyDriverImport(rosterPreview);
  assert.equal(rosterImport.created, 5);
  assert.equal(rosterImport.updated, 3);
  assert.equal(rosterImport.skipped, 0);
  for (const name of ASCEND_DRIVER_FIXTURE_NAMES) {
    assert.ok(queries.listDrivers().some((driver) => driver.name === name), `missing ${name}`);
  }
  assert.equal(queries.listDrivers().filter((driver) => driver.name === "Ghost Driver").length, 0);
  const howellAfter = queries.getDriver(howellId);
  assert.equal(howellAfter?.phone, "555-1001");
  assert.equal(howellAfter?.driver_type, "company_driver");
  assert.equal(howellAfter?.license_number, "123456789");
  assert.equal(howellAfter?.truck_id, howellBefore?.truck_id);
  assert.equal(howellAfter?.pay_percent ?? null, howellBefore?.pay_percent ?? null);
  const rosterAgain = applyDriverImport(rosterPreview);
  assert.equal(rosterAgain.created, 0);
  assert.equal(rosterAgain.updated, 8);
  const xlsxPreview = previewDriversFromXlsx(
    buildXlsxFromGrid([
      ["Status", "Team", "Name", "Telephone", "License Number", "DOB", "Country", "Province"],
      ["Active", "single", "Xlsx Only Driver", "555-1099", 987654321, "0000-00-00", "USA", "NE"],
    ]),
  );
  assert.equal(xlsxPreview.length, 1);
  assert.equal(xlsxPreview[0]?.name, "Xlsx Only Driver");
  assert.equal(xlsxPreview[0]?.license_number, "987654321");
  assert.equal(xlsxPreview[0]?.date_of_birth, "");
  const xlsxImport = applyDriverImport(xlsxPreview);
  assert.equal(xlsxImport.created, 1);
  assert.equal(queries.getDriver(queries.listDrivers().find((driver) => driver.name === "Xlsx Only Driver")?.id ?? 0)?.license_number, "987654321");

  const {
    ASCEND_LOAD_HEADERS,
    mapImportedEquipment,
    mapImportedLoadStatus,
    matchAssetUnit,
    recordsFromLoadSheetText,
    loadValuesFromRecords,
    splitImportList,
    zipImportedStops,
    buildLoadImportPreview,
  } = await import("../lib/load-import-shared");
  assert.equal(ASCEND_LOAD_HEADERS[0], "Load #");
  assert.equal(mapImportedEquipment("53' Reefer"), "reefer_53");
  assert.equal(mapImportedEquipment(""), "reefer_53");
  assert.equal(mapImportedLoadStatus("Invoiced"), "completed");
  assert.equal(mapImportedLoadStatus("in_transit"), "in_transit");
  assert.deepEqual(splitImportList("WSF, Lineage"), ["WSF", "Lineage"]);
  assert.equal(zipImportedStops("pickup", ["WSF", "Lineage"], ["Kansas City", "St. Louis"], ["MO", "MO"]).length, 2);
  const addressedImport = loadValuesFromRecords([
    {
      "Load #": "1007777",
      Status: "Available",
      Shipper: "Westside Foods",
      "Shipper City": "Avenel",
      "Shipper St.": "NJ",
      "Shipper Street": "10 Cold Rd",
      "Shipper Zip": "07001",
      "Shipper Phone": "732-555-0001",
      Consignee: "Nebraska Cold Storage",
      "Consignee City": "Hastings",
      "Consignee St.": "NE",
      "Consignee Address": "200 Ice House Rd",
      "Consignee Zip": "68901",
      "Consignee Phone": "402-555-0002",
    },
  ]);
  assert.equal(addressedImport[0]?.pickups[0]?.state, "NJ", "Shipper St. stays the state abbreviation");
  assert.equal(addressedImport[0]?.pickups[0]?.street, "10 Cold Rd");
  assert.equal(addressedImport[0]?.pickups[0]?.zip, "07001");
  assert.equal(addressedImport[0]?.pickups[0]?.phone, "732-555-0001");
  assert.equal(addressedImport[0]?.deliveries[0]?.street, "200 Ice House Rd");
  const { applyLoadImport, previewLoadsFromText, previewLoadsFromXlsx } = await import("../lib/load-import");
  const addressedApplied = applyLoadImport(buildLoadImportPreview(addressedImport, []));
  assert.equal(addressedApplied.created, 1);
  const addressedLoadId = queries.findLoadIdByNumber("1007777");
  const addressedStops = (await import("../lib/stops")).listStops(addressedLoadId!);
  assert.equal(addressedStops.find((stop) => stop.kind === "pickup")?.street, "10 Cold Rd");
  assert.equal(addressedStops.find((stop) => stop.kind === "pickup")?.phone, "732-555-0001");
  assert.equal(addressedStops.find((stop) => stop.kind === "delivery")?.zip, "68901");
  assert.equal(matchAssetUnit([{ id: 7, unit_number: "36" }], "36"), 7);
  assert.equal(matchAssetUnit([{ id: 8, unit_number: "1518" }], "MS1518"), 8);
  assert.equal(matchAssetUnit([{ id: 9, unit_number: "41" }], "Assign Later"), null);
  const csvCell = (value: string) => (/[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  const loadSheetRow = [
    "1005911",
    "",
    "PO-5911",
    "",
    "",
    "",
    "",
    "",
    "Invoiced",
    "8/1/2024",
    "8/3/2024",
    "M & S Loads LLC.",
    "WSF, Lineage",
    "Kansas City, St. Joseph",
    "MO, MO",
    "Lineage DC, Avenel",
    "Avenel, Newark",
    "NJ, NJ",
    "Assign Later",
    "Assign Later",
    "53' Reefer",
  ].map(csvCell).join(",");
  const parsedLoads = loadValuesFromRecords(recordsFromLoadSheetText(`${ASCEND_LOAD_HEADERS.join(",")}\n${loadSheetRow}`));
  assert.equal(parsedLoads.length, 1);
  assert.equal(parsedLoads[0]?.load_number, "1005911");
  assert.equal(parsedLoads[0]?.status, "completed");
  assert.equal(parsedLoads[0]?.customer_name, "M & S Loads LLC.");
  assert.equal(parsedLoads[0]?.wsf_po, "PO-5911");
  assert.equal(parsedLoads[0]?.equipment, "reefer_53");
  assert.equal(parsedLoads[0]?.pickups.length, 2);
  assert.equal(parsedLoads[0]?.deliveries.length, 2);
  const { listStops } = await import("../lib/stops");
  const loadPreview = previewLoadsFromText(`${ASCEND_LOAD_HEADERS.join(",")}\n${loadSheetRow}`);
  assert.equal(loadPreview.length, 1);
  assert.equal(loadPreview[0]?.action, "create");
  const loadImport = applyLoadImport(loadPreview);
  assert.equal(loadImport.created, 1);
  const importedLoadId = queries.findLoadIdByNumber("1005911");
  assert.ok(importedLoadId);
  const importedLoad = queries.getLoad(importedLoadId!);
  assert.equal(importedLoad?.status, "completed");
  assert.equal(importedLoad?.customer_name, "M & S Loads LLC.");
  assert.equal(importedLoad?.po_number, "PO-5911");
  assert.equal(importedLoad?.customer_reference, "PO-5911");
  assert.equal(importedLoad?.reference_number, "PO-5911");
  assert.equal(importedLoad?.equipment, "reefer_53");
  assert.equal(importedLoad?.truck_id, null);
  assert.equal(importedLoad?.driver_id, null);
  const importedStops = listStops(importedLoadId!);
  assert.equal(importedStops.filter((stop) => stop.kind === "pickup").length, 2);
  assert.equal(importedStops.filter((stop) => stop.kind === "delivery").length, 2);
  const loadAgain = applyLoadImport(previewLoadsFromText(`${ASCEND_LOAD_HEADERS.join(",")}\n${loadSheetRow}`));
  assert.equal(loadAgain.created, 0);
  assert.equal(loadAgain.updated, 1);
  const xlsxLoads = previewLoadsFromXlsx(
    buildXlsxFromGrid([
      [...ASCEND_LOAD_HEADERS],
      [
        1005912,
        "",
        "PO-5912",
        "note",
        "",
        "",
        "",
        "",
        "Invoiced",
        "8/4/2024",
        "8/5/2024",
        "M & S Loads LLC.",
        "WSF",
        "Kansas City",
        "MO",
        "Avenel",
        "Avenel",
        "NJ",
        "301",
        "",
        "",
      ],
    ]),
  );
  assert.equal(xlsxLoads[0]?.load_number, "1005912");
  assert.equal(xlsxLoads[0]?.equipment, "reefer_53");
  const xlsxLoadImport = applyLoadImport(xlsxLoads);
  assert.equal(xlsxLoadImport.created, 1);
  assert.equal(queries.getLoad(queries.findLoadIdByNumber("1005912")!)?.truck_unit, "301");
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/loads/new/page.tsx"), "utf8"), /Import/);
  const loadImportUi = fs.readFileSync(path.join(process.cwd(), "components/load-sheet-import.tsx"), "utf8");
  assert.match(loadImportUi, /Load spreadsheet/);
  assert.match(loadImportUi, /Preview/);
  assert.match(loadImportUi, /will import in this one/);
  assert.match(loadImportUi, /JSON\.stringify\(rows\)/);
  const assignUi = fs.readFileSync(path.join(process.cwd(), "components/assign-dialog.tsx"), "utf8");
  assert.match(assignUi, /useDismissable/);
  assert.match(assignUi, /createPortal/);
  assert.match(assignUi, /document\.body/);
  assert.match(assignUi, /data-assign-overlay/);
  assert.match(assignUi, /overflow-y-auto/);
  assert.match(assignUi, /name="truck_id"[\s\S]*?\{item\.unit_number\}[\s\S]*?name="trailer_id"/);
  assert.doesNotMatch(assignUi, /name="truck_id"[\s\S]*?item\.type[\s\S]*?name="trailer_id"/);
  assert.doesNotMatch(assignUi, /dry van/i);
  const dashUi = fs.readFileSync(path.join(process.cwd(), "app/desk/page.tsx"), "utf8");
  assert.match(dashUi, /Unit \{truck\.unit_number\}/);
  assert.doesNotMatch(dashUi, /labelForTruckType/);

  const ascendRow = (loadNumber: string | number, truck = ""): Array<string | number> => [
    loadNumber,
    "",
    `PO-${loadNumber}`,
    "",
    "",
    "",
    "",
    "",
    "Open",
    "8/4/2024",
    "8/5/2024",
    "M & S Loads LLC.",
    "WSF",
    "Kansas City",
    "MO",
    "Avenel",
    "Avenel",
    "NJ",
    truck,
    "",
    "53' Reefer",
  ];
  const pageOneNumbers = Array.from({ length: 12 }, (_, index) => 1006101 + index);
  const pageTwoNumbers = [1006113, 1006114, 1006115, 1006116];
  const pagedWorkbook = buildXlsxFromSheets([
    [[...ASCEND_LOAD_HEADERS], ...pageOneNumbers.map((number) => ascendRow(number))],
    [["Page 2"], [...ASCEND_LOAD_HEADERS], ...pageTwoNumbers.map((number) => ascendRow(number))],
  ]);
  assert.equal(recordsFromFirstSheet(pagedWorkbook).length, 12, "old first-sheet helper still stops at page 1");
  assert.equal(recordsFromLoadWorkbook(pagedWorkbook).length, 16);
  const pagedPreview = previewLoadsFromXlsx(pagedWorkbook);
  assert.equal(pagedPreview.length, 16, "print-layout pages / extra sheets must all preview");
  const pagedImport = applyLoadImport(pagedPreview);
  assert.equal(pagedImport.created, 16);
  assert.equal(pagedImport.updated, 0);
  for (const number of [...pageOneNumbers, ...pageTwoNumbers]) {
    assert.ok(queries.findLoadIdByNumber(String(number)), `imported ${number}`);
  }
  const reprintWorkbook = buildXlsxFromGrid([
    ["MS Express loads — page 1"],
    [...ASCEND_LOAD_HEADERS],
    ascendRow(1006121),
    ascendRow(1006122),
    ["MS Express loads — page 2"],
    [...ASCEND_LOAD_HEADERS],
    ascendRow(1006123),
    ascendRow(1006124),
  ]);
  const reprintPreview = previewLoadsFromXlsx(reprintWorkbook);
  assert.equal(reprintPreview.length, 4, "repeated print headers on one sheet must not drop later loads");
  assert.equal(applyLoadImport(reprintPreview).created, 4);

  const shareTruckId = queries.createTruck({
    unit_number: "SHARE-36",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const shareDriverA = queries.createDriver({
    name: "Share Truck A",
    phone: "555-0361",
    license: "MO-SHARE-A",
    pin: "8361",
    truck_id: null,
    status: "available",
    driver_type: "company_driver",
    country: "USA",
    city: "St Louis",
    state: "MO",
  });
  const shareDriverB = queries.createDriver({
    name: "Share Truck B",
    phone: "555-0362",
    license: "MO-SHARE-B",
    pin: "8362",
    truck_id: null,
    status: "available",
    driver_type: "company_driver",
    country: "USA",
    city: "St Louis",
    state: "MO",
  });
  const shareLoadA = queries.createLoad({
    customer_id: customerId,
    origin: "Dallas, TX",
    destination: "Houston, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Produce",
    rate: 1200,
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
  });
  const shareLoadB = queries.createLoad({
    customer_id: customerId,
    origin: "Houston, TX",
    destination: "Austin, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 38000,
    commodity: "Produce",
    rate: 1100,
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
  });
  queries.assignLoad(shareLoadA, shareTruckId, shareDriverA);
  queries.assignLoad(shareLoadB, shareTruckId, shareDriverB);
  assert.equal(queries.getLoad(shareLoadA)?.truck_id, shareTruckId);
  assert.equal(queries.getLoad(shareLoadB)?.truck_id, shareTruckId);
  assert.ok(
    queries.listAssignableTrucks(shareLoadB).some((truck) => truck.id === shareTruckId),
    "truck already on another open load stays in the assign picker",
  );
  const shareLoadC = queries.createLoad({
    customer_id: customerId,
    origin: "Austin, TX",
    destination: "Dallas, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 36000,
    commodity: "Produce",
    rate: 1000,
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
  });
  queries.assignLoad(shareLoadC, shareTruckId, shareDriverA);
  assert.equal(queries.getLoad(shareLoadA)?.driver_id, shareDriverA);
  assert.equal(queries.getLoad(shareLoadC)?.driver_id, shareDriverA);
  assert.ok(
    queries.listAssignableDrivers(shareLoadC).some((driver) => driver.id === shareDriverA),
    "driver already on another open load stays in the assign picker",
  );
  const { addRelay } = await import("../lib/relay-store");
  addRelay(shareLoadC, {
    from_driver_id: shareDriverA,
    driver_id: shareDriverB,
    delivery: "Waco, TX",
  });
  const shareTrailerId = queries.createTrailer({
    unit_number: "SHARE-TR",
    type: "reefer",
    status: "available",
  });
  queries.assignLoad(shareLoadA, shareTruckId, shareDriverA, shareTrailerId);
  queries.assignLoad(shareLoadB, shareTruckId, shareDriverB, shareTrailerId);
  assert.equal(queries.getLoad(shareLoadA)?.trailer_id, shareTrailerId);
  assert.equal(queries.getLoad(shareLoadB)?.trailer_id, shareTrailerId);
  assert.ok(
    queries.listAssignableTrailers(shareLoadB).some((trailer) => trailer.id === shareTrailerId),
    "trailer already on another open load stays in the assign picker",
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "lib/queries.ts"), "utf8"),
    /already on/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "lib/relay-store.ts"), "utf8"),
    /is already on/,
  );
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8"),
    /return fail\(error\)/,
  );

  const { buildSafetyBoard } = await import("../lib/safety");
  const { expiryRank, worstSafetyRank, cleanSafetyDate, formatSafetyDatePair } = await import("../lib/safety-shared");
  assert.equal(cleanSafetyDate("0000-00-00"), "");
  assert.equal(cleanSafetyDate(""), "");
  assert.equal(formatSafetyDatePair("", ""), "");
  assert.equal(formatSafetyDatePair("0000-00-00", "2026-09-01"), "2026-09-01");
  assert.equal(formatSafetyDatePair("2026-01-01", "2026-09-01"), "2026-01-01 / 2026-09-01");
  assert.equal(expiryRank("", 30, new Date("2026-08-24T12:00:00")), "empty");
  assert.equal(expiryRank("2026-07-01", 30, new Date("2026-08-24T12:00:00")), "expired");
  assert.equal(expiryRank("2026-09-01", 30, new Date("2026-08-24T12:00:00")), "due_soon");
  assert.equal(worstSafetyRank(["due_soon", "hos_violation", "expired"]), "expired");
  const tyrellSafety = queries.listDrivers().find((driver) => driver.name === "Tyrell Brooks");
  assert.ok(tyrellSafety);
  const safetyNow = new Date();
  safetyNow.setDate(safetyNow.getDate() + 15);
  const safetyBoard = buildSafetyBoard({
    drivers: queries.listDrivers(),
    windowDays: 30,
    insurance: { provider: "Great West", policy: "POL-100", expires: "2026-07-01" },
    tokenSet: false,
    hos: [],
    now: safetyNow,
  });
  assert.ok(safetyBoard.rows.some((row) => row.subject === "Denise Ortega"));
  assert.ok(safetyBoard.rows.some((row) => row.subject === "Cole Brennan" && row.driverType === "owner_operator"));
  assert.equal(safetyBoard.rows.find((row) => row.subject === "Tyrell Brooks")?.rank, "expired");
  assert.ok(safetyBoard.rows.every((row) => !/0000-00-00/.test(`${row.licenseExpires}${row.medicalNext}${row.drugNext}`)));
  assert.equal(safetyBoard.insurance?.rank, "expired");
  assert.equal(safetyBoard.rows[0]?.rank, "expired");
  assert.match(safetyBoard.rows.find((row) => row.subject === "Denise Ortega")?.hos ?? "", /Samsara token not set/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/safety/page.tsx"), "utf8"), /Safety/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/safety/page.tsx"), "utf8"), /CSA|hazmat|passport/);

  const payItemsMod = await import("../lib/pay-items");
  const {
    createTmsInvoice,
    tmsCustomerInvoiceLines,
    renderInvoicesCsv,
    paperworkCompanyName,
    buildTmsInvoice,
    renderTmsInvoicePdf,
    isCompanyCustomerName,
  } = await import("../lib/invoice");
  assert.equal(paperworkCompanyName("M&S Loads"), "M&S Loads LLC");
  assert.equal(paperworkCompanyName("M&S Loads LLC"), "M&S Loads LLC");
  assert.equal(paperworkCompanyName("Other Carrier"), "Other Carrier");
  const invoiceLoadId = queries.findLoadIdByNumber("1005911");
  assert.ok(invoiceLoadId);
  payItemsMod.addPayItem(invoiceLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "M & S Loads LLC.",
    category: "flat_rate",
    rate: 1500,
    qty: 1,
    total: 1500,
    notes: "",
  });
  payItemsMod.addPayItem(invoiceLoadId, {
    side: "expense",
    bill_to: "driver",
    payee: "Lumper",
    category: "lumper",
    rate: 150,
    qty: 1,
    total: 150,
    notes: "internal lumper",
  });
  payItemsMod.addPayItem(invoiceLoadId, {
    side: "income",
    bill_to: "customer",
    payee: "Lumper",
    category: "lumper",
    rate: 150,
    qty: 1,
    total: 150,
    notes: "do not bill lumper",
  });
  const invoiceLines = tmsCustomerInvoiceLines(queries.getLoad(invoiceLoadId)!);
  assert.equal(invoiceLines.length, 1);
  assert.equal(invoiceLines[0]?.amount, 1500);
  assert.ok(!invoiceLines.some((line) => /lumper/i.test(line.name)));
  assert.ok(!invoiceLines.some((line) => /internal|do not bill/i.test(line.description)));
  const freightPlusDetentionId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Kansas City, MO",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 40000,
    commodity: "Frozen",
    rate: 5869,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "delivered",
    truck_id: null,
    driver_id: null,
  });
  payItemsMod.addPayItem(freightPlusDetentionId, {
    side: "income",
    bill_to: "customer",
    payee: "Customer",
    category: "detention",
    rate: 100,
    qty: 1,
    total: 100,
    notes: "",
  });
  const freightPlusDetentionLoad = queries.getLoad(freightPlusDetentionId)!;
  assert.equal(freightPlusDetentionLoad.rate, 5869);
  const freightPlusDetentionLines = tmsCustomerInvoiceLines(freightPlusDetentionLoad);
  assert.deepEqual(
    freightPlusDetentionLines.map((line) => [line.name, line.amount]),
    [
      ["Flat Rate", 5869],
      ["Detention", 100],
    ],
  );
  const freightPlusDetentionModel = buildTmsInvoice(freightPlusDetentionLoad);
  assert.equal(freightPlusDetentionModel.total, 5969);
  const freightPlusDetentionPdf = await renderTmsInvoicePdf(freightPlusDetentionModel);
  const { extractText: extractInvoiceText } = await import("unpdf");
  const freightPlusDetentionText = String(
    (await extractInvoiceText(new Uint8Array(freightPlusDetentionPdf), { mergePages: true })).text ?? "",
  );
  assert.match(freightPlusDetentionText, /Flat Rate/);
  assert.match(freightPlusDetentionText, /5,869/);
  assert.match(freightPlusDetentionText, /Detention/);
  assert.match(freightPlusDetentionText, /100/);
  assert.match(freightPlusDetentionText, /5,969/);
  const freightPlusDetentionQbo = (await import("../lib/integrations/quickbooks")).buildInvoiceLines(
    freightPlusDetentionLoad,
  );
  assert.deepEqual(
    freightPlusDetentionQbo.map((line) => [line.name, line.amount]),
    [
      ["Line Haul", 5869],
      ["Detention", 100],
    ],
  );
  const tmsInvoiceModel = buildTmsInvoice(queries.getLoad(invoiceLoadId)!);
  assert.equal(tmsInvoiceModel.companyEmail, "ar@msloads.com");
  assert.equal(tmsInvoiceModel.companyLegalName, "M&S Loads LLC");
  assert.match(tmsInvoiceModel.companyLegalName, /LLC/);
  assert.match(tmsInvoiceModel.date, /^\d{2}\/\d{2}\/\d{2}$/);
  assert.doesNotMatch(tmsInvoiceModel.date, /\d{4}-\d{2}-\d{2}/);
  assert.ok(isCompanyCustomerName("M & S Loads LLC.", "M&S Loads"));
  assert.doesNotMatch(tmsInvoiceModel.customerStreet, /600 E 39th|100 Fleet Way/);
  assert.doesNotMatch(tmsInvoiceModel.customerCityStateZip, /Hastings/);
  assert.doesNotMatch(tmsInvoiceModel.customerPhone, /402-302-0097/);
  getDb()
    .prepare("UPDATE loads SET contact_phone = ?, contact_ext = ? WHERE id = ?")
    .run("800-555-0142", "2210", invoiceLoadId);
  const invoiceIgnoresBrokerPhone = buildTmsInvoice(queries.getLoad(invoiceLoadId)!);
  assert.doesNotMatch(invoiceIgnoresBrokerPhone.customerPhone, /800-555-0142/);
  assert.match(tmsInvoiceModel.companyAddress, /100 Fleet Way|600 E 39th/);
  assert.equal(settings.withOfficeAddress({ street: "", city: "", state: "", zip: "" }).street, "600 E 39th St");
  assert.equal(settings.withOfficeAddress({ street: "100 Fleet Way", city: "Omaha", state: "NE", zip: "68102" }).street, "100 Fleet Way");
  assert.ok(tmsInvoiceModel.stops.length >= 1);
  assert.ok(tmsInvoiceModel.lines.every((line) => line.qty != null || line.rate != null || line.amount));
  assert.doesNotMatch(tmsInvoiceModel.lines.map((line) => line.name).join(" "), /owner-operator|relay|lumper/i);
  const made = await createTmsInvoice(invoiceLoadId);
  assert.equal(made.invoiceNumber, "INV-1005911");
  assert.equal(made.filename, "INV-1005911.pdf");
  assert.equal(made.buffer.subarray(0, 4).toString(), "%PDF");
  assert.equal((await PDFDocument.load(made.buffer)).getPageCount(), 1);
  const { regenerateMissingAttachment } = await import("../lib/regenerate-attachment");
  const storedInvoice = getAttachment(made.attachmentId);
  assert.ok(storedInvoice);
  const missingInvoicePath = getAttachmentPath(storedInvoice);
  fs.unlinkSync(missingInvoicePath);
  assert.equal(fs.existsSync(missingInvoicePath), false);
  const recoveredInvoice = await regenerateMissingAttachment(storedInvoice);
  assert.ok(recoveredInvoice);
  assert.equal(recoveredInvoice.buffer.subarray(0, 4).toString(), "%PDF");
  const restoredInvoice = getAttachment(made.attachmentId);
  assert.ok(restoredInvoice);
  assert.equal(fs.existsSync(getAttachmentPath(restoredInvoice)), true);
  const missingPhoto = addAttachment({
    loadId: invoiceLoadId,
    kind: "photo_trailer",
    originalName: "gone-photo.jpg",
    buffer: Buffer.from("jpg"),
    mimeType: "image/jpeg",
    uploadedBy: "dispatcher",
  });
  fs.unlinkSync(getAttachmentPath(missingPhoto));
  assert.equal(await regenerateMissingAttachment(missingPhoto), null);
  const missingConfirm = addAttachment({
    loadId: invoiceLoadId,
    kind: "other",
    originalName: "1005911-customer-confirmation.pdf",
    buffer: Buffer.from("%PDF-1.4 gone"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  fs.unlinkSync(getAttachmentPath(missingConfirm));
  const recoveredConfirm = await regenerateMissingAttachment(missingConfirm);
  assert.ok(recoveredConfirm);
  assert.equal(recoveredConfirm.buffer.subarray(0, 4).toString(), "%PDF");
  const invoicePdfText = await extractDocumentText(made.buffer, "application/pdf", "INV-1005911.pdf");
  assert.match(invoicePdfText, /ar@msloads\.com/);
  assert.doesNotMatch(invoicePdfText, /Linehaul is the customer rate/);
  assert.doesNotMatch(invoicePdfText, /Accessorials are billed separately/);
  assert.doesNotMatch(invoicePdfText, /Payment due per customer terms/);
  assert.doesNotMatch(invoicePdfText, /Thank you for hauling with us/);
  assert.doesNotMatch(invoicePdfText, /Carrier is responsible for cargo/);
  assert.doesNotMatch(invoicePdfText, /Report exceptions at pickup/);
  assert.doesNotMatch(invoicePdfText, /Notes/);
  assert.doesNotMatch(invoicePdfText, /Stops \/ Actions/);
  assert.match(invoicePdfText, /Pickup \/ Delivery/);
  assert.match(invoicePdfText, /Pay Items/);
  assert.match(invoicePdfText, /Page 1 of /);
  assert.match(invoicePdfText, /Load #/);
  assert.doesNotMatch(invoicePdfText, /Subtotal/);
  assert.doesNotMatch(invoicePdfText, /AscendTMS|Powered by|Nanuet|228 East Route/);
  assert.match(invoicePdfText, /100 Fleet Way|600 E 39th/);
  const invoiceLibSource = fs.readFileSync(path.join(process.cwd(), "lib/invoice.ts"), "utf8");
  assert.match(invoiceLibSource, /showNotes/);
  assert.doesNotMatch(invoiceLibSource, /Linehaul is the customer rate|Payment due per customer terms/);
  const invoiceDefaults = settings.getDocumentDefaults("invoice");
  assert.equal(invoiceDefaults.footer_text, "");
  assert.equal(invoiceDefaults.terms_text, "");
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8"),
    /Linehaul is the customer rate|Payment due per customer terms/,
  );
  assert.match(invoiceLibSource, /INVOICE/);
  assert.match(invoiceLibSource, /Customer Information/);
  assert.match(invoiceLibSource, /Pickup \/ Delivery/);
  assert.doesNotMatch(invoiceLibSource, /Stops \/ Actions/);
  assert.match(invoiceLibSource, /Date\/Time/);
  assert.match(invoiceLibSource, /Quantity/);
  assert.match(invoiceLibSource, /paperworkCompanyName/);
  assert.match(invoiceLibSource, /bufferPages/);
  assert.match(invoiceLibSource, /drawPinnedFooter/);
  assert.match(invoiceLibSource, /Pay Items/);
  assert.match(invoiceLibSource, /margins: \{ top: 0, bottom: 0/);
  const onePageInvoice = await renderTmsInvoicePdf({
    ...tmsInvoiceModel,
    invoiceNumber: "INV-1005921",
    date: "05/29/26",
    customerName: "M & S Loads LLC.",
    customerStreet: "600 E 39th St",
    customerCityStateZip: "Hastings, NE 68901",
    customerPhone: "402-302-0097",
    companyLegalName: "M&S Loads LLC",
    companyPhone: "402-302-0097",
    dispatcherName: "MS Test",
    lines: [{ name: "Flat Rate", description: "", amount: 3500, qty: 1, rate: 3500 }],
    total: 3500,
    publicNotes: "",
    stops: [
      {
        sequence: 1,
        kind: "Pickup",
        window: "05/28/26 8:00 AM – 05/28/26 5:00 PM",
        name: "Tyson-Amarillo",
        street: "5000 FM1912",
        city: "Amarillo",
        state: "TX",
        zip: "79120",
        phone: "806-335-1531",
        reference: "",
        cargo: "",
      },
      {
        sequence: 2,
        kind: "Delivery",
        window: "05/29/26 8:00 AM – 05/29/26 5:00 PM",
        name: "Nebraska Cold Storage Inc",
        street: "600 E 39th St",
        city: "Hastings",
        state: "NE",
        zip: "68901",
        phone: "402-461-4442",
        reference: "",
        cargo: "",
      },
    ],
  });
  assert.equal((await PDFDocument.load(onePageInvoice)).getPageCount(), 1, "simple invoice must stay on one letter page");
  const onePageText = await extractDocumentText(onePageInvoice, "application/pdf", "INV-1005921-one.pdf");
  assert.match(onePageText, /Page 1 of 1/);
  assert.match(onePageText, /Load #/);
  assert.doesNotMatch(onePageText, /MS Test \(M&S Loads LLC\)/);
  assert.doesNotMatch(onePageText, /MS Test/);
  const freightPdf = await renderTmsInvoicePdf({
    ...tmsInvoiceModel,
    invoiceNumber: "INV-1005921",
    date: "05/29/26",
    customerName: "M & S Loads LLC.",
    customerStreet: "600 E 39th St",
    customerCityStateZip: "Hastings, NE 68901",
    customerPhone: "402-302-0097",
    companyLegalName: "M&S Loads LLC",
    companyPhone: "402-302-0097",
    lines: [{ name: "Flat Rate", description: "", amount: 3500, qty: 1, rate: 3500 }],
    total: 3500,
    publicNotes: "",
    stops: [
      {
        sequence: 1,
        kind: "Pickup",
        window: "05/28/26 8:00 AM – 05/28/26 5:00 PM",
        name: "Tyson-Amarillo",
        street: "5000 FM1912",
        city: "Amarillo",
        state: "TX",
        zip: "79120",
        phone: "806-335-1531",
        reference: "",
        cargo: "",
      },
      {
        sequence: 2,
        kind: "Delivery",
        window: "05/29/26 8:00 AM – 05/29/26 5:00 PM",
        name: "Nebraska Cold Storage Inc",
        street: "600 E 39th St",
        city: "Hastings",
        state: "NE",
        zip: "68901",
        phone: "402-461-4442",
        reference: "2405556-Moshe",
        cargo: "",
      },
      ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((sequence) => ({
        sequence,
        kind: sequence % 2 ? "Pickup" : "Delivery",
        window: "05/29/26 8:00 AM – 05/29/26 5:00 PM",
        name: `Warehouse ${sequence}`,
        street: "100 Industrial Rd",
        city: "Hastings",
        state: "NE",
        zip: "68901",
        phone: "402-461-4442",
        reference: sequence === 4 ? "REF-2405556" : "",
        cargo: "",
      })),
    ],
  });
  assert.equal((await PDFDocument.load(freightPdf)).getPageCount(), 2);
  const freightText = await extractDocumentText(freightPdf, "application/pdf", "INV-1005921.pdf");
  assert.match(freightText, /05\/29\/26/);
  assert.doesNotMatch(freightText, /2026-05-29/);
  assert.match(freightText, /600 E 39th/);
  assert.match(freightText, /402-302-0097/);
  assert.match(freightText, /5000 FM1912/);
  assert.match(freightText, /79120/);
  assert.match(freightText, /402-461-4442/);
  assert.match(freightText, /Pickup \/ Delivery/);
  assert.match(freightText, /Pay Items/);
  assert.match(freightText, /Page 1 of 2/);
  assert.match(freightText, /Page 2 of 2/);
  assert.match(freightText, /Load #/);
  assert.match(freightText, /References: 2405556-Moshe/);
  assert.doesNotMatch(freightText, /Subtotal/);
  assert.doesNotMatch(freightText, /Stops \/ Actions/);
  assert.doesNotMatch(freightText, /Notes/);
  assert.doesNotMatch(freightText, /Linehaul is the customer rate/);
  assert.doesNotMatch(freightText, /AscendTMS|Powered by|Nanuet|228 East Route/);
  assert.equal(tmsInvoiceModel.lines[0]?.name, "Flat Rate");
  assert.ok(tmsInvoiceModel.stops[0]?.name);
  assert.ok("window" in tmsInvoiceModel.stops[0]!);
  assert.equal(queries.getLoad(invoiceLoadId)?.tms_invoice_number, "INV-1005911");
  const invoiceFiles = (await import("../lib/files")).listAttachments(invoiceLoadId).filter((file) => file.kind === "invoice");
  assert.ok(invoiceFiles.some((file) => file.id === made.attachmentId && file.original_name === "INV-1005911.pdf"));
  const invoicePanel = fs.readFileSync(path.join(process.cwd(), "components/tms-invoice-panel.tsx"), "utf8");
  assert.match(invoicePanel, /Create invoice/);
  assert.match(invoicePanel, /EmailInvoiceButton/);
  assert.match(invoicePanel, /id="invoice-panel"/);
  assert.match(invoicePanel, /anchorId="email-invoice"/);
  assert.match(invoicePanel, /Email invoice after Delivered/);
  assert.match(invoicePanel, /companyLegalName/);
  assert.match(invoicePanel, /\/api\/loads\/\$\{loadId\}\/invoice/);
  assert.match(invoicePanel, /method="POST"/);
  assert.match(invoicePanel, /target="_blank"/);
  assert.match(invoicePanel, /downloadAndOpenPdf/);
  assert.match(invoicePanel, /about:blank/);
  assert.match(invoicePanel, /X-Attachment-Id/);
  assert.match(invoicePanel, /\/api\/attachments\/\$\{attachmentId\}\?download=1/);
  assert.match(invoicePanel, /setTab\("financials"\)/);
  assert.doesNotMatch(invoicePanel, /saved on Load Documents|go to the Load Documents/);
  const invoiceRouteSource = fs.readFileSync(path.join(process.cwd(), "app/api/loads/[id]/invoice/route.ts"), "utf8");
  assert.match(invoiceRouteSource, /pdfResponseHeaders/);
  assert.match(invoiceRouteSource, /X-Attachment-Id/);
  assert.match(invoiceRouteSource, /export async function GET/);
  assert.match(invoiceRouteSource, /export async function POST/);
  assert.doesNotMatch(invoiceRouteSource, /serveGeneratedInvoice/);
  const invoiceGetSource = invoiceRouteSource.slice(
    invoiceRouteSource.indexOf("export async function GET"),
    invoiceRouteSource.indexOf("export async function POST"),
  );
  const invoicePostSource = invoiceRouteSource.slice(invoiceRouteSource.indexOf("export async function POST"));
  assert.match(invoiceGetSource, /listAttachments/);
  assert.match(invoiceGetSource, /kind === "invoice"/);
  assert.match(invoiceGetSource, /Create or Rebuild invoice first/);
  assert.doesNotMatch(invoiceGetSource, /createTmsInvoice/);
  assert.match(invoicePostSource, /createTmsInvoice/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/pdf-response.ts"), "utf8"), /Content-Disposition.*attachment/);
  const openPdf = fs.readFileSync(path.join(process.cwd(), "lib/open-generated-pdf.ts"), "utf8");
  assert.match(openPdf, /createObjectURL/);
  assert.match(openPdf, /openPdfInNewTab/);
  assert.match(openPdf, /isSamePageWindow/);
  assert.match(openPdf, /window\.top/);
  assert.doesNotMatch(openPdf, /window\.location\.href\s*=/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/page-overlay-host.tsx"), "utf8"), /protocol === "blob:"/);
  assert.match(invoicePanel, /OpenAttachmentLink/);
  assert.match(renderInvoicesCsv([
    {
      invoiceNumber: "INV-1005911",
      loadNumber: "1005911",
      customerName: "M & S Loads LLC.",
      date: "2024-08-03",
      poNumber: "PO-5911",
      customerReference: "PO-5911",
      lane: "Kansas City, MO → Avenel, NJ",
      lines: invoiceLines,
      total: 1500,
      companyName: "M&S Loads",
      companyLegalName: "M&S Loads LLC",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      weight: "",
      miles: "",
      customerStreet: "",
      customerCityStateZip: "",
      customerPhone: "",
      customerContact: "",
      stops: [],
    },
  ]), /INV-1005911/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/tms-invoice-panel.tsx"), "utf8"), /Create invoice/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/accounting/invoices/page.tsx"), "utf8"), /Download invoices/);

  const mappedDrivers = samsara.mapTruckDrivers({
    vehicles: [
      {
        id: "veh-36",
        name: "36",
        vin: "",
        year: "",
        make: "",
        model: "",
        licensePlate: "",
        driverId: "drv-pat",
        driverName: "Pat Reed",
      },
    ],
    trucks: [{ id: 36, unit_number: "36", samsara_vehicle_id: "veh-36", vin: "", plate: "" }],
    drivers: [{ id: 99, name: "Pat Reed", samsara_driver_id: "drv-pat" }],
  });
  assert.equal(mappedDrivers[0]?.truckId, 36);
  assert.equal(mappedDrivers[0]?.samsaraDriverName, "Pat Reed");
  assert.equal(mappedDrivers[0]?.tmsDriverId, 99);
  const unmatchedHos = samsara.mapHosClocks({
    clocks: [
      {
        driver: { id: "drv-outside", name: "Outside Driver" },
        clocks: { drive: { driveRemainingDurationMs: 3_600_000 }, shift: { shiftRemainingDurationMs: 7_200_000 } },
        currentDutyStatus: { hosStatusType: "driving" },
      },
    ],
    drivers: [],
    loads: [],
  });
  assert.equal(unmatchedHos[0]?.driverName, "Outside Driver");
  assert.equal(unmatchedHos[0]?.driverId, null);
  assert.equal(
    samsara.hosForAssignedTruck(
      {
        mode: "samsara",
        tokenSet: true,
        fetchedAt: new Date().toISOString(),
        locations: [],
        hos: unmatchedHos,
        truckDrivers: [
          { truckId: 36, samsaraDriverId: "drv-outside", samsaraDriverName: "Outside Driver", tmsDriverId: null },
        ],
      },
      { id: 36, assigned_driver_id: null },
    )?.driverName,
    "Outside Driver",
  );
  const currentVehicleDrivers = samsara.mapHosCurrentVehicleDrivers({
    clocks: [
      {
        driver: { id: "88668", name: "Denise Ortega" },
        currentVehicle: { id: "veh-36", name: "36" },
        currentDutyStatus: { hosStatusType: "driving" },
        clocks: { drive: { driveRemainingDurationMs: 3_600_000 } },
      },
    ],
    trucks: [{ id: 36, unit_number: "36", samsara_vehicle_id: "veh-36", vin: "", plate: "" }],
    drivers: [{ id: denise.id, name: "Denise Ortega", samsara_driver_id: "88668" }],
  });
  assert.equal(currentVehicleDrivers[0]?.truckId, 36);
  assert.equal(currentVehicleDrivers[0]?.samsaraDriverName, "Denise Ortega");
  assert.equal(currentVehicleDrivers[0]?.tmsDriverId, denise.id);
  assert.equal(
    samsara.mapHosCurrentVehicleDrivers({
      clocks: [
        {
          driver: { id: "drv-old", name: "Historical Driver" },
          currentVehicle: { id: "sam-old-38", name: "old 38" },
          currentDutyStatus: { hosStatusType: "offDuty" },
        },
      ],
      trucks: [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-old-38", vin: "", plate: "" }],
      drivers: [],
    }).length,
    0,
    "inactive currentVehicle must not attach HOS/driver to a live TMS truck",
  );
  assert.equal(
    samsara.mapHosCurrentVehicleDrivers({
      clocks: [
        {
          driver: { id: "drv-old", name: "Historical Driver" },
          currentVehicle: { id: "sam-old-38", name: "38" },
          currentDutyStatus: { hosStatusType: "offDuty" },
        },
      ],
      trucks: [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-old-38", vin: "", plate: "" }],
      drivers: [],
      activeVehicleIds: new Set([canonicalFleetKey("sam-28")]),
    }).length,
    0,
    "HOS must ignore a stored id that is not in the active Samsara vehicle list",
  );
  queries.updateDriver(fleetDriverId, {
    name: "Fleet Smoke",
    phone: "555-0144",
    email: "fleet@msloads.com",
    notes: "Nights",
    license: "NE-CDL-FLEET",
    pin: "",
    truck_id: null,
    status: "available",
  });
  assert.equal(queries.getDriver(fleetDriverId)?.pin, "3333");
  assert.equal(queries.getDriver(fleetDriverId)?.email, "fleet@msloads.com");
  assert.equal(queries.getDriver(fleetDriverId)?.date_of_hire, "2020-03-15");
  assert.equal(queries.getDriver(fleetDriverId)?.country, "USA");
  queries.updateDriver(fleetDriverId, {
    name: "Fleet Smoke",
    phone: "555-0144",
    email: "fleet@msloads.com",
    notes: "Nights",
    license: "NE-CDL-FLEET",
    pin: "",
    resetPin: true,
    truck_id: null,
    status: "available",
  });
  assert.equal(queries.getDriver(fleetDriverId)?.pin, "");
  queries.updateDriver(fleetDriverId, {
    name: "Fleet Smoke",
    phone: "555-0144",
    email: "fleet@msloads.com",
    notes: "Nights",
    license: "NE-CDL-FLEET",
    pin: "4444",
    truck_id: null,
    status: "available",
  });
  assert.equal(queries.getDriver(fleetDriverId)?.pin, "4444");
  const modelTruckId = queries.createTruck({
    unit_number: "SMOKE-T",
    type: "dry_van",
    capacity_lbs: 40000,
    status: "available",
    model: "579",
    assigned_driver_id: fleetDriverId,
  });
  assert.equal(queries.getTruck(modelTruckId)?.model, "579");
  assert.equal(queries.getTruck(modelTruckId)?.driver_name, "Fleet Smoke");
  const reeferTrailerId = queries.createTrailer({
    unit_number: "R-SMOKE",
    type: "reefer",
    vin: "1TRAILER",
    plate: "TRL-1",
    truck_id: modelTruckId,
    reefer_setpoint_f: -10,
  });
  assert.equal(queries.getTrailer(reeferTrailerId)?.truck_unit, "SMOKE-T");
  assert.equal(queries.getTrailer(reeferTrailerId)?.reefer_setpoint_f, -10);
  queries.updateTrailer(reeferTrailerId, {
    unit_number: "R-SMOKE",
    type: "reefer",
    vin: "1TRAILER",
    plate: "TRL-1",
    truck_id: modelTruckId,
    reefer_setpoint_f: -10,
    notes: "Keep at -10",
    active: 1,
    orbcomm_asset_id: "orb-smoke",
  });
  assert.equal(queries.getTrailer(reeferTrailerId)?.notes, "Keep at -10");
  assert.equal(queries.getTrailer(reeferTrailerId)?.orbcomm_asset_id, "orb-smoke");

  const spareTruckId = queries.createTruck({
    unit_number: "DEL-1",
    type: "dry_van",
    capacity_lbs: 40000,
    status: "available",
  });
  queries.saveTruckGps(spareTruckId, {
    latitude: 35.4676,
    longitude: -97.5164,
    address: "Oklahoma City, OK",
    recordedAt: "2026-08-24T12:00:00Z",
    source: "samsara",
  });
  assert.equal(queries.getTruck(spareTruckId)?.gps_address, "Oklahoma City, OK");
  assert.equal(queries.getTruck(spareTruckId)?.gps_source, "samsara");
  queries.setTruckActive(spareTruckId, false);
  assert.equal(queries.getTruck(spareTruckId)?.active, 0);
  queries.setTruckActive(spareTruckId, true);
  queries.deleteTruck(spareTruckId);
  assert.equal(queries.getTruck(spareTruckId), null);

  const assignedTruckId = queries.createTruck({
    unit_number: "DEL-2",
    type: "dry_van",
    capacity_lbs: 40000,
    status: "available",
  });
  const assignedLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Tulsa, OK",
    destination: "Dallas, TX",
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: 20000,
    commodity: "Paper",
    rate: 900,
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
  });
  queries.assignLoad(assignedLoadId, assignedTruckId, fleetDriverId);
  assert.equal(queries.fleetAssetIsAssigned("truck", assignedTruckId), true);
  assert.throws(() => queries.deleteTruck(assignedTruckId), /Unassign this truck from the load first/);
  queries.setTruckActive(assignedTruckId, false);
  assert.equal(queries.getTruck(assignedTruckId)?.active, 0);

  const { attachMikeFleetTelemetry, buildMikeGpsContext, mikeGpsPointsFromFleet, resolveClosestCityRanking } =
    await import("../lib/mike");
  const mikeGps = mikeGpsPointsFromFleet({
    trucks: [
      {
        id: 36,
        unit_number: "36",
        samsara_vehicle_id: "sam-36",
        gps_latitude: 35.4676,
        gps_longitude: -97.5164,
        gps_address: "Oklahoma City, OK",
        gps_source: "samsara",
      },
      {
        id: 32,
        unit_number: "32",
        samsara_vehicle_id: "sam-32",
        gps_latitude: 40.8448,
        gps_longitude: -73.8648,
        gps_address: "Bronx, NY",
        gps_source: "samsara",
      },
    ],
    locations: [],
  });
  assert.equal(mikeGps.find((row) => row.unit === "36")?.address, "Oklahoma City, OK");
  assert.equal(mikeGps.find((row) => row.unit === "32")?.address, "Bronx, NY");
  const liveByVehicleId = buildMikeGpsContext("what truck is closest to Oklahoma City?", {
    trucks: [
      { id: 36, unit_number: "36", samsara_vehicle_id: "sam-36" },
      { id: 32, unit_number: "32", samsara_vehicle_id: "sam-32" },
      { id: 99, unit_number: "99", samsara_vehicle_id: "sam-99" },
    ],
    locations: [
      {
        truckId: 32,
        vehicleId: "sam-32",
        unitNumber: "32",
        latitude: 40.8448,
        longitude: -73.8648,
        address: "Bronx, NY",
        source: "samsara",
      },
      {
        vehicleId: "sam-36",
        unitNumber: "Unit 36",
        latitude: 35.4676,
        longitude: -97.5164,
        address: "Oklahoma City, OK",
        source: "samsara",
      },
    ],
  });
  assert.equal(liveByVehicleId.closestToCity?.found, true);
  assert.equal(liveByVehicleId.closestToCity?.ranked[0]?.unit, "36");
  assert.equal(liveByVehicleId.closestToCity?.ranked[0]?.address, "Oklahoma City, OK");
  assert.notEqual(liveByVehicleId.closestToCity?.ranked[0]?.unit, "32");
  assert.equal(liveByVehicleId.skippedNoPing, 1);
  assert.equal(liveByVehicleId.gps.find((row) => row.unit === "99")?.note, "no last GPS ping");
  assert.equal(liveByVehicleId.gps.find((row) => row.unit === "36")?.hasPosition, true);
  const matchByIdOnly = buildMikeGpsContext("what truck is closest to Oklahoma City?", {
    trucks: [{ id: 40, unit_number: "40", samsara_vehicle_id: "sam-40" }],
    locations: [
      {
        vehicleId: "sam-40",
        unitNumber: "",
        latitude: 35.4676,
        longitude: -97.5164,
        address: "Oklahoma City, OK",
        source: "samsara",
      },
    ],
  });
  assert.equal(matchByIdOnly.closestToCity?.ranked[0]?.unit, "40");
  assert.equal(matchByIdOnly.gps[0]?.hasPosition, true);
  const ignoreDemo = buildMikeGpsContext("what truck is closest to Oklahoma City?", {
    trucks: [{ id: 40, unit_number: "40", samsara_vehicle_id: "sam-40" }],
    locations: [
      {
        vehicleId: "sam-40",
        unitNumber: "40",
        latitude: 35.4676,
        longitude: -97.5164,
        address: "Oklahoma City, OK",
        source: "demo",
      },
    ],
  });
  assert.equal(ignoreDemo.gps[0]?.hasPosition, false);
  assert.equal(ignoreDemo.closestToCity?.ranked.length, 0);
  assert.equal(ignoreDemo.skippedNoPing, 1);
  const cityOnly = attachMikeFleetTelemetry({
    question: "what truck is closest to Oklahoma City?",
    trucks: [
      {
        id: 40,
        unit_number: "40",
        samsara_vehicle_id: "sam-40",
        assigned_driver_id: 9,
        driver_name: "Pat Reed",
      },
      { id: 41, unit_number: "41", samsara_vehicle_id: "sam-41" },
    ],
    locations: [
      {
        vehicleId: "sam-40",
        unitNumber: "",
        latitude: null,
        longitude: null,
        address: "Oklahoma City, OK",
        source: "samsara",
      },
    ],
    hos: [
      {
        driverId: 9,
        driverName: "Pat Reed",
        dutyStatus: "driving",
        driveRemainingMs: 4 * 3600000,
        source: "samsara",
      },
    ],
  });
  assert.equal(cityOnly.trucks.find((row) => row.unit === "40")?.lastGps.hasPosition, true);
  assert.equal(cityOnly.trucks.find((row) => row.unit === "40")?.lastGps.city, "Oklahoma City, OK");
  assert.equal(cityOnly.trucks.find((row) => row.unit === "40")?.hos?.duty, "driving");
  assert.equal(cityOnly.trucks.find((row) => row.unit === "41")?.lastGps.note, "no last GPS ping");
  assert.equal(cityOnly.trucks.find((row) => row.unit === "41")?.hos?.note, "no live HOS");
  assert.equal(cityOnly.closestToCity?.ranked[0]?.unit, "40");
  assert.equal(cityOnly.skippedNoPing, 1);
  const liveDesMoines = await resolveClosestCityRanking("What truck is closest to Des Moines, Iowa?", {
    trucks: [
      { id: 28, unit_number: "28", samsara_vehicle_id: "sam-28" },
      { id: 32, unit_number: "32", samsara_vehicle_id: "sam-32" },
      { id: 42, unit_number: "42", samsara_vehicle_id: "sam-42" },
    ],
    locations: [
      {
        vehicleId: "sam-28",
        unitNumber: "28",
        latitude: 41.9778,
        longitude: -91.6656,
        address: "Cedar Rapids, IA",
        source: "samsara",
      },
      {
        vehicleId: "sam-32",
        unitNumber: "32",
        latitude: 37.9861,
        longitude: -100.9957,
        address: "Holcomb, KS",
        source: "samsara",
      },
      {
        vehicleId: "sam-42",
        unitNumber: "42",
        latitude: 25.7617,
        longitude: -80.1918,
        address: "Miami, FL",
        source: "samsara",
      },
    ],
  });
  assert.equal(liveDesMoines?.found, true);
  assert.equal(liveDesMoines?.ranked[0]?.unit, "28");
  assert.match(formatClosestCityReply(liveDesMoines), /28/);
  assert.doesNotMatch(formatClosestCityReply(liveDesMoines), /no trucks ranked/i);
  const geocodeFallback = await resolveClosestCityRanking(
    "What truck is closest to Xyzzyville, ZZ?",
    {
      trucks: [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-28" }],
      locations: [
        {
          vehicleId: "sam-28",
          unitNumber: "28",
          latitude: 41.9778,
          longitude: -91.6656,
          address: "Cedar Rapids, IA",
          source: "samsara",
        },
      ],
    },
    async () => ({ latitude: 41.5868, longitude: -93.625 }),
  );
  assert.equal(geocodeFallback?.found, true);
  assert.equal(geocodeFallback?.ranked[0]?.unit, "28");
  const geocodeMiss = await resolveClosestCityRanking(
    "What truck is closest to Xyzzyville, ZZ?",
    {
      trucks: [{ id: 28, unit_number: "28", samsara_vehicle_id: "sam-28" }],
      locations: [
        {
          vehicleId: "sam-28",
          unitNumber: "28",
          latitude: 41.9778,
          longitude: -91.6656,
          address: "Cedar Rapids, IA",
          source: "samsara",
        },
      ],
    },
    async () => null,
  );
  assert.equal(geocodeMiss?.found, false);
  assert.equal(geocodeMiss?.reason, "city_not_found");
  assert.match(formatClosestCityReply(geocodeMiss), /could not place/i);
  assert.doesNotMatch(formatClosestCityReply(geocodeMiss), /no trucks ranked/i);
  let geocodedAsk = "";
  const coldDodge = await resolveClosestCityRanking(
    "What driver is closest to Dodge city Kansas",
    {
      trucks: [
        { id: 32, unit_number: "32", samsara_vehicle_id: "sam-32" },
        { id: 42, unit_number: "42", samsara_vehicle_id: "sam-42" },
      ],
      locations: [
        {
          vehicleId: "sam-32",
          unitNumber: "32",
          latitude: 37.9861,
          longitude: -100.9957,
          address: "Holcomb, KS",
          source: "samsara",
        },
        {
          vehicleId: "sam-42",
          unitNumber: "42",
          latitude: 25.7617,
          longitude: -80.1918,
          address: "Miami, FL",
          source: "samsara",
        },
      ],
    },
    async (address) => {
      geocodedAsk = address;
      return { latitude: 37.7528, longitude: -100.0171 };
    },
  );
  assert.match(geocodedAsk, /Dodge/i, "first closest-to ask must geocode the city without a named truck");
  assert.equal(coldDodge?.found, true);
  assert.equal(coldDodge?.ranked[0]?.unit, "32", "cold Dodge City ask must rank live Samsara GPS without priming");
  assert.doesNotMatch(formatClosestCityReply(coldDodge), /no trucks ranked/i);

  const {
    answerMikeReeferQuestion,
    answerMikeTmsQuestion,
    formatMikeReeferReply,
    formatMikeTmsStatsReply,
    parseMikeReeferQuestion,
    parseMikeTmsStatsQuestion,
    sameTrailerUnit,
    topCustomersByBilled,
    topDriversByBilled,
    topDriversByTmsMiles,
    weekBounds,
  } = await import("../lib/mike-tms-stats");
  const mikeNow = new Date("2026-08-28T15:00:00");
  assert.equal(parseMikeTmsStatsQuestion("Who is our top customer on 2026?", mikeNow)?.kind, "top_customer");
  assert.equal(parseMikeTmsStatsQuestion("What's highest grossing driver this month?", mikeNow)?.kind, "driver_billed");
  assert.equal(parseMikeTmsStatsQuestion("What driver did the most miles this week?", mikeNow)?.kind, "miles_week");
  const billedCustomer = queries.createCustomer({ name: "Billed Freight Foods", billing_notes: "", contacts: [] });
  const otherCustomer = queries.createCustomer({ name: "Small Broker LLC", billing_notes: "", contacts: [] });
  const billedTruck = queries.createTruck({
    unit_number: "77",
    type: "reefer",
    capacity_lbs: 43000,
    status: "available",
  });
  const mikeBilledDriver = queries.createDriver({
    name: "Dana Billed",
    phone: "555-0177",
    license: "NE-CDL-BILLED",
    pin: "7171",
    truck_id: billedTruck,
    status: "available",
  });
  const otherTruck = queries.createTruck({
    unit_number: "88",
    type: "reefer",
    capacity_lbs: 43000,
    status: "available",
  });
  const otherDriver = queries.createDriver({
    name: "Evan Miles",
    phone: "555-0188",
    license: "IA-CDL-MILES",
    pin: "8181",
    truck_id: otherTruck,
    status: "available",
  });
  const mikeBilledLoadId = queries.createLoad({
    customer_id: billedCustomer,
    origin: "Hastings, NE",
    destination: "Chicago, IL",
    pickup_start: "2026-08-26T12:00:00.000Z",
    pickup_end: "2026-08-26T18:00:00.000Z",
    delivery_start: "2026-08-27T12:00:00.000Z",
    delivery_end: "2026-08-27T18:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 250000,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "delivered",
    truck_id: billedTruck,
    driver_id: mikeBilledDriver,
  });
  const smallLoadId = queries.createLoad({
    customer_id: otherCustomer,
    origin: "Omaha, NE",
    destination: "Des Moines, IA",
    pickup_start: "2026-08-25T12:00:00.000Z",
    pickup_end: "2026-08-25T18:00:00.000Z",
    delivery_start: "2026-08-26T12:00:00.000Z",
    delivery_end: "2026-08-26T18:00:00.000Z",
    weight: 20000,
    commodity: "Pork",
    rate: 2100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "delivered",
    truck_id: otherTruck,
    driver_id: otherDriver,
  });
  getDb()
    .prepare("UPDATE loads SET route_miles = 9000, route_source = 'manual', empty_miles = 80, empty_source = 'google' WHERE id = ?")
    .run(mikeBilledLoadId);
  getDb()
    .prepare("UPDATE loads SET route_miles = 140, route_source = 'manual', empty_miles = 20, empty_source = 'google' WHERE id = ?")
    .run(smallLoadId);
  assert.equal(topCustomersByBilled(2026)[0]?.name, "Billed Freight Foods");
  assert.equal(topDriversByBilled(2026, 8)[0]?.name, "Dana Billed");
  assert.equal(topDriversByBilled(2026, 8)[0]?.unit, "77");
  const mikeWeek = weekBounds(mikeNow);
  assert.equal(topDriversByTmsMiles(mikeWeek.start, mikeWeek.end)[0]?.name, "Dana Billed");
  const customerReply = formatMikeTmsStatsReply(
    { kind: "top_customer", year: 2026, weekStart: mikeWeek.start, weekEnd: mikeWeek.end },
    mikeNow,
  );
  assert.match(customerReply, /Billed Freight Foods/);
  assert.doesNotMatch(customerReply, /I don't have information/i);
  const driverReply = formatMikeTmsStatsReply(
    { kind: "driver_billed", year: 2026, month: 8, weekStart: mikeWeek.start, weekEnd: mikeWeek.end },
    mikeNow,
  );
  assert.match(driverReply, /Dana Billed on unit 77/);
  assert.match(driverReply, /\$250,000/);
  assert.match(driverReply, /billed freight/i);
  assert.match(driverReply, /Financials/i);
  assert.doesNotMatch(driverReply, /paycheck|oo pay|relay pay|settlement/i);
  assert.doesNotMatch(driverReply, /I don't have information/i);
  const milesReply = formatMikeTmsStatsReply(
    { kind: "miles_week", year: 2026, weekStart: mikeWeek.start, weekEnd: mikeWeek.end },
    mikeNow,
  );
  assert.match(milesReply, /Dana Billed/);
  assert.match(milesReply, /TMS miles/i);
  const liveCustomerAsk = answerMikeTmsQuestion("Who is our top customer on 2026?", mikeNow);
  const liveDriverAsk = answerMikeTmsQuestion("What's highest grossing driver this month?", mikeNow);
  const liveMilesAsk = answerMikeTmsQuestion("What driver did the most miles this week?", mikeNow);
  assert.match(String(liveCustomerAsk), /Billed Freight Foods/);
  assert.doesNotMatch(String(liveCustomerAsk), /I don't have information/i);
  assert.match(String(liveDriverAsk), /Dana Billed/);
  assert.match(String(liveDriverAsk), /billed freight/i);
  assert.doesNotMatch(String(liveDriverAsk), /I don't have information/i);
  assert.match(String(liveMilesAsk), /TMS miles/i);
  assert.doesNotMatch(String(liveMilesAsk), /I don't have information/i);
  assert.equal(parseMikeReeferQuestion("What's the Reefer temperature on trailer MS1519"), "MS1519");
  assert.equal(sameTrailerUnit("MS1519", "1519"), true);
  assert.equal(sameTrailerUnit("MS1519", "MS-1519"), true);
  assert.equal(sameTrailerUnit("MK1519", "MS1519"), false);
  queries.createTrailer({
    unit_number: "MK1519",
    type: "reefer",
    orbcomm_asset_id: "orb-mk1519",
    status: "available",
  });
  getDb()
    .prepare(
      `INSERT INTO reefer_readings (
        load_id, truck_id, trailer_id, setpoint_f, temperature_f, return_air_f, operating_mode, address, source, recorded_at, alarm
      ) VALUES (NULL, NULL, 'MK1519', 34, 35.2, 35.2, 'continuous', 'York, NE', 'orbcomm', '2026-08-20T16:00:00Z', '')`,
    )
    .run();
  const reeferAsk = await answerMikeReeferQuestion("What's the Reefer temperature on trailer MK1519");
  assert.match(String(reeferAsk), /MK1519/);
  assert.match(String(reeferAsk), /34/);
  assert.match(String(reeferAsk), /35\.2/);
  assert.match(String(reeferAsk), /Continuous/);
  assert.match(String(reeferAsk), /York, NE/);
  assert.doesNotMatch(String(reeferAsk), /I don't have information/i);
  assert.match(formatMikeReeferReply({ unit: "MS1519", setpointF: 34, returnF: 35.2, mode: "continuous", city: "York, NE" }), /setpoint 34°F/);
  getDb()
    .prepare(
      `INSERT INTO reefer_readings (
        load_id, truck_id, trailer_id, setpoint_f, temperature_f, return_air_f, operating_mode, address, source, recorded_at, alarm
      ) VALUES (NULL, NULL, '1519', 36, 37.1, 37.1, 'continuous', 'Hastings, NE', 'orbcomm', '2026-08-19T12:00:00Z', '')`,
    )
    .run();
  const ms1519Ask = await answerMikeReeferQuestion("What's the Reefer temperature on trailer MS1519");
  assert.match(String(ms1519Ask), /36/);
  assert.match(String(ms1519Ask), /37\.1/);
  assert.match(String(ms1519Ask), /Continuous/);
  assert.match(String(ms1519Ask), /Hastings, NE/);
  assert.doesNotMatch(String(ms1519Ask), /I don't have information/i);
  const { matchLinkedSamsaraVehicle } = await import("../lib/fleet-import-shared");
  assert.equal(
    matchLinkedSamsaraVehicle(
      [{ id: 40, unit_number: "40", samsara_vehicle_id: "sam-40" }],
      "sam-40",
    )?.id,
    40,
  );
  const linkedGps = samsara.mapVehicleLocations({
    vehicles: [
      {
        id: "sam-40",
        name: "Vehicle 99999999",
        gps: [
          {
            time: "2026-08-24T16:00:00Z",
            latitude: 35.4676,
            longitude: -97.5164,
            reverseGeo: { formattedLocation: "Oklahoma City, OK" },
          },
        ],
      },
    ],
    trucks: [{ id: 40, unit_number: "40", samsara_vehicle_id: "sam-40" }],
    loads: [],
  });
  assert.equal(linkedGps[0]?.unitNumber, "40", "linked Samsara id must win even when the name has other digits");
  assert.equal(linkedGps[0]?.address, "Oklahoma City, OK");
  assert.equal(samsara.extractSamsaraGps({ gps: [{ latitude: 35.4, longitude: -97.5, reverseGeo: { formattedLocation: "OKC" } }] }).address, "OKC");
  assert.equal(
    samsara.extractSamsaraGps({
      gps: { latitude: 41.25, longitude: -95.93, speedMilesPerHour: 62, headingDegrees: 85 },
    }).headingDeg,
    85,
  );
  assert.equal(
    samsara.formatSamsaraStatusHos({
      driverId: 1,
      loadId: null,
      samsaraDriverId: "d1",
      driverName: "Test",
      dutyStatus: "driving",
      driveRemainingMs: 6.2 * 3600000,
      shiftRemainingMs: null,
      cycleRemainingMs: null,
      timeUntilBreakMs: null,
      recordedAt: "2026-08-31T12:00:00.000Z",
      source: "samsara",
    }),
    "Driving · 6h 12m",
  );
  assert.equal(samsara.formatSamsaraStatusHos(null), "");
  const odometerMiles = samsara.extractSamsaraOdometerMiles({
    obdOdometerMeters: { time: "2026-08-26T12:00:00.000Z", value: 160934.4 },
  }).miles;
  assert.ok(odometerMiles != null && Math.abs(odometerMiles - 100) < 0.01);
  assert.equal(samsara.extractSamsaraOdometerMiles({ gps: { latitude: 35.4, longitude: -97.5 } }).miles, null);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /obdOdometerMeters/);

  const { compactTrailerShareState, formatBoardDateTime, formatCompactShareExpiry, formatDate, formatDateTime, formatStopWindow, gpsMotionLabel, loadTouchesToday, shortPlaceLabel } = await import("../lib/format");
  assert.equal(formatDate("2026-08-25"), "08/25/26");
  assert.match(formatDateTime("2026-08-25T16:30:00-04:00"), /08\/25\/26/);
  assert.equal(formatCompactShareExpiry("2026-09-02T20:04:00-04:00"), "09/02 8:04p");
  assert.equal(compactTrailerShareState("", ""), "none");
  assert.equal(compactTrailerShareState("/t/abc", "2026-09-04T17:22:00-04:00", Date.parse("2026-09-03T12:00:00-04:00")), "live");
  assert.equal(compactTrailerShareState("/t/abc", "2026-09-02T20:04:00-04:00", Date.parse("2026-09-03T12:00:00-04:00")), "expired");
  assert.equal(compactTrailerShareState("/t/abc", "2026-09-03T12:00:00-04:00", Date.parse("2026-09-03T12:00:00-04:00")), "expired");
  const boardWhen = formatBoardDateTime("2026-08-28T08:00:00-04:00");
  assert.equal(boardWhen.date, "08/28/26");
  assert.match(boardWhen.time, /8:00\s*AM/);
  assert.doesNotMatch(boardWhen.date, /AM|PM/);
  assert.equal(formatBoardDateTime("2026-08-28").time, "");
  assert.equal(
    formatStopWindow("2026-08-25T11:57:00.000Z", "2026-08-25T11:58:00.000Z", "appointment"),
    formatDateTime("2026-08-25T11:57:00.000Z"),
  );
  assert.match(formatStopWindow("2026-08-25T11:57:00.000Z", "2026-08-25T17:58:00.000Z", "fcfs"), /–/);
  assert.doesNotMatch(formatStopWindow("2026-08-25T11:57:00.000Z", "2026-08-25T11:58:00.000Z", "appointment"), /–/);
  assert.ok(
    loadTouchesToday(
      { pickup_start: "2026-08-25T12:00:00-04:00", pickup_end: "", delivery_start: "", delivery_end: "" },
      new Date("2026-08-25T15:00:00-04:00"),
    ),
  );
  assert.equal(
    loadTouchesToday(
      { pickup_start: "2026-08-24T12:00:00-04:00", pickup_end: "", delivery_start: "", delivery_end: "" },
      new Date("2026-08-25T15:00:00-04:00"),
    ),
    false,
  );

  const { driverFacingPay } = await import("../lib/settlement");
  assert.equal(driverFacingPay({ driver_type: "company_driver", rate: 5000, oo_percent: 75 }), null);
  assert.equal(driverFacingPay({ driver_type: "single", rate: 5000, oo_percent: 75 }), null);
  assert.equal(driverFacingPay({ driver_type: "owner_operator", rate: 5000, oo_percent: 75 }), 3750);

  const { normalizeCabType, parseCdlEndorsements, formatCdlEndorsements, isOwnerOperator, normalizeDriverKind, labelForDriverKind } = await import("../lib/types");
  assert.equal(normalizeCabType("reefer"), "sleeper");
  assert.equal(normalizeCabType("day cab"), "day_cab");
  assert.deepEqual(parseCdlEndorsements("H,T"), ["H", "T"]);
  assert.match(formatCdlEndorsements("H"), /Hazmat/);
  assert.equal(isOwnerOperator("owner_operator"), true);
  assert.equal(isOwnerOperator("company_driver"), false);
  assert.equal(isOwnerOperator("single"), false);
  assert.equal(normalizeDriverKind("single"), "company_driver");
  assert.equal(normalizeDriverKind(""), "company_driver");
  assert.equal(normalizeDriverKind("owner_operator"), "owner_operator");
  assert.equal(labelForDriverKind("single"), "Company driver");
  assert.equal(labelForDriverKind("company_driver"), "Company driver");
  assert.equal(labelForDriverKind("owner_operator"), "Owner-operator");
  const { assignedLoadName } = await import("../lib/owner-operator-shared");
  assert.equal(
    assignedLoadName({ name: "Cole Brennan", driver_type: "owner_operator", company_name: "Brennan Trucking" }),
    "Brennan Trucking",
  );
  assert.equal(
    assignedLoadName({ driver_name: "Denise Ortega", driver_type: "company_driver", driver_company_name: "" }),
    "Denise Ortega",
  );
  assert.equal(
    assignedLoadName({ name: "Sam Keene", driver_type: "owner_operator", company_name: "" }),
    "Sam Keene",
  );

  const { motionFromSpeedMph } = await import("../lib/fleet-map-shared");
  assert.equal(motionFromSpeedMph(0), "Parked");
  assert.equal(motionFromSpeedMph(0.4), "Parked");
  assert.equal(motionFromSpeedMph(12), "Moving");

  const driverHome = fs.readFileSync(path.join(process.cwd(), "app/driver/page.tsx"), "utf8");
  assert.match(driverHome, /data-driver-destinations|DriverDestinations/);
  const driverDestUi = fs.readFileSync(path.join(process.cwd(), "components/driver-destinations.tsx"), "utf8");
  assert.match(driverDestUi, /driver-dest-label/);
  assert.match(driverDestUi, /driver-dest-off/);
  const driverCss = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(driverCss, /a\.driver-dest/);
  assert.match(driverCss, /#122033 !important/);
  assert.match(driverCss, /\.driver-dest-off[\s\S]*#334155/);
  assert.match(driverCss, /\.driver-app a\.btn-secondary/);
  assert.match(driverHome, /Dispatch/);
  assert.match(driverHome, /Upload/);
  assert.match(driverHome, /Confirmation/);
  assert.match(driverHome, /label: "Trailer"/);
  assert.match(driverHome, /driverLoadHasAssignedTrailer/);
  assert.doesNotMatch(driverHome, /label: "Fuel"/);
  assert.doesNotMatch(driverHome, /label: "BOL"/);
  assert.doesNotMatch(driverHome, /#fuel|#bol/);
  assert.match(driverHome, /pickDriverDestinationLoad/);
  const { pickDriverDestinationLoad } = await import("../lib/driver-destinations-shared");
  assert.equal(pickDriverDestinationLoad([{ id: 11 }], [{ id: 22, delivery_end: "2026-08-01T00:00:00.000Z" }])?.id, 11);
  assert.equal(
    pickDriverDestinationLoad(
      [],
      [
        { id: 22, delivery_end: "2026-01-01T00:00:00.000Z" },
        { id: 33, delivery_end: "2026-08-01T00:00:00.000Z" },
      ],
    )?.id,
    33,
  );
  assert.equal(pickDriverDestinationLoad([], []), null);
  const { driverLoadHasAssignedTrailer, driverAssignedTrailerMap } = await import("../lib/driver-trailer");
  assert.equal(driverLoadHasAssignedTrailer({ trailer_id: null }), false);
  assert.equal(driverLoadHasAssignedTrailer({ trailer_id: 9 }), true);
  const driverPinTrailerId = queries.createTrailer({
    unit_number: "TR-DRV-PIN",
    type: "reefer",
    orbcomm_asset_id: "orbcomm-drv-pin",
  });
  queries.saveTrailerGps(driverPinTrailerId, {
    latitude: 41.11,
    longitude: -96.22,
    address: "Driver trailer pin",
    recordedAt: "2026-08-20T14:00:00.000Z",
    source: "orbcomm",
  });
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "TR-DRV-PIN",
    setpoint_f: 34,
    temperature_f: 34,
    return_air_f: null,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "Off",
    latitude: 41.11,
    longitude: -96.22,
    address: "Driver trailer pin",
    source: "orbcomm",
    recorded_at: "2026-08-20T14:00:00.000Z",
  });
  const driverPinCustomerId = queries.createCustomer({
    name: "Driver Trailer Pin Co",
    billing_notes: "",
    contacts: [],
  });
  const driverPinLoadId = queries.createLoad({
    customer_id: driverPinCustomerId,
    origin: "Omaha, NE",
    destination: "Lincoln, NE",
    pickup_start: "2026-08-20T12:00:00.000Z",
    pickup_end: "2026-08-20T16:00:00.000Z",
    delivery_start: "2026-08-21T12:00:00.000Z",
    delivery_end: "2026-08-21T20:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 1500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    trailer_id: driverPinTrailerId,
    status: "assigned",
    truck_id: null,
    driver_id: null,
  });
  const driverPinView = await driverAssignedTrailerMap(queries.getLoad(driverPinLoadId)!);
  assert.equal(driverPinView.trailerNumber, "TR-DRV-PIN");
  assert.equal(driverPinView.point?.lat, 41.11);
  assert.equal(driverPinView.point?.lng, -96.22);
  assert.equal(driverPinView.point?.pinColor, "#eab308");
  const emptyTrailerLoadId = queries.createLoad({
    customer_id: driverPinCustomerId,
    origin: "Omaha, NE",
    destination: "Lincoln, NE",
    pickup_start: "2026-08-20T12:00:00.000Z",
    pickup_end: "2026-08-20T16:00:00.000Z",
    delivery_start: "2026-08-21T12:00:00.000Z",
    delivery_end: "2026-08-21T20:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 1500,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "assigned",
    truck_id: null,
    driver_id: null,
  });
  const emptyTrailerView = await driverAssignedTrailerMap(queries.getLoad(emptyTrailerLoadId)!);
  assert.equal(emptyTrailerView.point, null);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/trailer/page.tsx"), "utf8"), /data-driver-trailer-map/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/trailer/page.tsx"), "utf8"), /cluster=\{false\}/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map-shared.ts"), "utf8"), /LOAD_MAP_PIN_TIP_Y/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/load-map-shared.ts"), "utf8"), /r="9"/);
  const driverLoadPage = fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8");
  assert.match(driverLoadPage, /driverFacingPay/);
  assert.doesNotMatch(driverLoadPage, /formatMoney\(load\.rate\)/);
  assert.match(driverLoadPage, /id="fuel"/);
  assert.match(driverLoadPage, /id="upload"/);
  assert.doesNotMatch(driverLoadPage, /DriverFuelReceipt|DriverCameraPdf/);
  assert.match(driverLoadPage, /DriverLoadActions/);
  assert.match(driverLoadPage, /id="bol"/);
  assert.match(driverLoadPage, /data-driver-trailer-tab/);
  assert.match(driverLoadPage, /packet=internal/);
  assert.match(driverLoadPage, /isCustomerRateDocument/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/driver-doc-classify.tsx"), "utf8"),
    /isCustomerRateDocument/,
  );
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "app/api/attachments/[id]/route.ts"), "utf8"),
    /driver && isCustomerRateDocument/,
  );
  const { isCustomerRateDocument } = await import("../lib/load-documents-shared");
  assert.equal(isCustomerRateDocument({ kind: "rate_con", original_name: "rate.pdf" }), true);
  assert.equal(isCustomerRateDocument({ kind: "invoice", original_name: "inv.pdf" }), true);
  assert.equal(
    isCustomerRateDocument({ kind: "other", original_name: "MSE-1051-customer-confirmation.pdf" }),
    true,
  );
  assert.equal(isCustomerRateDocument({ kind: "bol", original_name: "MSE-1051-BOL.pdf" }), false);
  assert.equal(
    isCustomerRateDocument({ kind: "other", original_name: "MSE-1051-carrier-confirmation.pdf" }),
    false,
  );
  assert.match(driverLoadPage, /driver-sheet-value/);
  assert.match(driverLoadPage, /driverStopWhen/);
  assert.doesNotMatch(driverLoadPage, /text-white\}>\{value\}/);
  assert.match(driverCss, /\.driver-sheet[\s\S]*#122033 !important/);
  assert.match(driverCss, /\.driver-sheet-value[\s\S]*#122033 !important/);
  const { driverLaneEnds, driverStopWhen } = await import("../lib/driver-load-display");
  const hastingsPickup = {
    name: "Nebraska Cold Storage Inc",
    city: "Hastings",
    state: "NE",
    window_start: "2026-08-25T12:00:00.000Z",
    window_end: "2026-08-25T18:00:00.000Z",
  };
  const omahaDelivery = {
    name: "Receiver",
    city: "Omaha",
    state: "NE",
    window_start: "2026-08-26T14:00:00.000Z",
    window_end: "",
  };
  const fromStops = driverStopWhen("", "", hastingsPickup);
  assert.match(fromStops, /Hastings/);
  assert.match(fromStops, /08\/25\/26/);
  assert.doesNotMatch(driverStopWhen("2026-08-25T12:00:00.000Z", "2026-08-25T18:00:00.000Z", hastingsPickup), /Hastings/);
  const apptFromStop = driverStopWhen(
    "2026-08-25T12:00:00.000Z",
    "2026-08-25T18:00:00.000Z",
    { ...hastingsPickup, schedule_type: "appointment" },
  );
  assert.match(apptFromStop, /Hastings/);
  assert.doesNotMatch(apptFromStop, /–/);
  assert.equal(driverStopWhen("", "", null), "—");
  assert.equal(driverLaneEnds("", "", hastingsPickup, omahaDelivery), "Hastings, NE → Omaha, NE");
  assert.equal(driverLaneEnds("Lincoln, NE", "Chicago, IL", hastingsPickup, omahaDelivery), "Lincoln, NE → Chicago, IL");
  assert.equal(driverLaneEnds("", "", null, null), "");

  const cabTruckId = queries.createTruck({
    unit_number: "CAB-1",
    type: "dry_van",
    capacity_lbs: 44000,
    status: "available",
    plate: "ABC123",
    plate_state: "TN",
  });
  assert.equal(queries.getTruck(cabTruckId)?.type, "sleeper");
  assert.equal(queries.getTruck(cabTruckId)?.plate_state, "TN");

  const endorseId = queries.createDriver({
    name: "Endorsed Driver",
    phone: "555-0199",
    license: "TN-CDL-END",
    truck_id: null,
    status: "available",
    cdl_endorsements: "H,X",
  });
  assert.equal(queries.getDriver(endorseId)?.cdl_endorsements, "H,X");

  const liveSnapshots = orbcomm.snapshotsFromLiveAssets({
    loads: [],
    trucks: [],
    trailers: [{ id: 1, unit_number: "MS1514", orbcomm_asset_id: "" }],
    assets: [
      {
        assetId: "MS1514",
        trailerId: "MS1514",
        name: "MS1514",
        temperatureF: 36.5,
        setpointF: 34,
        powerOn: true,
        alarm: "High temp",
        address: "Omaha, NE",
      },
    ],
  });
  assert.equal(liveSnapshots.some((row) => row.loadId == null && row.trailerId === "MS1514"), true);
  const liveNested = orbcomm.normalizeOrbcommPayload({
    code: 1000,
    data: {
      assets: [
        {
          assetName: "MS1514",
          lastReportTime: "2026-08-25T18:48:00Z",
          reeferStatus: {
            returnTemp: 2,
            setpointTemp: 1,
            reeferPowerDesc: "Power On",
            activeAlarms: ["Passed"],
            eventTime: "2026-08-27T14:10:00Z",
          },
          positionStatus: { city: "Omaha", state: "NE", gpsTime: "2026-08-27T14:05:00Z" },
        },
      ],
    },
  });
  assert.equal(liveNested[0]?.temperatureF, 35.6);
  assert.equal(liveNested[0]?.setpointF, 33.8);
  assert.equal(liveNested[0]?.powerOn, true);
  assert.equal(liveNested[0]?.alarm, "");
  assert.equal(liveNested[0]?.recordedAt, "2026-08-27T14:10:00.000Z");

  const liveRefreshTrailerId = queries.createTrailer({
    unit_number: "LIVE-R1",
    type: "reefer",
    orbcomm_asset_id: "orb-live-r1",
  });
  orbcomm.insertReeferReading({
    load_id: null,
    truck_id: null,
    trailer_id: "LIVE-R1",
    setpoint_f: 34,
    temperature_f: 36,
    return_air_f: 36,
    supply_air_f: null,
    door_open: 0,
    alarm: "",
    operating_mode: "",
    latitude: 41.2565,
    longitude: -95.9345,
    address: "Omaha, NE",
    source: "orbcomm",
    recorded_at: "2026-08-25T18:48:00Z",
  });
  const liveRefreshUser = process.env.ORBCOMM_USERNAME;
  const liveRefreshPass = process.env.ORBCOMM_PASSWORD;
  const liveRefreshAccount = process.env.ORBCOMM_ACCOUNT_ID;
  process.env.ORBCOMM_USERNAME = "demo-user";
  process.env.ORBCOMM_PASSWORD = "demo-pass";
  process.env.ORBCOMM_ACCOUNT_ID = "test-org";
  const liveRefreshFetch = globalThis.fetch;
  let liveAssetNamesBody = "";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("generateToken")) {
      return new Response(JSON.stringify({ data: { accessToken: "live-token" }, code: 200 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("getAssetStatus")) {
      liveAssetNamesBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          code: 1000,
          data: {
            assets: [
              {
                assetName: "LIVE-R1",
                assetId: "orb-live-r1",
                lastReportTime: "2026-08-25T18:48:00Z",
                reeferStatus: {
                  returnTemp: 2,
                  setpointTemp: 1,
                  reeferPowerDesc: "Power On",
                  eventTime: "2026-08-27T14:10:00Z",
                },
                positionStatus: { city: "Omaha", state: "NE", latitude: 41.2565, longitude: -95.9345, gpsTime: "2026-08-27T14:05:00Z" },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    orbcomm.resetOrbcommCacheForTests();
    const liveRefresh = await orbcomm.getReeferSnapshots();
    assert.equal(liveRefresh.mode, "orbcomm");
    assert.equal(liveRefresh.note ?? "", "");
    assert.match(liveAssetNamesBody, /LIVE-R1/);
    assert.match(liveAssetNamesBody, /orb-live-r1/);
    const liveRow = liveRefresh.readings.find((row) => /live-r1/i.test(row.trailerId) || row.trailerId === "LIVE-R1");
    assert.equal(liveRow?.recordedAt, "2026-08-27T14:10:00.000Z");
    const storedLive = orbcomm.latestReeferForTrailer({
      unit_number: "LIVE-R1",
      orbcomm_asset_id: "orb-live-r1",
    });
    assert.equal(storedLive?.recorded_at, "2026-08-27T14:10:00.000Z");
    assert.equal(storedLive?.source, "orbcomm");
    orbcomm.resetOrbcommCacheForTests();
    globalThis.fetch = (async (input) => {
      if (String(input).includes("generateToken")) {
        return new Response(JSON.stringify({ data: { accessToken: "live-token" }, code: 200 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unavailable", { status: 500 });
    }) as typeof fetch;
    const staleRefresh = await orbcomm.getReeferSnapshots();
    assert.match(staleRefresh.note ?? "", /Last message 08\/27\/26 — live Orbcomm did not update/);
    assert.equal(
      staleRefresh.readings.some((row) => row.recordedAt === "2026-08-27T14:10:00.000Z"),
      true,
    );
    const { buildOrbcommFleetMap } = await import("../lib/fleet-map");
    orbcomm.resetOrbcommCacheForTests();
    const staleMap = await buildOrbcommFleetMap();
    assert.match(staleMap.sourceNote, /Last message 08\/27\/26 — live Orbcomm did not update/);
    assert.equal(staleMap.statusRows?.some((row) => row.trailer === "LIVE-R1" && row.messageAt === "2026-08-27T14:10:00.000Z"), true);
    assert.equal(staleMap.title, "Orbcomm");
  } finally {
    globalThis.fetch = liveRefreshFetch;
    if (liveRefreshUser == null) delete process.env.ORBCOMM_USERNAME;
    else process.env.ORBCOMM_USERNAME = liveRefreshUser;
    if (liveRefreshPass == null) delete process.env.ORBCOMM_PASSWORD;
    else process.env.ORBCOMM_PASSWORD = liveRefreshPass;
    if (liveRefreshAccount == null) delete process.env.ORBCOMM_ACCOUNT_ID;
    else process.env.ORBCOMM_ACCOUNT_ID = liveRefreshAccount;
    orbcomm.resetOrbcommCacheForTests();
    queries.setTrailerActive(liveRefreshTrailerId, false);
  }

  const fleetOneText = [
    "Transaction Activity Report",
    "Report Date: 08/25/2026",
    "Customer Number: 3770001903818",
    "M & S Loads LLC",
    "228 E ROUTE 59 #190",
    "NANUET NY 10954",
    "dispatch@msloads.com",
    "Funded Fuel",
    "08/25/2026 00260 Christopher Howell 32 LOVES #730 TRAVEL OMAHA NE Diesel 88.800 5.6490 505.62",
    "08/25/2026 00369 Steve Eller 26 ONE9 496 ATALISSA IA Diesel 121.310 5.3590 650.10",
    "08/25/2026 00369 Steve Eller 26 ONE9 496 ATALISSA IA Reefer 31.180 5.3590 167.58",
    "08/25/2026 00450 Ceferino Oquendo Garcia 42 ONVO TRAVEL PLAZA WHITE HAVEN PA Diesel 71.270 5.8590 417.36",
    "08/25/2026 00468 Kelvin Whaley 28 PILOT SIOUX CITY 5 SIOUX CITY IA Diesel 100.450 5.7590 538.81",
    "08/25/2026 00500 German Avilla 36 SUNOCO #7012 EAST BRUNSWICK NJ Diesel 98.000 5.9990 558.47",
    "08/25/2026 00500 German Avilla 36 SUNOCO #7012 EAST BRUNSWICK NJ Reefer 10.950 5.9990 62.90",
    "08/25/2026 00500 German Avilla 36 SUNOCO #7012 EAST BRUNSWICK NJ DEF 4.160 5.0990 21.19",
    "Money Code 137.25 fees 3.00 total 137.25",
    "Money Code 203.00 fees 3.00 total 203.00",
    "Funded Total $3,262.28",
    "Report Total 45.082",
  ].join("\n");
  assert.equal(looksLikeEfsReport(fleetOneText), false, "FleetOne TAR must not be classified as EFS");
  assert.equal(looksLikeFleetOneReport(fleetOneText), true);
  const fleetOne = parseFuelReport(fleetOneText);
  assert.equal(fleetOne.rows.filter((row) => row.category !== "money_code").length, 8);
  assert.equal(fleetOne.rows.filter((row) => row.category === "money_code").length, 2);
  assert.ok(fleetOne.rows.every((row) => !/nanuet/i.test(row.location)));
  assert.ok(fleetOne.rows.every((row) => row.amount !== 3262.28));
  assert.ok(fleetOne.rows.every((row) => row.gallons !== 45.082));
  const dieselLoves = fleetOne.rows.find((row) => row.amount === 505.62);
  assert.equal(dieselLoves?.category, "truck_diesel");
  assert.equal(dieselLoves?.gallons, 88.8);
  assert.equal(dieselLoves?.pricePerGallon, 5.649);
  assert.equal(dieselLoves?.unitNumber, "32");
  assert.match(dieselLoves?.location ?? "", /LOVES #730 TRAVEL/i);
  assert.match(dieselLoves?.location ?? "", /OMAHA/i);
  assert.equal(dieselLoves?.driverName, "Christopher Howell");
  assert.equal(dieselLoves?.cardLast4, "0260");
  assert.equal(fleetOne.rows.find((row) => row.amount === 167.58)?.category, "reefer_diesel");
  assert.equal(fleetOne.rows.find((row) => row.amount === 21.19)?.category, "def");
  assert.equal(fleetOne.rows.find((row) => row.amount === 137.25)?.category, "money_code");
  assert.equal(fleetOne.rows.find((row) => row.amount === 203)?.category, "money_code");
  const truck36 =
    queries.listTrucks().find((truck) => truck.unit_number === "36")?.id ??
    queries.createTruck({ unit_number: "36", type: "reefer", capacity_lbs: 44000, status: "available" });
  const avila =
    queries.listDrivers().find((driver) => driver.name === "German Avila")?.id ??
    queries.createDriver({
      name: "German Avila",
      phone: "555-0500",
      license: "NJ-CDL-AVILA",
      truck_id: truck36,
      status: "available",
    });
  queries.assignDriverToTruck(truck36, avila);
  const fleetOneImport = fuelStore.importFuelFromText(fleetOneText, "FleetOne_TransactionActivityReport_.pdf");
  assert.equal(fleetOneImport.created + fleetOneImport.unmatched, 10);
  const avilaRow = fuelStore
    .listFuelTransactions()
    .find((row) => row.amount === 558.47 && row.source_file.includes("FleetOne"));
  assert.equal(avilaRow?.driver_id, avila);
  assert.ok(!fuelStore.listFuelTransactions().some((row) => row.amount === 3262.28));

  const fleetOneGarbled = [
    "TransactionActivityReport Report Date: 08/25/2026 Customer Number: 3770001903818",
    "M&SLoads LLC 228 E ROUTE 59 #190 NANUET NY 10954 dispatch@msloads.com FundedFuel",
    "DATE DB CATEGORY SUNOCO EAST BRUNSWICK LOVES OMAHA",
    "08/25/202600260Christopher Howell32LOVES #730 TRAVELOMAHANEDiesel88.8005.6490505.62",
    "08/25/202600369Steve Eller26ONE9 496ATALISSAIADiesel121.3105.3590650.10",
    "08/25/202600369Steve Eller26ONE9 496ATALISSAIAReefer31.1805.3590167.58",
    "08/25/202600450Ceferino Oquendo Garcia42ONVO TRAVEL PLAZAWHITEHAVENPADiesel71.2705.8590417.36",
    "08/25/202600468Kelvin Whaley28PILOT SIOUX CITY 5SIOUXCITYIADiesel100.4505.7590538.81",
    "08/25/202600500German Avilla36SUNOCO #7012EASTBRUNSWICKNJDiesel98.0005.9990558.47",
    "08/25/202600500German Avilla36SUNOCO #7012EASTBRUNSWICKNJReefer10.9505.999062.90",
    "08/25/202600500German Avilla36SUNOCO #7012EASTBRUNSWICKNJDEF4.1605.099021.19",
    "MoneyCode137.25 fees 3.00 total 137.25",
    "MoneyCode203.00 fees 3.00 total 203.00",
    "FundedTotal $3,262.28 ReportTotal45.082",
    "Customer Number Voice Number Fax Email dispatch@msloads.com Funded Activity",
  ].join("");
  assert.equal(looksLikeEfsReport(fleetOneGarbled), false);
  assert.equal(
    looksLikeFleetOneReport(fleetOneGarbled, "FleetOne_TransactionActivityReport_.pdf"),
    true,
  );
  const fleetOneFromGarbled = parseFuelReport(fleetOneGarbled, "FleetOne_TransactionActivityReport_.pdf");
  assert.equal(fleetOneFromGarbled.rows.filter((row) => row.category === "truck_diesel").length, 5);
  assert.equal(fleetOneFromGarbled.rows.filter((row) => row.category === "reefer_diesel").length, 2);
  assert.equal(fleetOneFromGarbled.rows.filter((row) => row.category === "def").length, 1);
  assert.equal(fleetOneFromGarbled.rows.filter((row) => row.category === "money_code").length, 2);
  assert.ok(fleetOneFromGarbled.rows.every((row) => !/nanuet/i.test(row.location)));
  assert.ok(fleetOneFromGarbled.rows.every((row) => row.unitNumber !== "228"));
  assert.ok(fleetOneFromGarbled.rows.every((row) => row.amount !== 3262.28 && row.gallons !== 45.082));
  assert.equal(fleetOneFromGarbled.rows.find((row) => row.amount === 505.62)?.category, "truck_diesel");
  assert.equal(fleetOneFromGarbled.rows.find((row) => row.amount === 167.58)?.category, "reefer_diesel");
  assert.equal(fleetOneFromGarbled.rows.find((row) => row.amount === 21.19)?.category, "def");
  assert.equal(fleetOneFromGarbled.rows.find((row) => row.amount === 137.25)?.category, "money_code");
  assert.equal(fleetOneFromGarbled.rows.find((row) => row.amount === 203)?.category, "money_code");
  assert.equal(parseFuelReport(efsReport).rows[0]?.invoice, "900111");
  const fleetOneWithZipPaths = `${fleetOneText}\nStation path /NJ1234 /NE6890`;
  assert.equal(looksLikeEfsReport(fleetOneWithZipPaths), false);
  assert.equal(looksLikeFleetOneReport(fleetOneWithZipPaths, "FleetOne_TransactionActivityReport_.pdf"), true);
  const fleetOneZipParsed = parseFuelReport(fleetOneWithZipPaths, "FleetOne_TransactionActivityReport_.pdf");
  assert.ok(fleetOneZipParsed.rows.some((row) => row.amount === 505.62));
  assert.equal(fleetOneZipParsed.rows.some((row) => row.invoice === "900111"), false);
  assert.equal(looksLikeFleetOneReport("only a slash zip /NJ1234", "FleetOne_TransactionActivityReport_.pdf"), true);
  assert.doesNotMatch(
    JSON.stringify(parseFuelReport(fleetOneWithZipPaths, "FleetOne_TransactionActivityReport_.pdf").rows),
    /No activity lines found/,
  );

  const fleetOneOfficeExtract = fs.readFileSync(
    path.join(process.cwd(), "scripts/fixtures/fleetone-office-unpdf.txt"),
    "utf8",
  );
  const { parseFleetOneFuelText, normalizeFleetOneExtract } = await import("../lib/fuel-fleetone");
  const measuredOffice = parseFleetOneFuelText(fleetOneOfficeExtract);
  assert.equal(
    measuredOffice.errors.filter((item) => /Could not read that funded fuel line/.test(item.error)).length,
    0,
  );
  assert.equal(measuredOffice.rows.filter((row) => row.category === "truck_diesel").length, 5);
  assert.equal(measuredOffice.rows.filter((row) => row.category === "reefer_diesel").length, 2);
  assert.equal(measuredOffice.rows.filter((row) => row.category === "def").length, 1);
  assert.equal(measuredOffice.rows.filter((row) => row.category === "money_code").length, 2);
  assert.equal(measuredOffice.rows.find((row) => row.amount === 505.62)?.driverName, "Christopher Howell");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 505.62)?.unitNumber, "32");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 505.62)?.invoice, "157166699");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 650.1)?.driverName, "Steve Eller");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 167.58)?.driverName, "Steve Eller");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 417.36)?.driverName, "Ceferino Oquendo Garcia");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 538.81)?.driverName, "Kelvin Whaley");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 558.47)?.driverName, "German Avilla");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 62.9)?.driverName, "German Avilla");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 21.19)?.driverName, "German Avilla");
  assert.equal(measuredOffice.rows.find((row) => row.amount === 137.25)?.driverName, "");
  const measuredAfterNormalize = parseFleetOneFuelText(normalizeFleetOneExtract(fleetOneOfficeExtract));
  assert.equal(measuredAfterNormalize.rows.filter((row) => row.category !== "money_code").length, 8);
  assert.equal(looksLikeEfsReport(fleetOneOfficeExtract), false);
  assert.equal(looksLikeEfsReport("/ Dm201902\np/Ds201902 / Dm201902"), false);
  assert.equal(looksLikeFleetOneReport(fleetOneOfficeExtract), true);
  assert.equal(
    looksLikeFleetOneReport(fleetOneOfficeExtract, "FleetOne_TransactionActivityReport.pdf.pdf"),
    true,
  );
  assert.doesNotThrow(() => parseFuelReport(fleetOneOfficeExtract));
  assert.doesNotThrow(() => parseFuelReport(fleetOneOfficeExtract, "FleetOne_TransactionActivityReport.pdf.pdf"));
  const officeParsed = parseFuelReport(fleetOneOfficeExtract, "FleetOne_TransactionActivityReport.pdf.pdf");
  assert.equal(officeParsed.rows.filter((row) => row.category === "truck_diesel").length, 5);
  assert.equal(officeParsed.rows.filter((row) => row.category === "reefer_diesel").length, 2);
  assert.equal(officeParsed.rows.filter((row) => row.category === "def").length, 1);
  assert.equal(officeParsed.rows.filter((row) => row.category === "money_code").length, 2);
  assert.ok(officeParsed.rows.every((row) => !/nanuet/i.test(row.location)));
  assert.ok(officeParsed.rows.every((row) => row.amount !== 3262.28 && row.amount !== 340.25));
  assert.ok(officeParsed.rows.every((row) => row.gallons !== 45.082));
  const officeLoves = officeParsed.rows.find((row) => row.amount === 505.62);
  assert.equal(officeLoves?.category, "truck_diesel");
  assert.equal(officeLoves?.unitNumber, "32");
  assert.equal(officeLoves?.gallons, 88.8);
  assert.match(officeLoves?.location ?? "", /LOVES/i);
  assert.equal(new Date(officeLoves?.occurredAt ?? "").getFullYear(), 2026);
  assert.equal(new Date(officeLoves?.occurredAt ?? "").getMonth(), 7);
  assert.equal(new Date(officeLoves?.occurredAt ?? "").getDate(), 25);
  const officeSunoco = officeParsed.rows.find((row) => row.amount === 558.47);
  assert.equal(officeSunoco?.unitNumber, "36");
  assert.match(officeSunoco?.location ?? "", /SUNOCO/i);
  assert.match(officeSunoco?.location ?? "", /EAST BRUNSWICK/i);
  assert.equal(officeParsed.rows.find((row) => row.amount === 167.58)?.unitNumber, "26");
  assert.equal(officeParsed.rows.find((row) => row.amount === 21.19)?.category, "def");
  assert.equal(officeParsed.rows.find((row) => row.amount === 137.25)?.category, "money_code");
  assert.equal(officeParsed.rows.find((row) => row.amount === 203)?.category, "money_code");
  const officeImport = fuelStore.importFuelFromText(
    fleetOneOfficeExtract,
    "FleetOne_TransactionActivityReport_pdf",
  );
  assert.equal(officeParsed.rows.length, 10);
  assert.equal(officeImport.created + officeImport.unmatched, 8);
  const officeRows = fuelStore
    .listFuelTransactions()
    .filter((row) => row.source_file === "FleetOne_TransactionActivityReport_pdf");
  assert.equal(officeRows.filter((row) => row.category !== "money_code").length, 8);
  assert.equal(officeParsed.rows.find((row) => row.amount === 505.62)?.driverName, "Christopher Howell");
  assert.equal(officeParsed.rows.find((row) => row.amount === 650.1)?.driverName, "Steve Eller");
  assert.equal(officeParsed.rows.find((row) => row.amount === 167.58)?.driverName, "Steve Eller");
  assert.equal(officeParsed.rows.find((row) => row.amount === 417.36)?.driverName, "Ceferino Oquendo Garcia");
  assert.equal(officeParsed.rows.find((row) => row.amount === 538.81)?.driverName, "Kelvin Whaley");
  assert.equal(officeParsed.rows.find((row) => row.amount === 558.47)?.driverName, "German Avilla");
  assert.equal(officeParsed.rows.find((row) => row.amount === 62.9)?.driverName, "German Avilla");
  assert.equal(officeParsed.rows.find((row) => row.amount === 21.19)?.driverName, "German Avilla");
  assert.equal(officeParsed.rows.find((row) => row.amount === 137.25)?.driverName, "");
  assert.equal(officeRows.find((row) => row.amount === 505.62)?.driver_id, howellId);
  assert.equal(officeRows.find((row) => row.amount === 650.1)?.driver_id, ellerId);
  assert.equal(officeRows.find((row) => row.amount === 167.58)?.driver_id, ellerId);
  assert.equal(officeRows.find((row) => row.amount === 538.81)?.driver_id, whaleyId);
  assert.equal(officeRows.find((row) => row.amount === 558.47)?.driver_id, avila);
  assert.equal(officeRows.find((row) => row.amount === 62.9)?.driver_id, avila);
  assert.equal(officeRows.find((row) => row.amount === 21.19)?.driver_id, avila);
  assert.equal(officeRows.find((row) => row.amount === 417.36)?.driver_id, null);
  assert.equal(officeRows.find((row) => row.amount === 417.36)?.driver_name_raw, "Ceferino Oquendo Garcia");
  assert.ok(!officeRows.some((row) => row.amount === 3262.28 || row.amount === 340.25));
  const { extractNProductDriverName, stitchFleetOneNName } = await import("../lib/fuel-fleetone");
  assert.equal(extractNProductDriverName("Christoph Howell"), "Christoph Howell");
  assert.equal(extractNProductDriverName("CHRISTOPHER HOWELL"), "Christopher Howell");
  assert.equal(extractNProductDriverName("ULTRA LOW SULFUR DIESEL"), "");
  assert.equal(extractNProductDriverName("ULTRA LOW SULFUR DIESEL Christoph Howell"), "Christoph Howell");
  assert.equal(extractNProductDriverName("MONEY CODE"), "");
  assert.equal(stitchFleetOneNName("Christoph", "er Howell"), "Christopher Howell");
  assert.equal(stitchFleetOneNName("NGerman".replace(/^N/, ""), "Avilla"), "German Avilla");
  const unit36Match = matchFuelDriver(
    { driverName: "", driverIdRaw: "", unitNumber: "36", prompt: "" },
    queries.listDrivers(),
    queries.listTrucks(),
  );
  assert.equal(unit36Match.driverId, null);
  const noTruckDriver = matchFuelDriver(
    { driverName: "", driverIdRaw: "", unitNumber: "42", prompt: "" },
    queries.listDrivers(),
    queries.listTrucks(),
  );
  assert.equal(noTruckDriver.driverId, null);
  const loadFallback = matchFuelDriver(
    { driverName: "", driverIdRaw: "", unitNumber: "36", prompt: "" },
    queries.listDrivers().map((driver) => (driver.id === avila ? { ...driver, truck_id: null } : driver)),
    queries.listTrucks().map((truck) =>
      truck.unit_number === "36" ? { ...truck, assigned_driver_id: null } : truck,
    ),
    [{ truck_id: truck36, driver_id: avila, status: "in_transit" }],
  );
  assert.equal(loadFallback.driverId, null);
  const avillaMatch = matchFuelDriver(
    { driverName: "German Avilla", driverIdRaw: "", unitNumber: "36", prompt: "" },
    queries.listDrivers(),
    queries.listTrucks(),
  );
  assert.equal(avillaMatch.driverId, avila);
  const steveMatch = matchFuelDriver(
    { driverName: "Steve Eller", driverIdRaw: "", unitNumber: "26", prompt: "" },
    queries.listDrivers(),
    queries.listTrucks(),
  );
  assert.equal(steveMatch.driverId, ellerId);
  getDb()
    .prepare(
      `INSERT INTO fuel_transactions (
        occurred_at, driver_id, truck_id, location, gallons, price_per_gallon, amount,
        card_last4, source_file, category, unit_number, driver_name_raw, invoice_number,
        prompt_data, dedup_key, created_at
      ) VALUES (?, NULL, NULL, 'OMAHA NE', 88.8, 5.649, 505.62, '', 'live-office', 'truck_diesel', '32', '', '157166699', '', 'live-blank-157166699-505', ?)`,
    )
    .run(new Date().toISOString(), new Date().toISOString());
  fuelStore.rematchFuelTransactionDrivers();
  const liveBlank = getDb()
    .prepare("SELECT driver_id, driver_name_raw FROM fuel_transactions WHERE dedup_key = 'live-blank-157166699-505'")
    .get() as { driver_id: number | null; driver_name_raw: string };
  assert.equal(liveBlank.driver_name_raw, "Christopher Howell");
  assert.equal(liveBlank.driver_id, howellId);
  const sunocoForSkip = officeRows.find((row) => row.amount === 558.47);
  assert.ok(sunocoForSkip);
  getDb()
    .prepare("UPDATE fuel_transactions SET driver_id = NULL, driver_name_raw = '' WHERE id = ?")
    .run(sunocoForSkip.id);
  const skipImport = fuelStore.importFuelFromText(
    fleetOneOfficeExtract,
    "FleetOne_TransactionActivityReport_pdf",
  );
  assert.ok(skipImport.skipped >= 8);
  assert.equal(fuelStore.getFuelTransaction(sunocoForSkip.id)?.driver_name_raw, "German Avilla");
  assert.equal(fuelStore.getFuelTransaction(sunocoForSkip.id)?.driver_id, avila);
  const sunocoUnmatched = officeRows.find((row) => row.amount === 558.47);
  assert.ok(sunocoUnmatched);
  getDb().prepare("UPDATE fuel_transactions SET driver_id = NULL WHERE id = ?").run(sunocoUnmatched.id);
  assert.equal(fuelStore.getFuelTransaction(sunocoUnmatched.id)?.driver_id, null);
  assert.ok(fuelStore.rematchUnmatchedFuelTransactions() >= 1);
  assert.equal(fuelStore.getFuelTransaction(sunocoUnmatched.id)?.driver_id, avila);
  const lovesRow = fuelStore
    .listFuelTransactions()
    .find((row) => row.amount === 505.62 && row.source_file === "FleetOne_TransactionActivityReport_pdf");
  assert.ok(lovesRow);
  getDb()
    .prepare("UPDATE fuel_transactions SET driver_id = NULL, driver_name_raw = '' WHERE id = ?")
    .run(lovesRow.id);
  assert.ok(fuelStore.rematchFuelTransactionDrivers() >= 1);
  assert.equal(fuelStore.getFuelTransaction(lovesRow.id)?.driver_id, howellId);
  assert.equal(fuelStore.getFuelTransaction(lovesRow.id)?.driver_name_raw, "Christopher Howell");
  getDb()
    .prepare("UPDATE fuel_transactions SET driver_id = ?, driver_name_raw = '' WHERE id = ?")
    .run(howellId, lovesRow.id);
  getDb().prepare("DELETE FROM fuel_import_sources").run();
  assert.ok(fuelStore.rematchFuelTransactionDrivers() >= 1);
  assert.equal(fuelStore.getFuelTransaction(lovesRow.id)?.driver_id, null);
  assert.equal(
    fuelStore
      .listFuelTransactions()
      .find((row) => row.amount === 417.36 && row.source_file === "FleetOne_TransactionActivityReport_pdf")
      ?.driver_id,
    null,
  );
  const leftoverMoney = fuelStore.listFuelTransactions().find((row) => row.amount === 203 && row.category === "money_code");
  assert.ok(leftoverMoney);
  assert.equal(leftoverMoney.driver_id, null);
  const namedNProduct = parseFuelReport(
    "08/25 N Diesel Christoph Howell 32 D 1902 SUNOCO PA 50.123 3.4567 172.00",
    "FleetOne_TransactionActivityReport.pdf",
  );
  assert.equal(namedNProduct.rows[0]?.driverName, "Christoph Howell");
  assert.equal(namedNProduct.rows[0]?.unitNumber, "32");
  const namedMatch = matchFuelDriver(
    { driverName: "Christoph Howell", driverIdRaw: "", unitNumber: "", prompt: "" },
    [queries.getDriver(howellId)!],
    [],
  );
  assert.equal(namedMatch.driverId, howellId);
  const moneyUnmatched = matchFuelDriver(
    { driverName: "", driverIdRaw: "", unitNumber: "", prompt: "" },
    [queries.getDriver(howellId)!],
    [],
  );
  assert.equal(moneyUnmatched.driverId, null);
  const sameLineN = parseFuelReport(
    "08/25 N Diesel ULTRA LOW SULFUR DIESEL 32 D84 157166699 542161 NE 50.123 3.4567 173.00 LOVES #730 TRAVEL OMAHA NChristoph\ner Howell",
    "FleetOne_TransactionActivityReport.pdf",
  );
  assert.equal(sameLineN.rows[0]?.driverName, "Christopher Howell");
  assert.equal(sameLineN.rows[0]?.unitNumber, "32");

  const { isFuelPdfUpload, readFuelUploadText } = await import("../lib/fuel-pdf");
  assert.equal(isFuelPdfUpload("FleetOne_TransactionActivityReport_pdf", "application/octet-stream"), true);
  assert.equal(isFuelPdfUpload("FleetOne_TransactionActivityReport.pdf.pdf", ""), true);
  assert.equal(isFuelPdfUpload("report.PDF", ""), true);
  assert.equal(isFuelPdfUpload("report.pdf.pdf", ""), true);
  assert.equal(isFuelPdfUpload("plain.csv", "text/csv", Buffer.from("Date,Category\n")), false);
  assert.equal(isFuelPdfUpload("plain.csv", "", Buffer.from("%PDF-1.4 rest")), true);
  const fleetOnePdf = await PDFDocument.create();
  const fleetOnePage = fleetOnePdf.addPage([792, 612]);
  const fleetFont = await fleetOnePdf.embedFont(StandardFonts.Helvetica);
  fleetOnePage.drawText("Transaction Activity Report  M & S Loads LLC  Funded Fuel", {
    x: 24,
    y: 580,
    size: 9,
    font: fleetFont,
  });
  const fleetCells = [
    "08/25/2026",
    "00260",
    "Christopher Howell",
    "32",
    "LOVES #730 TRAVEL",
    "OMAHA",
    "NE",
    "Diesel",
    "88.800",
    "5.6490",
    "505.62",
  ];
  fleetCells.forEach((cell, index) => {
    fleetOnePage.drawText(cell, { x: 20 + index * 68, y: 540, size: 8, font: fleetFont });
  });
  fleetOnePage.drawText("Money Code 137.25 fees 3.00 total 137.25", { x: 24, y: 500, size: 8, font: fleetFont });
  const fleetPdfBytes = Buffer.from(await fleetOnePdf.save());
  assert.equal(
    isFuelPdfUpload("FleetOne_TransactionActivityReport_pdf", "application/octet-stream", fleetPdfBytes),
    true,
  );
  const underscoreUpload = await readFuelUploadText(
    fleetPdfBytes,
    "FleetOne_TransactionActivityReport_pdf",
    "application/octet-stream",
  );
  assert.equal(underscoreUpload.kind, "pdf");
  assert.ok(underscoreUpload.text.trim().length > 0);
  assert.doesNotMatch(underscoreUpload.text, /^Date,/);
  const fleetFromPdf = parseFuelReport(underscoreUpload.text, "FleetOne_TransactionActivityReport_pdf");
  assert.ok(fleetFromPdf.rows.some((row) => row.amount === 505.62 && row.category === "truck_diesel"));
  assert.ok(fleetFromPdf.rows.some((row) => row.amount === 137.25 && row.category === "money_code"));
  assert.doesNotMatch(JSON.stringify(fleetFromPdf.rows), /No activity lines found/);

  const doomedFuel = fuelStore.listFuelTransactions().find((row) => row.amount === 137.25 && row.category === "money_code");
  assert.ok(doomedFuel);
  const { addFuelReceipt, linkFuelReceipt, listFuelReceipts } = await import("../lib/fuel-receipts");
  const receiptId = addFuelReceipt({
    loadId,
    driverId: null,
    attachmentId: null,
    station: "Test unlink",
  });
  linkFuelReceipt(receiptId, doomedFuel.id);
  assert.equal(listFuelReceipts().find((row) => row.id === receiptId)?.fuel_transaction_id, doomedFuel.id);
  fuelStore.deleteFuelTransaction(doomedFuel.id);
  assert.equal(fuelStore.getFuelTransaction(doomedFuel.id), null);
  assert.equal(listFuelReceipts().find((row) => row.id === receiptId)?.fuel_transaction_id, null);
  assert.ok(queries.getLoad(loadId), "delete fuel must not cascade-delete the load");

  const { assignFuelDriverAction } = await import("../lib/actions");
  const emptyAssign = new FormData();
  emptyAssign.set("fuel_id", String(fuelStore.listFuelTransactions()[0]?.id ?? 1));
  const assignResult = await assignFuelDriverAction(null, emptyAssign);
  assert.equal(assignResult.ok, false);
  assert.ok(assignResult.error);

  assert.doesNotMatch(formatDateTime("08/25/26 12:00 AM"), /NaN|Invalid/);
  assert.equal(shortPlaceLabel("400 N Burlington Ave, Hastings, NE 68901"), "Hastings, NE");
  assert.equal(shortPlaceLabel("Dakota City, NE"), "Dakota City, NE");
  assert.equal(shortPlaceLabel("Holcomb, KS"), "Holcomb, KS");
  assert.equal(shortPlaceLabel("South Sioux City, NE"), "South Sioux City, NE");
  assert.equal(shortPlaceLabel("Hays, KS"), "Hays, KS");
  assert.doesNotMatch(shortPlaceLabel("Holcomb, KS"), /LCOMB/);
  assert.doesNotMatch(shortPlaceLabel("South Sioux City, NE"), /UTH SIOUX/);
  assert.doesNotMatch(shortPlaceLabel("Hays, KS"), /^YS,/);
  assert.doesNotMatch(shortPlaceLabel("Hastings, NE"), /STINGS/);
  const boardCss = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  const placeBlock = boardCss.match(/\.board-place\s*\{[^}]+\}/)?.[0] ?? "";
  const placeLine = boardCss.match(/\.board-place-line\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(boardCss, /table-layout:\s*fixed/);
  assert.match(placeBlock, /max-width:\s*100%/);
  assert.match(placeBlock, /overflow:\s*hidden/);
  assert.doesNotMatch(placeBlock, /max-width:\s*8\.5rem/);
  assert.match(placeLine, /text-overflow:\s*ellipsis/);
  assert.match(placeLine, /direction:\s*ltr/);
  assert.doesNotMatch(placeBlock, /direction:\s*rtl/);
  assert.doesNotMatch(placeLine, /direction:\s*rtl/);
  const boardPage = fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8");
  assert.match(boardPage, /board-place-cell/);
  assert.match(boardPage, /board-unit-cell/);
  assert.match(boardPage, /board-load-cell/);
  assert.match(boardPage, /board-when-cell/);
  assert.match(boardPage, /board-when-date/);
  assert.match(boardPage, /board-when-time/);
  assert.match(boardPage, /board-lane-line/);
  assert.match(boardPage, /board-scroll/);
  assert.doesNotMatch(boardPage, /whitespace-nowrap text-xs" title=\{`to \$\{formatDateTime/);
  assert.match(boardCss, /board-when-cell/);
  assert.match(boardCss, /board-scroll/);
  assert.match(boardCss, /min-width:\s*103rem/);
  assert.match(boardCss, /board-place-with-pin/);
  assert.match(boardCss, /board-trailer-cell/);
  const trailerCell = boardCss.match(/td\.board-trailer-cell[\s\S]*?\}/)?.[0] ?? "";
  assert.match(trailerCell, /overflow:\s*visible/);
  const pinStack = boardCss.match(/\.board-place-with-pin\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(pinStack, /flex-direction:\s*column/);
  assert.match(pinStack, /overflow:\s*visible/);
  assert.doesNotMatch(pinStack, /position:\s*absolute/);
  const pinOnCity = boardCss.match(/\.board-place-with-pin \.board-place-line\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(pinOnCity, /white-space:\s*normal/);
  assert.match(pinOnCity, /overflow:\s*visible/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/load-map-shared.ts"), "utf8"), /circle cx="14" cy="14" r="9"/);
  assert.doesNotMatch(boardCss.match(/\.board-when-date[\s\S]*?\}/)?.[0] ?? "", /direction:\s*rtl/);
  assert.match(boardCss, /\.load-overlay-backdrop[\s\S]*z-index:\s*80/);
  assert.match(boardCss, /\.load-overlay-backdrop[\s\S]*100dvh/);
  assert.match(boardCss, /\.load-overlay-panel[\s\S]*height:\s*100%/);
  assert.doesNotMatch(boardCss, /\.load-overlay-panel,\s*\n\.pay-item-dialog/);
  assert.doesNotMatch(boardCss, /load-overlay-panel[\s\S]{0,80}min\(1100px/);
  assert.match(boardCss, /acct-expand-grid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-badges.tsx"), "utf8"), /board-place-line/);
  const { criteriaFromSearchParams } = await import("../lib/search");
  assert.equal(criteriaFromSearchParams({ q: "MSE-1055" }).q, "MSE-1055");
  assert.equal(criteriaFromSearchParams({ q: "  " }).q, "");
  const { truckUnitForDriver } = await import("../lib/integrations/samsara");
  assert.equal(
    truckUnitForDriver(
      { id: 4, name: "Pat Driver", truck_unit: "", samsara_driver_id: "sam-pat" },
      [{ id: 9, unit_number: "27" }],
      {
        truckDrivers: [
          { truckId: 9, samsaraDriverId: "sam-pat", samsaraDriverName: "Pat Driver", tmsDriverId: 4 },
        ],
      },
    ),
    "27",
  );
  assert.equal(gpsMotionLabel(0), "Parked");
  assert.equal(gpsMotionLabel(58), "58 mph");
  assert.equal(labelForFuelBucket("DATE DB CATEGORY"), "DATE DB CATEGORY");
  assert.equal(isFuelBucket("money_code"), false);
  fuelStore.listFuelRollups();
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel.ts"), "utf8"), /if \(fleetOne\) return toFuelCsvResult/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/fuel.ts"), "utf8"), /\/\[A-Za-z\]\{2\}\\d\{4,\}/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-match-queue.tsx"), "utf8"), /FuelDeleteButton/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fuel/page.tsx"), "utf8"), /rematchUnmatchedFuelTransactions/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel-store.ts"), "utf8"), /rematchFuelTransactionDrivers/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/fuel.ts"), "utf8"), /driverAssignedToTruck/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/fuel-assign-form.tsx"), "utf8"),
    /disabled=\{pending \|\| !canAssign\}/,
  );

  const { buildSearchExportGrid } = await import("../lib/search-export");
  const searchGrid = buildSearchExportGrid(
    [
      {
        load_number: "SRCH-1",
        customer_name: "Shown Only",
        status: "assigned",
        origin: "Omaha, NE",
        destination: "Newark, NJ",
        pickup_start: "2026-08-25",
        pickup_end: "2026-08-25",
        delivery_start: "2026-08-26",
        delivery_end: "2026-08-26",
        driver_name: "Steve Eller",
        truck_unit: "26",
        trailer_unit: "MS1514",
        trailer_number: "",
        rate: 2400,
        reference_number: "PO-1",
        po_number: "",
        notes: "Keep cold",
        special_instructions: "",
        appointment_notes: "",
      } as import("../lib/types").LoadView,
    ],
    ["load_id", "customer", "status", "driver"],
  );
  assert.equal(searchGrid[0]?.includes("Load #"), true);
  assert.equal(searchGrid[0]?.includes("Rate"), true);
  assert.equal(searchGrid.length, 2);
  assert.equal(searchGrid[1]?.[0], "SRCH-1");
  assert.ok(!searchGrid.flat().includes("Not In Results"));
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-search.tsx"), "utf8"), /Download spreadsheet/);

  const dashToday = fs.readFileSync(path.join(process.cwd(), "app/desk/page.tsx"), "utf8");
  assert.match(dashToday, /loadTouchesToday/);
  assert.doesNotMatch(dashToday, /Loads picking up or delivering today/);
  assert.match(dashToday, /inboxItems/);
  assert.match(dashToday, /Need cover/);
  assert.match(dashToday, /data-need-cover/);
  assert.match(dashToday, /listNeedCover/);
  assert.doesNotMatch(dashToday, /maps\.google\.com/);

  const { cityStateFromPlace, deliveringSoon, listNeedCover, listNeedCoverRows } = await import("../lib/need-cover");
  assert.equal(cityStateFromPlace("400 N Burlington Ave, Hastings, NE 68901"), "Hastings, NE");
  assert.equal(cityStateFromPlace("Chicago, IL"), "Chicago, IL");
  const coverNow = new Date("2026-08-27T18:00:00.000Z");
  assert.equal(deliveringSoon({ status: "at_delivery", delivery_start: "", delivery_end: "" }, coverNow), true);
  assert.equal(
    deliveringSoon(
      { status: "in_transit", delivery_start: "2026-08-27T20:00:00.000Z", delivery_end: "2026-08-27T22:00:00.000Z" },
      coverNow,
    ),
    true,
  );
  assert.equal(
    deliveringSoon(
      { status: "in_transit", delivery_start: "2026-08-30T12:00:00.000Z", delivery_end: "2026-08-30T20:00:00.000Z" },
      coverNow,
    ),
    false,
  );
  const coverDriver = (
    id: number,
    name: string,
    extra: { active?: number; termination_date?: string; truck_id?: number | null } = {},
  ) => ({
    id,
    name,
    active: extra.active ?? 1,
    termination_date: extra.termination_date ?? "",
    truck_id: extra.truck_id ?? id,
  });
  const coverLoad = (partial: Record<string, unknown>) =>
    ({
      id: 1,
      status: "in_transit",
      pickup_start: "2026-08-26T12:00:00.000Z",
      delivery_start: "2026-08-27T12:00:00.000Z",
      delivery_end: "2026-08-27T20:00:00.000Z",
      destination: "Dallas, TX",
      updated_at: "2026-08-27T12:00:00.000Z",
      truck_id: 1,
      ...partial,
    }) as import("../lib/types").LoadView;
  const emptyCover = listNeedCoverRows(
    {
      drivers: [coverDriver(1, "Empty Ned")],
      loadsByDriver: new Map([[1, [coverLoad({ status: "delivered", destination: "Omaha, NE" })]]]),
      locations: [],
    },
    coverNow,
  );
  assert.equal(emptyCover.length, 1);
  assert.equal(emptyCover[0]?.reason, "empty");
  assert.equal(emptyCover[0]?.place, "Omaha, NE");
  const followCover = listNeedCoverRows(
    {
      drivers: [coverDriver(2, "Followed Fay")],
      loadsByDriver: new Map([
        [
          2,
          [
            coverLoad({ id: 10, status: "in_transit", delivery_end: "2026-08-27T20:00:00.000Z" }),
            coverLoad({
              id: 11,
              status: "assigned",
              pickup_start: "2026-08-28T12:00:00.000Z",
              delivery_end: "2026-08-29T20:00:00.000Z",
            }),
          ],
        ],
      ]),
      locations: [],
    },
    coverNow,
  );
  assert.equal(followCover.some((row) => row.driverId === 2), false);
  const midCover = listNeedCoverRows(
    {
      drivers: [coverDriver(3, "Mid Miles")],
      loadsByDriver: new Map([
        [3, [coverLoad({ status: "in_transit", delivery_end: "2026-08-30T20:00:00.000Z" })]],
      ]),
      locations: [],
    },
    coverNow,
  );
  assert.equal(midCover.some((row) => row.driverId === 3), false);
  const soonCover = listNeedCoverRows(
    {
      drivers: [coverDriver(4, "Soon Sam")],
      loadsByDriver: new Map([
        [
          4,
          [
            coverLoad({
              status: "in_transit",
              destination: "Kansas City, MO",
              delivery_end: "2026-08-27T22:00:00.000Z",
            }),
          ],
        ],
      ]),
      locations: [],
    },
    coverNow,
  );
  assert.equal(soonCover[0]?.reason, "soon");
  assert.equal(soonCover[0]?.place, "Kansas City, MO");
  const liveGpsCover = listNeedCoverRows(
    {
      drivers: [coverDriver(5, "Gps Gail", { truck_id: 55 })],
      loadsByDriver: new Map([[5, [coverLoad({ status: "delivered", destination: "Dallas, TX", truck_id: 55 })]]]),
      locations: [
        {
          truckId: 55,
          address: "400 N Burlington Ave, Hastings, NE 68901",
          source: "samsara",
          latitude: 40.58,
          longitude: -98.38,
        },
      ],
      truckIdByDriver: new Map([[5, 55]]),
    },
    coverNow,
  );
  assert.equal(liveGpsCover[0]?.place, "Hastings, NE");
  const demoGpsCover = listNeedCoverRows(
    {
      drivers: [coverDriver(6, "Demo Dan", { truck_id: 66 })],
      loadsByDriver: new Map([[6, [coverLoad({ status: "delivered", destination: "Lincoln, NE", truck_id: 66 })]]]),
      locations: [
        {
          truckId: 66,
          address: "Chicago, IL",
          source: "demo",
          latitude: 41.8,
          longitude: -87.6,
        },
      ],
      truckIdByDriver: new Map([[6, 66]]),
    },
    coverNow,
  );
  assert.equal(demoGpsCover[0]?.place, "Lincoln, NE");
  const coordsOnlyCover = listNeedCoverRows(
    {
      drivers: [coverDriver(7, "Coords Cal", { truck_id: 77 })],
      loadsByDriver: new Map([[7, [coverLoad({ status: "delivered", destination: "Des Moines, IA", truck_id: 77 })]]]),
      locations: [
        {
          truckId: 77,
          address: "",
          source: "samsara",
          latitude: 41.58,
          longitude: -93.6,
        },
      ],
      truckIdByDriver: new Map([[7, 77]]),
    },
    coverNow,
  );
  assert.equal(coordsOnlyCover[0]?.place, "Des Moines, IA");
  const rankedCover = listNeedCoverRows(
    {
      drivers: [coverDriver(8, "Zed Empty"), coverDriver(9, "Ann Soon")],
      loadsByDriver: new Map([
        [8, []],
        [9, [coverLoad({ status: "unloading", destination: "Omaha, NE" })]],
      ]),
      locations: [],
    },
    coverNow,
  );
  assert.equal(rankedCover[0]?.driverName, "Zed Empty");
  assert.equal(rankedCover[1]?.driverName, "Ann Soon");
  assert.equal(
    listNeedCoverRows(
      {
        drivers: [coverDriver(10, "Gone Gus", { active: 0 })],
        loadsByDriver: new Map([[10, []]]),
        locations: [],
      },
      coverNow,
    ).length,
    0,
  );
  const coverEmptyId = queries.createDriver({
    name: "Cover Empty Smoke",
    phone: "555-0190",
    license: "NE-CDL-COVER-E",
    pin: "1919",
    truck_id: null,
    status: "available",
  });
  assert.ok(listNeedCover([], coverNow).some((row) => row.driverId === coverEmptyId && row.reason === "empty"));
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/format.ts"), "utf8"), /America\/New_York/);
  const pageCopy = [
    ...fs.readdirSync(path.join(process.cwd(), "app"), { recursive: true, encoding: "utf8" }),
  ]
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => fs.readFileSync(path.join(process.cwd(), "app", file), "utf8"))
    .join("\n");
  const componentCopy = [
    ...fs.readdirSync(path.join(process.cwd(), "components"), { recursive: true, encoding: "utf8" }),
  ]
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => fs.readFileSync(path.join(process.cwd(), "components", file), "utf8"))
    .join("\n");
  const settingsHints = fs.readFileSync(path.join(process.cwd(), "lib/settings-shared.ts"), "utf8");
  const pageSubtitles = pageCopy.match(/subtitle=\{?`?["'][^"'`]+["'`]/g)?.join("\n") ?? "";
  assert.equal(pageSubtitles, "", "app pages must not print helper PageHeader subtitles");
  assert.doesNotMatch(componentCopy, /subtitle="[^"]+"/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"),
    /formatLoadLaneFromStops/,
  );
  const lectureCopy = /Official IFTA|Official truck IFTA|Credentials stay|Keys stay|<code>\.env|in \.env|to \.env|Ascend driver|Ascend load|Ascend\/legacy|JC.?s Ascend|first-class|Never lumped|append-only|not a live|demo-safe|SAMSARA_API_TOKEN|ORBCOMM_\*|QBO_CLIENT_ID|GOOGLE_MAPS_API_KEY|gpt-4o-mini|sample data off|Trucks from Samsara|Internal handoff|Never printed|Prints on the driver|Prints on confirmation|Prints on customer|Customer invoices only|Realm and refresh tokens|Set \(hidden\)|Demo GPS|Demo invoice preview|Samsara miles for this load|Estimate for this load|Match a driver photo|HOS stays on this board|token is set|default MS Express mark|Same list as the Users tab|Driver PIN is unchanged|Driver PIN login is not affected|office PC|Not Samsara IFTA|not for tax filing|QBO invoices customer|Review pairings|app keys set|demo mode, no secrets|Product name stays|CDL endorsements only|Do not invent one|Pick one so the row|Imported fuel and stored load miles|This load only|Check calls and stored GPS|Customer invoice\.|Windows does not drop|What's on fire|on fire for the next|Fuel card file|Company drivers and|Four first-class|Upload a spreadsheet|Upload a fuel file/i;
  assert.doesNotMatch(pageSubtitles, lectureCopy);
  assert.doesNotMatch(pageCopy, lectureCopy);
  assert.doesNotMatch(componentCopy, lectureCopy);
  assert.doesNotMatch(settingsHints, lectureCopy);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/truck-form.tsx"), "utf8"), /plate_state/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/truck-form.tsx"), "utf8"), /Cab type/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-form.tsx"), "utf8"), /cdl_endorsements/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-orbcomm-status-table/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-samsara-status-table/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), />Truck</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), />Mileage</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), />Driver</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), />HOS</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map.ts"), "utf8"), /truckStatusRows/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /formatSamsaraStatusHos/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /Parked|motion/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), />Message</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-orbcomm-message/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-orbcomm-live-note/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /live Orbcomm did not update/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-reefer-pin/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-orbcomm-pin-legend/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /Arrow = moving/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /Pin = stopped/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-samsara-pin-legend/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-samsara-pin="on"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-samsara-pin="moving"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-samsara-pin="off"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map-shared.ts"), "utf8"), /ORBCOMM_MOVING_SPEED_MPH = 5/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map-shared.ts"), "utf8"), /fleetMapDisplayPoints/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map-shared.ts"), "utf8"), /unitLabelBesideOrigin/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map-shared.ts"), "utf8"), /loadMapPinSvg/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /fleet-pin-label/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map.ts"), "utf8"), /orbcommPinShape/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map-shared.ts"), "utf8"), /classifyOrbcommReeferMode/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-map-canvas.tsx"), "utf8"), /loadMapPinIconUrl/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-map-shared.ts"), "utf8"), /SAMSARA_TRUCK_PIN_COLOR/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map.ts"), "utf8"), /samsaraTruckPinStyle/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map.ts"), "utf8"), /SAMSARA_TRUCK_PIN_COLOR/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-fleet-pin-color/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/orbcomm/page.tsx"), "utf8"), /buildOrbcommFleetMap/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fleet-map.ts"), "utf8"), /messageAt/);
  assert.match(orbcommAuth, /orbcomm_asset_id/);
  assert.match(orbcommAuth, /eventTime/);
  assert.match(orbcommAuth, /persistLiveReeferReadings/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /Official IFTA|<code>\.env|GOOGLE_MAPS_API_KEY/);

  const { attentionLabel } = await import("../lib/exceptions");
  assert.equal(attentionLabel({ kind: "late", severity: "HIGH", title: "Late to pickup" }), "Running late");
  assert.equal(attentionLabel({ kind: "reefer", severity: "CRITICAL", title: "Temperature discrepancy" }), "Critical");
  assert.equal(attentionLabel({ kind: "unassigned", severity: "LOW", title: "Unassigned" }), "Caution");
  assert.equal(attentionLabel({ kind: "missing_pod", severity: "HIGH", title: "Missing POD" }), "Important");
  assert.equal(attentionLabel({ kind: "detention", severity: "HIGH", title: "Detention — Dock" }), "Detention");
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/exceptions.ts"), "utf8"), /"detention"/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "lib/exceptions.ts"), "utf8"),
    /Possible detention — still at \$\{role\} \(\$\{stopLabel\}\) 2\+ hours past appointment/,
  );
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/exceptions.ts"), "utf8"), /stop\.kind !== "pickup"/);

  const { isDriverUploadKind, DRIVER_UPLOAD_KINDS, labelForDriverUploadKind } = await import("../lib/driver-docs");
  assert.equal(DRIVER_UPLOAD_KINDS.some((item) => item.value === "other"), false);
  assert.equal(isDriverUploadKind("other"), false);
  assert.equal(isDriverUploadKind("pod"), true);
  assert.equal(isDriverUploadKind("fuel_receipt"), true);
  assert.equal(isDriverUploadKind("carrier_invoice"), true);
  assert.equal(labelForDriverUploadKind("carrier_invoice"), "Billing");
  assert.equal(labelForDriverUploadKind("fuel_receipt"), "Fuel receipt");
  const driverActionsSource = fs.readFileSync(path.join(process.cwd(), "components/driver-load-actions.tsx"), "utf8");
  assert.match(driverActionsSource, /Check In/);
  assert.match(driverActionsSource, /Check Out/);
  assert.match(driverActionsSource, /DriverUpload/);
  assert.doesNotMatch(driverActionsSource, /Unclassified|ATTACHMENT_KINDS|DriverCameraPdf|DriverFuelReceipt|Or upload a file/);

  const { driverStopButtons } = await import("../lib/driver-stops");
  const checkButtons = driverStopButtons([
    {
      id: 1,
      load_id: 1,
      sequence: 1,
      kind: "pickup",
      location_id: null,
      name: "A",
      street: "",
      city: "A",
      state: "NE",
      zip: "",
      phone: "",
      window_start: "",
      window_end: "",
      confirmation: "",
      cargo: "",
      reference: "",
      instructions: "",
      notes: "",
      arrived_at: "",
      departed_at: "",
      delivered: 0,
      schedule_type: "",
    },
    {
      id: 2,
      load_id: 1,
      sequence: 2,
      kind: "delivery",
      location_id: null,
      name: "B",
      street: "",
      city: "B",
      state: "IA",
      zip: "",
      phone: "",
      window_start: "",
      window_end: "",
      confirmation: "",
      cargo: "",
      reference: "",
      instructions: "",
      notes: "",
      arrived_at: "",
      departed_at: "",
      delivered: 0,
      schedule_type: "",
    },
  ]);
  assert.equal(checkButtons.find((item) => item.stopLabel === "Delivery" && item.kind === "arrive")?.enabled, false);
  assert.equal(checkButtons.find((item) => item.stopLabel === "Pickup" && item.kind === "arrive")?.enabled, true);

  const { serializeRouteStateMiles } = await import("../lib/routing-shared");
  const { buildIftaQuarterEstimate, parseIftaQuarter } = await import("../lib/ifta-quarter");
  const iftaQ = parseIftaQuarter("2026-1");
  assert.equal(iftaQ.year, 2026);
  assert.equal(iftaQ.quarter, 1);
  const iftaLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Omaha, NE",
    destination: "Chicago, IL",
    pickup_start: "2026-01-10T12:00:00.000Z",
    pickup_end: "2026-01-10T18:00:00.000Z",
    delivery_start: "2026-01-11T12:00:00.000Z",
    delivery_end: "2026-01-11T20:00:00.000Z",
    weight: 40000,
    commodity: "Produce",
    rate: 1200,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "delivered",
    truck_id: null,
    driver_id: null,
  });
  getDb()
    .prepare("UPDATE loads SET route_miles = ?, route_source = 'manual', route_state_miles = ?, pickup_start = ?, delivery_end = ? WHERE id = ?")
    .run(
      120,
      serializeRouteStateMiles([
        { state: "NE", name: "Nebraska", miles: 40 },
        { state: "IA", name: "Iowa", miles: 80 },
      ]),
      "2026-01-10T12:00:00.000Z",
      "2026-01-11T20:00:00.000Z",
      iftaLoadId,
    );
  getDb()
    .prepare(
      `INSERT INTO fuel_transactions (
        occurred_at, driver_id, truck_id, load_id, location, gallons, price_per_gallon, amount,
        card_last4, source_file, category, unit_number, driver_name_raw, invoice_number, prompt_data, dedup_key, created_at
      ) VALUES (?, NULL, NULL, NULL, ?, 20, 4, 80, '', 'ifta-smoke', 'truck_diesel', '', '', '', '', 'ifta-smoke', ?)`,
    )
    .run("2026-01-12T12:00:00.000Z", "Pilot Omaha NE", new Date().toISOString());
  const iftaEstimate = buildIftaQuarterEstimate(iftaQ);
  assert.equal(iftaEstimate.milesByState.find((row) => row.state === "IA")?.miles, 80);
  assert.equal(iftaEstimate.fuelByState.find((row) => row.state === "NE")?.gallons, 20);
  assert.equal(iftaEstimate.waypoints.some((row) => row.loadId === iftaLoadId), true);
  const emptyMilesLoad = queries.createLoad({
    customer_id: customerId,
    origin: "Lincoln, NE",
    destination: "Des Moines, IA",
    pickup_start: "2026-01-15T12:00:00.000Z",
    pickup_end: "2026-01-15T18:00:00.000Z",
    delivery_start: "2026-01-16T12:00:00.000Z",
    delivery_end: "2026-01-16T20:00:00.000Z",
    weight: 1,
    commodity: "Empty",
    rate: 0,
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
  });
  getDb().prepare("UPDATE loads SET non_revenue = 1 WHERE id = ?").run(emptyMilesLoad);
  const invoiceMod = await import("../lib/invoice");
  const emptyView = queries.getLoad(emptyMilesLoad);
  assert.ok(emptyView);
  assert.throws(() => invoiceMod.buildTmsInvoice(emptyView), /Empty move/);
  const afterEmpty = buildIftaQuarterEstimate(iftaQ);
  assert.equal(afterEmpty.waypoints.some((row) => row.loadId === emptyMilesLoad), false);

  const { refreshLoadEmptyMiles, previousLoadForEmptyMiles } = await import("../lib/empty-miles");
  const deadheadTruckId = queries.createTruck({
    unit_number: "IFTA-DH-1",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const deadheadDriverId = queries.createDriver({
    name: "Dana Deadhead",
    phone: "555-0177",
    license: "NE-CDL-DEADHEAD",
    pin: "7788",
    truck_id: deadheadTruckId,
    status: "available",
  });
  const omahaLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Lincoln, NE",
    destination: "Omaha, NE",
    pickup_start: "2026-08-20T12:00:00.000Z",
    pickup_end: "2026-08-20T18:00:00.000Z",
    delivery_start: "2026-08-21T12:00:00.000Z",
    delivery_end: "2026-08-21T20:00:00.000Z",
    weight: 40000,
    commodity: "Produce",
    rate: 800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "delivered",
    truck_id: deadheadTruckId,
    driver_id: deadheadDriverId,
  });
  const hastingsLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Kansas City, MO",
    pickup_start: "2026-08-22T12:00:00.000Z",
    pickup_end: "2026-08-22T18:00:00.000Z",
    delivery_start: "2026-08-23T12:00:00.000Z",
    delivery_end: "2026-08-23T20:00:00.000Z",
    weight: 40000,
    commodity: "Produce",
    rate: 1100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "assigned",
    truck_id: deadheadTruckId,
    driver_id: deadheadDriverId,
  });
  ensureRouteStops(omahaLoadId);
  ensureRouteStops(hastingsLoadId);
  getDb()
    .prepare("UPDATE loads SET route_miles = ?, route_state_miles = ?, route_source = 'manual' WHERE id = ?")
    .run(100, serializeRouteStateMiles([{ state: "NE", name: "Nebraska", miles: 100 }]), omahaLoadId);
  getDb()
    .prepare("UPDATE loads SET route_miles = ?, route_state_miles = ?, route_source = 'manual' WHERE id = ?")
    .run(250, serializeRouteStateMiles([{ state: "KS", name: "Kansas", miles: 250 }]), hastingsLoadId);
  assert.equal(previousLoadForEmptyMiles(queries.getLoad(hastingsLoadId)! )?.id, omahaLoadId);
  const savedMapsForEmpty = process.env.GOOGLE_MAPS_API_KEY;
  const prevEmptyFetch = globalThis.fetch;
  let emptyGoogleCalls = 0;
  try {
    process.env.GOOGLE_MAPS_API_KEY = "";
    globalThis.fetch = async () => {
      emptyGoogleCalls += 1;
      throw new Error("Google should not be called without a key");
    };
    const missingEmpty = await refreshLoadEmptyMiles(hastingsLoadId);
    assert.equal(missingEmpty.miles, null);
    assert.equal(emptyGoogleCalls, 0);
    assert.equal(queries.getLoad(hastingsLoadId)?.route_miles, 250);
    process.env.GOOGLE_MAPS_API_KEY = "test-not-a-real-maps-key";
    globalThis.fetch = async (input) => {
      emptyGoogleCalls += 1;
      const url = new URL(String(input));
      assert.equal(url.hostname, "maps.googleapis.com");
      assert.match(url.pathname, /\/maps\/api\/directions\//);
      assert.doesNotMatch(url.hostname, /maps\.google\.com/);
      const points = routing.encodePolyline([
        { lat: 41.2565, lng: -95.9345 },
        { lat: 40.9264, lng: -97.088 },
        { lat: 40.5861, lng: -98.3884 },
      ]);
      return new Response(
        JSON.stringify({
          status: "OK",
          routes: [{ overview_polyline: { points }, legs: [{ distance: { value: 254277 } }] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const firstEmpty = await refreshLoadEmptyMiles(omahaLoadId);
    assert.equal(firstEmpty.miles, 0);
    assert.equal(firstEmpty.from, "");
    const omahaBefore = emptyGoogleCalls;
    const deadheadEmpty = await refreshLoadEmptyMiles(hastingsLoadId);
    assert.equal(deadheadEmpty.miles, 158);
    assert.equal(deadheadEmpty.source, "google");
    assert.match(deadheadEmpty.from, /Omaha/i);
    assert.match(deadheadEmpty.to, /Hastings/i);
    assert.ok(deadheadEmpty.states.some((row) => row.state === "NE"));
    assert.ok(emptyGoogleCalls > omahaBefore);
    const storedDeadhead = queries.getLoad(hastingsLoadId);
    assert.equal(storedDeadhead?.empty_miles, 158);
    assert.equal(storedDeadhead?.route_miles, 250);
    assert.equal(storedDeadhead?.empty_source, "google");
    assert.match(storedDeadhead?.empty_from ?? "", /Omaha/i);
    assert.match(storedDeadhead?.empty_to ?? "", /Hastings/i);
    assert.match(storedDeadhead?.empty_state_miles ?? "", /NE/);
    assert.equal(queries.getLoad(omahaLoadId)?.empty_miles, 0);
    assert.equal(queries.getLoad(omahaLoadId)?.route_miles, 100);
    const iftaQ3 = parseIftaQuarter("2026-3");
    const deadheadEstimate = buildIftaQuarterEstimate(iftaQ3);
    const deadheadDriverMiles = deadheadEstimate.drivers.find((row) => row.id === deadheadDriverId);
    const deadheadTruckMiles = deadheadEstimate.trucks.find((row) => row.id === deadheadTruckId);
    assert.ok(deadheadDriverMiles);
    assert.equal(deadheadDriverMiles.loaded, 350);
    assert.equal(deadheadDriverMiles.empty, 158);
    assert.equal(deadheadDriverMiles.total, 508);
    assert.ok(deadheadTruckMiles);
    assert.equal(deadheadTruckMiles.loaded, 350);
    assert.equal(deadheadTruckMiles.empty, 158);
    assert.equal(deadheadTruckMiles.total, 508);
    const hastingsWaypoint = deadheadEstimate.waypoints.find((row) => row.loadId === hastingsLoadId);
    assert.ok(hastingsWaypoint);
    assert.equal(hastingsWaypoint.loaded, 250);
    assert.equal(hastingsWaypoint.empty, 158);
    assert.match(hastingsWaypoint.emptyLane, /Omaha/i);
    assert.match(hastingsWaypoint.emptyLane, /Hastings/i);
    assert.ok(hastingsWaypoint.emptyStates.some((row) => row.state === "NE"));
    const omahaWaypoint = deadheadEstimate.waypoints.find((row) => row.loadId === omahaLoadId);
    assert.ok(omahaWaypoint);
    assert.equal(omahaWaypoint.loaded, 100);
    assert.equal(omahaWaypoint.empty, 0);
    const { buildStatistics } = await import("../lib/reports-stats");
    const { listReportExportRows } = await import("../lib/reports-export");
    const driverStats = buildStatistics({
      category: "driver",
      entityId: deadheadDriverId,
      dateBasis: "pickup",
      end: new Date(2026, 7, 28),
    });
    const driverStatRow = driverStats.rows.find((row) => row.id === deadheadDriverId);
    assert.ok(driverStatRow);
    assert.equal(driverStatRow.totals.miles, 350);
    assert.equal(driverStatRow.totals.emptyMiles, 158);
    const exportRow = listReportExportRows({
      category: "driver",
      entityId: deadheadDriverId,
      dateBasis: "pickup",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    }).find((row) => row.empty_miles === 158);
    assert.ok(exportRow);
  } finally {
    globalThis.fetch = prevEmptyFetch;
    if (savedMapsForEmpty == null) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedMapsForEmpty;
  }

  const dispatchLoad = queries.createLoad({
    customer_id: customerId,
    origin: "Omaha, NE",
    destination: "Kansas City, MO",
    pickup_start: "2026-08-26T12:00:00.000Z",
    pickup_end: "2026-08-26T18:00:00.000Z",
    delivery_start: "2026-08-27T12:00:00.000Z",
    delivery_end: "2026-08-27T20:00:00.000Z",
    weight: 40000,
    commodity: "Produce",
    rate: 900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  const trailerForLast = queries.createTrailer({
    unit_number: "MS-LAST-1",
    type: "reefer",
    status: "available",
  });
  queries.assignLoad(dispatchLoad, truckId, otherDriverId, trailerForLast, { dispatch: true });
  assert.equal(queries.getLoad(dispatchLoad)?.status, "dispatched");
  assert.equal(queries.getDriver(otherDriverId)?.last_trailer_id, trailerForLast);
  const followLoad = queries.createLoad({
    customer_id: customerId,
    origin: "Omaha, NE",
    destination: "St Louis, MO",
    pickup_start: "2026-08-28T12:00:00.000Z",
    pickup_end: "2026-08-28T18:00:00.000Z",
    delivery_start: "2026-08-29T12:00:00.000Z",
    delivery_end: "2026-08-29T20:00:00.000Z",
    weight: 40000,
    commodity: "Produce",
    rate: 800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
  queries.updateLoadStatus(followLoad, "available");
  queries.assignLoad(followLoad, truckId, otherDriverId);
  assert.equal(queries.getLoad(followLoad)?.trailer_id, trailerForLast);

  const { milesBetween, applyGeofenceArrivals, applyGeofenceArrivalsWithGeocode, GEOFENCE_MILES } = await import("../lib/geofence");
  assert.equal(GEOFENCE_MILES, 2);
  assert.ok(milesBetween({ latitude: 41.2565, longitude: -95.9345 }, { latitude: 41.2565, longitude: -95.9345 }) < 0.01);
  assert.equal(applyGeofenceArrivals(followLoad), 0);
  const fenceDock = queries.createLocation({
    name: "Fence Dock",
    street: "600 E 39th St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 40.586,
    longitude: -98.39,
  });
  const fenceTruckId = queries.createTruck({
    unit_number: "FENCE-2",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const fenceDriverId = queries.createDriver({
    name: "Fence Smoke",
    phone: "555-0288",
    license: "NE-CDL-FENCE",
    pin: "2882",
    truck_id: fenceTruckId,
    status: "available",
  });
  const fenceLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Hastings, NE",
    pickup_start: "2026-08-27T12:00:00.000Z",
    pickup_end: "2026-08-27T18:00:00.000Z",
    delivery_start: "2026-08-27T20:00:00.000Z",
    delivery_end: "2026-08-27T22:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 700,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(fenceLoadId, {
    kind: "pickup",
    name: "Fence Yard",
    city: "Hastings",
    state: "NE",
    location_id: fenceDock,
  });
  const fenceStopId = loadStops.addStop(fenceLoadId, {
    kind: "delivery",
    name: "Fence Dock",
    city: "Hastings",
    state: "NE",
    location_id: fenceDock,
  });
  queries.assignLoad(fenceLoadId, fenceTruckId, fenceDriverId);
  queries.saveTruckGps(fenceTruckId, {
    latitude: 40.6,
    longitude: -98.39,
    address: "Hastings, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
  });
  assert.ok(milesBetween({ latitude: 40.586, longitude: -98.39 }, { latitude: 40.6, longitude: -98.39 }) < 2);
  assert.ok(milesBetween({ latitude: 40.586, longitude: -98.39 }, { latitude: 40.63, longitude: -98.39 }) > 2);
  const stampedFence = loadStops.getStop(fenceStopId);
  assert.ok(stampedFence?.arrived_at, "Samsara GPS inside 2 miles should stamp Arrived");
  assert.equal(stampedFence.departed_at, "");
  const keptArrival = stampedFence.arrived_at;
  queries.saveTruckGps(fenceTruckId, {
    latitude: 40.587,
    longitude: -98.39,
    address: "Hastings, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
  });
  assert.equal(loadStops.getStop(fenceStopId)?.arrived_at, keptArrival);
  assert.equal(loadStops.getStop(fenceStopId)?.departed_at, "");
  queries.saveTruckGps(fenceTruckId, {
    latitude: 40.63,
    longitude: -98.39,
    address: "Away, NE",
    recordedAt: new Date(Date.now() + 60_000).toISOString(),
    source: "samsara",
  });
  const afterLeave = loadStops.getStop(fenceStopId);
  assert.equal(afterLeave?.arrived_at, keptArrival);
  assert.ok(afterLeave?.departed_at, "Samsara GPS outside 2 miles after arrival should stamp Departed");
  const keptDeparted = afterLeave.departed_at;
  queries.saveTruckGps(fenceTruckId, {
    latitude: 40.64,
    longitude: -98.39,
    address: "Farther, NE",
    recordedAt: new Date(Date.now() + 120_000).toISOString(),
    source: "samsara",
  });
  assert.equal(loadStops.getStop(fenceStopId)?.departed_at, keptDeparted);
  const typedArrival = "2026-08-27T15:05:00.000Z";
  const typedDeparted = "2026-08-27T16:10:00.000Z";
  loadStops.stampStopTime(fenceStopId, "arrived_at", typedArrival);
  loadStops.stampStopTime(fenceStopId, "departed_at", typedDeparted);
  queries.saveTruckGps(fenceTruckId, {
    latitude: 40.586,
    longitude: -98.39,
    address: "Hastings, NE",
    recordedAt: new Date(Date.now() + 180_000).toISOString(),
    source: "samsara",
  });
  applyGeofenceArrivals(fenceLoadId);
  assert.equal(loadStops.getStop(fenceStopId)?.arrived_at, typedArrival, "dispatcher-typed arrival stays");
  assert.equal(loadStops.getStop(fenceStopId)?.departed_at, typedDeparted, "dispatcher-typed departed stays");

  const {
    detentionClockStart,
    detentionTwoHourMark,
    detentionStillInsideAtMark,
  } = await import("../lib/detention-clock");
  const fcfsWindow = {
    scheduleType: "fcfs",
    windowStart: "2026-08-29T08:00:00.000-05:00",
    windowEnd: "2026-08-29T17:00:00.000-05:00",
  };
  const midnightArrival = detentionTwoHourMark({
    ...fcfsWindow,
    arrivedAt: "2026-08-29T00:00:00.000-05:00",
  });
  assert.equal(midnightArrival?.toISOString(), new Date("2026-08-29T10:00:00.000-05:00").toISOString());
  assert.equal(
    detentionClockStart({
      ...fcfsWindow,
      arrivedAt: "2026-08-29T00:00:00.000-05:00",
    })?.toISOString(),
    new Date("2026-08-29T08:00:00.000-05:00").toISOString(),
    "early FCFS arrival waits for window start, not arrival + 2 hours",
  );
  const insideArrival = detentionTwoHourMark({
    ...fcfsWindow,
    arrivedAt: "2026-08-29T10:00:00.000-05:00",
  });
  assert.equal(
    insideArrival?.toISOString(),
    new Date("2026-08-29T12:00:00.000-05:00").toISOString(),
    "FCFS in-window arrival marks at arrivedAt + exactly 2 hours",
  );
  assert.equal(
    detentionClockStart({
      ...fcfsWindow,
      arrivedAt: "2026-08-29T10:00:00.000-05:00",
    })?.toISOString(),
    new Date("2026-08-29T10:00:00.000-05:00").toISOString(),
  );
  const oddWindow = {
    scheduleType: "fcfs",
    windowStart: "2026-08-29T09:22:00.000-05:00",
    windowEnd: "2026-08-29T17:41:00.000-05:00",
  };
  assert.equal(
    detentionTwoHourMark({
      ...oddWindow,
      arrivedAt: "2026-08-29T06:14:00.000-05:00",
    })?.toISOString(),
    new Date("2026-08-29T11:22:00.000-05:00").toISOString(),
    "early FCFS mark is windowStart + exactly 2 hours",
  );
  assert.equal(
    detentionTwoHourMark({
      ...oddWindow,
      arrivedAt: "2026-08-29T11:37:00.000-05:00",
    })?.toISOString(),
    new Date("2026-08-29T13:37:00.000-05:00").toISOString(),
    "in-window FCFS 11:37 AM marks at 1:37 PM",
  );
  const apptMark = detentionTwoHourMark({
    scheduleType: "appointment",
    windowStart: "2026-08-29T08:00:00.000-05:00",
    arrivedAt: "2026-08-29T00:00:00.000-05:00",
  });
  assert.equal(apptMark?.toISOString(), new Date("2026-08-29T10:00:00.000-05:00").toISOString());
  assert.equal(
    detentionTwoHourMark({
      scheduleType: "appointment",
      windowStart: "2026-08-29T09:22:00.000-05:00",
      arrivedAt: "2026-08-29T00:00:00.000-05:00",
    })?.toISOString(),
    new Date("2026-08-29T11:22:00.000-05:00").toISOString(),
    "APPT mark is appointment + exactly 2 hours, not arrival",
  );
  assert.equal(
    detentionStillInsideAtMark({
      arrivedAt: "2026-08-29T00:00:00.000-05:00",
      twoHourMark: midnightArrival!,
      now: new Date("2026-08-29T10:00:00.000-05:00"),
    }),
    true,
  );
  assert.equal(
    detentionStillInsideAtMark({
      arrivedAt: "2026-08-29T00:00:00.000-05:00",
      departedAt: "2026-08-29T09:30:00.000-05:00",
      twoHourMark: midnightArrival!,
      now: new Date("2026-08-29T10:00:00.000-05:00"),
    }),
    false,
  );
  const clockLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Holdrege, NE",
    destination: "Holdrege, NE",
    pickup_start: "2026-08-29T13:00:00.000Z",
    pickup_end: "2026-08-29T22:00:00.000Z",
    delivery_start: "2026-08-29T22:00:00.000Z",
    delivery_end: "2026-08-29T23:00:00.000Z",
    weight: 1,
    commodity: "Beef",
    rate: 100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  const detentionShipperId = loadStops.addStop(clockLoadId, {
    kind: "pickup",
    name: "FCFS Shipper Clock",
    city: "Holdrege",
    state: "NE",
    schedule_type: "fcfs",
    window_start: "2026-08-29T08:00:00.000-05:00",
    window_end: "2026-08-29T17:00:00.000-05:00",
    arrived_at: "2026-08-29T00:00:00.000-05:00",
  });
  const detentionNow = new Date("2026-08-29T10:05:00.000-05:00");
  const detentionInbox = (await import("../lib/exceptions")).listExceptionInbox(detentionNow);
  assert.ok(
    detentionInbox.items.some(
      (item) =>
        item.kind === "detention" &&
        item.loadId === clockLoadId &&
        /still at shipper \(pickup\)/.test(item.title) &&
        /FCFS Shipper Clock/.test(item.detail),
    ),
    "FCFS shipper still inside at window start + 2 hours",
  );
  assert.equal(detentionInbox.items.filter((item) => item.kind === "detention" && item.loadId === clockLoadId).length, 1);
  loadStops.stampStopTime(detentionShipperId, "departed_at", "2026-08-29T09:15:00.000-05:00");
  const leftOnTime = (await import("../lib/exceptions")).listExceptionInbox(detentionNow);
  assert.equal(
    leftOnTime.items.some((item) => item.kind === "detention" && item.loadId === clockLoadId),
    false,
    "no detention after leaving before the two-hour mark",
  );
  const waitingLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Holdrege, NE",
    destination: "Holdrege, NE",
    pickup_start: "2026-08-29T13:00:00.000Z",
    pickup_end: "2026-08-29T22:00:00.000Z",
    delivery_start: "2026-08-29T22:00:00.000Z",
    delivery_end: "2026-08-29T23:00:00.000Z",
    weight: 1,
    commodity: "Beef",
    rate: 100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(waitingLoadId, {
    kind: "pickup",
    name: "Not Arrived Shipper",
    city: "Holdrege",
    state: "NE",
    schedule_type: "appointment",
    window_start: "2026-08-29T08:00:00.000-05:00",
  });
  assert.equal(
    (await import("../lib/exceptions")).listExceptionInbox(detentionNow).items.some(
      (item) => item.kind === "detention" && item.loadId === waitingLoadId,
    ),
    false,
    "no detention until the truck has arrived",
  );
  const receiverOnlyId = queries.createLoad({
    customer_id: customerId,
    origin: "Holdrege, NE",
    destination: "Holdrege, NE",
    pickup_start: "2026-08-29T13:00:00.000Z",
    pickup_end: "2026-08-29T22:00:00.000Z",
    delivery_start: "2026-08-29T22:00:00.000Z",
    delivery_end: "2026-08-29T23:00:00.000Z",
    weight: 1,
    commodity: "Beef",
    rate: 100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  loadStops.addStop(receiverOnlyId, {
    kind: "delivery",
    name: "Receiver Clock",
    city: "Holdrege",
    state: "NE",
    schedule_type: "appointment",
    window_start: "2026-08-29T08:00:00.000-05:00",
    arrived_at: "2026-08-29T00:00:00.000-05:00",
  });
  const receiverInbox = (await import("../lib/exceptions")).listExceptionInbox(detentionNow);
  assert.ok(
    receiverInbox.items.some(
      (item) =>
        item.kind === "detention" &&
        item.loadId === receiverOnlyId &&
        /still at receiver \(delivery\)/.test(item.title) &&
        /Receiver Clock/.test(item.detail),
    ),
    "receiver / delivery dwell also raises detention",
  );
  assert.equal(
    receiverInbox.items.filter((item) => item.kind === "detention" && item.loadId === receiverOnlyId).length,
    1,
  );
  const farLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Hastings, NE",
    pickup_start: "2026-08-28T12:00:00.000Z",
    pickup_end: "2026-08-28T18:00:00.000Z",
    delivery_start: "2026-08-28T20:00:00.000Z",
    delivery_end: "2026-08-28T22:00:00.000Z",
    weight: 1,
    commodity: "Beef",
    rate: 100,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  const farStopId = loadStops.addStop(farLoadId, {
    kind: "delivery",
    name: "Fence Dock",
    city: "Hastings",
    state: "NE",
    location_id: fenceDock,
  });
  const farTruckId = queries.createTruck({
    unit_number: "FENCE-FAR",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const farDriverId = queries.createDriver({
    name: "Fence Far Smoke",
    phone: "555-0289",
    license: "NE-CDL-FENCE-F",
    pin: "2892",
    truck_id: farTruckId,
    status: "available",
  });
  queries.assignLoad(farLoadId, farTruckId, farDriverId);
  queries.saveTruckGps(farTruckId, {
    latitude: 40.63,
    longitude: -98.39,
    address: "Away, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
  });
  assert.equal(loadStops.getStop(farStopId)?.arrived_at, "");
  assert.equal(loadStops.getStop(farStopId)?.departed_at, "");
  const histTruckId = queries.createTruck({
    unit_number: "FENCE-HIST",
    type: "reefer",
    capacity_lbs: 44000,
    status: "available",
  });
  const histDriverId = queries.createDriver({
    name: "Fence Hist Smoke",
    phone: "555-0290",
    license: "NE-CDL-FENCE-H",
    pin: "2902",
    truck_id: histTruckId,
    status: "available",
  });
  const histLoadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "El Paso, TX",
    pickup_start: "2026-08-25T12:00:00.000Z",
    pickup_end: "2026-08-25T18:00:00.000Z",
    delivery_start: "2026-08-26T20:00:00.000Z",
    delivery_end: "2026-08-26T22:00:00.000Z",
    weight: 40000,
    commodity: "Beef",
    rate: 900,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: 34,
    trailer_number: "",
    status: "dispatched",
    truck_id: null,
    driver_id: null,
  });
  const histStopId = loadStops.addStop(histLoadId, {
    kind: "pickup",
    name: "Nebraska Cold Storage Inc",
    city: "Hastings",
    state: "NE",
    location_id: fenceDock,
  });
  queries.assignLoad(histLoadId, histTruckId, histDriverId);
  queries.recordTruckGpsReading(histTruckId, {
    latitude: 40.586,
    longitude: -98.39,
    address: "Hastings, NE",
    recordedAt: "2026-08-25T13:00:00.000Z",
    source: "samsara",
  });
  queries.recordTruckGpsReading(histTruckId, {
    latitude: 40.63,
    longitude: -98.39,
    address: "Away, NE",
    recordedAt: "2026-08-25T16:00:00.000Z",
    source: "samsara",
  });
  applyGeofenceArrivals(histLoadId);
  const histStop = loadStops.getStop(histStopId);
  assert.equal(histStop?.arrived_at, "2026-08-25T13:00:00.000Z");
  assert.equal(histStop?.departed_at, "2026-08-25T16:00:00.000Z");
  getDb()
    .prepare("UPDATE load_stops SET arrived_at = ?, departed_at = ? WHERE id = ?")
    .run("2026-08-20T12:00:00.000Z", "2026-08-20T14:00:00.000Z", histStopId);
  applyGeofenceArrivals(histLoadId);
  assert.equal(loadStops.getStop(histStopId)?.arrived_at, "2026-08-20T12:00:00.000Z");
  assert.equal(loadStops.getStop(histStopId)?.departed_at, "2026-08-20T14:00:00.000Z");
  await applyGeofenceArrivalsWithGeocode(histLoadId);
  const { buildStopsMapModel } = await import("../lib/load-map");
  const fenceMap = await buildStopsMapModel(fenceLoadId);
  assert.ok(fenceMap.points.some((point) => point.kind === "delivery"));
  assert.ok(fenceMap.points.some((point) => point.kind === "truck"));

  const newLoadPage = fs.readFileSync(path.join(process.cwd(), "app/loads/new/page.tsx"), "utf8");
  assert.match(newLoadPage, /RateConImport/);
  assert.match(newLoadPage, /<RateConImport[\s\S]*<LoadWorkspace[\s\S]*<\/RateConImport>/);
  const laneFieldsSource = fs.readFileSync(path.join(process.cwd(), "components/load-lane-fields.tsx"), "utf8");
  assert.match(laneFieldsSource, /Pickup and delivery windows/);
  assert.doesNotMatch(laneFieldsSource, /Lane from rate con|Shipper location|Consignee location|htmlFor="origin"|htmlFor="destination"/);
  assert.match(laneFieldsSource, /type="hidden" name="origin"/);
  const locationReviewSource = fs.readFileSync(path.join(process.cwd(), "components/rate-con-location-review.tsx"), "utf8");
  assert.doesNotMatch(locationReviewSource, /Matched existing location —/);
  assert.match(locationReviewSource, /Matched a saved location/);
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "components/rate-con-import.tsx"), "utf8"),
    /inboxId" in state \?[\s\S]*RateConImportedLoad[\s\S]*: \(\s*children/,
  );
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/assign-dialog.tsx"), "utf8"), /Assign & Dispatch/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-money-box.tsx"), "utf8"), /Customer rate/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-money-box.tsx"), "utf8"), /billedCustomerRate/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/copy-trip-number.tsx"), "utf8"), /btn-secondary/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8"), /data-customer-picker/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8"), /<select[\s\S]*customer_id/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/places-shared.ts"), "utf8"), /nyBoroughStateError/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8"), /assertNyBoroughState/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /Imported fuel and stored load miles/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /maps\.google\.com/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /LoadTiedFuelReceipts/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /FuelMatchQueue/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /Driver mileage/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /Truck mileage/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /Empty miles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /Loaded miles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-routing-guide.tsx"), "utf8"), /Empty miles/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-routing-guide.tsx"), "utf8"), /refreshAction\(form\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/desk/page.tsx"), "utf8"), /data-email-ingest/);
  assert.match(workspaceSource, /WhatsApp load/);
  assert.match(workspaceSource, /Send WhatsApp/);
  assert.match(workspaceSource, /whatsappConfigured/);
  assert.match(workspaceSource, /data-whatsapp-load/);
  assert.match(workspaceSource, /data-whatsapp-send/);
  assert.match(workspaceSource, /Send text/);
  const whatsappSource = fs.readFileSync(path.join(process.cwd(), "lib/integrations/whatsapp.ts"), "utf8");
  assert.match(whatsappSource, /TWILIO_WHATSAPP_FROM|getTwilioWhatsAppFrom/);
  assert.match(whatsappSource, /2010-04-01\/Accounts/);
  assert.doesNotMatch(whatsappSource, /getTwilioFromNumber/);
  assert.doesNotMatch(whatsappSource, /contentSid|ContentSid/);
  assert.doesNotMatch(whatsappSource, /graph\.facebook\.com|web\.whatsapp\.com/);
  const whatsappActionSource = fs.readFileSync(path.join(process.cwd(), "lib/dispatcher-actions.ts"), "utf8");
  assert.match(whatsappActionSource, /sendLoadWhatsAppAction/);
  assert.match(whatsappActionSource, /twilioWhatsAppConfigured/);
  assert.match(whatsappActionSource, /The assigned driver needs a mobile number/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/integrations/page.tsx"), "utf8"), /Texting/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/integrations/page.tsx"), "utf8"), /WhatsApp/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/settings/integrations/page.tsx"), "utf8"), /TWILIO_|OPENAI_API_KEY|WHATSAPP_ACCESS_TOKEN/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /CriticalTag/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/nav-links.tsx"), "utf8"), /desk-nav-icons/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/driver/page.tsx"), "utf8"), /id="active"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/driver/page.tsx"), "utf8"), /id="delivered"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-doc-classify.tsx"), "utf8"), /Needs type/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/driver-load-actions.tsx"), "utf8"), /Unclassified|ATTACHMENT_KINDS/);

  const { foldNameKey } = await import("../lib/fuel");
  assert.equal(foldNameKey("Steve Eller"), foldNameKey("steve eller"));
  assert.notEqual(foldNameKey("Steve Eller"), foldNameKey("Steven Eller"));

  const { extractEmailBody, looksLikeEmailUpload } = await import("../lib/rate-con");
  assert.equal(looksLikeEmailUpload("forwarded.eml", "message/rfc822"), true);
  assert.match(
    extractEmailBody("From: broker@example.com\nSubject: Rate\n\nPickup Hastings, NE to Bronx, NY rate 2400"),
    /Hastings/,
  );

  const { loadNeedsCriticalTag } = await import("../lib/exceptions");
  assert.equal(loadNeedsCriticalTag(999999, [{ loadId: 1, kind: "late", severity: "HIGH" }]), false);
  assert.equal(loadNeedsCriticalTag(1, [{ loadId: 1, kind: "late", severity: "HIGH" }]), true);
  assert.equal(loadNeedsCriticalTag(1, [{ loadId: 1, kind: "reefer", severity: "CRITICAL" }]), true);

  const { proposeMikeWork, applyMikeProposal } = await import("../lib/mike-work");
  const detentionWork = proposeMikeWork(`Draft detention email for ${created.load_number}`);
  assert.ok(detentionWork.proposals.some((item) => item.kind === "detention_email"));

  const {
    TIE_SHEET_FIXTURES,
    TIE_SHEET_FIXTURE_0824_14M,
    TIE_SHEET_FIXTURE_0824_19E,
    TIE_SHEET_FIXTURE_0824_5W,
    TIE_SHEET_FIXTURE_0824_9E,
    TIE_SHEET_FIXTURE_0824_4W,
    TIE_SHEET_FIXTURE_0824_10E,
    TIE_SHEET_0824_4W_DROPS,
    TIE_SHEET_PICTURE_FILES,
    knownTieSheetExtract,
    readTieSheetPictureFixture,
  } = await import("../lib/tie-sheet-fixtures");
  const {
    draftFromTieSheetExtract,
    encodeTieSheetDraft,
    fillAmbiguousTieSheetFields,
    groupTieSheetOrdersByDock,
    parseTieSheetText,
    tieSheetDraftPreview,
    tieSheetSameDockFamily,
    TIE_SHEET_CUSTOMER,
    TIE_SHEET_MISSING_KEY_MESSAGE,
    TIE_SHEET_SHIPPER_NAME,
  } = await import("../lib/tie-sheet-shared");
  const { saveTieSheetDraft } = await import("../lib/tie-sheet");
  const { askMike } = await import("../lib/mike");
  const { setTieSheetAiTestClient } = await import("../lib/tie-sheet-ai");
  const ignoredParks = parseTieSheetText(`0824-14M
74774 | 89676G | MBL | Hammond, IN | 8/28 | 8/31 | 18,851 | Mixed | | 7:00 AM
XK + TOTAL | | | | | | 36,533 |

Customer Pickup
99999 | 000 | Stay at plant | Hastings, NE | 8/28 | 8/28 | 1 | 1 | | 

********
parked for next week
0831-1E | 1 | Future | Chicago, IL | 8/31 | 9/2 | 100 | 1 | |
`);
  assert.equal(ignoredParks.load_id, "0824-14M");
  assert.equal(ignoredParks.orders.length, 1);
  assert.equal(ignoredParks.orders[0]?.control, "74774");
  assert.equal(ignoredParks.orders.some((order) => order.control === "99999" || order.control === "0831-1E"), false);

  const ignoredUnnumberedPfg = parseTieSheetText(`0831-
74910 | 3698429 | PFG | Springfield, MA | 9/4 | 9/7 | 37,714 | 575 | |
`);
  assert.equal(ignoredUnnumberedPfg.load_id, "");
  assert.equal(ignoredUnnumberedPfg.orders.length, 0, "unnumbered 0831- PFG is not a truck");
  const truckThenUnnumberedPfg = parseTieSheetText(`0824-9E
74789 | 128494 | Bertolino | Peabody, MA | 8/28 | 8/31 | 37,152 | 630 | | 8am appt 8/31

0831-
74910 | 3698429 | PFG | Springfield, MA | 9/4 | 9/7 | 37,714 | 575 | |
`);
  assert.equal(truckThenUnnumberedPfg.load_id, "0824-9E");
  assert.deepEqual(truckThenUnnumberedPfg.orders.map((order) => order.control), ["74789"]);

  const extra10E = parseTieSheetText(TIE_SHEET_FIXTURE_0824_10E);
  assert.equal(extra10E.load_id, "0824-10E");
  const extra10EDraft = draftFromTieSheetExtract(extra10E);
  assert.equal(extra10EDraft.drops.length, 1, "0824-10E is an optional clean single");
  assert.match(extra10EDraft.drop.name, /Bozzutos/i);
  assert.equal(extra10EDraft.drop.city, "North Haven");
  assert.equal(extra10EDraft.drop.state, "CT");
  assert.deepEqual(extra10EDraft.drop.order_numbers, ["74371"]);
  assert.deepEqual(extra10EDraft.drop.po_numbers, ["3205355"]);
  assert.equal(extra10EDraft.weight, 46987);
  assert.equal(extra10EDraft.case_count, 635);
  assert.equal(extra10EDraft.drop.schedule_type, "appointment");
  assert.ok(!TIE_SHEET_FIXTURES.some((row) => row.id === "0824-10E"), "10E is not a picture-upload fixture");
  assert.ok(!TIE_SHEET_PICTURE_FILES.some((row) => row.id === "0824-10E"));
  assert.ok(!TIE_SHEET_FIXTURES.some((row) => row.id === "0824-4W"), "4W is mixed, not a happy-path same-drop");
  assert.ok(!TIE_SHEET_PICTURE_FILES.some((row) => row.id === "0824-4W"));

  const pastedTieSheet = proposeMikeWork(TIE_SHEET_FIXTURE_0824_14M);
  assert.equal(
    pastedTieSheet.proposals.some((item) => item.kind === "build_tie_sheet"),
    false,
    "fixture text is not a dispatcher paste path",
  );
  const tieSheetAsk = proposeMikeWork("Build a load from this tie sheet");
  assert.match(tieSheetAsk.reply, /picture/i);
  assert.equal(tieSheetAsk.proposals.length, 0);

  const expectedTrucks = [
    {
      text: TIE_SHEET_FIXTURE_0824_14M,
      id: "0824-14M",
      receiver: /MBL/i,
      city: "Hammond",
      state: "IN",
      orders: ["74774", "74775", "74929"],
      pos: ["89676G", "89784", "Kosher 89786"],
      weight: 36533,
      qty: 251,
      schedule: "appointment",
    },
    {
      text: TIE_SHEET_FIXTURE_0824_19E,
      id: "0824-19E",
      receiver: /Westside Nonkosher/i,
      city: "Bronx",
      state: "NY",
      orders: ["74480", "74795"],
      pos: ["288167", "289281"],
      weight: 19620,
      qty: 322,
      schedule: "fcfs",
    },
    {
      text: TIE_SHEET_FIXTURE_0824_5W,
      id: "0824-5W",
      receiver: /Zant/i,
      city: "Los Angeles",
      state: "CA",
      orders: ["74792", "74794"],
      pos: ["468110", "468111"],
      weight: 41084,
      qty: 657,
      schedule: "appointment",
    },
    {
      text: TIE_SHEET_FIXTURE_0824_9E,
      id: "0824-9E",
      receiver: /Bertolino/i,
      city: "Peabody",
      state: "MA",
      orders: ["74789"],
      pos: ["128494"],
      weight: 37152,
      qty: 630,
      schedule: "appointment",
    },
  ];
  assert.equal(TIE_SHEET_FIXTURES.length, 4);
  const loadsBeforeTieSheet = queries.listLoads({ status: "all" }).length;
  for (const truck of expectedTrucks) {
    const extract = parseTieSheetText(truck.text);
    assert.equal(extract.load_id, truck.id);
    const draft = draftFromTieSheetExtract(extract);
    assert.equal(draft.customer_name, TIE_SHEET_CUSTOMER);
    assert.equal(draft.pickup.name, TIE_SHEET_SHIPPER_NAME);
    assert.equal(draft.pickup.city, "Hastings");
    assert.equal(draft.pickup.state, "NE");
    assert.equal(draft.pickup.schedule_type, "appointment");
    assert.equal(draft.pickup.call_before, true);
    assert.equal(draft.drops.length, 1, `${truck.id} is same-receiver so one drop`);
    assert.match(draft.drop.name, truck.receiver);
    assert.equal(draft.drop.city, truck.city);
    assert.equal(draft.drop.state, truck.state);
    assert.deepEqual(draft.drop.order_numbers, truck.orders);
    assert.deepEqual(draft.drop.po_numbers, truck.pos);
    assert.equal(draft.weight, truck.weight);
    assert.equal(draft.case_count, truck.qty);
    assert.equal(draft.drop.schedule_type, truck.schedule);
    assert.equal(draft.equipment, "reefer_53");
    assert.equal(draft.reefer_mode, "continuous");
    assert.match(draft.notes, new RegExp(truck.id));
    assert.match(draft.pickup_start, /2026-08-2[89]/);
    assert.match(draft.delivery_start, /2026-08-31/);
    for (const order of truck.orders) assert.match(draft.drop.notes, new RegExp(order));
    for (const po of truck.pos) assert.match(draft.drop.notes, new RegExp(po.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const saved = saveTieSheetDraft(draft);
    const load = queries.getLoad(saved.id);
    assert.ok(load);
    assert.match(load.load_number, /^MSE-\d+$/);
    assert.doesNotMatch(load.load_number, /0824-/);
    assert.equal(load.customer_name, TIE_SHEET_CUSTOMER);
    assert.equal(load.rate, null);
    assert.equal(load.weight, truck.weight);
    assert.equal(load.case_count, truck.qty);
    assert.equal(load.equipment, "reefer_53");
    assert.equal(load.reefer_mode, "continuous");
    assert.match(load.notes, new RegExp(truck.id));
    const stops = (await import("../lib/stops")).listStops(saved.id);
    assert.equal(stops.length, 2, `${truck.id} same-receiver truck is one pickup and one drop`);
    assert.equal(stops.filter((stop) => stop.kind === "delivery").length, 1);
    const pickupStop = stops.find((stop) => stop.kind === "pickup");
    const dropStop = stops.find((stop) => stop.kind === "delivery");
    assert.ok(pickupStop && dropStop);
    assert.match(pickupStop.name, /Nebraska Cold Storage/i);
    assert.equal(pickupStop.city, "Hastings");
    assert.equal(pickupStop.state, "NE");
    assert.equal(pickupStop.schedule_type, "appointment");
    assert.match(dropStop.name, truck.receiver);
    assert.equal(dropStop.city, truck.city);
    assert.equal(dropStop.state, truck.state);
    assert.equal(dropStop.schedule_type, truck.schedule);
    for (const order of truck.orders) assert.match(`${dropStop.confirmation} ${dropStop.notes}`, new RegExp(order));
    for (const po of truck.pos) {
      assert.match(`${dropStop.reference} ${dropStop.notes} ${load.po_number}`, new RegExp(po.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const shipperLoc = pickupStop.location_id ? queries.getLocation(pickupStop.location_id) : null;
    assert.ok(shipperLoc);
    assert.equal(shipperLoc.scheduling_type, "appointment");
    assert.equal(shipperLoc.call_before, 1);
    assert.doesNotMatch(JSON.stringify(shipperLoc), /liftgate|inside/i);
  }
  assert.equal(queries.listLoads({ status: "all" }).length, loadsBeforeTieSheet + 4);

  const mixedExtract = parseTieSheetText(TIE_SHEET_FIXTURE_0824_4W);
  assert.equal(mixedExtract.load_id, "0824-4W");
  assert.equal(mixedExtract.orders.length, 7, "sheet has 7 order rows; that is not 7 drops");
  assert.equal(tieSheetSameDockFamily("Heartland Kosher - Western Kosher"), "western-kosher-heartland");
  assert.equal(tieSheetSameDockFamily("Heartland Kosher"), "western-kosher-heartland");
  assert.equal(tieSheetSameDockFamily("Western Kosher - Deli Crossdock"), "western-kosher-heartland");
  assert.equal(tieSheetSameDockFamily("Zant"), "");
  assert.equal(tieSheetSameDockFamily("Rolling Ranch"), "");
  const heartlandOnly = groupTieSheetOrdersByDock([
    { ...mixedExtract.orders[1], deliver_to: "Heartland Kosher" },
    mixedExtract.orders[2],
    mixedExtract.orders[6],
  ]);
  assert.equal(heartlandOnly.length, 2, "Heartland still shares the Western Kosher dock; Zant does not");
  assert.deepEqual(heartlandOnly[0]?.map((order) => order.control), ["74846", "7599"]);
  assert.deepEqual(heartlandOnly[1]?.map((order) => order.control), ["74793"]);
  const mixedDraft = draftFromTieSheetExtract(mixedExtract);
  assert.equal(mixedDraft.customer_name, TIE_SHEET_CUSTOMER);
  assert.equal(mixedDraft.pickup.name, TIE_SHEET_SHIPPER_NAME);
  assert.notEqual(mixedDraft.drops.length, 7, "0824-4W is not one drop per order");
  assert.notEqual(mixedDraft.drops.length, 2, "0824-4W is not one drop per city");
  assert.equal(mixedDraft.drops.length, 3, "0824-4W is one load with three customer/dock drops");
  assert.equal(TIE_SHEET_0824_4W_DROPS.length, 3);
  const mixedTieSheetPreview = tieSheetDraftPreview(mixedDraft);
  assert.match(mixedTieSheetPreview, /3 drops/);
  for (const [index, expected] of TIE_SHEET_0824_4W_DROPS.entries()) {
    const drop = mixedDraft.drops[index];
    assert.ok(drop, `0824-4W drop ${index + 1} ${expected.label}`);
    if (index === 0) assert.match(drop.name, /Rolling Ranch/i);
    if (index === 1) assert.match(drop.name, /Heartland|Western Kosher/i);
    if (index === 2) assert.match(drop.name, /Zant/i);
    assert.equal(drop.city, expected.city);
    assert.equal(drop.state, expected.state);
    assert.deepEqual(drop.order_numbers, [...expected.orders]);
    for (const order of expected.orders) {
      assert.match(`${drop.confirmation} ${drop.notes}`, new RegExp(order));
      assert.match(mixedTieSheetPreview, new RegExp(order));
    }
    for (const po of expected.pos) {
      assert.ok(drop.po_numbers.includes(po), `${expected.label} must keep PO ${po} on that drop`);
      assert.match(`${drop.reference} ${drop.notes}`, new RegExp(po.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(mixedTieSheetPreview, new RegExp(po.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
  assert.equal(mixedDraft.drops.filter((drop) => drop.city === "Los Angeles").length, 2, "LA city alone is not one drop");
  assert.equal(mixedDraft.weight, 39629);
  const mixedBefore = queries.listLoads({ status: "all" }).length;
  const mixedSaved = saveTieSheetDraft(mixedDraft);
  const mixedLoad = queries.getLoad(mixedSaved.id);
  assert.ok(mixedLoad);
  assert.match(mixedLoad.load_number, /^MSE-\d+$/);
  assert.equal(mixedLoad.customer_name, TIE_SHEET_CUSTOMER);
  assert.equal(mixedLoad.weight, 39629);
  const mixedStops = (await import("../lib/stops")).listStops(mixedSaved.id);
  assert.equal(mixedStops.filter((stop) => stop.kind === "pickup").length, 1);
  assert.equal(mixedStops.filter((stop) => stop.kind === "delivery").length, 3);
  assert.match(mixedStops.find((stop) => stop.kind === "pickup")?.name ?? "", /Nebraska Cold Storage/i);
  const mixedDrops = mixedStops.filter((stop) => stop.kind === "delivery");
  assert.notEqual(mixedDrops.length, 7);
  assert.notEqual(mixedDrops.length, 2);
  assert.equal(mixedDrops.length, 3);
  for (const [index, expected] of TIE_SHEET_0824_4W_DROPS.entries()) {
    const drop = mixedDrops[index];
    assert.equal(drop?.city, expected.city);
    assert.equal(drop?.state, expected.state);
    for (const order of expected.orders) {
      assert.match(`${drop?.confirmation} ${drop?.notes}`, new RegExp(order));
    }
    for (const po of expected.pos) {
      assert.match(
        `${drop?.reference} ${drop?.notes} ${mixedLoad.po_number}`,
        new RegExp(po.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
  }
  assert.match(mixedDrops[0]?.name ?? "", /Rolling Ranch/i);
  assert.match(mixedDrops[1]?.name ?? "", /Heartland|Western Kosher/i);
  assert.match(mixedDrops[2]?.name ?? "", /Zant/i);
  assert.equal(queries.listLoads({ status: "all" }).length, mixedBefore + 1, "mixed truck is still one load");

  const discardedCount = queries.listLoads({ status: "all" }).length;
  const discardDraft = draftFromTieSheetExtract(parseTieSheetText(TIE_SHEET_FIXTURE_0824_14M));
  assert.ok(discardDraft.drop.order_numbers.length);
  assert.equal(queries.listLoads({ status: "all" }).length, discardedCount, "mapping a draft must not save");

  const confirmDraft = draftFromTieSheetExtract(parseTieSheetText(TIE_SHEET_FIXTURE_0824_9E));
  const confirmResult = applyMikeProposal({ draft_json: encodeTieSheetDraft(confirmDraft) }, "build_tie_sheet");
  assert.match(confirmResult.message, /MSE-/);
  assert.ok(confirmResult.id);
  const confirmed = queries.getLoad(confirmResult.id);
  assert.ok(confirmed);
  assert.equal(confirmed.customer_name, TIE_SHEET_CUSTOMER);
  const confirmedStops = (await import("../lib/stops")).listStops(confirmResult.id);
  assert.equal(confirmedStops.filter((stop) => stop.kind === "delivery").length, 1);
  assert.match(confirmedStops.find((stop) => stop.kind === "delivery")?.reference ?? "", /128494/);

  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  setTieSheetAiTestClient(null);
  const missingKey = await askMike("", [], { mimeType: "image/png", buffer: tinyPng, filename: "truck.png" });
  assert.match(missingKey.reply, /not connected|Tie Sheet reader/i);
  assert.doesNotMatch(missingKey.reply, /OPENAI_API_KEY|sk-/);
  assert.equal(missingKey.proposals.length, 0);
  assert.match(TIE_SHEET_MISSING_KEY_MESSAGE, /not connected/);
  assert.doesNotMatch(TIE_SHEET_MISSING_KEY_MESSAGE, /\.env|OPENAI_API_KEY|sk-/);

  const thin14M = parseTieSheetText(TIE_SHEET_FIXTURE_0824_14M);
  const ambiguous14M = fillAmbiguousTieSheetFields(
    { load_id: "0824-14M", orders: [{ ...thin14M.orders[0], po: "", city: "", weight: null, qty: null, qty_label: "", appts: "" }], total_weight: null, total_qty: null },
    thin14M,
  );
  assert.equal(ambiguous14M.orders[0]?.po, "89676G");
  assert.equal(ambiguous14M.orders[0]?.city, "Hammond");
  assert.equal(ambiguous14M.total_weight, 36533);
  assert.equal(ambiguous14M.orders.length, 3, "known snapshot supplies the other two orders when the crop is thin");

  assert.equal(TIE_SHEET_PICTURE_FILES.length, 4);
  const liveCrops = TIE_SHEET_PICTURE_FILES.map((row) => ({ id: row.id, picture: readTieSheetPictureFixture(row.id) }));
  const livePresent = liveCrops.filter((row) => row.picture);
  if (livePresent.length) {
    assert.equal(livePresent.length, 4, "all four live 8.24.26 crops must be present together");
    for (const row of liveCrops) {
      assert.ok(row.picture && row.picture.buffer.length > 5000, `${row.id} live crop is a real photo`);
      assert.equal(row.picture?.buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    }
  }
  const pictureTrucks = [
    { id: "0824-14M", receiver: /MBL/, city: "Hammond", orders: ["74774", "74775", "74929"], pos: ["89676G", "89784", "Kosher 89786"] },
    { id: "0824-19E", receiver: /Westside Nonkosher/, city: "Bronx", orders: ["74480", "74795"], pos: ["288167", "289281"] },
    { id: "0824-5W", receiver: /Zant/, city: "Los Angeles", orders: ["74792", "74794"], pos: ["468110", "468111"] },
    { id: "0824-9E", receiver: /Bertolino/, city: "Peabody", orders: ["74789"], pos: ["128494"] },
  ];
  for (const truck of pictureTrucks) {
    const known = knownTieSheetExtract(truck.id);
    assert.ok(known);
    setTieSheetAiTestClient(async () =>
      JSON.stringify({
        load_id: truck.id,
        orders: known.orders.map((order) => ({ control: order.control })),
      }),
    );
    const picture = readTieSheetPictureFixture(truck.id) ?? {
      buffer: tinyPng,
      filename: `tie-sheet-${truck.id}.png`,
      mimeType: "image/png",
    };
    const loadsBeforePicture = queries.listLoads({ status: "all" }).length;
    const pictureRead = await askMike("", [], {
      mimeType: picture.mimeType,
      buffer: picture.buffer,
      filename: picture.filename,
    });
    setTieSheetAiTestClient(null);
    assert.equal(pictureRead.proposals.length, 1, `${truck.id} picture drafts one load`);
    assert.equal(pictureRead.proposals[0]?.kind, "build_tie_sheet");
    assert.match(pictureRead.proposals[0]?.preview ?? "", /M&S Loads/);
    assert.match(pictureRead.proposals[0]?.preview ?? "", /Nebraska Cold Storage/);
    assert.match(pictureRead.proposals[0]?.preview ?? "", truck.receiver);
    for (const order of truck.orders) assert.match(pictureRead.proposals[0]?.preview ?? "", new RegExp(order));
    assert.equal(queries.listLoads({ status: "all" }).length, loadsBeforePicture, `${truck.id} vision must not save until confirm`);
    const pictureConfirm = applyMikeProposal(pictureRead.proposals[0]?.payload ?? {}, "build_tie_sheet");
    assert.ok(pictureConfirm.id);
    const pictureLoad = queries.getLoad(pictureConfirm.id);
    assert.equal(pictureLoad?.customer_name, TIE_SHEET_CUSTOMER);
    const pictureStops = (await import("../lib/stops")).listStops(pictureConfirm.id!);
    assert.equal(pictureStops.filter((stop) => stop.kind === "pickup").length, 1);
    assert.equal(pictureStops.filter((stop) => stop.kind === "delivery").length, 1, `${truck.id} is one drop`);
    const pictureDrop = pictureStops.find((stop) => stop.kind === "delivery");
    assert.equal(pictureDrop?.city, truck.city);
    if (truck.id === "0824-19E") {
      assert.equal(pictureDrop?.state, "NY");
      assert.equal(pictureDrop?.schedule_type, "fcfs");
    }
    for (const order of truck.orders) assert.match(`${pictureDrop?.confirmation} ${pictureDrop?.notes}`, new RegExp(order));
    for (const po of truck.pos) {
      assert.match(
        `${pictureDrop?.reference} ${pictureDrop?.notes} ${pictureLoad?.po_number}`,
        new RegExp(po.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
  }

  const known4W = knownTieSheetExtract("0824-4W");
  assert.ok(known4W);
  setTieSheetAiTestClient(async () =>
    JSON.stringify({
      load_id: "0824-4W",
      orders: known4W.orders.map((order) => ({ control: order.control })),
    }),
  );
  const mixedPicture = readTieSheetPictureFixture("0824-4W") ?? {
    buffer: tinyPng,
    filename: "tie-sheet-0824-4W.png",
    mimeType: "image/png",
  };
  const mixedPictureBefore = queries.listLoads({ status: "all" }).length;
  const mixedPictureRead = await askMike("", [], {
    mimeType: mixedPicture.mimeType,
    buffer: mixedPicture.buffer,
    filename: mixedPicture.filename,
  });
  setTieSheetAiTestClient(null);
  assert.equal(mixedPictureRead.proposals.length, 1, "0824-4W picture drafts one load");
  assert.equal(mixedPictureRead.proposals[0]?.kind, "build_tie_sheet");
  assert.match(mixedPictureRead.proposals[0]?.preview ?? "", /3 drop/);
  assert.match(mixedPictureRead.proposals[0]?.preview ?? "", /Rolling Ranch/);
  assert.match(mixedPictureRead.proposals[0]?.preview ?? "", /Zant/);
  for (const expected of TIE_SHEET_0824_4W_DROPS) {
    for (const order of expected.orders) {
      assert.match(mixedPictureRead.proposals[0]?.preview ?? "", new RegExp(order));
    }
  }
  assert.equal(queries.listLoads({ status: "all" }).length, mixedPictureBefore, "0824-4W vision must not save until confirm");
  const mixedPictureConfirm = applyMikeProposal(mixedPictureRead.proposals[0]?.payload ?? {}, "build_tie_sheet");
  assert.ok(mixedPictureConfirm.id);
  const mixedPictureStops = (await import("../lib/stops")).listStops(mixedPictureConfirm.id!);
  assert.equal(mixedPictureStops.filter((stop) => stop.kind === "pickup").length, 1);
  assert.equal(
    mixedPictureStops.filter((stop) => stop.kind === "delivery").length,
    3,
    "0824-4W picture is three drops, not seven orders or two cities",
  );

  const whatsappEnvKeys = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "TWILIO_WHATSAPP_FROM",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "META_WHATSAPP_TOKEN",
    "META_WHATSAPP_PHONE_NUMBER_ID",
  ] as const;
  const previousWhatsAppEnv = Object.fromEntries(whatsappEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of whatsappEnvKeys) delete process.env[key];
  const whatsapp = await import("../lib/integrations/whatsapp");
  const { WHATSAPP_MISSING } = await import("../lib/whatsapp-shared");
  const { isWhatsAppConfigured } = await import("../lib/env");
  assert.equal(whatsapp.whatsappConfigured(), false);
  assert.equal(isWhatsAppConfigured(), false);
  await assert.rejects(
    () => whatsapp.sendWhatsAppMessage({ to: "(312) 555-0148", body: "Load" }),
    (error: unknown) => {
      assert.equal(error instanceof Error && error.message, WHATSAPP_MISSING);
      return true;
    },
  );
  process.env.WHATSAPP_ACCESS_TOKEN = "meta-token-not-used";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
  assert.equal(whatsapp.whatsappConfigured(), false, "Meta env must not enable WhatsApp");
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.TWILIO_ACCOUNT_SID = "ACtestnotreal";
  process.env.TWILIO_AUTH_TOKEN = "twilio-secret-token-do-not-log";
  process.env.TWILIO_FROM_NUMBER = "+15555550100";
  assert.equal(whatsapp.whatsappConfigured(), false, "SMS From alone must not enable WhatsApp");
  await assert.rejects(
    () => whatsapp.sendWhatsAppMessage({ to: "(312) 555-0148", body: "Load 1001" }),
    (error: unknown) => {
      assert.equal(error instanceof Error && error.message, WHATSAPP_MISSING);
      return true;
    },
  );
  const { sendLoadWhatsAppAction } = await import("../lib/dispatcher-actions");
  const missingWhatsAppForm = new FormData();
  missingWhatsAppForm.set("load_id", String(loadId));
  missingWhatsAppForm.set("kind", "load_info");
  const missingWhatsApp = await sendLoadWhatsAppAction(missingWhatsAppForm);
  assert.equal(missingWhatsApp.ok, false);
  if (!missingWhatsApp.ok) assert.match(missingWhatsApp.error, /WhatsApp is not connected/);
  const smsStillWorks = await import("../lib/integrations/twilio");
  let smsOnlyBody = "";
  const smsOnlyFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    smsOnlyBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ sid: "SM-sms-only" }), {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  await smsStillWorks.sendTwilioSms({ to: "(312) 555-0148", body: "SMS still works" }, smsOnlyFetch);
  assert.match(smsOnlyBody, /From=%2B15555550100|From=\+15555550100/);
  assert.doesNotMatch(smsOnlyBody, /whatsapp/);
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+15555550199";
  assert.equal(whatsapp.whatsappConfigured(), true);
  assert.equal(isWhatsAppConfigured(), true);
  let whatsappUrl = "";
  let whatsappSent = "";
  const whatsappOkFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    whatsappUrl = String(url);
    whatsappSent = String(init?.body ?? "");
    return new Response(JSON.stringify({ sid: "SM-wa" }), {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  await whatsapp.sendWhatsAppMessage({ to: "(312) 555-0148", body: "Load 1001 ready" }, whatsappOkFetch);
  assert.match(whatsappUrl, /api\.twilio\.com\/2010-04-01\/Accounts\/ACtestnotreal\/Messages\.json/);
  assert.match(whatsappSent, /From=whatsapp%3A%2B15555550199|From=whatsapp:\+15555550199/);
  assert.match(whatsappSent, /To=whatsapp%3A%2B13125550148|To=whatsapp:\+13125550148/);
  assert.match(whatsappSent, /Load\+1001|Load%201001|Load 1001/);
  assert.doesNotMatch(whatsappSent, /ContentSid|contentSid/);
  for (const key of whatsappEnvKeys) {
    const value = previousWhatsAppEnv[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  closeDb();
  const reopened = getDb();
  const persisted = reopened
    .prepare("SELECT status, customer_id FROM loads WHERE id = ?")
    .get(loadId) as { status: string; customer_id: number };
  assert.equal(persisted.status, "delivered");
  assert.equal(persisted.customer_id, customerId);

  closeDb();
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  console.log(
    "Smoke test passed: seed, locations, search, settings hub, customer, truck, driver, load, assign, persist.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
