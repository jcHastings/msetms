import {
  addYmdDays,
  foldNameKey,
  fuelTxListKind,
  localWeekRange,
  normalizeUnit,
  zonedWallToUtc,
} from "./fuel";
import { DISPLAY_TIME_ZONE, formatMdYDisplay, ymdInTimeZone } from "./format";

/** Soft-flag thresholds. CoS can tune; see docs/fuel-audit.md. */
export const FUEL_AUDIT_THRESHOLDS = {
  fillCountVsFleetMedian: 1.75,
  minFillsToFlag: 3,
  extraFillsVsMedian: 2,
  shortGapHoursNonDef: 4,
  gallonsPerFillVsOwn: 1.5,
  gallonsPerFillVsFleet: 1.75,
  gallonsPerDayVsFleet: 1.75,
  amountPerFillVsFleet: 1.75,
  minGallonsDieselFill: 80,
  minGallonsDefFill: 8,
  minGallonsReeferFill: 40,
  minGallonsDieselDay: 40,
  minGallonsDefDay: 5,
  minGallonsReeferDay: 20,
  ownBaselineMinFills: 2,
  ownBaselineLookbackDays: 30,
  duplicateGallonAbs: 1,
  duplicateGallonPct: 0.05,
  highRatio: 2.5,
  shortGapHighHours: 2,
  maxFlags: 8,
} as const;

export type FuelAuditThresholds = typeof FUEL_AUDIT_THRESHOLDS;

export type FuelAuditWindowKind = "week" | "last_7" | "last_14" | "last_30";

export type FuelAuditWindow = {
  kind: FuelAuditWindowKind;
  fromIso: string;
  toIso: string;
  startYmd: string;
  endYmd: string;
  label: string;
  days: number;
};

export type FuelAuditProduct = "diesel" | "def" | "reefer";

export type FuelAuditFlagKind = "too_often" | "too_much" | "duplicate";

export type FuelAuditTxPointer = {
  id: number;
  occurred_at: string;
  gallons: number | null;
  amount: number | null;
  location: string;
};

export type FuelAuditRow = {
  id: number;
  occurred_at: string;
  driver_id: number | null;
  location: string;
  gallons: number | null;
  amount: number | null;
  category: string;
  unit_number: string;
  driver_name_raw: string;
  driver_name?: string | null;
  truck_unit?: string | null;
};

export type FuelAuditSubject = {
  key: string;
  driverId: number | null;
  driverName: string;
  unit: string;
};

export type FuelAuditFlag = {
  kind: FuelAuditFlagKind;
  severity: "watch" | "high";
  product: FuelAuditProduct;
  reason: string;
  subjectKey: string;
  driverId: number | null;
  driverName: string;
  unit: string;
  metric: string;
  why: string;
  score: number;
  txs: FuelAuditTxPointer[];
};

export type FuelAuditReport = {
  window: FuelAuditWindow;
  txCount: number;
  scoredCount: number;
  flags: FuelAuditFlag[];
};

export function median(values: number[]): number | null {
  const nums = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2;
}

export function fuelAuditProduct(category: string): FuelAuditProduct | null {
  const kind = fuelTxListKind(category);
  if (kind === "truck_diesel") return "diesel";
  if (kind === "def") return "def";
  if (kind === "reefer") return "reefer";
  return null;
}

export function fuelAuditSubject(row: FuelAuditRow): FuelAuditSubject {
  const unit = String(row.truck_unit || row.unit_number || "").trim();
  const raw = String(row.driver_name_raw || "").trim();
  const joined = String(row.driver_name || "").trim();
  if (row.driver_id) {
    return {
      key: `d:${row.driver_id}`,
      driverId: row.driver_id,
      driverName: joined || raw || "Unassigned",
      unit,
    };
  }
  if (raw || joined) {
    return {
      key: `n:${foldNameKey(raw || joined)}`,
      driverId: null,
      driverName: joined || raw,
      unit,
    };
  }
  if (unit) {
    return {
      key: `u:${normalizeUnit(unit)}`,
      driverId: null,
      driverName: "Unassigned",
      unit,
    };
  }
  return { key: "x:unassigned", driverId: null, driverName: "Unassigned", unit: "" };
}

function windowLabel(kind: FuelAuditWindowKind, startYmd: string, endYmd: string): string {
  const range = `${formatMdYDisplay(startYmd)}-${formatMdYDisplay(endYmd)} NY`;
  if (kind === "week") return `this week (${range})`;
  if (kind === "last_7") return `last 7 days (${range})`;
  if (kind === "last_14") return `last 14 days (${range})`;
  return `last 30 days (${range})`;
}

export function resolveFuelAuditWindow(kind: FuelAuditWindowKind, now = new Date()): FuelAuditWindow {
  if (kind === "week") return fuelAuditWindowForWeek(localWeekRange(now).startYmd);
  const days = kind === "last_7" ? 7 : kind === "last_14" ? 14 : 30;
  const today = ymdInTimeZone(now, DISPLAY_TIME_ZONE);
  const startYmd = addYmdDays(today, -(days - 1));
  const from = zonedWallToUtc(startYmd, 0, 0, 0);
  const to = zonedWallToUtc(addYmdDays(today, 1), 0, 0, 0);
  return {
    kind,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    startYmd,
    endYmd: today,
    label: windowLabel(kind, startYmd, today),
    days,
  };
}

export function fuelAuditWindowForWeek(weekStartYmd: string): FuelAuditWindow {
  const range = localWeekRange(weekStartYmd);
  return {
    kind: "week",
    fromIso: range.start.toISOString(),
    toIso: range.end.toISOString(),
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    label: windowLabel("week", range.startYmd, range.endYmd),
    days: 7,
  };
}

export function inFuelAuditWindow(occurredAt: string, window: FuelAuditWindow): boolean {
  const at = Date.parse(occurredAt);
  if (!Number.isFinite(at)) return false;
  return at >= Date.parse(window.fromIso) && at < Date.parse(window.toIso);
}

function normalizeStation(location: string): string {
  return String(location ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pointer(row: FuelAuditRow): FuelAuditTxPointer {
  return {
    id: row.id,
    occurred_at: row.occurred_at,
    gallons: row.gallons,
    amount: row.amount,
    location: row.location,
  };
}

function ratio(value: number, base: number | null): number | null {
  if (base == null || !(base > 0) || !Number.isFinite(value)) return null;
  return value / base;
}

function minFillGallons(product: FuelAuditProduct, thresholds: FuelAuditThresholds): number {
  if (product === "def") return thresholds.minGallonsDefFill;
  if (product === "reefer") return thresholds.minGallonsReeferFill;
  return thresholds.minGallonsDieselFill;
}

function minDayGallons(product: FuelAuditProduct, thresholds: FuelAuditThresholds): number {
  if (product === "def") return thresholds.minGallonsDefDay;
  if (product === "reefer") return thresholds.minGallonsReeferDay;
  return thresholds.minGallonsDieselDay;
}

function gallonsClose(left: number, right: number, thresholds: FuelAuditThresholds): boolean {
  const delta = Math.abs(left - right);
  const band = Math.max(thresholds.duplicateGallonAbs, thresholds.duplicateGallonPct * Math.max(left, right));
  return delta <= band;
}

function hoursBetween(left: string, right: string): number | null {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(b - a) / 3_600_000;
}

function formatNum(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function formatGal(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${formatNum(value)}g`;
}

function formatMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${formatNum(value)}`;
}

function formatRatio(value: number): string {
  return `${formatNum(value)}x`;
}

function severityFromRatio(value: number | null, thresholds: FuelAuditThresholds): "watch" | "high" {
  return value != null && value >= thresholds.highRatio ? "high" : "watch";
}

function sortTxs(rows: FuelAuditRow[]): FuelAuditRow[] {
  return [...rows].sort((left, right) => {
    const delta = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
    return delta !== 0 ? delta : left.id - right.id;
  });
}

type SubjectBucket = {
  subject: FuelAuditSubject;
  rows: FuelAuditRow[];
};

function bucketsForProduct(rows: FuelAuditRow[], product: FuelAuditProduct): SubjectBucket[] {
  const map = new Map<string, SubjectBucket>();
  for (const row of rows) {
    if (fuelAuditProduct(row.category) !== product) continue;
    const subject = fuelAuditSubject(row);
    const bucket = map.get(subject.key) ?? { subject, rows: [] };
    bucket.rows.push(row);
    if (!bucket.subject.unit && subject.unit) bucket.subject = subject;
    if (bucket.subject.driverName === "Unassigned" && subject.driverName !== "Unassigned") {
      bucket.subject = subject;
    }
    map.set(subject.key, bucket);
  }
  return [...map.values()];
}

function historyForSubject(
  rows: FuelAuditRow[],
  window: FuelAuditWindow,
  subjectKey: string,
  product: FuelAuditProduct,
  thresholds: FuelAuditThresholds,
): FuelAuditRow[] {
  const from = Date.parse(window.fromIso);
  const lookback = from - thresholds.ownBaselineLookbackDays * 86_400_000;
  return rows.filter((row) => {
    if (fuelAuditProduct(row.category) !== product) return false;
    if (fuelAuditSubject(row).key !== subjectKey) return false;
    const at = Date.parse(row.occurred_at);
    return Number.isFinite(at) && at >= lookback && at < from;
  });
}

function shortGapPairs(rows: FuelAuditRow[], hours: number): Array<{ hours: number; txs: FuelAuditRow[] }> {
  const sorted = sortTxs(rows);
  const pairs: Array<{ hours: number; txs: FuelAuditRow[] }> = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = hoursBetween(sorted[i - 1]!.occurred_at, sorted[i]!.occurred_at);
    if (gap != null && gap <= hours && gap >= 0) {
      pairs.push({ hours: gap, txs: [sorted[i - 1]!, sorted[i]!] });
    }
  }
  return pairs;
}

function duplicateGroups(rows: FuelAuditRow[], thresholds: FuelAuditThresholds): FuelAuditRow[][] {
  const byDay = new Map<string, FuelAuditRow[]>();
  for (const row of rows) {
    const at = Date.parse(row.occurred_at);
    if (!Number.isFinite(at)) continue;
    if (row.gallons == null || !Number.isFinite(row.gallons)) continue;
    const day = ymdInTimeZone(new Date(at), DISPLAY_TIME_ZONE);
    const station = normalizeStation(row.location);
    if (!station) continue;
    const key = `${day}|${station}`;
    const list = byDay.get(key) ?? [];
    list.push(row);
    byDay.set(key, list);
  }
  const groups: FuelAuditRow[][] = [];
  for (const list of byDay.values()) {
    if (list.length < 2) continue;
    const used = new Set<number>();
    for (let i = 0; i < list.length; i += 1) {
      const seed = list[i]!;
      if (used.has(seed.id)) continue;
      const cluster = [seed];
      for (let j = i + 1; j < list.length; j += 1) {
        const other = list[j]!;
        if (used.has(other.id)) continue;
        if (gallonsClose(seed.gallons!, other.gallons!, thresholds)) cluster.push(other);
      }
      if (cluster.length >= 2) {
        for (const row of cluster) used.add(row.id);
        groups.push(sortTxs(cluster));
      }
    }
  }
  return groups;
}

export function scoreFuelAudit(
  rows: FuelAuditRow[],
  window: FuelAuditWindow,
  thresholds: FuelAuditThresholds = FUEL_AUDIT_THRESHOLDS,
): FuelAuditReport {
  const windowRows = rows.filter((row) => inFuelAuditWindow(row.occurred_at, window));
  const scored = windowRows.filter((row) => fuelAuditProduct(row.category) != null);
  const flags: FuelAuditFlag[] = [];
  const products: FuelAuditProduct[] = ["diesel", "def", "reefer"];

  for (const product of products) {
    const productRows = scored.filter((row) => fuelAuditProduct(row.category) === product);
    const buckets = bucketsForProduct(productRows, product);
    const fillCounts = buckets.map((bucket) => bucket.rows.length);
    const fillGallons = productRows
      .map((row) => row.gallons)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const fillAmounts = productRows
      .map((row) => row.amount)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const gallonsPerDay = buckets
      .map((bucket) => {
        const gallons = bucket.rows.reduce((sum, row) => sum + (row.gallons ?? 0), 0);
        return gallons > 0 ? gallons / window.days : null;
      })
      .filter((value): value is number => value != null);
    const fleetFillMedian = median(fillCounts);
    const fleetFillGallons = median(fillGallons);
    const fleetFillAmount = median(fillAmounts);
    const fleetGallonsPerDay = median(gallonsPerDay);

    for (const bucket of buckets) {
      const fills = bucket.rows.length;
      const totalGallons = bucket.rows.reduce((sum, row) => sum + (row.gallons ?? 0), 0);
      const perDay = totalGallons / window.days;
      const ownHistory = historyForSubject(rows, window, bucket.subject.key, product, thresholds);
      const ownFillGallons = median(
        ownHistory
          .map((row) => row.gallons)
          .filter((value): value is number => value != null && Number.isFinite(value)),
      );
      const ownReady = ownHistory.length >= thresholds.ownBaselineMinFills && ownFillGallons != null;

      if (product !== "def") {
        const gaps = shortGapPairs(bucket.rows, thresholds.shortGapHoursNonDef);
        if (gaps.length) {
          const tightest = gaps.reduce((best, gap) => (gap.hours < best.hours ? gap : best));
          flags.push({
            kind: "too_often",
            severity: tightest.hours <= thresholds.shortGapHighHours ? "high" : "watch",
            product,
            reason: "short_gap",
            subjectKey: bucket.subject.key,
            driverId: bucket.subject.driverId,
            driverName: bucket.subject.driverName,
            unit: bucket.subject.unit,
            metric: `${fills} fills / ${formatNum(tightest.hours)}h gap`,
            why: `${product} fills ${formatNum(tightest.hours)}h apart (floor ${thresholds.shortGapHoursNonDef}h, not DEF)`,
            score: 3 + Math.max(0, thresholds.shortGapHoursNonDef - tightest.hours),
            txs: tightest.txs.map(pointer),
          });
        }
      }

      const vsFleetOften =
        buckets.length >= 2 &&
        fleetFillMedian != null &&
        fills >= thresholds.minFillsToFlag &&
        fills >= fleetFillMedian + thresholds.extraFillsVsMedian &&
        fills >= fleetFillMedian * thresholds.fillCountVsFleetMedian;
      if (vsFleetOften && fleetFillMedian != null) {
        const oftenRatio = ratio(fills, fleetFillMedian) ?? fills;
        flags.push({
          kind: "too_often",
          severity: severityFromRatio(oftenRatio, thresholds),
          product,
          reason: "fill_count",
          subjectKey: bucket.subject.key,
          driverId: bucket.subject.driverId,
          driverName: bucket.subject.driverName,
          unit: bucket.subject.unit,
          metric: `${fills} fills (fleet median ${formatNum(fleetFillMedian)})`,
          why: `${product} fill count ${formatRatio(oftenRatio)} fleet median`,
          score: oftenRatio,
          txs: sortTxs(bucket.rows).slice(0, 5).map(pointer),
        });
      }

      const heavyFills = sortTxs(bucket.rows).filter((row) => {
        if (row.gallons == null || !Number.isFinite(row.gallons)) return false;
        if (row.gallons < minFillGallons(product, thresholds)) return false;
        const vsOwn = ownReady && row.gallons >= ownFillGallons! * thresholds.gallonsPerFillVsOwn;
        const vsFleet =
          fleetFillGallons != null &&
          buckets.length >= 2 &&
          row.gallons >= fleetFillGallons * thresholds.gallonsPerFillVsFleet;
        return Boolean(vsOwn || vsFleet);
      });
      const dayRatio = ratio(perDay, fleetGallonsPerDay);
      const heavyDay =
        buckets.length >= 2 &&
        fleetGallonsPerDay != null &&
        perDay >= minDayGallons(product, thresholds) &&
        dayRatio != null &&
        dayRatio >= thresholds.gallonsPerDayVsFleet;
      const heavyAmounts = sortTxs(bucket.rows).filter((row) => {
        if (row.amount == null || !Number.isFinite(row.amount)) return false;
        return (
          fleetFillAmount != null &&
          buckets.length >= 2 &&
          row.amount >= fleetFillAmount * thresholds.amountPerFillVsFleet
        );
      });

      if (heavyFills.length || heavyDay || (heavyAmounts.length && !heavyFills.length)) {
        const sample = heavyFills[0] ?? heavyAmounts[0] ?? sortTxs(bucket.rows)[0]!;
        const fillRatio =
          sample.gallons != null
            ? ratio(sample.gallons, ownReady ? ownFillGallons : fleetFillGallons)
            : ratio(sample.amount ?? 0, fleetFillAmount);
        const usedRatio = heavyFills.length ? fillRatio : heavyDay ? dayRatio : fillRatio;
        let why: string;
        let metric: string;
        let reason: string;
        if (heavyFills.length && sample.gallons != null) {
          reason = "gallons_fill";
          metric = `${formatGal(sample.gallons)} / fill`;
          why = ownReady
            ? `${product} fill ${formatGal(sample.gallons)} vs own median ${formatGal(ownFillGallons)} (${formatRatio(sample.gallons / ownFillGallons!)})`
            : `${product} fill ${formatGal(sample.gallons)} vs fleet median ${formatGal(fleetFillGallons)} (${formatRatio(usedRatio ?? 0)})`;
        } else if (heavyDay) {
          reason = "gallons_day";
          metric = `${formatGal(perDay)} / day`;
          why = `${product} ${formatGal(perDay)}/day vs fleet median ${formatGal(fleetGallonsPerDay)} (${formatRatio(dayRatio ?? 0)})`;
        } else {
          reason = "amount_fill";
          metric = `${formatMoney(sample.amount)} / fill`;
          why = `${product} ${formatMoney(sample.amount)} vs fleet median ${formatMoney(fleetFillAmount)} (${formatRatio(usedRatio ?? 0)})`;
        }
        flags.push({
          kind: "too_much",
          severity: severityFromRatio(usedRatio, thresholds),
          product,
          reason,
          subjectKey: bucket.subject.key,
          driverId: bucket.subject.driverId,
          driverName: bucket.subject.driverName,
          unit: bucket.subject.unit,
          metric,
          why,
          score: usedRatio ?? 1,
          txs: (heavyFills.length ? heavyFills : heavyDay ? sortTxs(bucket.rows) : heavyAmounts)
            .slice(0, 5)
            .map(pointer),
        });
      }

      for (const group of duplicateGroups(bucket.rows, thresholds)) {
        const gallons = group.map((row) => row.gallons).filter((value): value is number => value != null);
        flags.push({
          kind: "duplicate",
          severity: group.length >= 3 ? "high" : "watch",
          product,
          reason: "same_day_swipe",
          subjectKey: bucket.subject.key,
          driverId: bucket.subject.driverId,
          driverName: bucket.subject.driverName,
          unit: bucket.subject.unit,
          metric: `${group.length} swipes ${formatGal(gallons[0] ?? null)}`,
          why: `same-day ${product} at ${group[0]!.location} with near-identical gallons`,
          score: 1.4 + group.length * 0.2,
          txs: group.map(pointer),
        });
      }
    }

    if (product !== "def") {
      const byUnit = new Map<string, FuelAuditRow[]>();
      for (const row of productRows) {
        const unit = normalizeUnit(row.truck_unit || row.unit_number);
        if (!unit) continue;
        const list = byUnit.get(unit) ?? [];
        list.push(row);
        byUnit.set(unit, list);
      }
      for (const [unit, unitRows] of byUnit) {
        const subjects = new Set(unitRows.map((row) => fuelAuditSubject(row).key));
        if (subjects.size < 2) continue;
        const gaps = shortGapPairs(unitRows, thresholds.shortGapHoursNonDef);
        const mixed = gaps.find((gap) => fuelAuditSubject(gap.txs[0]!).key !== fuelAuditSubject(gap.txs[1]!).key);
        if (!mixed) continue;
        const names = [...new Set(mixed.txs.map((row) => fuelAuditSubject(row).driverName))].join(" / ");
        flags.push({
          kind: "too_often",
          severity: mixed.hours <= thresholds.shortGapHighHours ? "high" : "watch",
          product,
          reason: "unit_short_gap",
          subjectKey: `u:${unit}`,
          driverId: null,
          driverName: names || "Unassigned",
          unit,
          metric: `unit ${unit} / ${formatNum(mixed.hours)}h gap`,
          why: `${product} fills on unit ${unit} ${formatNum(mixed.hours)}h apart under different names`,
          score: 2.8 + Math.max(0, thresholds.shortGapHoursNonDef - mixed.hours),
          txs: mixed.txs.map(pointer),
        });
      }
    }
  }

  const ranked = flags.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "high" ? -1 : 1;
    return right.score - left.score;
  });
  return {
    window,
    txCount: windowRows.length,
    scoredCount: scored.length,
    flags: ranked.slice(0, thresholds.maxFlags),
  };
}

export function summarizeFuelAudit(report: FuelAuditReport): {
  window: Pick<FuelAuditWindow, "kind" | "startYmd" | "endYmd" | "label">;
  txCount: number;
  flagCount: number;
  flags: Array<{
    driver: string;
    unit: string;
    kind: FuelAuditFlagKind;
    product: FuelAuditProduct;
    metric: string;
    why: string;
    txs: Array<{ id: number; date: string; gallons: number | null }>;
  }>;
  note: string;
} {
  return {
    window: {
      kind: report.window.kind,
      startYmd: report.window.startYmd,
      endYmd: report.window.endYmd,
      label: report.window.label,
    },
    txCount: report.txCount,
    flagCount: report.flags.length,
    flags: report.flags.map((flag) => ({
      driver: flag.driverName,
      unit: flag.unit,
      kind: flag.kind,
      product: flag.product,
      metric: flag.metric,
      why: flag.why,
      txs: flag.txs.map((tx) => ({
        id: tx.id,
        date: ymdInTimeZone(new Date(tx.occurred_at), DISPLAY_TIME_ZONE),
        gallons: tx.gallons,
      })),
    })),
    note: "Soft flags only. Never email or text a driver about fuel. Never invent transactions.",
  };
}
