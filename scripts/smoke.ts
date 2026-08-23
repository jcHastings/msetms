import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-smoke-${Date.now()}.db`);
process.env.TMS_DB_PATH = dbPath;

async function main() {
  assert.equal(fs.existsSync(path.join(process.cwd(), "SHIPPED.md")), true, "SHIPPED.md checklist");
  const navSource = fs.readFileSync(path.join(process.cwd(), "components/nav-links.tsx"), "utf8");
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
  assert.match(navSource, /href: "\/loads\/templates"/);
  assert.match(navSource, /href: "\/settings"/);
  assert.match(navSource, /href: "\/audit"/);
  assert.match(navSource, /label: "Audit"/);
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
  assert.match(loadPage, /LoadWorkspace/);
  assert.match(loadPage, /searchParams/);
  assert.match(loadPage, /LoadRelaysPanel/);
  assert.match(loadPage, /Relay markers/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-relays-panel.tsx"), "utf8"), /Add relay/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/load-relays-panel.tsx"), "utf8"), /not a billed customer stop/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8"), /\+1 relay|relayLabels/);
  const qboSettingsPage = fs.readFileSync(path.join(process.cwd(), "app/settings/quickbooks/page.tsx"), "utf8");
  assert.match(qboSettingsPage, /Connect QuickBooks/);
  assert.match(qboSettingsPage, /Setup steps/);
  assert.match(qboSettingsPage, /QBO_CLIENT_ID/);
  assert.doesNotMatch(qboSettingsPage, /QBO_CLIENT_SECRET=\w+/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/accounting/quickbooks/page.tsx"), "utf8"), /Needs QBO customer/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/api/integrations/quickbooks/connect/route.ts"), "utf8"), /isQuickbooksOAuthReady/);
  assert.match(fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8"), /QBO_REDIRECT_URI=/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/settings/security/page.tsx"), "utf8"), /2-step verification/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/totp-setup-panel.tsx"), "utf8"), /Set up 2-step/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/totp-setup-panel.tsx"), "utf8"), /Require 2-step for all dispatchers/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /Authenticator code/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/dispatcher-login-form.tsx"), "utf8"), /recovery_code/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/driver/login/page.tsx"), "utf8"), /totp|authenticator/i);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "components/totp-setup-panel.tsx"), "utf8"), /from \"@\/lib\/db\"|from \"@\/lib\/settings\"/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/totp.ts"), "utf8"), /otpauth/);
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/ms-express-logo.png")), true, "default MS Express logo");
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/brand-mark.tsx"), "utf8"), /MS Express TMS/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /BrandMark/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/app-shell.tsx"), "utf8"), /BrandMark/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/load-confirmation.ts"), "utf8"), /companyLogoPath/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8"), /MSE Transport/);
  assert.match(tabSource, /Load Basics/);
  assert.match(tabSource, /Customer Info/);
  assert.match(tabSource, /Carrier \/ Asset Info/);
  assert.match(tabSource, /Edit Stops/);
  assert.match(tabSource, /Financials/);
  const workspaceSource = fs.readFileSync(path.join(process.cwd(), "components/load-workspace.tsx"), "utf8");
  assert.match(workspaceSource, /Back to board/);
  assert.match(workspaceSource, /Load Actions/);
  assert.match(workspaceSource, /Load Log/);
  assert.match(workspaceSource, /Dispatch and Tracking/);
  assert.match(workspaceSource, /Load Documents/);
  assert.match(workspaceSource, /Copy \/ Cancel \/ Archive/);
  assert.match(workspaceSource, /Admin \/ Financials/);
  assert.match(workspaceSource, /Log Check Call/);
  assert.match(workspaceSource, /View Load Log/);
  assert.match(workspaceSource, /Send Text Message/);
  assert.match(workspaceSource, /Text Load Information/);
  assert.match(workspaceSource, /Upload a Document/);
  assert.match(workspaceSource, /Request Documents From Driver/);
  assert.match(workspaceSource, /Send to Accounting/);
  assert.match(workspaceSource, /View Accountability Log/);
  assert.match(workspaceSource, /Copy This Load/);
  assert.match(workspaceSource, /Archive This Load/);
  assert.match(workspaceSource, /Cancel This Load/);
  assert.doesNotMatch(workspaceSource, /AscendTracker/);
  assert.doesNotMatch(workspaceSource, /Search Load Boards/);
  assert.doesNotMatch(workspaceSource, /Customer Portal/);
  assert.match(workspaceSource, /form=\{formId\}/);
  assert.match(workspaceSource, /beforeunload/);
  const docsPage = fs.readFileSync(path.join(process.cwd(), "app/loads/[id]/page.tsx"), "utf8");
  assert.match(docsPage, /AttachmentsPanel/);
  assert.match(docsPage, /when="docs"/);

  const { closeDb, getDb } = await import("../lib/db");
  const queries = await import("../lib/queries");

  getDb();
  const seeded = queries.getDashboardStats();
  assert.ok(seeded.openLoads >= 1, "seed should create open loads");
  assert.ok(seeded.unassignedLoads >= 1, "seed should create unassigned loads");
  assert.ok(seeded.availableTrucks >= 1, "seed should create available trucks");
  assert.ok(queries.listLoads({ status: "in_transit" }).length >= 1, "seed should include in-transit loads");
  assert.ok(queries.listCustomers().length >= 1, "seed should include customers");

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

  const { mirrorIntoStandalone } = await import("../scripts/standalone-link.mjs");
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

  const envExample = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(envExample, /GOOGLE_MAPS_API_KEY=/);
  assert.match(envExample, /GOOGLE_PLACES_API_KEY/);
  assert.match(envExample, /HTTP referrer/);
  const placeSearchSource = fs.readFileSync(path.join(process.cwd(), "components/place-search.tsx"), "utf8");
  assert.match(placeSearchSource, /Add a key to enable search/);
  assert.doesNotMatch(placeSearchSource, /from ["']@\/lib\/places["']/);
  assert.doesNotMatch(placeSearchSource, /from ["']@\/lib\/env["']/);
  for (const file of [
    "components/rate-con-import.tsx",
    "components/rate-con-apply.tsx",
    "components/rate-con-location-review.tsx",
    "components/load-form.tsx",
    "lib/rate-con-shared.ts",
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /from ["']@\/lib\/rate-con["']/, `${file} must not import server rate-con`);
    assert.doesNotMatch(source, /from ["']@\/lib\/(db|env|settings|places)["']/, `${file} must stay client-safe`);
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
  audit.runWithAuditActor({ name: "Ana G", kind: "dispatcher" }, () => {
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
  assert.match(docsPanel, /From rate con/);
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
        row.actor === "Ana G",
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
  const { listDispatcherUsers } = await import("../lib/settings");
  const dispatcher = listDispatcherUsers(false)[0];
  assert.ok(dispatcher);
  audit.runWithAuditActor({ name: "Ana G", kind: "dispatcher" }, () => {
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
  if (!missingKeys.ok) assert.match(missingKeys.error, /Add Twilio keys in \.env/);
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
  audit.runWithAuditActor({ name: "Ana G", kind: "dispatcher" }, () => {
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
  const company = audit.listCompanyAudit({ loadNumber: created.load_number, actor: "Ana G" });
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
  assert.equal(header.dispatcher_name, "Ana G");
  const coleConfirm = confirmation.buildConfirmationForLoad(coleLoad.id);
  assert.equal(coleConfirm.style, "owner_operator");
  assert.equal(coleConfirm.loadNumber, coleLoad.load_number);
  assert.ok(coleConfirm.agreedAmount != null);
  assert.ok(!["1006149", "1006151"].includes(coleConfirm.loadNumber));
  const colePdf = await confirmation.renderConfirmationPdf(coleConfirm);
  assert.equal(colePdf.subarray(0, 4).toString(), "%PDF");
  const { PDFDocument } = await import("pdf-lib");
  const { extractText } = await import("unpdf");
  assert.equal((await PDFDocument.load(colePdf)).getPageCount(), 1, "confirmation must be one page");
  const coleText = String((await extractText(new Uint8Array(colePdf), { mergePages: true })).text ?? "");
  assert.match(coleText, /Rate & Load Confirmation/);
  const deniseLoad =
    queries.listLoads({ status: "all" }).find((load) => load.load_number === "MSE-1045") ??
    queries.listLoads({ status: "all" }).find((load) => load.driver_id === denise.id);
  assert.ok(deniseLoad);
  const deniseConfirm = confirmation.buildConfirmationForLoad(deniseLoad.id);
  assert.equal(deniseConfirm.style, "company_driver");
  assert.equal(deniseConfirm.agreedAmount, null);
  assert.equal(deniseConfirm.loadNumber, deniseLoad.load_number);
  const denisePdf = await confirmation.renderConfirmationPdf(deniseConfirm);
  assert.equal(denisePdf.subarray(0, 4).toString(), "%PDF");
  assert.equal((await PDFDocument.load(denisePdf)).getPageCount(), 1, "company confirmation must be one page");
  const deniseText = String((await extractText(new Uint8Array(denisePdf), { mergePages: true })).text ?? "");
  assert.match(deniseText, /Load Confirmation/);
  assert.doesNotMatch(deniseText, /Rate & Load Confirmation/);
  assert.match(deniseText.replaceAll(/\s+/g, ""), /ana@msloads\.com/);
  assert.match(deniseText, /Mon–Fri 06:00–12:00|Mon-Fri 06:00–12:00|Mon–Fri 06:00-12:00/);
  assert.match(deniseText, /Daily 14:00–22:00|Daily 14:00-22:00/);

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

  const { extraRelayCount, boardRelayLabel, formatRelayLane } = await import("../lib/relays");
  const relayStore = await import("../lib/relay-store");
  assert.equal(extraRelayCount(1, [{ driver_id: 1 }, { driver_id: 2 }]), 1);
  assert.equal(boardRelayLabel(1), "+1 relay");
  assert.equal(formatRelayLane("New York, NY", "Chicago, IL"), "New York, NY → Chicago, IL");
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
  assert.doesNotMatch(customerPacket.dispatchNotes, /Chicago|internal \$900|Relay Bravo/i);
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
  const relaySms = formatLoadSummary(queries.getLoad(relayLoadId)!);
  assert.match(relaySms, /New York, NY → Denver, CO/);
  assert.doesNotMatch(relaySms, /Chicago|internal \$900|Relay Bravo/);
  const relayAudit = audit.listLoadAudit(relayLoadId);
  assert.ok(relayAudit.some((row) => row.action === "relay" && row.actor));
  assert.ok(audit.listLoadLog(relayLoadId).some((row) => row.action === "relay"));
  queries.updateDriverProgress(relayLoadId, relayDriverB, "en_route_pickup");
  assert.equal(queries.getLoad(relayLoadId)?.status, "in_transit");

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
  samsara.resetSamsaraCacheForTests();
  orbcomm.resetOrbcommCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    const failedFleet = await samsara.getSamsaraFleet();
    assert.equal(failedFleet.mode, "demo", "Samsara 401 should fall back to demo GPS/HOS");
    assert.ok(failedFleet.error && /401/.test(failedFleet.error));

    const failedReefer = await orbcomm.getReeferSnapshots();
    assert.equal(failedReefer.mode, "demo", "ORBCOMM 401 should fall back to demo temps");
    assert.ok(failedReefer.error && /401/.test(failedReefer.error));
    const fallbackReading = await orbcomm.getLatestReeferForLoad(reeferLoad.id);
    assert.equal(fallbackReading?.source, "demo");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSamsara == null) delete process.env.SAMSARA_API_TOKEN;
    else process.env.SAMSARA_API_TOKEN = previousSamsara;
    if (previousUser == null) delete process.env.ORBCOMM_USERNAME;
    else process.env.ORBCOMM_USERNAME = previousUser;
    if (previousPass == null) delete process.env.ORBCOMM_PASSWORD;
    else process.env.ORBCOMM_PASSWORD = previousPass;
    samsara.resetSamsaraCacheForTests();
    orbcomm.resetOrbcommCacheForTests();
  }

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
  assert.match(fuelPage, /Unassigned/);
  assert.match(fuelPage, /Per-truck totals/);
  assert.match(fuelPage, /Truck diesel/);
  assert.match(fuelPage, /Reefer diesel|reefer diesel/);
  assert.match(fuelPage, /DEF/);
  assert.match(fuelPage, /Scale/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "components/fuel-rollup-table.tsx"), "utf8"), /FUEL_BUCKETS/);
  assert.match(fuelImportUi, /\/api\/fuel\/template/);
  assert.match(fuelImportUi, /\/api\/fuel\/export/);
  assert.match(fuelImportUi, /NName|Transaction Activity/);
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
    parseEfsFuelText,
    parseFuelCsv,
    parseFuelReport,
    parseFuelWhen,
    renderFuelExportCsv,
    renderFuelTemplate,
    FUEL_CSV_HEADERS,
    FUEL_BUCKETS,
  } = await import("../lib/fuel");
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
  const fuelWhen = new Date();
  const fuelDate = `${fuelWhen.getMonth() + 1}/${fuelWhen.getDate()}/${fuelWhen.getFullYear()}`;
  const fuelCsv = [
    "Date,Time,Driver Name,Driver ID,Unit,Location,Category,Gallons,Price,Total,Card Number",
    `${fuelDate},14:32,Denise Ortega,,112,Memphis TN,Diesel,100,3.499,349.90,****4321`,
    `${fuelDate},15:10,, ,101,Indianapolis,Diesel,80,3.40,272.00,1111`,
    `${fuelDate},16:00,Unknown Driver,,8888,Nowhere,Diesel,40,3.10,124.00,2222`,
    `${fuelDate},14:32,Denise Ortega,,112,Memphis TN,Diesel,100,3.499,349.90,****4321`,
    ",,,,,",
  ].join("\r\n");
  const parsedFuel = parseFuelCsv(fuelCsv);
  assert.equal(parsedFuel.rows.length, 4);
  assert.equal(parsedFuel.skipped, 0);
  const deniseMatch = matchFuelDriver(parsedFuel.rows[0]!, queries.listDrivers(), queries.listTrucks());
  assert.equal(queries.getDriver(deniseMatch.driverId ?? 0)?.name, "Denise Ortega");
  const unitMatch = matchFuelDriver(parsedFuel.rows[1]!, queries.listDrivers(), queries.listTrucks());
  assert.equal(queries.getDriver(unitMatch.driverId ?? 0)?.name, "Priya Shah");
  const unknownMatch = matchFuelDriver(parsedFuel.rows[2]!, queries.listDrivers(), queries.listTrucks());
  assert.equal(unknownMatch.driverId, null);

  const firstFuel = fuelStore.importFuelFromCsv(fuelCsv, "daily.csv");
  assert.equal(firstFuel.created, 2);
  assert.equal(firstFuel.unmatched, 1);
  assert.equal(firstFuel.skipped, 1);
  const secondFuel = fuelStore.importFuelFromCsv(fuelCsv, "daily-again.csv");
  assert.equal(secondFuel.created, 0);
  assert.equal(secondFuel.unmatched, 0);
  assert.equal(secondFuel.skipped, 4);
  const unmatchedFuel = fuelStore.listFuelTransactions({ unmatchedOnly: true });
  assert.equal(unmatchedFuel.length, 1);
  assert.equal(unmatchedFuel[0]?.driver_name_raw, "Unknown Driver");
  const fuelTyrell = queries.listDrivers().find((driver) => driver.name === "Tyrell Brooks");
  assert.ok(fuelTyrell);
  fuelStore.assignFuelTransactionDriver(unmatchedFuel[0]!.id, fuelTyrell.id);
  assert.equal(fuelStore.listFuelTransactions({ unmatchedOnly: true }).length, 0);
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

  const truck32 = queries.createTruck({ unit_number: "32", type: "reefer", capacity_lbs: 44000, status: "available" });
  const truck26 = queries.createTruck({ unit_number: "26", type: "reefer", capacity_lbs: 44000, status: "available" });
  const truck28 = queries.createTruck({ unit_number: "28", type: "dry_van", capacity_lbs: 44000, status: "available" });
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
  const { ACTIVE_LOAD_STATUSES, LOAD_STATUSES, isClosedStatus } = await import("../lib/types");
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
  const defaultStops = loadStops.ensureDefaultStops(clonedId);
  assert.ok(defaultStops.length >= 2);
  loadStops.addStop(clonedId, { kind: "stopoff", name: "Nashville DC", city: "Nashville", state: "TN" });
  assert.equal(loadStops.listStops(clonedId).length, defaultStops.length + 1);

  const templates = await import("../lib/templates");
  const listedTemplates = templates.listTemplates();
  assert.ok(listedTemplates.some((row) => /Heartland/i.test(row.name)));
  const bookedFromTemplate = templates.createLoadFromTemplate(listedTemplates[0].id);
  assert.ok(queries.getLoad(bookedFromTemplate));

  const session = await import("../lib/dispatcher-session");
  const ana = session.listDispatchers().find((row) => row.name === "Ana G");
  assert.ok(ana);
  assert.equal(ana.totp_enrolled, false);
  assert.equal("pin" in ana, false);
  assert.equal("totp_secret" in ana, false);
  assert.equal(session.authenticateDispatcher(ana.id, "4020").role, "manager");
  assert.throws(() => session.authenticateDispatcher(ana.id, "0000"));
  assert.ok(session.parseSessionValue(`${ana.id}.${Date.now()}`));
  assert.equal(session.parseSessionValue(`${ana.id}.${Date.now() - session.DISPATCHER_SESSION_MS - 1}`), null);

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
    assert.match(ooPreview.memo, /customer rate/i);
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
    dispatcher_name: "Ana G",
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
  const jordan = session.listDispatchers().find((row) => row.name === "Jordan Lee");
  assert.ok(jordan);
  assert.equal(jordan.role, "dispatcher");
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
  dispatcherTotp.resetDispatcherTotp(userId, "Ana G");
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
  });
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
