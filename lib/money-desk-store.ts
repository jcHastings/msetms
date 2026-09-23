import { listFuelTransactions } from "./fuel-store";
import { milesFromSamsaraOdometer, samsaraMilesSourceStatus } from "./miles-source";
import {
  buildCashSketch,
  buildMoneyFlags,
  buildMoneyStandings,
  describeFleetCpm,
  describeLeastContribution,
  matchMoneyAsk,
  monthChoices,
  quarterChoices,
  resolveMoneyWindow,
  unmatchedMoneyAsk,
  weekChoicesFromInstants,
  windowForMoneyAsk,
  type MoneyDeskModel,
  type MoneyFuelTx,
  type MoneyLoad,
  type MoneyMiles,
  type MoneyTollTx,
  type MoneyTruckInput,
  type MoneyWindow,
} from "./money-desk";
import { listLoads, listTrucks } from "./queries";
import { listTollTransactions } from "./tolls-store";
import type { FuelTransactionView } from "./fuel";
import type { LoadView, TruckWithDriver } from "./types";
import type { TollTransactionView } from "./tolls";

type MoneyQuery = {
  span?: string;
  week?: string;
  month?: string;
  quarter?: string;
  inactive?: string;
  q?: string;
};

function mapTruck(truck: TruckWithDriver): MoneyTruckInput {
  return {
    id: truck.id,
    unit: truck.unit_number,
    driverName: truck.driver_name ?? "",
    active: truck.active === 1,
  };
}

function mapFuel(row: FuelTransactionView): MoneyFuelTx {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    truckId: row.truck_id,
    driverId: row.driver_id,
    driverName: row.driver_name || row.driver_name_raw || "",
    unit: row.truck_unit || row.unit_number || "",
    gallons: row.gallons,
    amount: row.amount,
    location: row.location,
    category: row.category,
  };
}

function mapToll(row: TollTransactionView): MoneyTollTx {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    truckId: row.truck_id,
    driverName: row.driver_name || row.driver_name_raw || "",
    unit: row.truck_unit || row.unit_number || "",
    amount: row.amount,
    plaza: row.plaza,
  };
}

function mapLoad(load: LoadView): MoneyLoad {
  return {
    id: load.id,
    loadNumber: load.load_number,
    truckId: load.truck_id,
    status: load.status,
    nonRevenue: load.non_revenue === 1,
    rate: load.rate,
    lumper: load.lumper_actual,
    pickupStart: load.pickup_start,
    deliveryStart: load.delivery_start,
    deliveryEnd: load.delivery_end,
    invoiced: Boolean(
      load.tms_invoice_number.trim() ||
        load.tms_invoice_at.trim() ||
        load.qbo_invoice_number.trim() ||
        load.qbo_sent_at.trim(),
    ),
    invoicePaid: load.invoice_paid === 1,
    invoiceAt: load.tms_invoice_at.trim() || load.qbo_sent_at.trim(),
  };
}

function milesFor(window: MoneyWindow): MoneyMiles[] {
  const readings = milesFromSamsaraOdometer({
    fromIso: window.fromIso,
    toIso: window.toIso,
    startYmd: window.startYmd,
    endYmd: window.endYmd,
  });
  return readings.flatMap((row) =>
    row.truckId == null ? [] : [{ truckId: row.truckId, miles: row.miles, note: row.note }],
  );
}

export function loadMoneyDesk(query: MoneyQuery, now = new Date()): MoneyDeskModel {
  const window = resolveMoneyWindow(query, now);
  const includeInactive = query.inactive === "1";
  const trucks = listTrucks().map(mapTruck);
  const fuel = listFuelTransactions().map(mapFuel);
  let tolls: MoneyTollTx[] = [];
  let tollsFailed = false;
  try {
    tolls = listTollTransactions().map(mapToll);
  } catch {
    tollsFailed = true;
    tolls = [];
  }
  const loads = listLoads({ status: "all" }).map(mapLoad);
  const milesNote = samsaraMilesSourceStatus().note;
  const standings = buildMoneyStandings({
    window,
    trucks,
    fuel,
    tolls,
    loads,
    miles: milesFor(window),
    includeInactive,
    milesNote,
  });
  const flags = buildMoneyFlags({ window, standings, fuel, tolls });
  const cash = buildCashSketch({ now, loads, fuel, tolls });
  const instants = [
    ...fuel.map((tx) => tx.occurredAt),
    ...tolls.map((tx) => tx.occurredAt),
    ...loads.map((load) => load.deliveryStart || load.pickupStart),
  ];
  const question = String(query.q ?? "").trim().slice(0, 240);
  let ask: MoneyDeskModel["ask"] = null;
  if (question) {
    const matched = matchMoneyAsk(question);
    if (!matched) ask = { question, answer: unmatchedMoneyAsk(question), matched: false };
    else {
      const askWindow = windowForMoneyAsk(matched, now);
      const askStandings = buildMoneyStandings({
        window: askWindow,
        trucks,
        fuel,
        tolls,
        loads,
        miles: milesFor(askWindow),
        includeInactive: false,
        milesNote,
      });
      ask = {
        question,
        matched: true,
        answer: matched === "least-last-quarter" ? describeLeastContribution(askStandings) : describeFleetCpm(askStandings),
      };
    }
  }

  return {
    window,
    includeInactive,
    standings,
    flags,
    cash,
    weekChoices: weekChoicesFromInstants(instants, now, window.span === "week" ? window.anchorYmd : ""),
    monthChoices: monthChoices(now),
    quarterChoices: quarterChoices(now),
    ask,
    fuelNote: fuel.length ? "" : "No fuel transactions on file.",
    tollsNote: tollsFailed
      ? "Tolls could not be read. The toll list stays empty."
      : tolls.length
        ? ""
        : "No tolls on file.",
  };
}
