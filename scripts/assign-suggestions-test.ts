/**
 * Suggested trucks inside Assign. Ranking is pure: no Samsara calls, no writes,
 * and the same inputs always return the same order.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ASSIGN_SUGGESTION_BUDGET_MS,
  ASSIGN_SUGGESTION_LIMIT,
  fleetWithinBudget,
  pickupPointForSuggestion,
  rankAssignSuggestions,
  type AssignLoadFacts,
} from "../lib/assign-suggestions";
import type { HosClock } from "../lib/integrations/samsara";
import type { Driver, Trailer, TruckWithDriver } from "../lib/types";

const DALLAS = { lat: 32.7767, lng: -96.797 };
const HOUSTON = { lat: 29.7604, lng: -95.3698 };
const NASHVILLE = { lat: 36.1627, lng: -86.7816 };
const NOW = new Date("2026-10-07T15:00:00.000Z");
const DRIVE_7H_40M = 7 * 3_600_000 + 40 * 60_000;

const load: AssignLoadFacts = {
  id: 50,
  origin: "Dallas, TX",
  pickup_start: "2026-10-08T12:00:00.000Z",
  pickup_end: "2026-10-08T14:00:00.000Z",
  delivery_start: "2026-10-09T12:00:00.000Z",
  delivery_end: "2026-10-09T18:00:00.000Z",
  equipment: "reefer_53",
  reefer_mode: "continuous",
};

function truck(partial: Partial<TruckWithDriver> & Pick<TruckWithDriver, "id" | "unit_number">): TruckWithDriver {
  return {
    type: "sleeper",
    capacity_lbs: 44000,
    status: "available",
    samsara_vehicle_id: `veh-${partial.id}`,
    samsara_trailer_id: "",
    orbcomm_asset_id: "",
    prepass_transponder_id: "",
    trailer_number: "",
    registration_issued: "2024-01-01",
    registration_expires: "2030-01-01",
    dot_inspected_on: "2025-01-01",
    dot_expires: "2030-01-01",
    vin: "",
    plate: "",
    plate_state: "",
    year: "2022",
    make: "",
    model: "",
    notes: "",
    active: 1,
    gps_latitude: null,
    gps_longitude: null,
    gps_address: "",
    gps_recorded_at: "",
    gps_source: "",
    gps_speed_mph: null,
    gps_heading_deg: null,
    gps_engine_on: null,
    division: "MSE",
    created_at: "",
    updated_at: "",
    assigned_driver_id: partial.id,
    driver_name: `Driver ${partial.id}`,
    ...partial,
  };
}

function driver(partial: Partial<Driver> & Pick<Driver, "id" | "name">): Driver {
  return {
    phone: "",
    email: "",
    notes: "",
    active: 1,
    license: "",
    license_number: "",
    license_state: "",
    license_expires: "2030-01-01",
    cdl_endorsements: "",
    medical_issued: "2024-01-01",
    medical_expires: "2030-01-01",
    driver_type: "company_driver",
    company_name: "",
    pay_percent: null,
    pin: "",
    samsara_driver_id: "",
    truck_id: partial.id,
    status: "available",
    alt_phone: "",
    cell_phone: "",
    pager: "",
    address: "",
    country: "",
    city: "",
    state: "",
    postal_zip: "",
    date_of_birth: "",
    date_of_hire: "",
    drug_test_last: "",
    drug_test_next: "",
    termination_date: "",
    last_trailer_id: null,
    division: "MSE",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function trailer(partial: Partial<Trailer> & Pick<Trailer, "id" | "unit_number">): Trailer {
  return {
    type: "reefer",
    orbcomm_asset_id: "",
    registration_issued: "2024-01-01",
    registration_expires: "2030-01-01",
    dot_inspected_on: "2025-01-01",
    dot_expires: "2030-01-01",
    status: "available",
    vin: "",
    plate: "",
    truck_id: null,
    notes: "",
    reefer_setpoint_f: null,
    active: 1,
    gps_latitude: null,
    gps_longitude: null,
    gps_address: "",
    gps_recorded_at: "",
    gps_source: "",
    division: "MSE",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function clock(driverId: number, name: string, driveMs: number, source: HosClock["source"] = "samsara"): HosClock {
  return {
    driverId,
    loadId: null,
    samsaraDriverId: "",
    driverName: name,
    dutyStatus: "driving",
    driveRemainingMs: driveMs,
    shiftRemainingMs: 11 * 3_600_000,
    cycleRemainingMs: 50 * 3_600_000,
    timeUntilBreakMs: 3 * 3_600_000,
    recordedAt: NOW.toISOString(),
    source,
  };
}

function ping(truckId: number, unit: string, lat: number, lng: number, recordedAt = NOW.toISOString()) {
  return {
    truckId,
    vehicleId: `veh-${truckId}`,
    unitNumber: unit,
    latitude: lat,
    longitude: lng,
    address: "live",
    recordedAt,
    source: "samsara" as const,
  };
}

const drivers = [
  driver({ id: 1, name: "Ada Cole" }),
  driver({ id: 2, name: "Ben Ortiz" }),
  driver({ id: 3, name: "Cia Nguyen" }),
  driver({ id: 4, name: "Dee Shah" }),
  driver({ id: 5, name: "Eli Brooks" }),
];

const trailers = [
  trailer({ id: 11, unit_number: "5312", truck_id: 1 }),
  trailer({ id: 12, unit_number: "5400", truck_id: 2 }),
  trailer({ id: 13, unit_number: "5501", truck_id: 3 }),
  trailer({ id: 14, unit_number: "5602", truck_id: 4 }),
  trailer({ id: 15, unit_number: "5703", truck_id: 5 }),
];

function rank(overrides: Parameters<typeof rankAssignSuggestions>[0] extends infer T ? Partial<T> : never = {}) {
  const trucks = [
    truck({ id: 1, unit_number: "101", assigned_driver_id: 1, driver_name: "Ada Cole" }),
    truck({ id: 2, unit_number: "102", assigned_driver_id: 2, driver_name: "Ben Ortiz" }),
    truck({ id: 3, unit_number: "103", assigned_driver_id: 3, driver_name: "Cia Nguyen" }),
    truck({ id: 4, unit_number: "104", assigned_driver_id: 4, driver_name: "Dee Shah" }),
    truck({ id: 5, unit_number: "105", assigned_driver_id: 5, driver_name: "Eli Brooks", status: "out_of_service" }),
  ];
  return rankAssignSuggestions({
    load,
    pickup: { ...DALLAS, label: "Dallas, TX" },
    trucks,
    drivers,
    trailers,
    otherLoads: [
      {
        id: 90,
        truck_id: 4,
        driver_id: 4,
        status: "assigned",
        pickup_start: "2026-10-08T15:00:00.000Z",
        delivery_end: "2026-10-09T12:00:00.000Z",
      },
    ],
    gpsLocations: [
      ping(1, "101", DALLAS.lat, DALLAS.lng),
      ping(2, "102", HOUSTON.lat, HOUSTON.lng),
      ping(3, "103", NASHVILLE.lat, NASHVILLE.lng),
      ping(4, "104", DALLAS.lat, DALLAS.lng),
      ping(5, "105", DALLAS.lat, DALLAS.lng),
    ],
    hos: [
      clock(1, "Ada Cole", 11 * 3_600_000),
      clock(2, "Ben Ortiz", 11 * 3_600_000),
      clock(3, "Cia Nguyen", 11 * 3_600_000),
      clock(4, "Dee Shah", 11 * 3_600_000),
      clock(5, "Eli Brooks", 11 * 3_600_000),
    ],
    tokenSet: true,
    quietHours: 2,
    now: NOW,
    ...overrides,
  });
}

const started = Date.now();
const top = rank();
const rankMs = Date.now() - started;

assert.equal(top.length, ASSIGN_SUGGESTION_LIMIT);
assert.deepEqual(
  top.map((row) => row.unit),
  ["101", "102", "103"],
  "closest free trucks outrank an overlapping truck and an out-of-service truck",
);
assert.equal(top[0]?.driverId, 1);
assert.equal(top[0]?.trailerId, 11);
assert.equal(top[0]?.selectable, true);
assert.equal(top[0]?.caution, false);
assert.match(top[0]?.reason ?? "", /^0 empty mi · 11h 0m drive left · reefer 5312 · docs OK$/);
assert.ok(top.every((row) => row.selectable));
assert.ok(rankMs < 50, `ranking should be instant, took ${rankMs}ms`);

const again = rank();
assert.deepEqual(again, top, "the same inputs rank the same way; nothing is learned from a pick");

const hosOrder = rank({
  hos: [
    clock(1, "Ada Cole", 2 * 3_600_000),
    clock(2, "Ben Ortiz", DRIVE_7H_40M),
    clock(3, "Cia Nguyen", 11 * 3_600_000),
    clock(4, "Dee Shah", 11 * 3_600_000),
    clock(5, "Eli Brooks", 11 * 3_600_000),
  ],
  gpsLocations: [
    ping(1, "101", HOUSTON.lat, HOUSTON.lng),
    ping(2, "102", HOUSTON.lat, HOUSTON.lng),
    ping(3, "103", NASHVILLE.lat, NASHVILLE.lng),
    ping(4, "104", NASHVILLE.lat, NASHVILLE.lng),
    ping(5, "105", NASHVILLE.lat, NASHVILLE.lng),
  ],
});
assert.equal(hosOrder[0]?.unit, "102");
assert.match(hosOrder[0]?.reason ?? "", /7h 40m drive left/);
assert.ok(hosOrder.findIndex((row) => row.unit === "102") < hosOrder.findIndex((row) => row.unit === "101"));

const reeferOrder = rank({
  trailers: [
    trailer({ id: 11, unit_number: "5312", truck_id: 1, type: "dry_van" }),
    trailer({ id: 12, unit_number: "5400", truck_id: 2 }),
  ],
  gpsLocations: [ping(1, "101", HOUSTON.lat, HOUSTON.lng), ping(2, "102", HOUSTON.lat, HOUSTON.lng)],
  trucks: [
    truck({ id: 1, unit_number: "101", assigned_driver_id: 1, driver_name: "Ada Cole" }),
    truck({ id: 2, unit_number: "102", assigned_driver_id: 2, driver_name: "Ben Ortiz" }),
  ],
  otherLoads: [],
});
assert.equal(reeferOrder[0]?.unit, "102");
assert.match(reeferOrder[0]?.reason ?? "", /reefer 5400/);
assert.match(reeferOrder[1]?.reason ?? "", /reefer 5400 on another truck/);

const docsOrder = rank({
  drivers: [
    driver({ id: 1, name: "Ada Cole", license_expires: "2020-01-01" }),
    driver({ id: 2, name: "Ben Ortiz" }),
  ],
  gpsLocations: [ping(1, "101", HOUSTON.lat, HOUSTON.lng), ping(2, "102", HOUSTON.lat, HOUSTON.lng)],
  trucks: [
    truck({ id: 1, unit_number: "101", assigned_driver_id: 1, driver_name: "Ada Cole" }),
    truck({ id: 2, unit_number: "102", assigned_driver_id: 2, driver_name: "Ben Ortiz" }),
  ],
  trailers: [trailer({ id: 11, unit_number: "5312", truck_id: 1 }), trailer({ id: 12, unit_number: "5400", truck_id: 2 })],
  otherLoads: [],
});
assert.equal(docsOrder[0]?.unit, "102");
assert.match(docsOrder[0]?.reason ?? "", /docs OK/);
assert.match(docsOrder[1]?.reason ?? "", /expired docs/);

const blocked = rank({
  trucks: [truck({ id: 1, unit_number: "101", assigned_driver_id: 1, driver_name: "Ada Cole" })],
  drivers: [driver({ id: 1, name: "Ada Cole" })],
  trailers: [trailer({ id: 11, unit_number: "5312", truck_id: 1 })],
  otherLoads: [],
  hardBlocks: () => ["Unit 101: registration is missing or expired."],
});
assert.match(blocked[0]?.reason ?? "", /docs blocked/);

const staleAt = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
const missing = rank({
  tokenSet: false,
  timedOut: false,
  trucks: [
    truck({
      id: 1,
      unit_number: "101",
      assigned_driver_id: 1,
      driver_name: "Ada Cole",
      gps_latitude: DALLAS.lat,
      gps_longitude: DALLAS.lng,
      gps_source: "samsara",
      gps_recorded_at: staleAt,
      gps_address: "Dallas, TX",
    }),
    truck({ id: 2, unit_number: "102", assigned_driver_id: 2, driver_name: "Ben Ortiz" }),
  ],
  drivers: [driver({ id: 1, name: "Ada Cole" }), driver({ id: 2, name: "Ben Ortiz" })],
  trailers: [trailer({ id: 11, unit_number: "5312", truck_id: 1 })],
  gpsLocations: [],
  hos: [clock(1, "Ada Cole", 11 * 3_600_000, "demo")],
  otherLoads: [],
});
assert.match(missing[0]?.reason ?? "", /0 empty mi/);
assert.match(missing[0]?.reason ?? "", /GPS 3h old/);
assert.match(missing[0]?.reason ?? "", /no Samsara token/);
assert.match(missing[0]?.reason ?? "", /HOS unknown/);
assert.match(missing[0]?.reason ?? "", /reefer 5312/);
assert.doesNotMatch(missing[0]?.reason ?? "", /11h 0m drive left/, "demo HOS is not a live clock");
assert.match(missing.find((row) => row.unit === "102")?.reason ?? "", /miles unknown/);
assert.match(missing.find((row) => row.unit === "102")?.reason ?? "", /HOS unknown/);

const timedOut = rank({
  tokenSet: true,
  timedOut: true,
  trucks: [truck({ id: 2, unit_number: "102", assigned_driver_id: 2, driver_name: "Ben Ortiz" })],
  drivers: [driver({ id: 2, name: "Ben Ortiz" })],
  gpsLocations: [],
  hos: [],
  otherLoads: [],
  trailers: [],
});
assert.match(timedOut[0]?.reason ?? "", /miles unknown/);
assert.match(timedOut[0]?.reason ?? "", /live GPS timed out/);
assert.match(timedOut[0]?.reason ?? "", /HOS unknown/);

const onlyDown = rank({
  trucks: [truck({ id: 5, unit_number: "105", assigned_driver_id: 5, status: "out_of_service" })],
  otherLoads: [],
});
assert.equal(onlyDown.length, 1);
assert.equal(onlyDown[0]?.selectable, false);
assert.equal(onlyDown[0]?.caution, true);
assert.match(onlyDown[0]?.reason ?? "", /out of service/);

const backToBack = rank({
  trucks: [truck({ id: 4, unit_number: "104", assigned_driver_id: 4, driver_name: "Dee Shah" })],
  drivers: [driver({ id: 4, name: "Dee Shah" })],
  trailers: [trailer({ id: 14, unit_number: "5602", truck_id: 4 })],
  otherLoads: [
    {
      id: 91,
      truck_id: 4,
      driver_id: 4,
      status: "dispatched",
      pickup_start: "2026-10-07T12:00:00.000Z",
      delivery_end: "2026-10-08T12:00:00.000Z",
    },
  ],
});
assert.equal(backToBack[0]?.caution, false);
assert.doesNotMatch(backToBack[0]?.reason ?? "", /overlapping/);

const offDuty = rank({
  trucks: [truck({ id: 1, unit_number: "101", assigned_driver_id: 1, driver_name: "Ada Cole" })],
  drivers: [driver({ id: 1, name: "Ada Cole", status: "off_duty" })],
  otherLoads: [],
});
assert.equal(offDuty[0]?.driverId, null);
assert.equal(offDuty[0]?.caution, true);
assert.match(offDuty[0]?.reason ?? "", /driver off duty/);

const seated = rank({
  trucks: [truck({ id: 8, unit_number: "88", assigned_driver_id: null, driver_name: null })],
  drivers: [driver({ id: 3, name: "Cia Nguyen", truck_id: null })],
  trailers: [trailer({ id: 13, unit_number: "5501", truck_id: null })],
  otherLoads: [
    {
      id: 77,
      truck_id: 8,
      driver_id: 3,
      status: "in_transit",
      pickup_start: "2026-10-01T12:00:00.000Z",
      delivery_end: "2026-10-02T12:00:00.000Z",
    },
  ],
  hos: [clock(3, "Cia Nguyen", DRIVE_7H_40M)],
  gpsLocations: [ping(8, "88", DALLAS.lat, DALLAS.lng)],
});
assert.equal(seated[0]?.driverId, 3);
assert.equal(seated[0]?.driverName, "Cia Nguyen");
assert.equal(seated[0]?.caution, false);
assert.match(seated[0]?.reason ?? "", /7h 40m drive left/);

const dry = rank({
  load: { ...load, equipment: "dry_van", reefer_mode: "", reefer_setpoint_f: null },
  trucks: [truck({ id: 1, unit_number: "101", assigned_driver_id: 1 })],
  otherLoads: [],
});
assert.match(dry[0]?.reason ?? "", /reefer not needed/);

const placed = pickupPointForSuggestion({ origin: "Dallas, TX", shipper_location_id: null }, null, []);
assert.equal(placed?.label, "Dallas, TX");
assert.ok(placed && Math.abs(placed.lat - DALLAS.lat) < 0.001);

const exact = pickupPointForSuggestion(
  { origin: "Somewhere", shipper_location_id: 7 },
  { city: "Plant", state: "TX", location_id: 9 },
  [
    {
      id: 9,
      name: "Plant",
      city: "Cactus",
      state: "TX",
      latitude: 36.05,
      longitude: -102.01,
    },
  ],
);
assert.equal(exact?.lat, 36.05);
assert.equal(pickupPointForSuggestion({ origin: "", shipper_location_id: null }, null, []), null);

async function assertBudget() {
  const budgetStarted = Date.now();
  const budgeted = await fleetWithinBudget(
    () => new Promise<string>(() => {}),
    80,
    () => "saved-gps",
  );
  assert.equal(budgeted.value, "saved-gps");
  assert.equal(budgeted.timedOut, true);
  assert.ok(Date.now() - budgetStarted < 1000, "suggestion fleet budget must stop a hung Samsara read");
  assert.equal(ASSIGN_SUGGESTION_BUDGET_MS, 1200);

  const fast = await fleetWithinBudget(async () => "live", 1200, () => "saved-gps");
  assert.equal(fast.value, "live");
  assert.equal(fast.timedOut, false);
}

const dialog = fs.readFileSync(path.join(process.cwd(), "components/assign-dialog.tsx"), "utf8");
assert.match(dialog, /data-assign-suggestions/);
assert.match(dialog, /data-assign-suggestion/);
assert.match(dialog, /You still confirm/);
assert.match(dialog, /View only\. Suggestions stay visible/);
assert.match(dialog, /disabled=\{readOnly/);
assert.match(dialog, /data-view-only-allow/);
assert.doesNotMatch(dialog, /accept\/reject|learnFrom/);
const suggestionAt = dialog.indexOf('data-assign-suggestion=""');
const suggestionButton = dialog.slice(Math.max(0, suggestionAt - 180), suggestionAt + 500);
assert.match(suggestionButton, /type="button"/);
assert.doesNotMatch(suggestionButton, /assignLoadAction/);

const board = fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8");
assert.match(board, /suggestAssignmentsForBoard/);
assert.match(board, /readOnly=\{!write\}/);

assertBudget()
  .then(() => {
    console.log(`assign-suggestions-test ok (${rankMs}ms rank, budget ${ASSIGN_SUGGESTION_BUDGET_MS}ms)`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
