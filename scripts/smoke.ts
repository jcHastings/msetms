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
  assert.match(navSource, /href: "\/loads\/templates"/);
  assert.match(navSource, /href: "\/settings"/);

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
  assert.equal(header.dispatcher_name, "Ana G");
  const coleConfirm = confirmation.buildConfirmationForLoad(coleLoad.id);
  assert.equal(coleConfirm.style, "owner_operator");
  assert.equal(coleConfirm.loadNumber, coleLoad.load_number);
  assert.ok(coleConfirm.agreedAmount != null);
  assert.ok(!["1006149", "1006151"].includes(coleConfirm.loadNumber));
  const colePdf = await confirmation.renderConfirmationPdf(coleConfirm);
  assert.equal(colePdf.subarray(0, 4).toString(), "%PDF");
  const deniseLoad = queries.listLoads({ status: "all" }).find((load) => load.driver_id === denise.id);
  assert.ok(deniseLoad);
  const deniseConfirm = confirmation.buildConfirmationForLoad(deniseLoad.id);
  assert.equal(deniseConfirm.style, "company_driver");
  assert.equal(deniseConfirm.agreedAmount, null);
  assert.equal(deniseConfirm.loadNumber, deniseLoad.load_number);
  const denisePdf = await confirmation.renderConfirmationPdf(deniseConfirm);
  assert.equal(denisePdf.subarray(0, 4).toString(), "%PDF");

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

  const clonedId = queries.cloneLoad(load1042.id);
  const cloned = queries.getLoad(clonedId);
  assert.ok(cloned);
  assert.equal(cloned.status, "available");
  assert.equal(cloned.origin, load1042.origin);
  assert.equal(cloned.destination, load1042.destination);
  assert.equal(cloned.cloned_from_id, load1042.id);
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
  assert.equal(session.authenticateDispatcher(ana.id, "4020").role, "manager");
  assert.throws(() => session.authenticateDispatcher(ana.id, "0000"));

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
  });
  assert.equal(queries.getTruck(truckId)?.vin, "1FTSW21P04EB12345");
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
