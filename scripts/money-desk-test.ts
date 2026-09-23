import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MoneyDeskView } from "../components/money-desk-view";
import { zonedWallToUtc } from "../lib/fuel";
import {
  buildCashSketch,
  buildMoneyFlags,
  buildMoneyStandings,
  CASH_SKETCH_BANNER,
  cashSketchWeekStarts,
  closedOfficeWeekStart,
  describeFleetCpm,
  describeLeastContribution,
  matchMoneyAsk,
  previousQuarterWindow,
  resolveMoneyWindow,
  type MoneyFuelTx,
  type MoneyLoad,
  type MoneyTruckInput,
  unmatchedMoneyAsk,
  windowForMoneyAsk,
} from "../lib/money-desk";
import { canViewMoney } from "../lib/settings-shared";

const now = new Date("2026-09-23T16:00:00Z");

function at(ymd: string, hours = 12, minutes = 0): string {
  return zonedWallToUtc(ymd, hours, minutes, 0).toISOString();
}

function truck(id: number, unit: string, active = true): MoneyTruckInput {
  return { id, unit, driverName: `Driver ${unit}`, active };
}

function fuel(partial: Partial<MoneyFuelTx> & Pick<MoneyFuelTx, "id" | "occurredAt">): MoneyFuelTx {
  return {
    truckId: 1,
    driverId: 1,
    driverName: "Driver 101",
    unit: "101",
    gallons: 100,
    amount: 400,
    location: "Pilot Dallas",
    category: "truck_diesel",
    ...partial,
  };
}

const closed = resolveMoneyWindow({}, now);

assert.equal(closed.span, "week");
assert.equal(closed.startYmd, "2026-09-14");
assert.equal(closed.endYmd, "2026-09-20");
assert.equal(closedOfficeWeekStart(now), "2026-09-14");
assert.equal(resolveMoneyWindow({ span: "week", week: "2026-09-23" }, now).startYmd, "2026-09-21");
assert.equal(resolveMoneyWindow({ span: "month", month: "2026-09" }, now).label, "September 2026");
assert.equal(resolveMoneyWindow({ span: "quarter", quarter: "2026-Q2" }, now).startYmd, "2026-04-01");
assert.equal(resolveMoneyWindow({ span: "quarter", quarter: "2026-Q2" }, now).endYmd, "2026-06-30");
assert.equal(previousQuarterWindow(now).anchorYmd, "2026-Q2");

const standings = buildMoneyStandings({
  window: closed,
  includeInactive: false,
  milesNote: "Samsara odometer delta.",
  trucks: [truck(1, "101"), truck(2, "102"), truck(3, "103", false)],
  miles: [
    { truckId: 1, miles: 1000, note: "Samsara odometer delta" },
    { truckId: 1, miles: null, note: "ignored duplicate" },
  ],
  fuel: [
    fuel({ id: 1, occurredAt: at("2026-09-15"), truckId: 1, amount: 400, category: "ULSD" }),
    fuel({ id: 2, occurredAt: at("2026-09-15", 13), truckId: 1, amount: 25, category: "money_code", gallons: null }),
    fuel({ id: 3, occurredAt: at("2026-09-16"), truckId: 3, amount: 80, unit: "103", driverId: 3, driverName: "Driver 103" }),
    fuel({ id: 4, occurredAt: at("2026-09-16"), truckId: null, amount: 15, driverId: null, driverName: "", unit: "" }),
  ],
  tolls: [
    { id: 9, occurredAt: at("2026-09-16"), truckId: 1, amount: 50, driverName: "Driver 101", unit: "101", plaza: "York" },
    { id: 10, occurredAt: at("2026-09-16"), truckId: null, amount: 12, driverName: "", unit: "", plaza: "Barrier" },
  ],
  loads: [
    {
      id: 50,
      loadNumber: "MSE50",
      truckId: 1,
      status: "delivered",
      nonRevenue: false,
      rate: 2000,
      lumper: 25,
      pickupStart: at("2026-09-14"),
      deliveryStart: at("2026-09-16"),
      deliveryEnd: at("2026-09-16", 18),
      invoiced: true,
      invoicePaid: false,
      invoiceAt: at("2026-09-17"),
    },
    {
      id: 51,
      loadNumber: "MSE51",
      truckId: null,
      status: "delivered",
      nonRevenue: false,
      rate: 900,
      lumper: null,
      pickupStart: at("2026-09-15"),
      deliveryStart: at("2026-09-16"),
      deliveryEnd: "",
      invoiced: false,
      invoicePaid: false,
      invoiceAt: "",
    },
  ],
});

const row = standings.rows.find((item) => item.truckId === 1);
assert.ok(row);
assert.equal(row.fuel, 400);
assert.equal(row.tolls, 50);
assert.equal(row.other, 50);
assert.equal(row.burns, 500);
assert.equal(row.miles, 1000);
assert.equal(row.cpm, 0.5);
assert.equal(row.revenue, 2000);
assert.equal(row.margin, 1500);
assert.equal(row.marginPct, 0.75);
assert.equal(standings.rows.some((item) => item.truckId === 3), false);
assert.equal(standings.hiddenInactiveBurns, 80);
assert.equal(standings.unassignedFuel, 15);
assert.equal(standings.unassignedTolls, 12);
assert.equal(standings.loadsWithoutTruck, 1);
assert.equal(standings.fleet.cpm, 0.5);
assert.match(describeFleetCpm(standings), /\$0\.500/);
assert.match(describeFleetCpm(standings), /Active trucks only/);

const withInactive = buildMoneyStandings({
  window: closed,
  includeInactive: true,
  milesNote: "",
  trucks: [truck(3, "103", false)],
  miles: [],
  fuel: [fuel({ id: 3, occurredAt: at("2026-09-16"), truckId: 3, amount: 80 })],
  tolls: [],
  loads: [],
});
assert.equal(withInactive.rows.length, 1);
assert.equal(withInactive.rows[0]?.active, false);
assert.equal(withInactive.fleet.cpm, null);

const noMiles = buildMoneyStandings({
  window: closed,
  includeInactive: false,
  milesNote: "No odometer pair.",
  trucks: [truck(1, "101")],
  miles: [{ truckId: 1, miles: null, note: "No Samsara odometer pair in this period" }],
  fuel: [fuel({ id: 1, occurredAt: at("2026-09-15"), amount: 100 })],
  tolls: [],
  loads: [],
});
assert.equal(noMiles.fleet.cpm, null);
assert.match(describeFleetCpm(noMiles), /not available/);
assert.match(describeFleetCpm(noMiles), /No Samsara miles/);

const flagFuel: MoneyFuelTx[] = [
  fuel({ id: 21, occurredAt: at("2026-09-15", 8, 0), gallons: 100, amount: 400, location: "Pilot Dallas" }),
  fuel({ id: 22, occurredAt: at("2026-09-15", 8, 5), gallons: 100, amount: 401, location: "Pilot Dallas" }),
  fuel({
    id: 23,
    occurredAt: at("2026-09-15", 14),
    truckId: 2,
    driverId: 2,
    driverName: "Driver 102",
    unit: "102",
    gallons: 10,
    amount: 40,
    location: "Small Stop",
  }),
  fuel({
    id: 24,
    occurredAt: at("2026-09-16", 9),
    truckId: 4,
    driverId: 4,
    driverName: "Driver 104",
    unit: "104",
    gallons: 400,
    amount: 1600,
    location: "Big Rack",
  }),
  fuel({
    id: 25,
    occurredAt: at("2026-09-16", 11),
    truckId: null,
    driverId: null,
    driverName: "",
    unit: "",
    gallons: 20,
    amount: 70,
    location: "Unmatched",
  }),
];

const flagStandings = buildMoneyStandings({
  window: closed,
  includeInactive: false,
  milesNote: "",
  trucks: [
    truck(1, "101"),
    truck(2, "102"),
    truck(4, "104"),
    truck(5, "105"),
    truck(6, "106"),
  ],
  miles: [
    { truckId: 1, miles: 2000, note: "Samsara odometer delta" },
    { truckId: 2, miles: 2000, note: "Samsara odometer delta" },
    { truckId: 4, miles: 200, note: "Samsara odometer delta" },
    { truckId: 5, miles: 2000, note: "Samsara odometer delta" },
    { truckId: 6, miles: 2000, note: "Samsara odometer delta" },
  ],
  fuel: flagFuel,
  tolls: [{ id: 30, occurredAt: at("2026-09-16"), truckId: null, amount: 18, driverName: "", unit: "", plaza: "Open road" }],
  loads: [
    {
      id: 70,
      loadNumber: "MSE70",
      truckId: 4,
      status: "delivered",
      nonRevenue: false,
      rate: 100,
      lumper: null,
      pickupStart: at("2026-09-14"),
      deliveryStart: at("2026-09-16"),
      deliveryEnd: "",
      invoiced: false,
      invoicePaid: false,
      invoiceAt: "",
    },
  ],
});

const flags = buildMoneyFlags({
  window: closed,
  standings: flagStandings,
  fuel: flagFuel,
  tolls: [{ id: 30, occurredAt: at("2026-09-16"), truckId: null, amount: 18, driverName: "", unit: "", plaza: "Open road" }],
});
const kinds = new Set(flags.map((flag) => flag.kind));
assert.ok(kinds.has("duplicate_fuel"), `missing duplicate: ${[...kinds].join(",")}`);
assert.ok(kinds.has("fuel_too_often"), `missing too often: ${[...kinds].join(",")}`);
assert.ok(kinds.has("fuel_overspend"), `missing overspend: ${[...kinds].join(",")}`);
assert.ok(kinds.has("unassigned_fuel"));
assert.ok(kinds.has("unassigned_toll"));
assert.ok(kinds.has("negative_contribution"));
const duplicate = flags.find((flag) => flag.kind === "duplicate_fuel");
assert.match(duplicate?.href ?? "", /^\/fuel\?week=2026-09-14&truck=1$/);
assert.match(flags.find((flag) => flag.kind === "unassigned_toll")?.href ?? "", /^\/tolls\?week=2026-09-14$/);
assert.equal(flags.some((flag) => /text the driver|send/i.test(`${flag.title} ${flag.detail} ${flag.hrefLabel}`)), false);

const outlierWindow = closed;
const outlier = buildMoneyStandings({
  window: outlierWindow,
  includeInactive: false,
  milesNote: "",
  trucks: [truck(1, "101"), truck(2, "102"), truck(3, "103", true), truck(4, "104")],
  miles: [
    { truckId: 1, miles: 1000, note: "" },
    { truckId: 2, miles: 1000, note: "" },
    { truckId: 3, miles: 1000, note: "" },
    { truckId: 4, miles: 1000, note: "" },
  ],
  fuel: [
    fuel({ id: 1, occurredAt: at("2026-09-15"), truckId: 1, amount: 400 }),
    fuel({ id: 2, occurredAt: at("2026-09-15"), truckId: 2, amount: 450, driverId: 2, unit: "102" }),
    fuel({ id: 3, occurredAt: at("2026-09-15"), truckId: 3, amount: 500, driverId: 3, unit: "103" }),
    fuel({ id: 4, occurredAt: at("2026-09-15"), truckId: 4, amount: 2000, driverId: 4, unit: "104" }),
  ],
  tolls: [],
  loads: [],
});
assert.ok(buildMoneyFlags({ window: outlierWindow, standings: outlier, fuel: [], tolls: [] }).some((flag) => flag.kind === "outlier_cpm"));

const quarter = windowForMoneyAsk("least-last-quarter", now);
assert.equal(quarter.anchorYmd, "2026-Q2");
const least = buildMoneyStandings({
  window: quarter,
  includeInactive: false,
  milesNote: "",
  trucks: [truck(1, "101"), truck(2, "102")],
  miles: [],
  fuel: [],
  tolls: [],
  loads: [
    {
      id: 1,
      loadNumber: "A",
      truckId: 1,
      status: "completed",
      nonRevenue: false,
      rate: 500,
      lumper: null,
      pickupStart: at("2026-05-04"),
      deliveryStart: at("2026-05-06"),
      deliveryEnd: "",
      invoiced: true,
      invoicePaid: false,
      invoiceAt: at("2026-05-07"),
    },
    {
      id: 2,
      loadNumber: "B",
      truckId: 2,
      status: "completed",
      nonRevenue: false,
      rate: 900,
      lumper: null,
      pickupStart: at("2026-05-11"),
      deliveryStart: at("2026-05-12"),
      deliveryEnd: "",
      invoiced: false,
      invoicePaid: false,
      invoiceAt: "",
    },
  ],
});
assert.match(describeLeastContribution(least), /unit 101/);
assert.match(describeLeastContribution(least), /\$500\.00/);
const emptyLeast = buildMoneyStandings({
  window: quarter,
  includeInactive: false,
  milesNote: "",
  trucks: [truck(1, "101")],
  miles: [],
  fuel: [],
  tolls: [],
  loads: [],
});
assert.match(describeLeastContribution(emptyLeast), /No active truck has a contribution number/);

assert.equal(matchMoneyAsk("What is fleet CPM this week?"), "fleet-cpm-this-week");
assert.equal(matchMoneyAsk("What's fleet CPM for the last closed week?"), "fleet-cpm-closed-week");
assert.equal(matchMoneyAsk("Which truck made the least money last quarter?"), "least-last-quarter");
assert.equal(matchMoneyAsk("fleet CPM"), null);
assert.match(unmatchedMoneyAsk("fleet CPM"), /this week/);
assert.match(unmatchedMoneyAsk("how much is in the bank"), /only answer from numbers already in the TMS/);

const cashLoads: MoneyLoad[] = [
  {
    id: 1,
    loadNumber: "INV",
    truckId: 1,
    status: "delivered",
    nonRevenue: false,
    rate: 800,
    lumper: null,
    pickupStart: at("2026-09-22", 8),
    deliveryStart: at("2026-09-22", 16),
    deliveryEnd: "",
    invoiced: true,
    invoicePaid: false,
    invoiceAt: at("2026-09-23", 9),
  },
  {
    id: 2,
    loadNumber: "EXP",
    truckId: 1,
    status: "dispatched",
    nonRevenue: false,
    rate: 600,
    lumper: null,
    pickupStart: at("2026-09-28", 8),
    deliveryStart: at("2026-09-30", 12),
    deliveryEnd: "",
    invoiced: false,
    invoicePaid: false,
    invoiceAt: "",
  },
  {
    id: 3,
    loadNumber: "PAID",
    truckId: 1,
    status: "completed",
    nonRevenue: false,
    rate: 1000,
    lumper: null,
    pickupStart: at("2026-09-22"),
    deliveryStart: at("2026-09-23"),
    deliveryEnd: "",
    invoiced: true,
    invoicePaid: true,
    invoiceAt: at("2026-09-23"),
  },
];
const cash = buildCashSketch({
  now,
  loads: cashLoads,
  fuel: [{ occurredAt: at("2026-09-22", 7), amount: 100 }],
  tolls: [],
});
assert.equal(cash.weeks.length, 13);
assert.equal(cashSketchWeekStarts(now)[0], "2026-09-21");
assert.match(cash.banner, /Not a bank balance/);
assert.match(cash.banner, /Sketch until a bank is connected/);
assert.equal(CASH_SKETCH_BANNER, cash.banner);
const thisWeek = cash.weeks[0];
assert.ok(thisWeek);
assert.equal(thisWeek.status, "both");
assert.equal(thisWeek.invoiced, 800);
assert.equal(thisWeek.net, 700);
assert.equal(cash.weeks[1]?.expected, 600);
assert.equal(cash.weeks[1]?.status, "partial");
assert.ok(cash.weeks.some((week) => week.status === "gap"));
assert.match(cash.notes.join(" "), /marked paid/);
assert.equal(cash.weeks.reduce((sum, week) => sum + week.invoiced, 0), 800);

assert.equal(canViewMoney("admin"), true);
assert.equal(canViewMoney("accounting"), true);
assert.equal(canViewMoney("dispatcher"), true);
assert.equal(canViewMoney("read_only"), true);
assert.equal(canViewMoney("manager"), true);

const html = renderToStaticMarkup(
  MoneyDeskView({
    model: {
      window: closed,
      includeInactive: false,
      standings,
      flags,
      cash,
      weekChoices: [{ value: closed.anchorYmd, label: closed.label }],
      monthChoices: [{ value: "2026-09", label: "September 2026" }],
      quarterChoices: [{ value: "2026-Q3", label: "Q3 2026" }],
      ask: {
        question: "What is fleet CPM for the last closed week?",
        answer: describeFleetCpm(standings),
        matched: true,
      },
      fuelNote: "",
      tollsNote: "No tolls on file.",
    },
  }),
);
assert.match(html, /<main[^>]*id="main"/);
assert.match(html, /Money/);
assert.match(html, /SKETCH\. Not bank-backed\./);
assert.match(html, /data-cash-sketch="not-bank-backed"/);
assert.match(html, /data-money-standings/);
assert.match(html, /data-money-flags/);
assert.match(html, /data-money-ask/);
assert.match(html, /Open in Fuel/);
assert.match(html, /Open in Tolls/);
assert.match(html, /Fleet CPM for Last closed week/);
assert.doesNotMatch(html, /AI CFO|QuickBooks|Send to driver|text the driver/i);
assert.equal(html.includes("\u2014"), false);
assert.equal(html.includes("\u2013"), false);

console.log("money desk tests passed");
