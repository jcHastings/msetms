/**
 * Viewer can open the same read screens as an administrator, and every office
 * write action or API write route rejects the role. New exports fail this file
 * until they are allowlisted (self-service or read) or guarded.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-viewer-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SCRIPT_ACTOR_ROLE = "viewer";

const ROOT = process.cwd();

const SELF_SERVICE = new Set([
  "dispatcherLoginAction",
  "dispatcherLogoutAction",
  "forgotDispatcherPasswordAction",
  "resetDispatcherPasswordAction",
  "changeOwnPasswordAction",
  "updateOwnContactAction",
  "startTotpEnrollmentAction",
  "cancelTotpEnrollmentAction",
  "confirmTotpEnrollmentAction",
  "markOfficeNotificationReadAction",
  "markAllOfficeNotificationsReadAction",
  "askMikeAction",
  "searchLoadsAction",
  "searchLocationsAction",
  "searchPlacesAction",
  "placeDetailsAction",
  "driverLoginAction",
  "driverLogoutAction",
]);

const ACTION_FILES = [
  "lib/actions.ts",
  "lib/dispatcher-actions.ts",
  "lib/settings-actions.ts",
  "lib/mike-actions.ts",
  "lib/location-verify-actions.ts",
  "lib/search-actions.ts",
  "lib/places-actions.ts",
  "lib/dispatcher-password-actions.ts",
  "lib/driver-actions.ts",
  "lib/settlement-actions.ts",
];

const GUARD =
  /requireWriteRole\(|requireCapability\(|requireLoadEditor\(|requireLoadAssigner\(|requireSettingsEditor\(|requireUserAdmin\(|requireLocationEditor\(|requireDriver\(/;

type ActionMod = Record<string, unknown>;

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exportedAsyncFns(source: string): string[] {
  return [...source.matchAll(/export async function (\w+)/g)].map((match) => match[1]);
}

function functionBody(source: string, name: string): string {
  const token = `export async function ${name}`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\nexport ", start + token.length);
  return source.slice(start, next === -1 ? undefined : next);
}

function sameFileCallees(body: string): string[] {
  return [...body.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\(/g)].map((match) => match[1]);
}

function isViewOnlyResult(value: unknown): boolean {
  if (value instanceof Error) return /View-only access/.test(value.message);
  if (value && typeof value === "object" && "ok" in value) {
    const result = value as { ok?: boolean; error?: string };
    return result.ok === false && /View-only access/.test(String(result.error ?? ""));
  }
  return false;
}

function isDriverRejection(value: unknown): boolean {
  if (value instanceof Error) return value.message.length > 0;
  if (value && typeof value === "object" && "ok" in value) {
    return (value as { ok?: boolean }).ok === false;
  }
  return false;
}

async function callAction(fn: unknown): Promise<unknown> {
  const form = new FormData();
  return await (fn as (formData: FormData) => Promise<unknown>)(form);
}

function walkRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkRouteFiles(full));
    else if (entry.name === "route.ts") found.push(path.relative(ROOT, full));
  }
  return found;
}

function writeMethods(source: string): string[] {
  return [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)/g)].map((match) => match[1]);
}

async function assertOfficeWriteResponse(response: Response, label: string): Promise<void> {
  const text = await response.text();
  assert.ok(response.status === 403 || response.status === 401, `${label} status ${response.status} ${text}`);
  assert.match(text, /View-only access/, label);
}

async function main(): Promise<void> {
  const settings = await import("../lib/settings-shared");
  assert.equal(settings.canWrite("viewer"), false);
  assert.equal(settings.canWrite("read_only"), false);
  assert.equal(settings.canWrite("admin"), true);
  assert.equal(settings.canWrite("manager"), true);
  assert.equal(settings.canWrite("dispatcher"), true);
  assert.equal(settings.canWrite("accounting"), true);
  assert.equal(settings.isViewerRole("viewer"), true);
  assert.equal(settings.canViewLoadFinancials("viewer"), true);
  assert.equal(settings.canViewLoadFinancials("read_only"), false);
  assert.equal(settings.canViewLoadFinancials("dispatcher"), true);
  assert.equal(settings.canEditLoads("viewer"), false);
  assert.equal(settings.canEditFleet("viewer"), false);
  assert.equal(settings.canViewFleet("viewer"), true);
  assert.equal(settings.canUploadFuel("viewer"), false);
  assert.equal(settings.canViewFuel("viewer"), true);
  assert.equal(settings.canUploadPaystubs("viewer"), false);
  assert.equal(settings.canUploadPaystubs("read_only"), false);
  assert.equal(settings.canUploadPaystubs("admin"), true);
  assert.equal(settings.canUploadPaystubs("dispatcher"), true);
  assert.equal(settings.canUploadPaystubs("accounting"), true);
  assert.equal(settings.canViewPaystubs("viewer"), true);
  assert.equal(settings.canViewPaystubs("dispatcher"), true);
  assert.equal(settings.canSeeNavHref("dispatcher", "/paystubs"), true);
  assert.equal(settings.canSeeNavHref("accounting", "/paystubs"), true);
  assert.equal(settings.canSeeNavHref("viewer", "/paystubs"), true);
  assert.equal(settings.canAccessAccounting("viewer"), false);
  assert.equal(settings.canViewAccounting("viewer"), true);
  assert.equal(settings.canViewReports("viewer"), true);
  assert.equal(settings.canViewReports("dispatcher"), false);
  assert.equal(settings.canViewAudit("viewer"), true);
  assert.equal(settings.canViewAudit("accounting"), true);
  assert.equal(settings.canViewAudit("dispatcher"), false);
  assert.equal(settings.canViewIfta("viewer"), true);
  assert.equal(settings.canViewClaims("viewer"), true);
  assert.equal(settings.canEditSettings("viewer"), false);
  assert.equal(settings.canManageUsers("viewer"), false);
  assert.equal(settings.canSendSms("viewer"), false);
  assert.equal(settings.canEmailInvoice("viewer"), false);
  assert.equal(settings.canConnectQuickbooks("viewer"), false);
  assert.equal(settings.roleLabel("viewer"), "Viewer");
  assert.equal(
    settings.selectableDispatcherRoles().some(
      (role) => role.value === "viewer" && role.label === "Viewer (see everything, change nothing)",
    ),
    true,
  );
  assert.equal(
    settings.selectableDispatcherRoles("dispatcher").some((role) => role.value === "read_only"),
    false,
  );
  assert.equal(
    settings.selectableDispatcherRoles("read_only").some((role) => role.value === "read_only"),
    true,
  );
  assert.equal(settings.selectableDispatcherRoles("viewer").some((role) => role.value === "viewer"), true);

  const navHrefs = [...read("components/nav-links.tsx").matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);
  const hiddenFromViewer = new Set(["/settings", "/users", "/settings/sign-in", "/loads/import-sheet"]);
  assert.ok(navHrefs.length >= 20, "nav hrefs");
  for (const href of navHrefs) {
    assert.equal(settings.canSeeNavHref("admin", href), true, `admin nav ${href}`);
    if (hiddenFromViewer.has(href)) {
      assert.equal(settings.canSeeNavHref("viewer", href), false, `viewer hides ${href}`);
    } else {
      assert.equal(settings.canSeeNavHref("viewer", href), true, `viewer nav ${href}`);
    }
  }
  assert.equal(settings.canSeeNavHref("viewer", "/settings/security"), true);
  assert.equal(settings.canSeeNavHref("viewer", "/settings/integrations"), false);
  assert.equal(settings.canSeeNavHref("viewer", "/settings/quickbooks"), false);
  assert.equal(settings.canSeeNavHref("read_only", "/fleet"), false);
  assert.equal(settings.canSeeNavHref("read_only", "/accounting"), false);
  assert.equal(settings.canSeeNavHref("read_only", "/reports"), false);
  assert.equal(settings.canSeeNavHref("dispatcher", "/ifta"), true);
  assert.equal(settings.canSeeNavHref("accounting", "/accounting"), true);
  assert.equal(settings.canExportCsv("viewer"), true);
  assert.equal(settings.canExportCsv("admin"), true);
  assert.equal(settings.canExportCsv("dispatcher"), false);
  assert.equal(settings.canSeeNavHref("viewer", "/loads/import"), false);
  assert.match(read("components/load-search.tsx"), /data-view-only-allow/);
  assert.match(read("app/reports/page.tsx"), /data-view-only-allow/);
  assert.match(read("components/board-toolbar.tsx"), /data-view-only-allow/);
  assert.match(read("components/view-only-guard.tsx"), /textarea/);
  assert.match(read("components/view-only-guard.tsx"), /HTMLInputElement/);
  assert.match(read("components/load-rate-fields.tsx"), /disabled=\{readOnly\}/);
  assert.match(read("components/load-workspace.tsx"), /!readOnly && \(create \|\| isSaveTab\(tab\)\)/);
  assert.match(read("components/exception-issue-line.tsx"), /disabled=\{readOnly\}/);
  assert.match(read("app/desk/page.tsx"), /readOnly=\{!canWrite\(dispatcher\.role\)\}/);

  const readGates: Array<[string, RegExp]> = [
    ["app/fleet/layout.tsx", /canViewFleet/],
    ["app/safety/page.tsx", /canViewFleet/],
    ["app/compliance/page.tsx", /canViewFleet/],
    ["app/fuel/page.tsx", /canViewFuel/],
    ["app/paystubs/page.tsx", /canViewPaystubs/],
    ["app/tolls/page.tsx", /canViewFuel/],
    ["app/accounting/layout.tsx", /canViewAccounting/],
    ["app/claims/layout.tsx", /canViewClaims/],
    ["app/reports/page.tsx", /canViewReports/],
    ["app/audit/page.tsx", /canViewAudit/],
    ["app/ifta/page.tsx", /canSeeNavHref/],
    ["app/users/layout.tsx", /canManageUsers/],
    ["components/settings-admin-gate.tsx", /canEditSettings/],
  ];
  for (const [file, pattern] of readGates) {
    assert.match(read(file), pattern, file);
  }
  assert.match(read("app/loads/[id]/page.tsx"), /getSignedInDispatcher/);
  assert.doesNotMatch(read("app/loads/[id]/page.tsx"), /AccessDenied/);
  assert.match(read("lib/load-tabs.ts"), /canViewLoadFinancials/);
  assert.match(read("components/load-status-select.tsx"), /View-only access/);
  assert.match(read("components/load-status-select.tsx"), /aria-disabled/);
  assert.match(read("app/settings/page.tsx"), /isViewerRole/);
  assert.match(read("app/settings/layout.tsx"), /redirect\("\/settings\/security"\)/);
  assert.match(read("components/settings-access.tsx"), /redirect\("\/settings\/security"\)/);
  assert.match(read("components/dispatcher-user-form.tsx"), /selectableDispatcherRoles/);

  const modules: Array<{ file: string; mod: ActionMod; source: string }> = [];
  for (const file of ACTION_FILES) {
    modules.push({ file, source: read(file), mod: (await import(`../${file.replace(/\.ts$/, "")}`)) as ActionMod });
  }

  const bodies = new Map<string, string>();
  for (const entry of modules) {
    for (const name of exportedAsyncFns(entry.source)) {
      assert.equal(typeof entry.mod[name], "function", `${entry.file} ${name}`);
      bodies.set(name, functionBody(entry.source, name));
    }
  }

  const failures: string[] = [];
  const rejected = new Set<string>();
  const driverRejected = new Set<string>();
  const wrappers = new Map<string, string>();
  let officeWriteCount = 0;

  for (const [name, body] of bodies) {
    if (SELF_SERVICE.has(name)) continue;
    const fn = modules.flatMap((entry) => (typeof entry.mod[name] === "function" ? [entry.mod[name]] : []))[0];
    assert.equal(typeof fn, "function", name);
    const driverAuth = /requireDriver\(/.test(body);
    let outcome: unknown;
    try {
      outcome = await callAction(fn);
    } catch (error) {
      outcome = error;
    }
    if (driverAuth) {
      assert.equal(isDriverRejection(outcome), true, `${name} should reject an office viewer`);
      assert.notEqual((outcome as { ok?: boolean })?.ok, true, name);
      driverRejected.add(name);
      continue;
    }
    if (isViewOnlyResult(outcome)) {
      rejected.add(name);
      officeWriteCount += 1;
      const guarded =
        GUARD.test(body) || sameFileCallees(body).some((callee) => callee !== name && GUARD.test(bodies.get(callee) ?? ""));
      assert.equal(guarded, true, `${name} rejected viewer without a write guard`);
      continue;
    }
    if (outcome === undefined) {
      wrappers.set(name, body);
      continue;
    }
    const detail = outcome instanceof Error ? outcome.message : JSON.stringify(outcome);
    console.error(`NOT_REJECTED ${name}: ${detail}`);
    failures.push(name);
  }
  if (failures.length) {
    assert.fail(`${failures.length} actions were not rejected for viewer: ${failures.join(", ")}`);
  }

  for (const [name, body] of wrappers) {
    const callsRejected = sameFileCallees(body).some((callee) => rejected.has(callee));
    assert.equal(callsRejected, true, `${name} returns without rejecting viewer itself`);
    officeWriteCount += 1;
  }

  const viewerBlockedWrites = [
    "updateLoadAction",
    "addPayItemAction",
    "updateCustomerAction",
    "deleteCustomerAction",
    "updateDriverAction",
    "closeDriverPayPeriodAction",
    "updateLocationAction",
    "parseRateConAction",
    "attachFleetDocAction",
    "importFuelCsvAction",
    "saveHandoffAction",
    "updateLoadStatusAction",
  ];
  for (const name of viewerBlockedWrites) {
    assert.equal(rejected.has(name), true, `${name} must reject viewer`);
  }
  const searchMod = modules.find((entry) => entry.file === "lib/search-actions.ts");
  const searchHits = await (searchMod?.mod.searchLoadsAction as (criteria: object) => Promise<unknown>)({
    q: "",
    originState: "",
    destState: "",
    dateFrom: "",
    dateTo: "",
    searchBy: "pickup",
    customerId: null,
    driverId: null,
    truckId: null,
    trailerId: null,
    status: "",
    includeLive: true,
    includeArchived: false,
    includeCancelled: false,
  });
  assert.equal(Array.isArray(searchHits), true);
  const locationHits = await (searchMod?.mod.searchLocationsAction as (query: string) => Promise<unknown>)("a");
  assert.equal(Array.isArray(locationHits), true);

  const safety = await import("../lib/safety");
  const desk = await import("../lib/desk");
  const emptyOnTime = desk.onTimeFromRows([]);
  assert.equal(emptyOnTime.onTimePct, null);
  assert.equal(desk.formatOnTimePct(null), "—");
  const mixedOnTime = desk.onTimeFromRows([{ onTime: false }, { onTime: false }, { onTime: true }, { onTime: false }]);
  assert.equal(mixedOnTime.delivered, 4);
  assert.equal(mixedOnTime.late, 3);
  assert.equal(mixedOnTime.onTimePct, 25);
  const board = safety.buildSafetyBoard({
    drivers: [
      {
        id: 9,
        name: "Pat Driver",
        samsara_driver_id: "",
        driver_type: "company",
        license_expires: "",
        medical_issued: "",
        medical_expires: "",
        drug_test_last: "",
        drug_test_next: "",
      } as import("../lib/types").Driver,
    ],
    windowDays: 30,
    insurance: { provider: "", policy: "", expires: "" },
    tokenSet: true,
    hos: [
      {
        driverId: null,
        loadId: null,
        samsaraDriverId: "sam-9",
        driverName: "Pat Driver",
        dutyStatus: "driving",
        driveRemainingMs: 3_600_000,
        shiftRemainingMs: 3_600_000,
        cycleRemainingMs: 3_600_000,
        timeUntilBreakMs: 3_600_000,
        recordedAt: "2026-10-05T12:00:00.000Z",
        source: "samsara",
      },
    ],
    truckDrivers: [],
  });
  assert.equal(board.rows[0]?.hos.includes("No Samsara id"), false);
  assert.match(board.rows[0]?.hos ?? "", /remaining/);

  assert.ok(officeWriteCount >= 100, `expected the office write walk to cover the action surface, got ${officeWriteCount}`);
  assert.ok(driverRejected.size >= 5, "driver write actions");

  const officeWriteRoutes = new Set([
    "app/api/fuel/import/route.ts",
    "app/api/loads/[id]/documents/route.ts",
    "app/api/loads/[id]/invoice/route.ts",
    "app/api/tolls/import/route.ts",
    "app/api/tolls/pull/route.ts",
    "app/api/integrations/quickbooks/connect/route.ts",
    "app/api/integrations/quickbooks/callback/route.ts",
    "app/api/paystubs/preview/route.ts",
    "app/api/paystubs/commit/route.ts",
  ]);
  const allowedWriteRoutes = new Set([
    "app/api/mike/route.ts",
    "app/api/integrations/samsara/webhook/route.ts",
    "app/api/driver/v1/auth/login/route.ts",
    "app/api/driver/v1/auth/logout/route.ts",
    "app/api/paystubs/upload/route.ts",
  ]);

  const routeFiles = walkRouteFiles(path.join(ROOT, "app/api"));
  let apiWriteCount = 0;
  for (const file of routeFiles) {
    const source = read(file);
    const writes = writeMethods(source);
    const mutatingGet =
      file.endsWith("app/api/integrations/quickbooks/connect/route.ts") ||
      file.endsWith("app/api/integrations/quickbooks/callback/route.ts");
    if (writes.length === 0 && !mutatingGet) continue;
    const listed = officeWriteRoutes.has(file) || allowedWriteRoutes.has(file) || file.includes("app/api/driver/v1/");
    assert.equal(listed, true, `new write route is not classified: ${file}`);
  }

  const fuel = await import("../app/api/fuel/import/route");
  await assertOfficeWriteResponse(
    await fuel.POST(new Request("http://localhost/api/fuel/import", { method: "POST" })),
    "fuel import",
  );
  apiWriteCount += 1;

  const tollImport = await import("../app/api/tolls/import/route");
  await assertOfficeWriteResponse(
    await tollImport.POST(new Request("http://localhost/api/tolls/import", { method: "POST" })),
    "tolls import",
  );
  apiWriteCount += 1;

  const tollPull = await import("../app/api/tolls/pull/route");
  await assertOfficeWriteResponse(await tollPull.POST(), "tolls pull");
  apiWriteCount += 1;

  const documents = await import("../app/api/loads/[id]/documents/route");
  await assertOfficeWriteResponse(
    await documents.POST(new Request("http://localhost/api/loads/1/documents", { method: "POST" }), {
      params: Promise.resolve({ id: "1" }),
    }),
    "load documents",
  );
  apiWriteCount += 1;

  const invoice = await import("../app/api/loads/[id]/invoice/route");
  await assertOfficeWriteResponse(
    await invoice.POST(new Request("http://localhost/api/loads/1/invoice", { method: "POST" }), {
      params: Promise.resolve({ id: "1" }),
    }),
    "invoice create",
  );
  apiWriteCount += 1;

  const qboConnect = await import("../app/api/integrations/quickbooks/connect/route");
  await assertOfficeWriteResponse(
    await qboConnect.GET(new Request("http://localhost/api/integrations/quickbooks/connect")),
    "quickbooks connect",
  );
  apiWriteCount += 1;

  const qboCallback = await import("../app/api/integrations/quickbooks/callback/route");
  await assertOfficeWriteResponse(
    await qboCallback.GET(new Request("http://localhost/api/integrations/quickbooks/callback")),
    "quickbooks callback",
  );
  apiWriteCount += 1;

  const paystubPreview = await import("../app/api/paystubs/preview/route");
  await assertOfficeWriteResponse(
    await paystubPreview.POST(new Request("http://localhost/api/paystubs/preview", { method: "POST" })),
    "paystub preview",
  );
  apiWriteCount += 1;

  const paystubCommit = await import("../app/api/paystubs/commit/route");
  await assertOfficeWriteResponse(
    await paystubCommit.POST(new Request("http://localhost/api/paystubs/commit", { method: "POST" })),
    "paystub commit",
  );
  apiWriteCount += 1;

  const mike = read("app/api/mike/route.ts");
  assert.match(mike, /writeMikeHistory/);
  assert.doesNotMatch(mike, /requireWriteRole|requireCapability/);
  const webhook = read("app/api/integrations/samsara/webhook/route.ts");
  assert.match(webhook, /x-samsara-signature/);
  assert.doesNotMatch(webhook, /getSignedInDispatcher|canWrite/);

  const driverProgress = await import("../app/api/driver/v1/loads/[id]/progress/route");
  const driverDenied = await driverProgress.POST(new Request("http://localhost/api/driver/v1/loads/1/progress", { method: "POST" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(driverDenied.status, 401);

  console.log(
    `viewer write guard covers ${officeWriteCount} office server actions and ${apiWriteCount} office API write routes (${driverRejected.size} driver actions stay on driver auth)`,
  );
  assert.equal(apiWriteCount, officeWriteRoutes.size);
}

main()
  .then(() => {
    fs.rmSync(dbPath, { force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
