/**
 * Driver download hotfix: confirmation and load-attachment bytes.
 * Scratch DB, two drivers (one assigned). Cookie session and app token.
 */
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-driver-access-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.SESSION_SECRET = "driver-access-hotfix-test-secret";
delete process.env.TMS_SCRIPT_ACTOR_ROLE;
delete process.env.TMS_SCRIPT_DRIVER_ID;

const WHEN = "2026-10-08T15:00:00.000Z";
const WHEN_END = "2026-10-08T18:00:00.000Z";

type Caller =
  | { name: string; mode: "cookie"; cookie: string; assigned: boolean }
  | { name: string; mode: "token"; token: string; assigned: boolean }
  | { name: string; mode: "office"; cookie: string };

type StoredFile = { id: number; kind: string; name: string; marker: string };

function attachmentUrls(id: number): string[] {
  return [`/api/attachments/${id}`, `/api/attachments/${id}?download=1`];
}

function confirmationUrls(loadId: number, otherDriverId: number): string[] {
  return [
    `/api/loads/${loadId}/confirmation`,
    `/api/loads/${loadId}/confirmation?packet=internal`,
    `/api/loads/${loadId}/confirmation?driver=${otherDriverId}`,
    `/api/loads/${loadId}/confirmation?packet=internal&driver=${otherDriverId}`,
  ];
}

async function withCookies<T>(cookieHeader: string, fn: () => Promise<T>): Promise<T> {
  const { RequestCookies } = await import("next/dist/server/web/spec-extension/cookies.js");
  const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external.js");
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external.js");
  const headers = new Headers();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  const jar = new RequestCookies(headers);
  const unit = {
    type: "request" as const,
    phase: "action" as const,
    cookies: jar,
    mutableCookies: jar,
    userspaceMutableCookies: jar,
  };
  return workAsyncStorage.run({ route: "/", incrementalCache: {} }, () => workUnitAsyncStorage.run(unit, fn));
}

async function pdfText(bytes: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const extracted = await extractText(new Uint8Array(bytes), { mergePages: true });
  return String(extracted.text ?? "").replace(/\s+/g, " ");
}

async function main(): Promise<void> {
  if (!("AsyncLocalStorage" in globalThis)) {
    Object.assign(globalThis, { AsyncLocalStorage });
  }
  const queries = await import("../lib/queries");
  const files = await import("../lib/files");
  const driverDocs = await import("../lib/driver-docs");
  const sessionToken = await import("../lib/session-token");
  const driverSession = await import("../lib/driver-session");
  const driverApi = await import("../lib/driver-api");
  const settings = await import("../lib/settings");
  const officeConstants = await import("../lib/dispatcher-session-constants");
  const officeTypes = await import("../lib/dispatcher-session-types");
  const relays = await import("../lib/relay-store");
  const confirmationRoute = await import("../app/api/loads/[id]/confirmation/route");
  const attachmentRoute = await import("../app/api/attachments/[id]/route");
  const driverActions = await import("../lib/driver-actions");
  const driverLoadRoute = await import("../app/api/driver/v1/loads/[id]/route");

  assert.deepEqual(
    [...driverDocs.DRIVER_DOWNLOAD_KINDS],
    [
      "bol",
      "pod",
      "lumper",
      "photo_trailer",
      "photo_product",
      "photo_seals",
      "temp_log",
      "scale_ticket",
      "fuel_receipt",
      "samsara_still",
      "claim",
    ],
    "photos map to photo_trailer, photo_product, and photo_seals",
  );

  const customerId = queries.createCustomer({
    name: "Hotfix Shipper",
    billing_notes: "",
    contacts: [],
  });
  const assignedId = queries.createDriver({
    name: "Assigned Driver",
    phone: "555-2101",
    email: "assigned.driver@msloads.test",
    license: "MS-HOT-A",
    truck_id: null,
    status: "available",
  });
  const otherId = queries.createDriver({
    name: "Other Driver",
    phone: "555-2102",
    email: "other.driver@msloads.test",
    license: "MS-HOT-B",
    truck_id: null,
    status: "available",
  });
  const loadInput = {
    customer_id: customerId,
    origin: "Jackson, MS",
    destination: "Birmingham, AL",
    pickup_start: WHEN,
    pickup_end: WHEN_END,
    delivery_start: WHEN,
    delivery_end: WHEN_END,
    weight: 40000,
    commodity: "Paper",
    rate: 1800,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "RC-SECRET",
    po_number: "PO-SECRET",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "assigned" as const,
    truck_id: null,
  };
  const loadId = queries.createLoad({
    ...loadInput,
    load_number: "MSE-HOT-1",
    driver_id: assignedId,
  });
  const strangerLoadId = queries.createLoad({
    ...loadInput,
    load_number: "MSE-HOT-2",
    driver_id: null,
    status: "available",
  });
  relays.addRelay(loadId, {
    pickup: "ALPHA-YARD",
    delivery: "ALPHA-DOCK",
    driver_id: assignedId,
  });

  function store(load: number, kind: string, name: string, marker: string): StoredFile {
    const saved = files.addAttachment({
      loadId: load,
      kind: kind as "bol",
      originalName: name,
      buffer: Buffer.from(`%PDF-1.4\n${marker}\n`),
      mimeType: "application/pdf",
      uploadedBy: "dispatcher",
    });
    return { id: saved.id, kind, name, marker };
  }

  const allowed: StoredFile[] = driverDocs.DRIVER_DOWNLOAD_KINDS.map((kind) =>
    store(loadId, kind, `${kind}.pdf`, `HOTFIX-ALLOW-${kind}`),
  );
  const denied: StoredFile[] = [
    store(loadId, "rate_con", "rate-con.pdf", "HOTFIX-DENY-rate_con"),
    store(loadId, "invoice", "invoice.pdf", "HOTFIX-DENY-invoice"),
    store(loadId, "carrier_invoice", "carrier-invoice.pdf", "HOTFIX-DENY-carrier_invoice"),
    store(loadId, "unclassified", "needs-type.pdf", "HOTFIX-DENY-unclassified"),
    store(loadId, "other", "MSE-HOT-customer-confirmation.pdf", "HOTFIX-DENY-customer-confirmation"),
    store(loadId, "bol", "MSE-HOT-customer_confirmation.pdf", "HOTFIX-DENY-customer-confirmation-bol"),
    store(loadId, "other", "plain-other.pdf", "HOTFIX-DENY-other"),
    store(loadId, "ifta", "ifta-report.pdf", "HOTFIX-DENY-ifta"),
    store(loadId, "not_a_real_kind", "unknown.pdf", "HOTFIX-DENY-unknown"),
  ];
  const strangerBol = store(strangerLoadId, "bol", "stranger-bol.pdf", "HOTFIX-ALLOW-stranger-bol");

  function driverCookie(driverId: number): string {
    const value = sessionToken.createSignedSessionToken({
      id: driverId,
      issuedAt: Date.now(),
      typ: driverSession.DRIVER_SESSION_TYP,
    });
    return `${driverSession.DRIVER_SESSION_COOKIE}=${value}`;
  }

  const officeUserId = settings.createDispatcherUser({
    name: "Hotfix Office",
    password: "Office1$ab",
    role: "dispatcher",
    email: "hotfix.office@msloads.test",
  });
  const officeCookieValue = sessionToken.createSignedSessionToken({
    id: officeUserId,
    issuedAt: Date.now(),
    typ: officeTypes.DISPATCHER_SESSION_TYP,
  });
  const office: Caller = {
    name: "office",
    mode: "office",
    cookie: `${officeConstants.DISPATCHER_SESSION_COOKIE}=${officeCookieValue}`,
  };
  const drivers: Caller[] = [
    { name: "assigned cookie", mode: "cookie", cookie: driverCookie(assignedId), assigned: true },
    { name: "assigned token", mode: "token", token: driverApi.issueDriverApiToken(assignedId).token, assigned: true },
    { name: "unassigned cookie", mode: "cookie", cookie: driverCookie(otherId), assigned: false },
    { name: "unassigned token", mode: "token", token: driverApi.issueDriverApiToken(otherId).token, assigned: false },
  ];

  async function call(caller: Caller, urlPath: string): Promise<{ status: number; type: string; disposition: string; bytes: Buffer }> {
    const headers = new Headers();
    if (caller.mode === "token") headers.set("Authorization", `Bearer ${caller.token}`);
    const request = new Request(`http://localhost${urlPath}`, { headers });
    const pathname = urlPath.split("?")[0] ?? urlPath;
    const id = pathname.split("/")[3] ?? "";
    const run = () =>
      pathname.includes("/confirmation")
        ? confirmationRoute.GET(request, { params: Promise.resolve({ id }) })
        : attachmentRoute.GET(request, { params: Promise.resolve({ id }) });
    const response = caller.mode === "token" ? await run() : await withCookies(caller.cookie, run);
    return {
      status: response.status,
      type: response.headers.get("content-type") ?? "",
      disposition: response.headers.get("content-disposition") ?? "",
      bytes: Buffer.from(await response.arrayBuffer()),
    };
  }

  const anonConfirmation = await confirmationRoute.GET(
    new Request(`http://localhost/api/loads/${loadId}/confirmation`),
    { params: Promise.resolve({ id: String(loadId) }) },
  );
  assert.equal(anonConfirmation.status, 401);
  const anonAttachment = await attachmentRoute.GET(
    new Request(`http://localhost/api/attachments/${allowed[0]!.id}`),
    { params: Promise.resolve({ id: String(allowed[0]!.id) }) },
  );
  assert.equal(anonAttachment.status, 401);
  const badToken = await call(
    { name: "bad token", mode: "token", token: "drv_not_a_real_token", assigned: false },
    `/api/attachments/${allowed[0]!.id}`,
  );
  assert.equal(badToken.status, 401, "invalid app token stays unauthorized");

  for (const caller of drivers) {
    for (const file of allowed) {
      for (const urlPath of attachmentUrls(file.id)) {
        const res = await call(caller, urlPath);
        const label = `${caller.name} ${file.kind} ${urlPath}`;
        if (caller.assigned) {
          assert.equal(res.status, 200, label);
          assert.match(res.bytes.toString("utf8"), new RegExp(file.marker), label);
          if (urlPath.includes("download=1")) assert.match(res.disposition, /^attachment;/, label);
          else assert.match(res.disposition, /^inline;/, label);
        } else {
          assert.equal(res.status, 404, label);
          assert.doesNotMatch(res.bytes.toString("utf8"), /HOTFIX-/, label);
        }
      }
    }
    for (const file of denied) {
      for (const urlPath of attachmentUrls(file.id)) {
        const res = await call(caller, urlPath);
        const label = `${caller.name} denied ${file.kind} ${file.name} ${urlPath}`;
        assert.equal(res.status, 404, label);
        assert.doesNotMatch(res.bytes.toString("utf8"), /HOTFIX-/, label);
      }
    }
    for (const urlPath of [...confirmationUrls(loadId, otherId), ...confirmationUrls(strangerLoadId, assignedId)]) {
      const res = await call(caller, urlPath);
      const onAssignedLoad = urlPath.includes(`/loads/${loadId}/`);
      const label = `${caller.name} ${urlPath}`;
      if (caller.assigned && onAssignedLoad) {
        assert.equal(res.status, 200, label);
        assert.equal(res.bytes.subarray(0, 4).toString(), "%PDF", label);
        assert.match(res.type, /application\/pdf/, label);
        const text = await pdfText(res.bytes);
        assert.match(text, /Your leg/, label);
        assert.match(text, /ALPHA-YARD/, label);
        assert.match(text, /Driver Confirmation/, label);
        assert.doesNotMatch(text, /Customer Confirmation/, label);
      } else {
        assert.equal(res.status, 404, label);
        assert.notEqual(res.bytes.subarray(0, 4).toString(), "%PDF", label);
      }
    }
    for (const urlPath of attachmentUrls(strangerBol.id)) {
      const res = await call(caller, urlPath);
      const label = `${caller.name} stranger load ${urlPath}`;
      assert.equal(res.status, 404, label);
      assert.doesNotMatch(res.bytes.toString("utf8"), /HOTFIX-/, label);
    }
  }

  for (const file of [...allowed, ...denied, strangerBol]) {
    for (const urlPath of attachmentUrls(file.id)) {
      const res = await call(office, urlPath);
      const label = `office ${file.kind} ${file.name} ${urlPath}`;
      assert.equal(res.status, 200, label);
      assert.match(res.bytes.toString("utf8"), new RegExp(file.marker), label);
    }
  }
  const unassignedToken = drivers.find((caller) => caller.mode === "token" && !caller.assigned);
  assert.ok(unassignedToken && unassignedToken.mode === "token");
  {
    const headers = new Headers({ Authorization: `Bearer ${unassignedToken.token}` });
    const request = new Request(`http://localhost/api/attachments/${denied[0]!.id}`, { headers });
    const response = await withCookies(office.cookie, () =>
      attachmentRoute.GET(request, { params: Promise.resolve({ id: String(denied[0]!.id) }) }),
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, "office cookie still wins over a driver token");
    assert.match(bytes.toString("utf8"), /HOTFIX-DENY-rate_con/);
  }

  for (const urlPath of confirmationUrls(loadId, otherId)) {
    const res = await call(office, urlPath);
    const label = `office ${urlPath}`;
    assert.equal(res.status, 200, label);
    assert.equal(res.bytes.subarray(0, 4).toString(), "%PDF", label);
    const text = await pdfText(res.bytes);
    const internal = urlPath.includes("packet=internal");
    const picksAssigned = urlPath.includes(`driver=${assignedId}`);
    if (!internal) {
      assert.match(text, /Customer Confirmation/, label);
      assert.doesNotMatch(text, /ALPHA-YARD/, label);
    } else if (picksAssigned) {
      assert.match(text, /Your leg/, label);
      assert.match(text, /ALPHA-YARD/, label);
    } else {
      assert.doesNotMatch(text, /Your leg/, label);
      assert.doesNotMatch(text, /ALPHA-YARD/, label);
    }
  }
  const officePicksAssigned = await call(
    office,
    `/api/loads/${loadId}/confirmation?packet=internal&driver=${assignedId}`,
  );
  assert.equal(officePicksAssigned.status, 200, "office still honors ?driver=");
  const officePickedText = await pdfText(officePicksAssigned.bytes);
  assert.match(officePickedText, /Your leg/);
  assert.match(officePickedText, /ALPHA-YARD/);

  for (const urlPath of confirmationUrls(strangerLoadId, assignedId)) {
    const res = await call(office, urlPath);
    const label = `office unassigned load ${urlPath}`;
    assert.equal(res.status, 200, label);
    assert.equal(res.bytes.subarray(0, 4).toString(), "%PDF", label);
  }

  const assignedCaller = drivers.find((caller) => caller.name === "assigned cookie");
  const assignedToken = drivers.find((caller) => caller.name === "assigned token");
  const unassignedCaller = drivers.find((caller) => caller.name === "unassigned cookie");
  assert.ok(assignedCaller && assignedCaller.mode === "cookie");
  assert.ok(assignedToken && assignedToken.mode === "token");
  assert.ok(unassignedCaller && unassignedCaller.mode === "cookie");
  const assignedDriver = queries.getDriver(assignedId);
  assert.ok(assignedDriver);

  function storeAs(kind: string, name: string, marker: string, uploadedBy: string): StoredFile {
    const saved = files.addAttachment({
      loadId,
      kind: kind as "bol",
      originalName: name,
      buffer: Buffer.from(`%PDF-1.4\n${marker}\n`),
      mimeType: "application/pdf",
      uploadedBy,
    });
    return { id: saved.id, kind, name, marker };
  }

  const ownUnclassified = storeAs("unclassified", "own-needs-type.pdf", "HOTFIX-OWN-unclassified", assignedDriver.name);
  const ownBilling = storeAs("carrier_invoice", "own-billing.pdf", "HOTFIX-OWN-carrier_invoice", assignedDriver.name);
  const ownRetype = storeAs("unclassified", "own-retype.pdf", "HOTFIX-OWN-retype", assignedDriver.name);
  const routeSentinel = storeAs("unclassified", "route-needs-type.pdf", "HOTFIX-OWN-sentinel", "driver");
  const officeUnclassified = denied.find((file) => file.kind === "unclassified" && file.name === "needs-type.pdf");
  const officeBilling = denied.find((file) => file.kind === "carrier_invoice");
  assert.ok(officeUnclassified);
  assert.ok(officeBilling);

  for (const file of [ownUnclassified, ownBilling, routeSentinel]) {
    for (const caller of [assignedCaller, assignedToken]) {
      const res = await call(caller, `/api/attachments/${file.id}`);
      const label = `${caller.name} own ${file.kind} ${file.name}`;
      assert.equal(res.status, 200, label);
      assert.match(res.bytes.toString("utf8"), new RegExp(file.marker), label);
    }
    const hidden = await call(unassignedCaller, `/api/attachments/${file.id}`);
    assert.equal(hidden.status, 404, `unassigned own ${file.name}`);
  }
  for (const file of [officeUnclassified, officeBilling]) {
    const res = await call(assignedCaller, `/api/attachments/${file.id}`);
    assert.equal(res.status, 404, `office ${file.kind} stays closed`);
    assert.doesNotMatch(res.bytes.toString("utf8"), /HOTFIX-/, `office ${file.kind}`);
  }

  const pageSource = fs.readFileSync(path.join(process.cwd(), "app/driver/loads/[id]/page.tsx"), "utf8");
  assert.match(pageSource, /driverMaySeeAttachment\(file, driver\)/);
  const visibleIds = files
    .listAttachments(loadId)
    .filter((file) => driverDocs.driverMaySeeAttachment(file, assignedDriver))
    .map((file) => file.id)
    .sort((a, b) => a - b);
  const detailResponse = await driverLoadRoute.GET(
    new Request(`http://localhost/api/driver/v1/loads/${loadId}`, {
      headers: { Authorization: `Bearer ${assignedToken.token}` },
    }),
    { params: Promise.resolve({ id: String(loadId) }) },
  );
  assert.equal(detailResponse.status, 200, "driver load JSON");
  const detail = (await detailResponse.json()) as { attachments: Array<{ id: number }> };
  const jsonIds = detail.attachments.map((file) => file.id).sort((a, b) => a - b);
  assert.deepEqual(jsonIds, visibleIds, "JSON list matches the driver page filter");
  assert.ok(jsonIds.includes(ownUnclassified.id));
  assert.ok(jsonIds.includes(ownBilling.id));
  assert.ok(jsonIds.includes(routeSentinel.id));
  assert.ok(!jsonIds.includes(officeUnclassified.id));
  assert.ok(!jsonIds.includes(officeBilling.id));
  for (const file of files.listAttachments(loadId)) {
    const res = await call(assignedCaller, `/api/attachments/${file.id}`);
    const listed = visibleIds.includes(file.id);
    assert.equal(res.status, listed ? 200 : 404, `${listed ? "listed" : "hidden"} ${file.kind} ${file.original_name}`);
    assert.equal(jsonIds.includes(file.id), listed);
  }

  async function classify(attachmentId: number, kind: string) {
    const form = new FormData();
    form.set("attachment_id", String(attachmentId));
    form.set("kind", kind);
    return withCookies(assignedCaller.cookie, () => driverActions.driverClassifyAction(form));
  }

  function podStamp(): { outcome: string; recorded: string } {
    const load = queries.getLoad(loadId);
    assert.ok(load);
    return { outcome: load.pod_outcome, recorded: load.pod_recorded_at };
  }

  const podBefore = podStamp();
  const blockedRetypes = [
    denied.find((file) => file.kind === "rate_con"),
    denied.find((file) => file.kind === "invoice"),
    denied.find((file) => file.kind === "other" && file.name === "plain-other.pdf"),
    officeUnclassified,
    officeBilling,
  ];
  for (const file of blockedRetypes) {
    assert.ok(file);
    const result = await classify(file.id, "pod");
    assert.equal(result.ok, false, `re-type ${file.kind} ${file.name}`);
    assert.equal(files.getAttachment(file.id)?.kind, file.kind, `kind unchanged ${file.name}`);
  }
  const billingAttempt = await classify(ownUnclassified.id, "carrier_invoice");
  assert.equal(billingAttempt.ok, false, "new kind must be on the download allow-list");
  assert.equal(files.getAttachment(ownUnclassified.id)?.kind, "unclassified");
  const podAfterReject = podStamp();
  assert.equal(podAfterReject.outcome, podBefore.outcome);
  assert.equal(podAfterReject.recorded, podBefore.recorded);

  const retyped = await classify(ownRetype.id, "pod");
  assert.equal(retyped.ok, true, "own unclassified upload can become pod");
  assert.equal(files.getAttachment(ownRetype.id)?.kind, "pod");
  const podAfter = podStamp();
  assert.equal(podAfter.outcome, "photo");
  assert.notEqual(podAfter.recorded, "");
  const opened = await call(assignedCaller, `/api/attachments/${ownRetype.id}`);
  assert.equal(opened.status, 200);

  queries.setDriverActive(assignedId, false);
  const deadSession = await withCookies(assignedCaller.cookie, () => driverSession.getSignedInDriver());
  assert.equal(deadSession, null, "deactivated driver cookie is not a session");
  for (const urlPath of [`/api/attachments/${allowed[0]!.id}`, `/api/loads/${loadId}/confirmation`]) {
    const res = await call(assignedCaller, urlPath);
    assert.ok(res.status === 401 || res.status === 302 || res.status === 303 || res.status === 307, urlPath);
  }
  const deadToken = await call(assignedToken, `/api/attachments/${allowed[0]!.id}`);
  assert.equal(deadToken.status, 401, "deactivated driver app token");
  const deadDetail = await driverLoadRoute.GET(
    new Request(`http://localhost/api/driver/v1/loads/${loadId}`, {
      headers: { Authorization: `Bearer ${assignedToken.token}` },
    }),
    { params: Promise.resolve({ id: String(loadId) }) },
  );
  assert.equal(deadDetail.status, 401, "deactivated driver load JSON");

  console.log("driver access hotfix tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
