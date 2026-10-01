import {
  fuelAuditSubject,
  fuelAuditWindowForWeek,
  inFuelAuditWindow,
  median,
  scoreFuelAudit,
  type FuelAuditFlag,
  type FuelAuditRow,
  type FuelAuditSubject,
} from "./fuel-audit";
import {
  fuelTxListKind,
  fuelWeekSpentTotalsForWeek,
  isFuelUnassignedRow,
  isTruckDieselCategory,
  localWeekRange,
  type FuelWeekSpentTotals,
} from "./fuel";
import { formatMdYDisplay } from "./format";
import {
  engineHoursForSubject,
  type EngineHourSubject,
  type EngineHoursSourceStatus,
} from "./engine-hours";
import {
  IDLE_FUEL_ESTIMATE_NOTE,
  estimateIdleFuelCost,
  idleFuelPriceCite,
  quoteIdleFuelForSubject,
  type IdleFuelQuote,
} from "./idle-fuel-cost";
import {
  computeMpg,
  MILES_SOURCE_ID,
  milesWindowForWeek,
  priorFuelWeekStart,
  readingForSubject,
  type MilesReading,
  type MilesSourceStatus,
} from "./miles-source";

/** Soft closeout thresholds. CoS can tune; see docs/fuel-closeout.md. */
export const FUEL_CLOSEOUT_THRESHOLDS = {
  greenMpgVsFleetMedian: 1,
  fillBandLowVsMedian: 0.5,
  fillBandHighVsMedian: 1.75,
  minFillsForGreen: 1,
  idleIshGallonsVsFleet: 1,
  idleIshMilesVsFleet: 0.4,
  idleIshMpgVsFleet: 0.6,
  idleIshMinGallons: 40,
  bestWorstCount: 3,
} as const;

export type FuelCloseoutThresholds = typeof FUEL_CLOSEOUT_THRESHOLDS;

export type FuelCloseoutTx = FuelAuditRow & {
  truck_id?: number | null;
};

export type FuelCloseoutLineItems = {
  dieselGallons: number;
  dieselAmount: number;
  dieselFills: number;
  reeferGallons: number;
  reeferAmount: number;
  defGallons: number;
  defAmount: number;
  scaleAmount: number;
  moneyAmount: number;
};

export type FuelCloseoutDriverRow = {
  subjectKey: string;
  driverId: number | null;
  driverName: string;
  unit: string;
  miles: number | null;
  milesSource: typeof MILES_SOURCE_ID | "missing";
  idleHours: number | null;
  engineHours: number | null;
  engineStat: EngineHourSubject["engineStat"];
  idlePpg: number | null;
  idleFuelCost: number | null;
  mpg: number | null;
  mpgVsPrior: number | null;
  fillCount: number;
  avgGallonsPerFill: number | null;
  fillsInNormalBand: boolean;
  flags: FuelAuditFlag[];
  greenLight: boolean;
  idleIsh: boolean;
  fuelNoMiles: boolean;
  milesNoFuel: boolean;
} & FuelCloseoutLineItems;

export type FuelCloseoutRank = {
  driverName: string;
  unit: string;
  mpg: number;
  miles: number;
  dieselGallons: number;
};

export type FuelCloseoutReport = {
  week: {
    startYmd: string;
    endYmd: string;
    fromIso: string;
    toIso: string;
    label: string;
    closed: boolean;
  };
  milesSource: MilesSourceStatus;
  engineHoursSource: EngineHoursSourceStatus;
  drivers: FuelCloseoutDriverRow[];
  flags: FuelAuditFlag[];
  greenLights: Array<{ driverName: string; unit: string; mpg: number; fillCount: number }>;
  fleet: {
    miles: number;
    idleHours: number | null;
    engineHours: number | null;
    idleFuelCost: number | null;
    dieselGallons: number;
    dieselAmount: number;
    mpg: number | null;
    priorMpg: number | null;
    mpgVsPrior: number | null;
    worst3: FuelCloseoutRank[];
    best3: FuelCloseoutRank[];
    spend: FuelWeekSpentTotals;
    unassignedAmount: number;
    idleIsh: Array<{ driverName: string; unit: string; why: string }>;
    fuelNoMiles: Array<{ driverName: string; unit: string; dieselGallons: number }>;
    milesNoFuel: Array<{ driverName: string; unit: string; miles: number }>;
    driverCount: number;
    fillCount: number;
  };
  note: string;
  idleFuelNote: string;
  idlePriceCite: string;
};

function emptyLines(): FuelCloseoutLineItems {
  return {
    dieselGallons: 0,
    dieselAmount: 0,
    dieselFills: 0,
    reeferGallons: 0,
    reeferAmount: 0,
    defGallons: 0,
    defAmount: 0,
    scaleAmount: 0,
    moneyAmount: 0,
  };
}

function addLine(lines: FuelCloseoutLineItems, row: FuelCloseoutTx): void {
  const kind = fuelTxListKind(row.category);
  const gallons = row.gallons != null && Number.isFinite(row.gallons) ? row.gallons : 0;
  const amount = row.amount != null && Number.isFinite(row.amount) ? row.amount : 0;
  if (kind === "truck_diesel" || isTruckDieselCategory(row.category)) {
    lines.dieselGallons += gallons;
    lines.dieselAmount += amount;
    lines.dieselFills += 1;
    return;
  }
  if (kind === "reefer") {
    lines.reeferGallons += gallons;
    lines.reeferAmount += amount;
    return;
  }
  if (kind === "def") {
    lines.defGallons += gallons;
    lines.defAmount += amount;
    return;
  }
  if (kind === "scale") {
    lines.scaleAmount += amount;
    return;
  }
  if (kind === "money_code") {
    lines.moneyAmount += amount;
  }
}

function weekLabel(startYmd: string, endYmd: string, closed: boolean): string {
  const range = `${formatMdYDisplay(startYmd)}-${formatMdYDisplay(endYmd)} NY`;
  return closed ? `closed week (${range})` : `in-progress week (${range})`;
}

function fillsInNormalBand(
  fillCount: number,
  fleetFillMedian: number | null,
  thresholds: FuelCloseoutThresholds,
): boolean {
  if (fillCount < thresholds.minFillsForGreen) return false;
  if (fleetFillMedian == null || !(fleetFillMedian > 0)) return fillCount >= thresholds.minFillsForGreen;
  const low = Math.max(thresholds.minFillsForGreen, fleetFillMedian * thresholds.fillBandLowVsMedian);
  const high = fleetFillMedian * thresholds.fillBandHighVsMedian;
  return fillCount >= low && fillCount <= high + 1e-9;
}

function idleIshWhy(
  row: Pick<FuelCloseoutDriverRow, "miles" | "mpg" | "dieselGallons">,
  fleet: { milesMedian: number | null; mpgMedian: number | null; gallonsMedian: number | null },
  thresholds: FuelCloseoutThresholds,
): string | null {
  if (!(row.dieselGallons >= thresholds.idleIshMinGallons)) return null;
  const gallonsHigh =
    fleet.gallonsMedian != null &&
    row.dieselGallons >= fleet.gallonsMedian * thresholds.idleIshGallonsVsFleet;
  if (!gallonsHigh) return null;
  if (row.miles == null || !(row.miles > 0)) {
    return `diesel ${formatNum(row.dieselGallons)}g with no Samsara miles`;
  }
  if (
    fleet.milesMedian != null &&
    fleet.milesMedian > 0 &&
    row.miles < fleet.milesMedian * thresholds.idleIshMilesVsFleet
  ) {
    return `diesel ${formatNum(row.dieselGallons)}g on ${formatNum(row.miles)} mi (low vs fleet)`;
  }
  if (
    row.mpg != null &&
    fleet.mpgMedian != null &&
    fleet.mpgMedian > 0 &&
    row.mpg < fleet.mpgMedian * thresholds.idleIshMpgVsFleet
  ) {
    return `MPG ${formatNum(row.mpg)} vs fleet median ${formatNum(fleet.mpgMedian)}`;
  }
  return null;
}

function formatNum(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function mpgMap(rows: FuelCloseoutTx[], miles: MilesReading[], weekStartYmd: string): Map<string, number> {
  const window = fuelAuditWindowForWeek(weekStartYmd);
  const buckets = new Map<string, { subject: FuelAuditSubject; gallons: number }>();
  for (const row of rows) {
    if (!inFuelAuditWindow(row.occurred_at, window)) continue;
    if (!isTruckDieselCategory(row.category)) continue;
    const subject = fuelAuditSubject(row);
    const bucket = buckets.get(subject.key) ?? { subject, gallons: 0 };
    bucket.gallons += row.gallons != null && Number.isFinite(row.gallons) ? row.gallons : 0;
    buckets.set(subject.key, bucket);
  }
  const out = new Map<string, number>();
  for (const bucket of buckets.values()) {
    const reading = readingForSubject(bucket.subject, miles);
    const mpg = computeMpg(reading?.miles ?? null, bucket.gallons);
    if (mpg != null) out.set(bucket.subject.key, mpg);
  }
  return out;
}

function mergeSubject(
  left: FuelAuditSubject,
  right: FuelAuditSubject,
): FuelAuditSubject {
  if (left.driverName === "Unassigned" && right.driverName !== "Unassigned") return right;
  if (!left.unit && right.unit) return { ...left, unit: right.unit };
  return left;
}

const BLANK_ENGINE_HOURS_SOURCE: EngineHoursSourceStatus = {
  label: "Samsara idle / engine hours",
  status: "unavailable",
  note: "No Samsara idle or engine-hour readings were passed in. Hours stay blank.",
};

export function buildFuelCloseout(input: {
  weekStartYmd: string;
  now?: Date;
  rows: FuelCloseoutTx[];
  miles: MilesReading[];
  milesSource: MilesSourceStatus;
  hours?: EngineHourSubject[];
  engineHoursSource?: EngineHoursSourceStatus;
  idleFuel?: IdleFuelQuote[];
  prior?: { rows: FuelCloseoutTx[]; miles: MilesReading[] };
  thresholds?: FuelCloseoutThresholds;
}): FuelCloseoutReport {
  const thresholds = input.thresholds ?? FUEL_CLOSEOUT_THRESHOLDS;
  const range = localWeekRange(input.weekStartYmd);
  const window = fuelAuditWindowForWeek(range.startYmd);
  const now = input.now ?? new Date();
  const closed = Date.parse(window.toIso) <= now.getTime();
  const weekRows = input.rows.filter((row) => inFuelAuditWindow(row.occurred_at, window));
  const audit = scoreFuelAudit(input.rows, window);
  const flagsBySubject = new Map<string, FuelAuditFlag[]>();
  for (const flag of audit.flags) {
    const list = flagsBySubject.get(flag.subjectKey) ?? [];
    list.push(flag);
    flagsBySubject.set(flag.subjectKey, list);
  }

  const buckets = new Map<string, { subject: FuelAuditSubject; lines: FuelCloseoutLineItems }>();
  for (const row of weekRows) {
    const subject = fuelAuditSubject(row);
    const bucket = buckets.get(subject.key) ?? { subject, lines: emptyLines() };
    bucket.subject = mergeSubject(bucket.subject, subject);
    addLine(bucket.lines, row);
    buckets.set(subject.key, bucket);
  }
  for (const reading of input.miles) {
    if (reading.miles == null || !(reading.miles > 0)) continue;
    if (buckets.has(reading.subjectKey)) continue;
    const subject: FuelAuditSubject = {
      key: reading.subjectKey,
      driverId: reading.driverId,
      driverName: reading.driverName,
      unit: reading.unit,
    };
    buckets.set(reading.subjectKey, { subject, lines: emptyLines() });
  }

  const fillCounts = [...buckets.values()]
    .map((bucket) => bucket.lines.dieselFills)
    .filter((count) => count > 0);
  const gallonsList = [...buckets.values()]
    .map((bucket) => bucket.lines.dieselGallons)
    .filter((value) => value > 0);
  const fleetFillMedian = median(fillCounts);
  const fleetGallonsMedian = median(gallonsList);

  const priorStart = priorFuelWeekStart(range.startYmd);
  const priorMpgBySubject = input.prior
    ? mpgMap(input.prior.rows, input.prior.miles, priorStart)
    : new Map<string, number>();

  let fleetMiles = 0;
  let fleetIdle = 0;
  let fleetIdleKnown = 0;
  let fleetEngine = 0;
  let fleetEngineKnown = 0;
  let fleetGallons = 0;
  let fleetDieselAmount = 0;
  let fleetFills = 0;
  const mpgRows: FuelCloseoutDriverRow[] = [];

  const drivers: FuelCloseoutDriverRow[] = [...buckets.values()]
    .map((bucket) => {
      const reading = readingForSubject(bucket.subject, input.miles);
      const hours = engineHoursForSubject(bucket.subject, input.hours ?? []);
      const miles = reading?.miles ?? null;
      const idleHours = hours?.idleHours ?? null;
      const engineHours = hours?.engineHours ?? null;
      const idleQuote = quoteIdleFuelForSubject(bucket.subject, input.idleFuel ?? []);
      const idlePpg = idleQuote?.ppg ?? null;
      const idleFuelCost = estimateIdleFuelCost(idleHours, idlePpg);
      if (idleHours != null) {
        fleetIdle += idleHours;
        fleetIdleKnown += 1;
      }
      if (engineHours != null) {
        fleetEngine += engineHours;
        fleetEngineKnown += 1;
      }
      const mpg = computeMpg(miles, bucket.lines.dieselGallons);
      const priorMpg = priorMpgBySubject.get(bucket.subject.key) ?? null;
      const flags = flagsBySubject.get(bucket.subject.key) ?? [];
      const fillCount = bucket.lines.dieselFills;
      const avgGallonsPerFill =
        fillCount > 0 && bucket.lines.dieselGallons > 0 ? bucket.lines.dieselGallons / fillCount : null;
      const inBand = fillsInNormalBand(fillCount, fleetFillMedian, thresholds);
      if (miles != null && miles > 0) fleetMiles += miles;
      fleetGallons += bucket.lines.dieselGallons;
      fleetDieselAmount += bucket.lines.dieselAmount;
      fleetFills += fillCount;
      const row: FuelCloseoutDriverRow = {
        subjectKey: bucket.subject.key,
        driverId: bucket.subject.driverId,
        driverName: bucket.subject.driverName,
        unit: bucket.subject.unit,
        miles,
        milesSource: reading?.source === MILES_SOURCE_ID && miles != null ? MILES_SOURCE_ID : "missing",
        idleHours,
        engineHours,
        engineStat: hours?.engineStat ?? null,
        idlePpg,
        idleFuelCost,
        mpg,
        mpgVsPrior: mpg != null && priorMpg != null ? mpg - priorMpg : null,
        fillCount,
        avgGallonsPerFill,
        fillsInNormalBand: inBand,
        flags,
        greenLight: false,
        idleIsh: false,
        fuelNoMiles: bucket.lines.dieselGallons > 0 && !(miles != null && miles > 0),
        milesNoFuel: miles != null && miles > 0 && !(bucket.lines.dieselGallons > 0),
        ...bucket.lines,
      };
      if (mpg != null) mpgRows.push(row);
      return row;
    })
    .sort((left, right) => {
      if (left.mpg == null && right.mpg == null) return left.driverName.localeCompare(right.driverName);
      if (left.mpg == null) return 1;
      if (right.mpg == null) return -1;
      if (left.mpg !== right.mpg) return left.mpg - right.mpg;
      return left.driverName.localeCompare(right.driverName);
    });

  let fleetIdleCost = 0;
  let fleetIdleCostKnown = 0;
  for (const row of drivers) {
    if (row.idleFuelCost == null) continue;
    fleetIdleCost += row.idleFuelCost;
    fleetIdleCostKnown += 1;
  }
  const fleetMpg = computeMpg(fleetMiles > 0 ? fleetMiles : null, fleetGallons);
  const mpgMedian = median(mpgRows.map((row) => row.mpg).filter((value): value is number => value != null));
  const milesMedian = median(
    drivers.map((row) => row.miles).filter((value): value is number => value != null && value > 0),
  );
  const priorFleet = input.prior
    ? buildFuelCloseout({
        weekStartYmd: priorStart,
        now,
        rows: input.prior.rows,
        miles: input.prior.miles,
        milesSource: input.milesSource,
        thresholds,
      }).fleet
    : null;

  for (const row of drivers) {
    const why = idleIshWhy(row, { milesMedian, mpgMedian, gallonsMedian: fleetGallonsMedian }, thresholds);
    row.idleIsh = why != null;
    row.greenLight =
      row.mpg != null &&
      mpgMedian != null &&
      row.mpg >= mpgMedian * thresholds.greenMpgVsFleetMedian &&
      row.flags.length === 0 &&
      row.fillsInNormalBand;
  }

  const ranked = drivers
    .filter((row): row is FuelCloseoutDriverRow & { mpg: number; miles: number } => row.mpg != null && row.miles != null)
    .map((row) => ({
      driverName: row.driverName,
      unit: row.unit,
      mpg: row.mpg,
      miles: row.miles,
      dieselGallons: row.dieselGallons,
    }));
  const worst3 = ranked.slice(0, thresholds.bestWorstCount);
  const best3 = [...ranked].reverse().slice(0, thresholds.bestWorstCount);

  const unassignedAmount = weekRows.reduce((sum, row) => {
    if (!isFuelUnassignedRow(row)) return sum;
    return sum + (row.amount != null && Number.isFinite(row.amount) ? row.amount : 0);
  }, 0);

  return {
    week: {
      startYmd: range.startYmd,
      endYmd: range.endYmd,
      fromIso: window.fromIso,
      toIso: window.toIso,
      label: weekLabel(range.startYmd, range.endYmd, closed),
      closed,
    },
    milesSource: input.milesSource,
    engineHoursSource: input.engineHoursSource ?? BLANK_ENGINE_HOURS_SOURCE,
    drivers,
    flags: audit.flags,
    greenLights: drivers
      .filter((row) => row.greenLight && row.mpg != null)
      .map((row) => ({
        driverName: row.driverName,
        unit: row.unit,
        mpg: row.mpg as number,
        fillCount: row.fillCount,
      })),
    fleet: {
      miles: fleetMiles,
      idleHours: fleetIdleKnown > 0 ? Math.round(fleetIdle * 10) / 10 : null,
      engineHours: fleetEngineKnown > 0 ? Math.round(fleetEngine * 10) / 10 : null,
      idleFuelCost: fleetIdleCostKnown > 0 ? Math.round(fleetIdleCost * 100) / 100 : null,
      dieselGallons: fleetGallons,
      dieselAmount: fleetDieselAmount,
      mpg: fleetMpg,
      priorMpg: priorFleet?.mpg ?? null,
      mpgVsPrior: fleetMpg != null && priorFleet?.mpg != null ? fleetMpg - priorFleet.mpg : null,
      worst3,
      best3,
      spend: fuelWeekSpentTotalsForWeek(weekRows, range.startYmd),
      unassignedAmount,
      idleIsh: drivers
        .filter((row) => row.idleIsh)
        .map((row) => ({
          driverName: row.driverName,
          unit: row.unit,
          why:
            idleIshWhy(row, { milesMedian, mpgMedian, gallonsMedian: fleetGallonsMedian }, thresholds) ??
            "high diesel / low miles",
        })),
      fuelNoMiles: drivers
        .filter((row) => row.fuelNoMiles)
        .map((row) => ({
          driverName: row.driverName,
          unit: row.unit,
          dieselGallons: row.dieselGallons,
        })),
      milesNoFuel: drivers
        .filter((row) => row.milesNoFuel && row.miles != null)
        .map((row) => ({
          driverName: row.driverName,
          unit: row.unit,
          miles: row.miles as number,
        })),
      driverCount: drivers.length,
      fillCount: fleetFills,
    },
    note: "Draft for JC only. Soft flags. Nothing emailed or texted to drivers.",
    idleFuelNote: IDLE_FUEL_ESTIMATE_NOTE,
    idlePriceCite: idleFuelPriceCite(
      "week",
      now.getTime() >= range.start.getTime() && now.getTime() < range.end.getTime(),
    ),
  };
}

export function summarizeFuelCloseout(report: FuelCloseoutReport) {
  return {
    week: report.week,
    milesSource: report.milesSource,
    fleetMpg: report.fleet.mpg,
    flagCount: report.flags.length,
    greenCount: report.greenLights.length,
    unassignedAmount: report.fleet.unassignedAmount,
    note: report.note,
  };
}

export { milesWindowForWeek, computeMpg };
