import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitRouteAtPoint, SWAP_OFF_ROUTE_MILES } from "../lib/routing-shared";
import {
  detentionLegPay,
  fuelSurchargeLegPay,
  linehaulLegPay,
  loadedLegShare,
  lumperPassThrough,
  payWithStoredPercent,
  settlementHasDoublePay,
} from "../lib/relay-pay";

const dbPath = path.join(os.tmpdir(), `tms-relay-swap-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.TMS_SCRIPT_ACTOR_ROLE;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

const WEEK = "2026-09-21";
const NEXT_WEEK = "2026-09-28";

function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let lastLat = 0;
  let lastLng = 0;
  let encoded = "";
  const write = (value: number) => {
    let shifted = value < 0 ? ~(value << 1) : value << 1;
    while (shifted >= 0x20) {
      encoded += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
      shifted >>= 5;
    }
    encoded += String.fromCharCode(shifted + 63);
  };
  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    write(lat - lastLat);
    write(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return encoded;
}

function throwsMessage(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, pattern);
    return true;
  });
}

const neRoute = [
  { lat: 41.2, lng: -102.5 },
  { lat: 41.2, lng: -98 },
];
const ilRoute = [
  { lat: 40.1, lng: -89.6 },
  { lat: 40.1, lng: -88.6 },
];
const kearney = { lat: 41.2, lng: -100.25 };
const ilMeet = { lat: 40.1, lng: -89.1 };

function assertJcExample(): void {
  const share = loadedLegShare(3000, 1000, 500);
  assert.equal(share, 1500);
  assert.equal(payWithStoredPercent(share, 85), 1275);
  assert.equal(payWithStoredPercent(share, 75), 1125);
  assert.equal(payWithStoredPercent(share, null), null);
  assert.equal(
    linehaulLegPay({ rate: 3000, totalMiles: 1000, legMiles: 500, driverType: "owner_operator", storedPercent: 85 }).pay,
    1275,
  );
  assert.equal(
    linehaulLegPay({ rate: 3000, totalMiles: 1000, legMiles: 500, driverType: "owner_operator", storedPercent: 75 }).pay,
    1125,
  );
  assert.equal(
    linehaulLegPay({ rate: 3000, totalMiles: 1000, legMiles: 500, driverType: "owner_operator", storedPercent: null }).pay,
    null,
  );
  assert.equal(
    linehaulLegPay({ rate: 3000, totalMiles: 1000, legMiles: 500, driverType: "company_driver", storedPercent: 85 }).pay,
    null,
  );
  assert.equal(
    fuelSurchargeLegPay({ fscAmount: 200, totalMiles: 1000, legMiles: 500, driverType: "owner_operator", storedPercent: 85 }),
    85,
  );
  assert.equal(
    fuelSurchargeLegPay({ fscAmount: 200, totalMiles: 1000, legMiles: 500, driverType: "owner_operator", storedPercent: 75 }),
    75,
  );
  assert.equal(
    fuelSurchargeLegPay({ fscAmount: 200, totalMiles: 1000, legMiles: 500, driverType: "company_driver", storedPercent: null }),
    null,
  );
  assert.equal(detentionLegPay({ amount: 80, driverType: "owner_operator", happenedOnLeg: true }), 80);
  assert.equal(detentionLegPay({ amount: 80, driverType: "owner_operator", happenedOnLeg: false }), null);
  assert.equal(detentionLegPay({ amount: 80, driverType: "company_driver", happenedOnLeg: true }), null);
  assert.equal(lumperPassThrough({ amount: 50, assignedToDriver: true }), 50);
  assert.equal(lumperPassThrough({ amount: 50, assignedToDriver: false }), null);
  assert.equal(settlementHasDoublePay([{ loadId: 1, leg: "" }, { loadId: 1, leg: "1" }]), true);
  assert.equal(settlementHasDoublePay([{ loadId: 1, leg: "1" }, { loadId: 2, leg: "2" }]), false);
  const source = fs.readFileSync(path.join(process.cwd(), "lib/relay-pay.ts"), "utf8");
  assert.equal(/\b75\b|\b85\b|defaultOo/.test(source), false);
}

function assertPolylineSplit(): void {
  const onRoute = splitRouteAtPoint(neRoute, kearney, 1000);
  assert.ok(onRoute);
  assert.equal(onRoute.fromMiles, 500);
  assert.equal(onRoute.toMiles, 500);
  assert.equal(onRoute.offRoute, false);
  assert.ok(onRoute.offsetMiles <= SWAP_OFF_ROUTE_MILES);
  const offRoute = splitRouteAtPoint(neRoute, { lat: kearney.lat + 0.2, lng: kearney.lng }, 1000);
  assert.ok(offRoute);
  assert.equal(offRoute.offRoute, true);
  assert.ok(offRoute.offsetMiles > SWAP_OFF_ROUTE_MILES);
  assert.equal(offRoute.fromMiles + offRoute.toMiles, 1000);
}

async function main() {
  assertJcExample();
  assertPolylineSplit();

  const queries = await import("../lib/queries");
  const payItems = await import("../lib/pay-items");
  const swaps = await import("../lib/load-swap");
  const statements = await import("../lib/settlement-statement");
  const db = await import("../lib/db");
  const settings = await import("../lib/settings");
  const relayStore = await import("../lib/relay-store");
  const relayRouting = await import("../lib/relay-routing");
  const invoice = await import("../lib/invoice");
  const confirmation = await import("../lib/load-confirmation");
  const driverLeg = await import("../lib/driver-leg");
  const fuel = await import("../lib/fuel-mpg");
  const ifta = await import("../lib/ifta-quarter");
  const pdf = await import("../lib/settlement-statement-pdf");
  const { extractText } = await import("unpdf");

  const contact = settings.getCompanySettings();
  settings.updateCompanyContact({
    ...contact,
    company_name: "MS Express",
    dispatcher_phone: "402-302-0097",
    city: "Hastings",
    state: "NE",
    usdot: "3062879",
    mc: "056299",
    ar_email: "ar@msloads.com",
  });

  const customerId = queries.createCustomer({ name: "Swap Yard", billing_notes: "", contacts: [] });
  const steveTruck = queries.createTruck({ unit_number: "ST-85", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const jordanTruck = queries.createTruck({ unit_number: "CD-1", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const chrisTruck = queries.createTruck({ unit_number: "CH-75", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const patTruck = queries.createTruck({ unit_number: "PT-1", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const noneTruck = queries.createTruck({ unit_number: "NP-1", type: "dry_van", capacity_lbs: 44000, status: "available" });
  const trailer = (unit: string) => queries.createTrailer({ unit_number: unit, type: "reefer", status: "available" });
  const trailers = {
    a: trailer("T-A"),
    b: trailer("T-B"),
    d: trailer("T-D"),
    e: trailer("T-E"),
    g: trailer("T-G"),
    h: trailer("T-H"),
    paid: trailer("T-PAID"),
    partner: trailer("T-PART"),
  };

  const steveId = queries.createDriver({
    name: "Steve Eller",
    phone: "555-0185",
    license: "NE-SWAP-STEVE",
    driver_type: "owner_operator",
    company_name: "3K3B Trucking LLC",
    pay_percent: 85,
    truck_id: steveTruck,
    status: "available",
  });
  const chrisId = queries.createDriver({
    name: "Chris Ceferino",
    phone: "555-0175",
    license: "NE-SWAP-CHRIS",
    driver_type: "owner_operator",
    company_name: "Lumig Transports LLC",
    pay_percent: 75,
    truck_id: chrisTruck,
    status: "available",
  });
  const jordanId = queries.createDriver({
    name: "Jordan Hale",
    phone: "555-0100",
    license: "NE-SWAP-JORDAN",
    driver_type: "company_driver",
    truck_id: jordanTruck,
    status: "available",
  });
  const noneId = queries.createDriver({
    name: "No Percent",
    phone: "555-0101",
    license: "NE-SWAP-NONE",
    driver_type: "owner_operator",
    company_name: "No Default LLC",
    pay_percent: null,
    truck_id: noneTruck,
    status: "available",
  });
  const patId = queries.createDriver({
    name: "Pat Paid",
    phone: "555-0102",
    license: "NE-SWAP-PAT",
    driver_type: "owner_operator",
    company_name: "Already Paid LLC",
    pay_percent: 80,
    truck_id: patTruck,
    status: "available",
  });

  function loadInput(
    driverId: number,
    truckId: number,
    trailerId: number,
    extra: Record<string, unknown> = {},
  ) {
    return {
      customer_id: customerId,
      origin: "Omaha, NE",
      destination: "Denver, CO",
      pickup_start: "2026-09-21T14:00:00.000Z",
      pickup_end: "2026-09-21T16:00:00.000Z",
      delivery_start: "2026-09-23T14:00:00.000Z",
      delivery_end: "2026-09-23T18:00:00.000Z",
      weight: 20000,
      commodity: "Frozen",
      rate: 3000,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      trailer_id: trailerId,
      status: "delivered",
      truck_id: truckId,
      driver_id: driverId,
      ...extra,
    };
  }

  function saveRoute(loadId: number, points: Array<{ lat: number; lng: number }>) {
    db.getDb()
      .prepare("UPDATE loads SET route_miles = ?, route_polyline = ?, route_source = 'google' WHERE id = ?")
      .run(1000, encodePolyline(points), loadId);
  }

  const loadA = queries.createLoad(
    loadInput(steveId, steveTruck, trailers.a, { load_number: "SWAP-A", trailer_number: "T-A" }),
  );
  const loadB = queries.createLoad(
    loadInput(jordanId, jordanTruck, trailers.b, {
      load_number: "SWAP-B",
      origin: "Chicago, IL",
      destination: "Dallas, TX",
      trailer_number: "T-B",
    }),
  );
  const loadD = queries.createLoad(
    loadInput(jordanId, jordanTruck, trailers.d, {
      load_number: "SWAP-D",
      origin: "Chicago, IL",
      destination: "Dallas, TX",
      trailer_number: "T-D",
    }),
  );
  const loadE = queries.createLoad(
    loadInput(chrisId, chrisTruck, trailers.e, {
      load_number: "SWAP-E",
      rate: 1000,
      trailer_number: "T-E",
    }),
  );
  saveRoute(loadA, neRoute);
  saveRoute(loadB, neRoute);
  saveRoute(loadD, ilRoute);
  saveRoute(loadE, ilRoute);

  const pointA = { address: "Kearney, NE", lat: kearney.lat, lng: kearney.lng };
  const pointB = { address: "Bloomington, IL", lat: ilMeet.lat, lng: ilMeet.lng };
  const swapAt = "2026-09-22T16:00:00.000Z";
  const swapAb = await swaps.createLoadSwap({
    loadAId: loadA,
    loadBId: loadB,
    point: pointA,
    swapAt,
    detentionLegA: "pickup",
    detentionLegB: "delivery",
  });
  const swapDe = await swaps.createLoadSwap({
    loadAId: loadD,
    loadBId: loadE,
    point: pointB,
    swapAt,
  });
  assert.equal(swaps.getLoadSwap(loadA)?.id, swapAb);
  assert.equal(swaps.getLoadSwap(loadA)?.loadBId, loadB);
  assert.equal(swaps.getLoadSwap(loadB)?.id, swapAb);
  assert.notEqual(swapDe, swapAb);

  const legA = swaps.getLoadSwap(loadA)?.legs.find((leg) => leg.loadId === loadA);
  assert.equal(legA?.fromMiles, 500);
  assert.equal(legA?.toMiles, 500);
  assert.equal(legA?.source, "polyline");
  assert.equal(legA?.fromDriverPercent, 85);
  assert.equal(legA?.toDriverPercent, null);

  const afterA = queries.getLoad(loadA);
  const afterB = queries.getLoad(loadB);
  assert.equal(afterA?.driver_id, jordanId);
  assert.equal(afterA?.truck_id, jordanTruck);
  assert.equal(afterA?.trailer_id, trailers.a);
  assert.equal(afterB?.driver_id, steveId);
  assert.equal(afterB?.truck_id, steveTruck);
  assert.equal(afterB?.trailer_id, trailers.b);
  assert.equal(relayStore.listRelays(loadA).length, 1);
  assert.equal(relayStore.listRelays(loadB).length, 1);
  throwsMessage(() => relayStore.deleteRelay(relayStore.listRelays(loadA)[0].id), /Remove the swap/);
  await relayRouting.refreshRelayLegMiles(loadA);
  assert.equal(swaps.getLoadSwap(loadA)?.legs.find((leg) => leg.loadId === loadA)?.fromMiles, 500);

  payItems.addPayItem(loadA, {
    side: "income",
    bill_to: "customer",
    payee: "",
    category: "fuel_surcharge",
    rate: 200,
    qty: 1,
    total: 200,
    notes: "",
  });
  payItems.addPayItem(loadA, {
    side: "expense",
    bill_to: "driver",
    payee: "Steve Eller",
    category: "detention",
    rate: 80,
    qty: 1,
    total: 80,
    notes: "Shipper hold",
    leg: "pickup",
  });
  payItems.addPayItem(loadA, {
    side: "expense",
    bill_to: "driver",
    payee: "Steve Eller",
    category: "lumper",
    rate: 50,
    qty: 1,
    total: 50,
    notes: "",
    leg: "pickup",
  });
  payItems.addPayItem(loadB, {
    side: "expense",
    bill_to: "driver",
    payee: "Chris Ceferino",
    category: "detention",
    rate: 120,
    qty: 1,
    total: 120,
    notes: "Receiver hold",
    leg: "delivery",
  });

  const steve = statements.buildSettlement(steveId, WEEK);
  const chris = statements.buildSettlement(chrisId, WEEK);
  const jordan = statements.buildSettlement(jordanId, WEEK);
  assert.ok(steve && chris && jordan);
  assert.equal(steve.identityBlock, "");
  assert.deepEqual(steve.loads.map((line) => line.loadNumber).sort(), ["SWAP-A", "SWAP-B"]);
  const steveA = steve.loads.find((line) => line.loadNumber === "SWAP-A");
  const steveB = steve.loads.find((line) => line.loadNumber === "SWAP-B");
  assert.equal(steveA?.leg, "1");
  assert.equal(steveA?.legLabel, "Leg 1");
  assert.equal(steveA?.miles, 500);
  assert.equal(steveA?.linehaul, 1275);
  assert.equal(steveA?.ooPercent, 85);
  assert.equal(steveB?.leg, "2");
  assert.equal(steveB?.legLabel, "Leg 2");
  assert.equal(steveB?.miles, 500);
  assert.equal(steveB?.linehaul, 1275);
  assert.equal(steve.extras.find((line) => line.label.startsWith("Fuel surcharge"))?.amount, 85);
  assert.equal(steve.extras.filter((line) => line.label === "Detention").reduce((sum, line) => sum + line.amount, 0), 200);
  assert.equal(steve.extras.find((line) => line.label === "Lumper")?.amount, 50);
  assert.equal(steve.gross, 2885);

  const chrisD = chris.loads.find((line) => line.loadNumber === "SWAP-D");
  const chrisE = chris.loads.find((line) => line.loadNumber === "SWAP-E");
  assert.equal(chrisD?.leg, "2");
  assert.equal(chrisD?.legLabel, "Leg 2");
  assert.equal(chrisD?.miles, 500);
  assert.equal(chrisD?.linehaul, 1125);
  assert.equal(chrisD?.ooPercent, 75);
  assert.equal(chrisE?.leg, "1");
  assert.equal(chrisE?.linehaul, 375);
  assert.equal(chris.extras.length, 0);
  assert.equal(chris.gross, 1500);

  assert.ok(jordan.loads.every((line) => line.linehaul == null && line.leg));
  assert.equal(jordan.extras.some((line) => line.label === "Detention" || line.label === "Lumper"), false);
  assert.equal(jordan.gross, 0);
  assert.equal(JSON.stringify(jordan).includes("3000"), false);
  for (const statement of [steve, chris, jordan]) {
    assert.equal(
      settlementHasDoublePay(statement.loads.map((line) => ({ loadId: line.loadId, leg: line.leg }))),
      false,
    );
    assert.ok(statement.loads.every((line) => line.leg === "1" || line.leg === "2"));
  }

  const billed = invoice.tmsCustomerInvoiceLines(queries.getLoad(loadA)!);
  assert.deepEqual(
    billed.map((line) => line.amount).sort((a, b) => a - b),
    [200, 3000],
  );

  const truckLegsA = swaps.truckLegsForLoad(loadA);
  assert.ok(truckLegsA);
  assert.equal(truckLegsA.find((leg) => leg.truckId === steveTruck)?.miles, 500);
  assert.equal(truckLegsA.find((leg) => leg.truckId === jordanTruck)?.miles, 500);
  assert.ok(truckLegsA.every((leg) => leg.states.some((state) => state.state === "NE")));
  const quarter = ifta.buildIftaQuarterEstimate({ year: 2026, quarter: 3 });
  const truckLoaded = (id: number) => quarter.trucks.find((row) => row.id === id)?.loaded ?? 0;
  assert.equal(truckLoaded(steveTruck), 1000);
  assert.equal(truckLoaded(chrisTruck), 1000);
  assert.equal(truckLoaded(jordanTruck), 2000);
  const ne = quarter.milesByState.find((row) => row.state === "NE");
  const il = quarter.milesByState.find((row) => row.state === "IL");
  assert.ok(ne && ne.loaded >= 1900, `NE miles ${ne?.loaded}`);
  assert.ok(il && il.loaded >= 1900, `IL miles ${il?.loaded}`);

  const mpgLoads = [loadA, loadB, loadD, loadE].map((id) => queries.getLoad(id)!);
  const windowStart = "2026-09-21T00:00:00.000Z";
  const windowEnd = "2026-09-27T23:59:59.000Z";
  assert.equal(fuel.googleMilesForDriverInRange(mpgLoads, steveId, steveTruck, windowStart, windowEnd), 1000);
  assert.equal(fuel.googleMilesForDriverInRange(mpgLoads, chrisId, chrisTruck, windowStart, windowEnd), 1000);
  assert.equal(fuel.googleMilesForDriverInRange(mpgLoads, jordanId, jordanTruck, windowStart, windowEnd), 2000);

  const steveRelay = relayStore.relayForDriver(loadA, steveId);
  const steveView = driverLeg.driverSwapLegView({
    driverId: steveId,
    origin: "Omaha, NE",
    destination: "Denver, CO",
    trailerNumber: "T-A",
    truckUnit: "CD-1",
    relay: steveRelay,
  });
  assert.equal(steveView?.role, "pickup");
  assert.match(steveView?.lane ?? "", /Omaha, NE/);
  assert.match(steveView?.lane ?? "", /Kearney, NE/);
  assert.equal((steveView?.lane ?? "").includes("Denver"), false);
  assert.equal(steveView?.trailer, "T-A");
  assert.equal(steveView?.truck, "ST-85");
  const viewText = JSON.stringify(steveView);
  assert.equal(viewText.includes("%"), false);
  assert.equal(viewText.includes("$"), false);
  assert.equal(/pay|percent|rate/i.test(viewText), false);

  const stevePacket = confirmation.buildConfirmationForLoad(loadA, { packet: "internal", driverId: steveId });
  assert.equal(stevePacket.hidePay, true);
  assert.equal(stevePacket.agreedAmount, null);
  assert.equal(stevePacket.customerRate, null);
  assert.match(stevePacket.internalLegs, /Omaha, NE/);
  assert.match(stevePacket.internalLegs, /Kearney, NE/);
  assert.equal(/Denver|Jordan|Chris|85%|75%|\$3,000|3000/.test(stevePacket.internalLegs), false);
  assert.equal(stevePacket.stops.some((stop) => /Denver/.test(stop.address)), false);
  const chrisPacket = confirmation.buildConfirmationForLoad(loadD, { packet: "internal", driverId: chrisId });
  assert.match(chrisPacket.internalLegs, /Dallas, TX/);
  assert.match(chrisPacket.internalLegs, /Bloomington, IL/);
  assert.equal(/Chicago|Steve|85%|75%|3000/.test(chrisPacket.internalLegs), false);
  assert.equal(chrisPacket.stops.some((stop) => /Chicago/.test(stop.address)), false);
  const customerPacket = confirmation.buildConfirmationForLoad(loadA, { packet: "customer" });
  assert.equal(customerPacket.customerRate, 3200);
  assert.deepEqual(
    customerPacket.customerRateLines.map((line) => line.amount).sort((a, b) => a - b),
    [200, 3000],
  );
  assert.equal(customerPacket.hidePay, undefined);

  const driverPdf = String((await extractText(new Uint8Array(await pdf.renderSettlementPdf(steve, "driver")), { mergePages: true })).text ?? "");
  const officePdf = String((await extractText(new Uint8Array(await pdf.renderSettlementPdf(steve, "office")), { mergePages: true })).text ?? "");
  assert.match(driverPdf, /SWAP-A/);
  assert.match(driverPdf, /Leg 1/);
  assert.equal(driverPdf.includes("85%"), false);
  assert.match(officePdf, /85%/);

  statements.markSettlementRecordPaid(steveId, WEEK);
  db.getDb().prepare("UPDATE loads SET rate = 1 WHERE id = ?").run(loadA);
  db.getDb().prepare("UPDATE load_relays SET from_leg_miles = 100 WHERE load_id = ?").run(loadA);
  const frozen = statements.buildSettlement(steveId, WEEK);
  assert.equal(frozen?.gross, 2885);
  assert.equal(frozen?.loads.find((line) => line.loadNumber === "SWAP-A")?.linehaul, 1275);
  throwsMessage(() => swaps.setSwapLegMiles({ loadId: loadA, fromMiles: 100, toMiles: 900, role: "admin" }), /paid settlement/);
  throwsMessage(() => swaps.deleteLoadSwap(swapAb), /paid settlement/);

  const paidLoad = queries.createLoad(
    loadInput(patId, patTruck, trailers.paid, {
      load_number: "SWAP-PAID",
      rate: 1000,
      oo_pay: 800,
      oo_percent: 80,
    }),
  );
  const partnerLoad = queries.createLoad(
    loadInput(jordanId, jordanTruck, trailers.partner, { load_number: "SWAP-PARTNER", rate: 1000 }),
  );
  db.getDb()
    .prepare(
      `INSERT INTO settlement_statements (driver_id, week_start, week_end, paid_at, created_at, snapshot_json)
       VALUES (?, ?, ?, ?, ?, '')`,
    )
    .run(patId, WEEK, "2026-09-27", "2026-09-28T12:00:00.000Z", "2026-09-28T12:00:00.000Z");
  const paidBefore = statements.buildSettlement(patId, WEEK);
  assert.equal(paidBefore?.loads[0]?.linehaul, 800);
  assert.equal(paidBefore?.loads[0]?.leg, "");
  await assert.rejects(
    () => swaps.createLoadSwap({ loadAId: paidLoad, loadBId: partnerLoad, point: pointA, swapAt }),
    /paid settlement/,
  );
  assert.equal(statements.buildSettlement(patId, WEEK)?.loads[0]?.linehaul, 800);
  assert.equal(swaps.loadHasSwap(paidLoad), false);

  const loadG = queries.createLoad(
    loadInput(noneId, noneTruck, trailers.g, {
      load_number: "SWAP-G",
      pickup_start: "2026-09-28T14:00:00.000Z",
      pickup_end: "2026-09-28T16:00:00.000Z",
      delivery_start: "2026-09-29T14:00:00.000Z",
      delivery_end: "2026-09-29T18:00:00.000Z",
    }),
  );
  const loadH = queries.createLoad(
    loadInput(chrisId, chrisTruck, trailers.h, {
      load_number: "SWAP-H",
      origin: "Chicago, IL",
      destination: "Dallas, TX",
      pickup_start: "2026-09-28T14:00:00.000Z",
      pickup_end: "2026-09-28T16:00:00.000Z",
      delivery_start: "2026-09-29T14:00:00.000Z",
      delivery_end: "2026-09-29T18:00:00.000Z",
    }),
  );
  db.getDb().prepare("UPDATE loads SET route_miles = 1000, route_polyline = '' WHERE id IN (?, ?)").run(loadG, loadH);
  const bare = { origin: "Omaha, NE", destination: "Denver, CO", route_miles: null, route_polyline: "" };
  const missing = await swaps.measureSwapLegs(bare, pointA);
  assert.equal(missing.source, "missing");
  assert.equal(missing.fromMiles, null);
  process.env.GOOGLE_MAPS_API_KEY = "synthetic-test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        routes: [{ overview_polyline: { points: encodePolyline(neRoute) }, legs: [{ distance: { value: 804672 } }] }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  try {
    const googled = await swaps.measureSwapLegs(bare, pointA);
    assert.equal(googled.source, "google");
    assert.equal(googled.fromMiles, 500);
    assert.equal(googled.toMiles, 500);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
  }

  await swaps.createLoadSwap({ loadAId: loadG, loadBId: loadH, point: pointA, swapAt: "2026-09-28T18:00:00.000Z" });
  const beforeMiles = statements.buildSettlement(noneId, NEXT_WEEK);
  assert.equal(beforeMiles?.loads[0]?.linehaul, null);
  assert.equal(beforeMiles?.gross, 0);
  throwsMessage(
    () => swaps.setSwapLegMiles({ loadId: loadG, fromMiles: 400, toMiles: 600, role: "dispatcher" }),
    /administrator/,
  );
  swaps.setSwapLegMiles({ loadId: loadG, fromMiles: 400, toMiles: 600, role: "admin" });
  swaps.setSwapLegMiles({ loadId: loadH, fromMiles: 400, toMiles: 600, role: "manager" });
  const noneAfter = statements.buildSettlement(noneId, NEXT_WEEK);
  assert.equal(noneAfter?.loads[0]?.linehaul, null);
  assert.match(noneAfter?.loads[0]?.basis ?? "", /not on file/);
  assert.equal(noneAfter?.gross, 0);
  const chrisNext = statements.buildSettlement(chrisId, NEXT_WEEK);
  assert.equal(chrisNext?.loads.find((line) => line.loadNumber === "SWAP-G")?.linehaul, 1350);
  assert.equal(chrisNext?.loads.find((line) => line.loadNumber === "SWAP-H")?.linehaul, 900);
  assert.equal(swaps.getLoadSwap(loadG)?.legs.find((leg) => leg.loadId === loadG)?.source, "manual");
  await relayRouting.refreshRelayLegMiles(loadG);
  assert.equal(swaps.getLoadSwap(loadG)?.legs.find((leg) => leg.loadId === loadG)?.fromMiles, 400);

  console.log("relay swap tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
