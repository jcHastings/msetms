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
  assert.match(navSource, /title: "Accounting"/);
  assert.match(navSource, /href: "\/accounting"/);
  assert.match(navSource, /Invoices \(AR\)/);
  assert.match(navSource, /Bills \(AP\)/);
  assert.match(navSource, /Driver pay/);
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
  assert.match(loadStatusBadgeClass("available"), /amber/);
  assert.doesNotMatch(loadStatusBadgeClass("assigned"), /amber/);
  assert.match(loadStatusBadgeClass("assigned"), /sky/);
  assert.match(loadStatusBadgeClass("delivered"), /slate/);
  assert.match(loadStatusRowClass("available"), /inset_4px/);
  assert.match(loadStatusRowClass("in_transit"), /inset_4px/);
  assert.ok(LOAD_STATUSES.every((status) => loadStatusBadgeClass(status) && loadStatusRowClass(status)));
  assert.equal(LOAD_STATUSES.includes("tonu" as (typeof LOAD_STATUSES)[number]), false);
  const boardUi = fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8");
  const dashUiStatus = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
  const { loadMatchesListQuery, parseLoadListTab } = await import("../lib/load-list-shared");
  assert.equal(parseLoadListTab(""), "active");
  assert.equal(parseLoadListTab("planning"), "planning");
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
  assert.match(boardUi, /listLoads\(\{ status, date \}\)/);
  assert.match(boardUi, /data-dispatch-board/);
  assert.match(boardUi, /table-grid-board/);
  assert.match(boardUi, />Tractor</);
  assert.match(boardUi, />Trailer</);
  assert.match(boardUi, />HOS</);
  assert.match(boardUi, />Reefer</);
  assert.match(boardUi, /Change unit|Assign/);
  assert.doesNotMatch(boardUi, /Find New Shippers|EDI \/ Tenders|Post\/Search Load Boards/);
  const boardToolbar = fs.readFileSync(path.join(process.cwd(), "components/board-toolbar.tsx"), "utf8");
  assert.match(boardToolbar, /Search loads on this tab/);
  assert.match(boardToolbar, /LOAD_LIST_TABS/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-list-shared.ts"), "utf8"), /Planning/);
  assert.match(boardUi, /loadStatusRowClass\(load\.status\)/);
  assert.match(dashUiStatus, /loadStatusRowClass\(load\.status\)/);
  const tabSource = fs.readFileSync(path.join(process.cwd(), "lib/load-tabs.ts"), "utf8");
  assert.match(tabSource, /basics/);
  assert.match(tabSource, /financials/);
  const { parseLoadTab } = await import("../lib/load-tabs");
  assert.equal(parseLoadTab("history"), "log");
  assert.equal(parseLoadTab("documents"), "docs");
  assert.equal(parseLoadTab("carrier"), "assets");
  assert.equal(parseLoadTab("tracking"), "assets");
  assert.equal(parseLoadTab(""), "basics");
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
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/accounting/quickbooks/page.tsx"), "utf8"), /Needs QBO customer/);
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
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Authenticator code/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /recovery_code/);
  const driverLoginPage = fs.readFileSync(path.join(process.cwd(), "app/driver/login/page.tsx"), "utf8");
  assert.doesNotMatch(driverLoginPage, /totp|authenticator/i);
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
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/brand-mark.tsx"), "utf8"), /MS Express TMS/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /BrandMark/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /MS Test/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /Ana G/);
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
  assert.match(workspaceSource, /Load Actions/);
  assert.match(workspaceSource, /load-tabs/);
  assert.match(workspaceSource, /load-tab-active/);
  assert.match(workspaceSource, /load-actions/);
  assert.match(workspaceSource, /load-action-btn/);
  assert.match(workspaceSource, /load-action-menu/);
  assert.match(workspaceSource, /load-tab-back/);
  const cssSource = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(cssSource, /\.load-tabs/);
  assert.match(cssSource, /\.load-tab-active/);
  assert.match(cssSource, /\.load-actions/);
  assert.match(cssSource, /\.desk-sidebar/);
  assert.match(cssSource, /\.desk-nav-link-active/);
  assert.match(cssSource, /#0b1f3a/);
  assert.match(cssSource, /#d4a017/);
  assert.match(cssSource, /\[data-load-list-chrome\]/);
  assert.match(cssSource, /\.stop-row-pickup/);
  assert.match(cssSource, /\.stop-chip-delivery/);
  assert.match(cssSource, /\.finance-income/);
  assert.match(cssSource, /\.finance-head/);
  assert.match(cssSource, /\.section-head/);
  assert.match(cssSource, /\.stop-row-delivery/);
  assert.match(cssSource, /\.note-public/);
  assert.match(cssSource, /\.note-private/);
  assert.match(cssSource, /\.load-docs-actions/);
  assert.match(navSource, /desk-nav-section/);
  assert.match(navSource, /desk-nav-link-active/);
  const shellSource = fs.readFileSync(path.join(process.cwd(), "components/app-shell.tsx"), "utf8");
  assert.match(shellSource, /desk-sidebar/);
  assert.match(workspaceSource, /Load Log/);
  assert.match(workspaceSource, /Dispatch and Tracking/);
  assert.match(workspaceSource, /Load Documents/);
  assert.match(workspaceSource, /Copy \/ Cancel \/ Archive/);
  assert.match(workspaceSource, /Admin \/ Financials/);
  assert.match(workspaceSource, /Log Check Call/);
  assert.match(workspaceSource, /View Load Log/);
  assert.match(workspaceSource, /Send Text Message/);
  assert.match(workspaceSource, /Text dispatch to driver/);
  assert.match(workspaceSource, /Assign a driver first/);
  assert.match(workspaceSource, /The assigned driver needs a mobile number/);
  assert.match(workspaceSource, /Send text/);
  assert.doesNotMatch(workspaceSource, /window\.confirm\(`Text dispatch/);
  assert.doesNotMatch(workspaceSource, /Text Load Information/);
  assert.match(workspaceSource, /Upload a Document/);
  assert.match(workspaceSource, /Request Documents From Driver/);
  assert.match(workspaceSource, /Release to invoicing/);
  assert.match(workspaceSource, /Request POD/);
  assert.match(workspaceSource, /Request Detention email/);
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
  assert.doesNotMatch(workspaceSource, /<details/);
  assert.doesNotMatch(workspaceSource, /Delete This Load/);
  const loadFormSource = fs.readFileSync(path.join(process.cwd(), "components/load-form.tsx"), "utf8");
  const basicsChunk = fs.readFileSync(path.join(process.cwd(), "components/load-basics-screen.tsx"), "utf8");
  const customerChunk = fs.readFileSync(path.join(process.cwd(), "components/load-customer-screen.tsx"), "utf8");
  const assetsChunk = fs.readFileSync(path.join(process.cwd(), "components/load-carrier-screen.tsx"), "utf8");
  assert.match(loadFormSource, /LoadBasicsScreen/);
  assert.match(loadFormSource, /LoadCustomerScreen/);
  assert.match(loadFormSource, /LoadCarrierScreen/);
  assert.match(loadFormSource, /data-assign-fields/);
  assert.match(loadFormSource, /hidden=\{resolvedScreen !== "assets"/);
  assert.match(loadFormSource, /stay_on_load/);
  assert.match(loadFormSource, /\/loads\/\$\{load\.id\}/);
  const actionsSource = fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8");
  assert.match(actionsSource, /redirect\(`\/loads\/\$\{id\}`\)/);
  assert.match(actionsSource, /Existing-load Save must stay on this load/);
  assert.doesNotMatch(
    actionsSource,
    /redirect\(safeReturnTo\(formData.get\("return_to"\), `\/loads\/\$\{id\}`\)\)/,
  );
  assert.doesNotMatch(loadFormSource, /name="origin"|name="destination"|name="pickup_start"|hidden leftover/);
  assert.match(basicsChunk, /data-load-tab="basics"/);
  assert.match(basicsChunk, /Reefer setpoint/);
  assert.match(basicsChunk, /Reefer mode/);
  assert.match(basicsChunk, /useLoadAssignPersist/);
  assert.match(basicsChunk, /handleAssign/);
  assert.match(basicsChunk, /continuous/);
  assert.match(basicsChunk, /Load Status/);
  assert.match(basicsChunk, /Truck Status/);
  assert.match(basicsChunk, /Load Reference ID/);
  assert.match(basicsChunk, /Reefer setpoint/);
  assert.doesNotMatch(basicsChunk, /htmlFor="branch"|New\/Used|Lower temp threshold|Upper temp threshold|Temp time tolerance|Container #|Last free day/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-stops-panel.tsx"), "utf8"), /applyLocationToStop/);
  assert.doesNotMatch(basicsChunk, /Shipper location|Consignee location|Pickup window|Delivery window|htmlFor="origin"|htmlFor="destination"/);
  assert.match(customerChunk, /data-load-tab="customer"/);
  assert.match(customerChunk, /useLoadAssignPersist/);
  assert.match(customerChunk, /Customer reference/);
  assert.doesNotMatch(customerChunk, /credit_hold|MC#|EDI/);
  assert.match(assetsChunk, /Company driver/);
  assert.match(assetsChunk, /Owner-operator/);
  assert.match(assetsChunk, /name="driver_id"/);
  assert.match(assetsChunk, /name="truck_id"/);
  assert.match(assetsChunk, /name="trailer_id"/);
  assert.match(assetsChunk, /useLoadAssignPersist/);
  assert.match(assetsChunk, /handleAssign/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-load-assign-persist.ts"), "utf8"), /stay_on_load/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/use-load-assign-persist.ts"), "utf8"), /isAssignEdit/);
  assert.doesNotMatch(assetsChunk, /Assigned truck|Trailer #|MC#|DOT|insurance|Reefer setpoint/);
  assert.match(workspaceSource, /Watch this load/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tab-panel.tsx"), "utf8"), /keepMounted/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tab-panel.tsx"), "utf8"), /if \(!visible && !keepMounted\) return null/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8"), /keepMounted/);
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
  assert.match(paySource, /ViewInvoiceButton/);
  assert.match(paySource, /View Customer Confirmation/);
  assert.match(paySource, /View Carrier Confirmation/);
  assert.match(paySource, /\/api\/loads\/\$\{loadId\}\/confirmation`/);
  assert.match(paySource, /\/api\/loads\/\$\{loadId\}\/confirmation\?packet=internal/);
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
  assert.match(stopsSource, /stopTypeNumber/);
  assert.match(stopsSource, /stopTypeLabel/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops-shared.ts"), "utf8"), /export function stopTypeNumber/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops-shared.ts"), "utf8"), /Delivery" : "Pickup"/);
  assert.match(stopsSource, /datetime-local/);
  assert.match(stopsSource, /onBlur/);
  assert.match(stopsSource, /commitTime/);
  assert.match(stopsSource, /stopPrivateNotes/);
  assert.doesNotMatch(stopsSource, /#\{index\}/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /stop-front/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"), /table-grid-stops/);
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
  assert.match(laneSource, /LocationPicker/);
  assert.match(laneSource, /useLoadAssignPersist/);
  assert.doesNotMatch(laneSource, /<select[^>]*name="shipper_location_id"/);
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
  assert.doesNotMatch(rateConReviewSource, /Change the dropdown/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tracking-panel.tsx"), "utf8"), /Load map/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/load-tracking-panel.tsx"), "utf8"), /This load only|Check calls and stored GPS/);
  const mapCanvasSource = fs.readFileSync(path.join(process.cwd(), "components/load-map-canvas.tsx"), "utf8");
  assert.match(mapCanvasSource, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.doesNotMatch(mapCanvasSource, /maps\.google\.com\/maps\?/);
  assert.doesNotMatch(mapCanvasSource, /AIza[0-9A-Za-z_-]+/);
  assert.match(mapCanvasSource, /point\.href/);
  assert.match(mapCanvasSource, /Polyline/);
  const stopsMapUi = fs.readFileSync(path.join(process.cwd(), "components/load-stops-map.tsx"), "utf8");
  assert.match(stopsMapUi, /data-stops-map/);
  assert.match(stopsMapUi, /Map is off/);
  assert.match(stopsMapUi, /No map yet/);
  assert.doesNotMatch(stopsMapUi, /maps\.google\.com|GOOGLE_MAPS_API_KEY|Official IFTA|<code>\.env/);
  const stopsPanelUi = fs.readFileSync(path.join(process.cwd(), "components/load-stops-panel.tsx"), "utf8");
  assert.match(stopsPanelUi, /draggable/);
  assert.match(stopsPanelUi, /APPT/);
  assert.match(stopsPanelUi, /FCFS/);
  assert.match(stopsPanelUi, /Add Pickup/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/geofence.ts"), "utf8"), /GEOFENCE_MILES = 2/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/queries.ts"), "utf8"), /applyGeofenceArrivalsForTruck/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/stops.ts"), "utf8"), /applyGeofenceArrivals\(loadId\)/);
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
  assert.match(fleetMapView, /Map is off/);
  assert.doesNotMatch(fleetMapView, /GOOGLE_MAPS_API_KEY|<code>\.env/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/samsara/page.tsx"), "utf8"), /buildSamsaraFleetMap/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/fleet/orbcomm/page.tsx"), "utf8"), /buildOrbcommFleetMap/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/loads/templates/page.tsx"), "utf8"), /Picks/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/loads/templates/page.tsx"), "utf8"), /Book from template/);
  const payPageSource = fs.readFileSync(path.join(process.cwd(), "app/accounting/pay/page.tsx"), "utf8");
  assert.match(payPageSource, /Close period/);
  assert.match(payPageSource, /Download Excel/);
  assert.match(payPageSource, /Driver pay/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/accounting/pay/export/route.ts"), "utf8"), /driver-pay\.xlsx/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-tracking-panel.tsx"), "utf8"), /Recent events/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-log-section.tsx"), "utf8"), /Save check call/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/alerts/page.tsx"), "utf8"), /GPS quiet window/);
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
  const dbMigrateSource = fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8");
  const fromColAt = dbMigrateSource.indexOf('ensureColumn(db, "load_relays", "from_driver_id"');
  const fromIdxAt = dbMigrateSource.indexOf("idx_load_relays_from_driver");
  assert.ok(fromColAt >= 0 && fromIdxAt > fromColAt, "add from_driver_id before indexing it");
  assert.doesNotMatch(basicsChunk, /Routing guide|Refresh route|route_miles/);
  assert.doesNotMatch(paySource, /Routing guide|Refresh route|route_miles/);
  const docsPage = fs.readFileSync(path.join(process.cwd(), "components/load-editor.tsx"), "utf8");
  assert.match(docsPage, /AttachmentsPanel/);
  assert.match(docsPage, /when="docs"/);
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
  assert.doesNotMatch(driverFormSrc, /Default settlement|pay_percent/);
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
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8"), /On the road/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8"), /LocationBadge/);
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
  }
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
  for (const file of [
    "components/rate-con-import.tsx",
    "components/rate-con-apply.tsx",
    "components/rate-con-location-review.tsx",
    "components/load-form.tsx",
    "components/load-basics-screen.tsx",
    "components/load-customer-screen.tsx",
    "components/load-carrier-screen.tsx",
    "components/load-lane-fields.tsx",
    "lib/rate-con-shared.ts",
    "lib/reefer-shared.ts",
    "components/make-bol-button.tsx",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /from ["']@\/lib\/rate-con["']/, `${file} must not import server rate-con`);
    assert.doesNotMatch(source, /from ["']@\/lib\/(db|env|settings|places|bol)["']/, `${file} must stay client-safe`);
  }
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
  const sampleRefLoad = queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1042");
  assert.ok(sampleRefLoad);
  assert.ok(
    queries.listLoads({ status: "all", q: sampleRefLoad.customer_name.split(" ")[0] ?? "Heartland" }).some(
      (load) => load.id === sampleRefLoad.id,
    ),
  );

  const { addPayItem, listPayItems } = await import("../lib/pay-items");
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
  assert.equal(listPayItems(payLoadId).length, 0, "financials start with no blank row");
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
  assert.match(docsPanel, /Replace/);
  assert.match(docsPanel, /Load documents/);
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
  assert.match(companySummary, /Shipper A/);
  assert.match(companySummary, /Receiver B/);
  assert.match(companySummary, /34\s*°F|34°F/);
  assert.match(companySummary, /Continuous/);
  assert.match(companySummary, /localhost:3000\/driver/);
  assert.doesNotMatch(companySummary, /2150|\$2/);
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
  assert.match(dispatchSummary, /Truck 112/);
  assert.match(dispatchSummary, /Trailer TR-7742/);
  assert.match(dispatchSummary, /34°F/);
  assert.match(dispatchSummary, /Continuous/);
  assert.match(dispatchSummary, /Your leg: Nashville, TN → Memphis, TN/);
  assert.match(dispatchSummary, /Scale ticket/);
  assert.doesNotMatch(dispatchSummary, /INTERNAL/);
  assert.doesNotMatch(dispatchSummary, /3100|\$3/);
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

  const trailerLocation = await orbcomm.getTrailerLocationForLoad(reeferLoad.id);
  assert.ok(trailerLocation, "demo ORBCOMM snapshot should include trailer location");
  assert.equal(trailerLocation.source, "demo");
  assert.ok(trailerLocation.latitude != null && trailerLocation.longitude != null);

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
  assert.equal(samsara.isLiveSamsaraGps(mappedGps[0] ?? null), true);
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
  const { companyLogoPath, defaultCompanyLogoPath, hasCustomCompanyLogo } = await import("../lib/settings");
  assert.equal(hasCustomCompanyLogo(), false);
  assert.ok(defaultCompanyLogoPath()?.endsWith("ms-express-logo.png"));
  assert.equal(companyLogoPath(), defaultCompanyLogoPath());
  assert.equal(header.dispatcher_name, "MS Test");
  const coleConfirm = confirmation.buildConfirmationForLoad(coleLoad.id);
  assert.equal(coleConfirm.packet, "customer");
  assert.equal(coleConfirm.style, "owner_operator");
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
  assert.match(coleDriverText, /Rate & Load Confirmation/);
  assert.doesNotMatch(coleDriverText, /Customer Confirmation/);
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
  assert.match(deniseDriverText, /Load Confirmation/);
  assert.doesNotMatch(deniseDriverText, /Customer Confirmation/);
  assert.doesNotMatch(deniseDriverText, /Customer Rate|^Rate$/m);
  assert.doesNotMatch(deniseDriverText, /3,100/);
  assert.match(deniseText.replaceAll(/\s+/g, ""), /ana@msloads\.com/);
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
  assert.match(bolText, /Smoke Bill of Lading/);
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
  assert.match(bolText, /Smoke BOL footer|Smoke BOL terms/);
  assert.doesNotMatch(bolText, /Internal legs|for carrier use|Relay/i);

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
  assert.equal(billedPacket.customerPhone, "816-555-0199");
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
  assert.match(billedDriverText, /Load Confirmation/);
  assert.doesNotMatch(billedDriverText, /Customer Confirmation|2,150|Westside Foods Billing Co|WSF-1006153/);
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
  assert.match(relaySms, /Shipper New York, NY/);
  assert.match(relaySms, /Receiver Denver, CO/);
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

  const { closestTrucksToCity, extractCityFromQuestion, findCityCenter } = await import("../lib/city-coords-shared");
  assert.ok(findCityCenter("Oklahoma City"));
  assert.match(extractCityFromQuestion("what truck is closest to Oklahoma City?"), /Oklahoma City/i);
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
  const routing = await import("../lib/routing");
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
  const missingRoute = await routing.refreshLoadRoute(routeLoadId);
  assert.equal(missingRoute.ok, true);
  assert.equal(missingRoute.configured, false);
  assert.equal(googleCalls, 0);
  assert.equal(queries.getLoad(routeLoadId)?.route_miles ?? null, null);
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
    const points = routing.encodePolyline([
      { lat: 40.71, lng: -74.0 },
      { lat: 40.8, lng: -77.2 },
      { lat: 41.1, lng: -81.7 },
      { lat: 41.6, lng: -86.2 },
      { lat: 41.88, lng: -87.63 },
    ]);
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
  const { milesForStopGap } = await import("../lib/routing-shared");
  assert.equal(milesForStopGap(0, 2, { totalMiles: 12.3, legMiles: [] }), 12.3);
  assert.equal(milesForStopGap(0, 3, { totalMiles: 12.3, legMiles: [] }), null);
  assert.equal(milesForStopGap(1, 3, { totalMiles: 12.3, legMiles: [8, 4.3] }), 4.3);
  const officialIfta = queries.getIftaReport(reeferLoad.id);
  assert.ok(officialIfta);
  assert.notEqual(officialIfta.source, "google");
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
  const fuelMatchUi = fs.readFileSync(path.join(process.cwd(), "components/fuel-match-queue.tsx"), "utf8");
  assert.match(fuelPage, /FuelMatchQueue/);
  assert.match(fuelMatchUi, /data-fuel-match-queue/);
  assert.match(fuelMatchUi, /Receipt match/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /data-fuel-week-strip/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /Lowest paid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /Highest paid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-week-strip.tsx"), "utf8"), /Average paid/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/fuel.ts"), "utf8"), /fuelWeekPaidStats/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/types.ts"), "utf8"), /fuel_receipt/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/driver-fuel-receipt.tsx"), "utf8"), /fuel_receipt/);
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
    isTruckDieselCategory,
    fuelTxListKind,
    parseEfsFuelText,
    looksLikeEfsReport,
    isFuelBucket,
    labelForFuelBucket,
    parseFuelCsv,
    parseFuelReport,
    parseFuelWhen,
    renderFuelExportCsv,
    renderFuelTemplate,
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
  const fuelWhen = new Date();
  const [fuelYear, fuelMonth, fuelDay] = ymdInTimeZone(fuelWhen, DISPLAY_TIME_ZONE).split("-").map(Number);
  const fuelDate = `${fuelMonth}/${fuelDay}/${fuelYear}`;
  const fuelCsv = [
    "Date,Time,Driver Name,Driver ID,Unit,Location,Category,Gallons,Price,Total,Card Number",
    `${fuelDate},00:32,Denise Ortega,,112,Memphis TN,Diesel,100,3.499,349.90,****4321`,
    `${fuelDate},00:40,, ,101,Indianapolis,Diesel,80,3.40,272.00,1111`,
    `${fuelDate},00:50,Unknown Driver,,8888,Nowhere,Diesel,40,3.10,124.00,2222`,
    `${fuelDate},00:32,Denise Ortega,,112,Memphis TN,Diesel,100,3.499,349.90,****4321`,
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
  const { listDriverMpg, odometerDeltaMiles } = await import("../lib/fuel-mpg");
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

  const efsReport = [
    "/Dm201902",
    "M&S LOADS",
    "CUSTOMER 3770001903818",
    "TRANSACTION ACTIVITY REPORT",
    "REPORT DATE 08/21/2026",
    "",
    "NName: HOWELL, CHRISTOPHER",
    "08/21/26 556712341111 DIESEL ULTRA LOW SULFUR DIESEL 32 32 900111 1011 MEMPHIS TN LOVES 102.340 3.459 8.20 353.90 0.00 1.00 355.10",
    "08/21/26 556712341111 REEFER REEFER ULTRA LOW SULFUR 32 32 900112 1011 MEMPHIS TN LOVES 20.000 3.459 1.50 69.18 0.00 0.00 69.18",
    "08/21/26 556712341111 DEF DIESEL EXHAUST FLUID 32 32 900113 1011 MEMPHIS TN LOVES 5.000 4.199 0.40 21.00 0.00 0.00 21.00",
    "",
    "NName: ELLER, STEVE",
    "08/21/26 556712342222 SCALE CAT SCALES 26 26 900221 2022 JACKSON MS CAT SCALE 1.000 0.000 0.00 18.50 0.00 0.00 18.50",
    "",
    "NName: WHALEY, KELVIN",
    "08/21/26 556712343333 DIESEL ULTRA LOW SULFUR DIESEL 28 28 900331 3033 NASHVILLE TN PILOT 88.100 3.399 6.10 299.45 0.00 0.00 299.45",
  ].join("\n");
  const efsParsed = parseEfsFuelText(efsReport);
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
  assert.ok(liveOnly.every((load) => (ACTIVE_LOAD_STATUSES as readonly string[]).includes(load.status)));
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

  const previousOrbcommUser = process.env.ORBCOMM_USERNAME;
  const previousOrbcommPass = process.env.ORBCOMM_PASSWORD;
  delete process.env.ORBCOMM_USERNAME;
  delete process.env.ORBCOMM_PASSWORD;
  const fleetMap = await import("../lib/fleet-map");
  const { isPlottableCoord } = await import("../lib/fleet-map-shared");
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
  const samsaraFleetMap = await fleetMap.buildSamsaraFleetMap();
  const liveTruckPin = samsaraFleetMap.pins.find((pin) => pin.label === "FM-SAM-1");
  assert.ok(liveTruckPin, "active truck with stored Samsara GPS must plot");
  assert.equal(liveTruckPin?.lat, 41.2565);
  assert.equal(liveTruckPin?.lng, -95.9345);
  assert.equal(liveTruckPin?.href, `/fleet/trucks/${fleetMapTruckId}`);
  assert.equal(
    samsaraFleetMap.pins.some((pin) => pin.label === "FM-OLD"),
    false,
    "deactivated trucks stay off the live Samsara map",
  );
  assert.ok(samsaraFleetMap.missing.some((item) => item.label === "FM-EMPTY" && item.id === fleetMapEmptyId));
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
  const reeferStatus = orbcommFleetMap.statusRows?.find((row) => row.trailer === "FM-R1");
  assert.ok(reeferStatus?.messageAt, "status row should show the Orbcomm message time");
  const emptyStatus = orbcommFleetMap.statusRows?.find((row) => row.trailer === "FM-R0");
  assert.equal(emptyStatus?.messageAt ?? "", "", "no message yet stays blank");
  assert.equal(orbcommFleetMap.pins.some((pin) => pin.label === "FM-DRY"), false, "dry-van trailers stay off the reefer map");
  assert.ok(orbcommFleetMap.missing.some((item) => item.label === "FM-R0" && item.id === fleetEmptyReeferId));
  assert.match(orbcommFleetMap.sourceNote, /stored|not connected/i);
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
  assert.equal("totp_secret" in msTest, false);
  assert.equal(session.authenticateDispatcher(msTest.id, "4020").role, "manager");
  assert.throws(() => session.authenticateDispatcher(msTest.id, "0000"));
  assert.ok(session.parseSessionValue(`${msTest.id}.${Date.now()}`));
  assert.equal(session.parseSessionValue(`${msTest.id}.${Date.now() - session.DISPATCHER_SESSION_MS - 1}`), null);

  const accounting = await import("../lib/accounting");
  assert.ok(accounting.listBills().some((bill) => /Lumper/i.test(bill.vendor)));
  assert.ok(accounting.listReceivables().length >= 1);
  assert.ok(accounting.listCommissions().length >= 1);

  const desk = await import("../lib/desk");
  const firstException = inbox.items[0];
  desk.setExceptionState(firstException.id, "resolved", "smoke");
  const liveInbox = desk.listLiveExceptionInbox();
  assert.equal(liveInbox.items.some((item) => item.id === firstException.id), false);
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
  assert.ok(settings.SETTINGS_SECTIONS.some((section) => section.title === "Users"));
  assert.ok(
    settings.SETTINGS_SECTIONS.some((section) => section.items.some((item) => item.href === "/users")),
  );
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
  assert.equal(settings.canEditSettings("dispatcher"), false);
  assert.equal(settings.canEditSettings("accounting"), false);
  assert.equal(settings.canEditSettings("manager"), true);
  assert.equal(settings.canImportLocations("dispatcher"), false);
  assert.equal(settings.canImportLocations("manager"), true);
  assert.equal(settings.canViewLoadFinancials("dispatcher"), false);
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
  assert.equal(session.roleLabel("manager"), "Administrator");
  const usersPage = fs.readFileSync(path.join(process.cwd(), "app/users/page.tsx"), "utf8");
  assert.match(usersPage, /Add user/);
  assert.match(usersPage, /listDispatcherUsers/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/users/page.tsx"), "utf8"), /redirect\("\/users"\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/company/page.tsx"), "utf8"), /SettingsAdminGate/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/settings-admin-gate.tsx"), "utf8"), /Only an Administrator can change Settings/);
  const userForm = fs.readFileSync(path.join(process.cwd(), "components/dispatcher-user-form.tsx"), "utf8");
  assert.doesNotMatch(userForm, /user\?\.pin/);
  assert.match(userForm, /defaultValue=""/);
  assert.match(userForm, /leave blank to keep/);
  assert.match(userForm, /2-step verification/);
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
    alert_driver_days: 14,
    alert_registration_days: 45,
    alert_dot_days: 21,
    alert_emails_enabled: true,
  });
  assert.equal(settings.getCompanySettings().alert_driver_days, 14);
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
  const commodityId = settings.addDropdownOption({ kind: "commodity", value: "", label: "Smoke commodity" });
  assert.ok(settings.commoditySuggestions().includes("Smoke commodity"));
  settings.setDropdownOptionActive(commodityId, false);
  assert.equal(settings.commoditySuggestions().includes("Smoke commodity"), false);
  settings.addDropdownOption({ kind: "load_status", value: "waiting_paper", label: "Waiting paper" });
  assert.equal(settings.isKnownLoadStatus("waiting_paper"), true);
  const userId = settings.createDispatcherUser({
    name: "Smoke Desk",
    pin: "7777",
    role: "dispatcher",
    email: "smoke@msloads.com",
    permission_group: "billing",
  });
  assert.equal(settings.getDispatcherUser(userId)?.permission_group, "billing");
  const booksId = settings.createDispatcherUser({
    name: "Smoke Books",
    pin: "8888",
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
  assert.equal(settings.getCompanySettings().require_dispatcher_2fa, 0);
  assert.equal(settings.isDispatcherTwoFactorRequired(), false);
  settings.updateTwoFactorPolicy(true);
  assert.equal(settings.isDispatcherTwoFactorRequired(), true);
  settings.updateTwoFactorPolicy(false);
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
  assert.match(assignUi, /name="truck_id"[\s\S]*?\{item\.unit_number\}[\s\S]*?name="trailer_id"/);
  assert.doesNotMatch(assignUi, /name="truck_id"[\s\S]*?item\.type[\s\S]*?name="trailer_id"/);
  assert.doesNotMatch(assignUi, /dry van/i);
  const dashUi = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
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
  const safetyBoard = buildSafetyBoard({
    drivers: queries.listDrivers(),
    windowDays: 30,
    insurance: { provider: "Great West", policy: "POL-100", expires: "2026-07-01" },
    tokenSet: false,
    hos: [],
    now: new Date("2026-08-24T12:00:00"),
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
  const tmsInvoiceModel = buildTmsInvoice(queries.getLoad(invoiceLoadId)!);
  assert.equal(tmsInvoiceModel.companyLegalName, "M&S Loads LLC");
  assert.match(tmsInvoiceModel.companyLegalName, /LLC/);
  assert.match(tmsInvoiceModel.date, /^\d{2}\/\d{2}\/\d{2}$/);
  assert.doesNotMatch(tmsInvoiceModel.date, /\d{4}-\d{2}-\d{2}/);
  assert.ok(isCompanyCustomerName("M & S Loads LLC.", "M&S Loads"));
  assert.equal(tmsInvoiceModel.customerStreet, settings.getCompanySettings().street);
  assert.match(tmsInvoiceModel.customerCityStateZip, /NE/);
  assert.match(tmsInvoiceModel.customerPhone, /402-302-0097/);
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
  const invoicePdfText = await extractDocumentText(made.buffer, "application/pdf", "INV-1005911.pdf");
  assert.doesNotMatch(invoicePdfText, /Linehaul is the customer rate/);
  assert.doesNotMatch(invoicePdfText, /Accessorials are billed separately/);
  assert.doesNotMatch(invoicePdfText, /Payment due per customer terms/);
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
  assert.match(onePageText, /MS Test \(M&S Loads LLC\)/);
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
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/loads/[id]/invoice/route.ts"), "utf8"), /Content-Disposition.*attachment/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/loads/[id]/invoice/route.ts"), "utf8"), /X-Attachment-Id/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/open-generated-pdf.ts"), "utf8"), /createObjectURL/);
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

  const { attachMikeFleetTelemetry, buildMikeGpsContext, mikeGpsPointsFromFleet } = await import("../lib/mike");
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
  const odometerMiles = samsara.extractSamsaraOdometerMiles({
    obdOdometerMeters: { time: "2026-08-26T12:00:00.000Z", value: 160934.4 },
  }).miles;
  assert.ok(odometerMiles != null && Math.abs(odometerMiles - 100) < 0.01);
  assert.equal(samsara.extractSamsaraOdometerMiles({ gps: { latitude: 35.4, longitude: -97.5 } }).miles, null);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara.ts"), "utf8"), /obdOdometerMeters/);

  const { formatDate, formatDateTime, gpsMotionLabel, loadTouchesToday, shortPlaceLabel } = await import("../lib/format");
  assert.equal(formatDate("2026-08-25"), "08/25/26");
  assert.match(formatDateTime("2026-08-25T16:30:00-04:00"), /08\/25\/26/);
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

  const { motionFromSpeedMph } = await import("../lib/fleet-map-shared");
  assert.equal(motionFromSpeedMph(0), "Parked");
  assert.equal(motionFromSpeedMph(0.4), "Parked");
  assert.equal(motionFromSpeedMph(12), "Moving");

  const driverHome = fs.readFileSync(path.join(process.cwd(), "app/driver/page.tsx"), "utf8");
  assert.match(driverHome, /data-driver-destinations|DriverDestinations/);
  assert.match(driverHome, /Dispatch/);
  assert.match(driverHome, /Fuel/);
  assert.match(driverHome, /Upload/);
  assert.match(driverHome, /BOL/);
  assert.match(driverHome, /Confirmation/);
  const driverLoadPage = fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8");
  assert.match(driverLoadPage, /driverFacingPay/);
  assert.doesNotMatch(driverLoadPage, /formatMoney\(load\.rate\)/);

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

  const dashToday = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
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
    /subtitle=\{\`\$\{load\.origin\} → \$\{load\.destination\}\`\}/,
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
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /Parked|motion/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), />Message</);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-orbcomm-message/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /data-orbcomm-live-note/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fleet-map-view.tsx"), "utf8"), /live Orbcomm did not update/);
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

  const { isDriverUploadKind, DRIVER_UPLOAD_KINDS } = await import("../lib/driver-docs");
  assert.equal(DRIVER_UPLOAD_KINDS.some((item) => item.value === "other"), false);
  assert.equal(isDriverUploadKind("other"), false);
  assert.equal(isDriverUploadKind("pod"), true);
  assert.equal(isDriverUploadKind("fuel_receipt"), true);
  const driverActionsSource = fs.readFileSync(path.join(process.cwd(), "components/driver-load-actions.tsx"), "utf8");
  assert.match(driverActionsSource, /Check In/);
  assert.match(driverActionsSource, /Check Out/);
  assert.doesNotMatch(driverActionsSource, /Unclassified|ATTACHMENT_KINDS/);

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
    .prepare("UPDATE loads SET route_state_miles = ?, pickup_start = ?, delivery_end = ? WHERE id = ?")
    .run(
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

  const { milesBetween, applyGeofenceArrivals, GEOFENCE_MILES } = await import("../lib/geofence");
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
  const keptArrival = stampedFence.arrived_at;
  queries.saveTruckGps(fenceTruckId, {
    latitude: 40.587,
    longitude: -98.39,
    address: "Hastings, NE",
    recordedAt: new Date().toISOString(),
    source: "samsara",
  });
  assert.equal(loadStops.getStop(fenceStopId)?.arrived_at, keptArrival);
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
  const { buildStopsMapModel } = await import("../lib/load-map");
  const fenceMap = await buildStopsMapModel(fenceLoadId);
  assert.ok(fenceMap.points.some((point) => point.kind === "delivery"));
  assert.ok(fenceMap.points.some((point) => point.kind === "truck"));
  assert.ok(fenceMap.path.length >= 2);

  const newLoadPage = fs.readFileSync(path.join(process.cwd(), "app/loads/new/page.tsx"), "utf8");
  assert.match(newLoadPage, /RateConImport/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/assign-dialog.tsx"), "utf8"), /Assign & Dispatch/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-money-box.tsx"), "utf8"), /Customer rate/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /Imported fuel and stored load miles/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /maps\.google\.com/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /LoadTiedFuelReceipts/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/ifta/page.tsx"), "utf8"), /FuelMatchQueue/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8"), /data-email-ingest/);
  assert.match(workspaceSource, /WhatsApp load/);
  assert.match(workspaceSource, /Send WhatsApp/);
  assert.match(workspaceSource, /Send text/);
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

  const { proposeMikeWork } = await import("../lib/mike-work");
  const detentionWork = proposeMikeWork(`Draft detention email for ${created.load_number}`);
  assert.ok(detentionWork.proposals.some((item) => item.kind === "detention_email"));

  const previousWhatsApp = process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.META_WHATSAPP_TOKEN;
  delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const whatsapp = await import("../lib/integrations/whatsapp");
  const { WHATSAPP_MISSING } = await import("../lib/whatsapp-shared");
  assert.equal(whatsapp.whatsappConfigured(), false);
  await assert.rejects(
    () => whatsapp.sendWhatsAppMessage({ to: "(312) 555-0148", body: "Load" }),
    (error: unknown) => {
      assert.equal(error instanceof Error && error.message, WHATSAPP_MISSING);
      return true;
    },
  );
  if (previousWhatsApp == null) delete process.env.TWILIO_WHATSAPP_FROM;
  else process.env.TWILIO_WHATSAPP_FROM = previousWhatsApp;

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
