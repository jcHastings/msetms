import { writeAudit } from "./desk";
import { getDb } from "./db";
import { labelForPayCategory } from "./load-page-shared";
import { inPayWeek, normalizePayWeek, shiftPayWeek } from "./pay-week";
import { driverPayItems, type LoadPayItem } from "./pay-items";
import { getDriver, listDrivers, listLoads } from "./queries";
import {
  labelForReimbursementCategory,
  listStatementReimbursements,
  markWeekReimbursementsPaid,
  type DriverReimbursement,
} from "./reimbursements";
import { computeOwnerOperatorPay, impliedOwnerOperatorPercent } from "./settlement";
import { formatCompanyAddress, getCarrierAuthority, getCompanySettings } from "./settings";
import { isOwnerOperator, labelForDriverKind, normalizeDriverKind, type DriverWithTruck, type LoadView } from "./types";

/**
 * Live loads stay on the operations desk until someone sends them to accounting.
 * Statements still list the week's assigned loads so stored OO pay and pay items show up.
 * Set this to false to match Driver Pay Mgmt. (accounting desk only, plus archived).
 */
export const SETTLEMENT_INCLUDES_OPERATIONS_LOADS = true;

export type DeductionBasis = "fixed" | "per_load";
export type DeductionAppliesTo = "company_driver" | "owner_operator" | "driver";

export type DeductionTemplate = {
  id: number;
  name: string;
  amount: number;
  basis: DeductionBasis;
  applies_to: DeductionAppliesTo;
  driver_id: number | null;
  active: number;
  example: number;
  created_at: string;
};

export type SettlementOneOff = {
  id: number;
  driver_id: number;
  week_start: string;
  name: string;
  amount: number;
  created_at: string;
};

export type SettlementLoadLine = {
  loadId: number;
  loadNumber: string;
  lane: string;
  pickup: string;
  delivery: string;
  miles: number | null;
  linehaul: number | null;
  ooPercent: number | null;
  basis: string;
};

export type SettlementExtraLine = {
  id: number;
  loadNumber: string;
  label: string;
  amount: number;
};

export type SettlementReimbursementLine = {
  id: number;
  categoryLabel: string;
  loadNumber: string;
  amount: number;
  status: "approved" | "paid";
  receiptHref: string;
};

export type SettlementDeductionLine = {
  key: string;
  oneOffId: number | null;
  name: string;
  detail: string;
  amount: number;
};

export type SettlementStatement = {
  statementNumber: string;
  driverId: number;
  driverName: string;
  driverKind: "owner_operator" | "company_driver";
  driverKindLabel: string;
  ownerOperatorCompany: string;
  weekStart: string;
  weekEnd: string;
  paidAt: string;
  carrierName: string;
  carrierAddress: string;
  usdot: string;
  mcNumber: string;
  loads: SettlementLoadLine[];
  extras: SettlementExtraLine[];
  reimbursements: SettlementReimbursementLine[];
  deductions: SettlementDeductionLine[];
  gross: number;
  reimbursementTotal: number;
  deductionTotal: number;
  net: number;
};

export type SettlementWeekRow = {
  driverId: number;
  driverName: string;
  driverKindLabel: string;
  ownerOperatorCompany: string;
  loadCount: number;
  gross: number;
  reimbursementTotal: number;
  deductionTotal: number;
  net: number;
  statementNumber: string;
  paidAt: string;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatStatementMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function statementNumberFor(weekStart: string, driverId: number): string {
  return `SS-${weekStart.replaceAll("-", "")}-${driverId}`;
}

export function loadIncludedOnStatement(
  load: { status: string; accounting_desk?: string | null },
  includeOperations = SETTLEMENT_INCLUDES_OPERATIONS_LOADS,
): boolean {
  if (load.status === "cancelled") return false;
  if (includeOperations) return true;
  return load.accounting_desk === "accounting" || load.accounting_desk === "archived";
}

export function linehaulForLoad(input: {
  ownerOperator: boolean;
  rate: number | null;
  ooPercent: number | null;
  ooPay: number | null;
  flatDriverExpense: number | null;
}): { amount: number | null; ooPercent: number | null; basis: string } {
  if (input.flatDriverExpense != null) {
    const amount = roundMoney(input.flatDriverExpense);
    const percent = input.ownerOperator
      ? (input.ooPercent ?? impliedOwnerOperatorPercent(amount, input.rate))
      : null;
    return {
      amount,
      ooPercent: percent,
      basis: input.ownerOperator ? "Owner-operator flat rate" : "Flat rate",
    };
  }
  if (!input.ownerOperator) {
    return { amount: null, ooPercent: null, basis: "No linehaul stored" };
  }
  const amount = input.ooPay ?? computeOwnerOperatorPay(input.rate, input.ooPercent);
  const percent = input.ooPercent ?? impliedOwnerOperatorPercent(amount, input.rate);
  if (amount == null) return { amount: null, ooPercent: percent, basis: "No linehaul stored" };
  return {
    amount: roundMoney(amount),
    ooPercent: percent,
    basis: percent != null ? "Owner-operator percent" : "Owner-operator pay",
  };
}

function periodIso(load: LoadView): string {
  return load.delivery_end || load.delivery_start || load.updated_at || "";
}

function loadsInWeek(from: string, to: string): LoadView[] {
  return listLoads({ status: "all" }).filter(
    (load) =>
      load.driver_id != null &&
      loadIncludedOnStatement(load) &&
      inPayWeek(periodIso(load), from, to),
  );
}

function flatDriverExpense(items: LoadPayItem[]): number | null {
  const flats = items.filter((item) => item.side === "expense" && item.category === "flat_rate");
  if (!flats.length) return null;
  return roundMoney(flats.reduce((sum, item) => sum + (item.total ?? 0), 0));
}

function extraPayItems(items: LoadPayItem[]): LoadPayItem[] {
  return items.filter((item) => !(item.side === "expense" && item.category === "flat_rate"));
}

export function deductionApplies(
  template: Pick<DeductionTemplate, "active" | "applies_to" | "driver_id">,
  driver: { id: number; driver_type?: string | null },
): boolean {
  if (!Number(template.active)) return false;
  if (template.applies_to === "company_driver") return !isOwnerOperator(driver.driver_type);
  if (template.applies_to === "owner_operator") return isOwnerOperator(driver.driver_type);
  if (template.applies_to === "driver") return template.driver_id === driver.id;
  return false;
}

function mapTemplate(row: DeductionTemplate): DeductionTemplate {
  return {
    ...row,
    driver_id: row.driver_id ?? null,
    active: Number(row.active) ? 1 : 0,
    example: Number(row.example) ? 1 : 0,
    amount: Number(row.amount) || 0,
  };
}

export function listDeductionTemplates(): DeductionTemplate[] {
  return (getDb().prepare("SELECT * FROM deduction_templates ORDER BY id").all() as DeductionTemplate[]).map(mapTemplate);
}

export function listOneOffs(driverId: number, weekStart: string): SettlementOneOff[] {
  return getDb()
    .prepare("SELECT * FROM settlement_one_offs WHERE driver_id = ? AND week_start = ? ORDER BY id")
    .all(driverId, weekStart) as SettlementOneOff[];
}

function paidAtFor(driverId: number, weekStart: string): string {
  const row = getDb()
    .prepare("SELECT paid_at FROM settlement_statements WHERE driver_id = ? AND week_start = ?")
    .get(driverId, weekStart) as { paid_at?: string } | undefined;
  return String(row?.paid_at ?? "");
}

function carrierHeader(): Pick<SettlementStatement, "carrierName" | "carrierAddress" | "usdot" | "mcNumber"> {
  const settings = getCompanySettings();
  const authority = getCarrierAuthority();
  return {
    carrierName: settings.company_name,
    carrierAddress: formatCompanyAddress(settings),
    usdot: authority.usdot,
    mcNumber: authority.mc_number,
  };
}

function reimbursementLines(rows: DriverReimbursement[]): SettlementReimbursementLine[] {
  return rows
    .filter((row): row is DriverReimbursement & { status: "approved" | "paid" } => row.status === "approved" || row.status === "paid")
    .map((row) => ({
      id: row.id,
      categoryLabel: labelForReimbursementCategory(row.category),
      loadNumber: row.load_number || "",
      amount: roundMoney(row.amount),
      status: row.status,
      receiptHref: `/api/reimbursements/${row.id}/receipt`,
    }));
}

export function buildSettlement(driverId: number, weekInput?: string | null, now = new Date()): SettlementStatement | null {
  const driver = getDriver(driverId);
  if (!driver) return null;
  const week = normalizePayWeek(weekInput, now);
  const loads = loadsInWeek(week.from, week.to).filter((load) => load.driver_id === driver.id);
  const ownerOperator = isOwnerOperator(driver.driver_type);
  const loadLines: SettlementLoadLine[] = [];
  const extras: SettlementExtraLine[] = [];
  for (const load of loads) {
    const items = driverPayItems(load.id);
    const linehaul = linehaulForLoad({
      ownerOperator,
      rate: load.rate,
      ooPercent: load.oo_percent,
      ooPay: load.oo_pay,
      flatDriverExpense: flatDriverExpense(items),
    });
    loadLines.push({
      loadId: load.id,
      loadNumber: load.load_number,
      lane: `${load.origin} → ${load.destination}`,
      pickup: (load.pickup_start || "").slice(0, 10),
      delivery: (load.delivery_end || load.delivery_start || "").slice(0, 10),
      miles: load.route_miles != null && load.route_miles > 0 ? load.route_miles : null,
      linehaul: linehaul.amount,
      ooPercent: linehaul.ooPercent,
      basis: linehaul.basis,
    });
    for (const item of extraPayItems(items)) {
      const label = labelForPayCategory(item.category);
      const notes = item.notes.trim();
      extras.push({
        id: item.id,
        loadNumber: load.load_number,
        label: notes ? `${label} — ${notes}` : label,
        amount: roundMoney(item.total ?? 0),
      });
    }
  }
  const reimbursements = reimbursementLines(listStatementReimbursements(driver.id, week.from));
  const deductions = deductionLines(driver, loadLines.length, week.from);
  const gross = roundMoney(
    loadLines.reduce((sum, line) => sum + (line.linehaul ?? 0), 0) + extras.reduce((sum, line) => sum + line.amount, 0),
  );
  const reimbursementTotal = roundMoney(reimbursements.reduce((sum, line) => sum + line.amount, 0));
  const deductionTotal = roundMoney(deductions.reduce((sum, line) => sum + line.amount, 0));
  const kind = normalizeDriverKind(driver.driver_type);
  return {
    statementNumber: statementNumberFor(week.from, driver.id),
    driverId: driver.id,
    driverName: driver.name,
    driverKind: kind,
    driverKindLabel: labelForDriverKind(driver.driver_type),
    ownerOperatorCompany: ownerOperator ? driver.company_name.trim() : "",
    weekStart: week.from,
    weekEnd: week.to,
    paidAt: paidAtFor(driver.id, week.from),
    ...carrierHeader(),
    loads: loadLines,
    extras,
    reimbursements,
    deductions,
    gross,
    reimbursementTotal,
    deductionTotal,
    net: roundMoney(gross + reimbursementTotal - deductionTotal),
  };
}

function deductionLines(driver: DriverWithTruck, loadCount: number, weekStart: string): SettlementDeductionLine[] {
  const lines: SettlementDeductionLine[] = [];
  for (const template of listDeductionTemplates()) {
    if (!deductionApplies(template, driver)) continue;
    if (template.basis === "per_load") {
      if (loadCount <= 0) continue;
      lines.push({
        key: `template-${template.id}`,
        oneOffId: null,
        name: template.name,
        detail: `${formatStatementMoney(template.amount)} × ${loadCount} load${loadCount === 1 ? "" : "s"}`,
        amount: roundMoney(template.amount * loadCount),
      });
      continue;
    }
    lines.push({
      key: `template-${template.id}`,
      oneOffId: null,
      name: template.name,
      detail: "Fixed, this week",
      amount: roundMoney(template.amount),
    });
  }
  for (const item of listOneOffs(driver.id, weekStart)) {
    lines.push({
      key: `one-${item.id}`,
      oneOffId: item.id,
      name: item.name,
      detail: "One-time, this statement",
      amount: roundMoney(item.amount),
    });
  }
  return lines;
}

function fixedTemplateMatches(template: DeductionTemplate, driver: DriverWithTruck): boolean {
  return template.basis === "fixed" && deductionApplies(template, driver);
}

export function listSettlementWeek(weekInput?: string | null, now = new Date()): {
  week: { from: string; to: string };
  rows: SettlementWeekRow[];
} {
  const week = normalizePayWeek(weekInput, now);
  const ids = new Set<number>();
  for (const load of loadsInWeek(week.from, week.to)) {
    if (load.driver_id) ids.add(load.driver_id);
  }
  const oneOffDrivers = getDb()
    .prepare("SELECT DISTINCT driver_id FROM settlement_one_offs WHERE week_start = ?")
    .all(week.from) as Array<{ driver_id: number }>;
  for (const row of oneOffDrivers) ids.add(row.driver_id);
  const templates = listDeductionTemplates();
  for (const driver of listDrivers()) {
    if (templates.some((template) => fixedTemplateMatches(template, driver))) ids.add(driver.id);
  }
  const rows = [...ids]
    .map((id) => buildSettlement(id, week.from, now))
    .filter((row): row is SettlementStatement => row != null)
    .filter((row) => row.loads.length > 0 || row.reimbursements.length > 0 || row.deductions.length > 0)
    .map((row) => ({
      driverId: row.driverId,
      driverName: row.driverName,
      driverKindLabel: row.driverKindLabel,
      ownerOperatorCompany: row.ownerOperatorCompany,
      loadCount: row.loads.length,
      gross: row.gross,
      reimbursementTotal: row.reimbursementTotal,
      deductionTotal: row.deductionTotal,
      net: row.net,
      statementNumber: row.statementNumber,
      paidAt: row.paidAt,
    }))
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
  return { week, rows };
}

export function listDriverStatementWeeks(driverId: number, now = new Date()): Array<{ from: string; to: string }> {
  const keys = new Set<string>([defaultWeek(now).from]);
  for (const load of listLoads({ status: "all" })) {
    if (load.driver_id !== driverId || !loadIncludedOnStatement(load)) continue;
    const day = periodIso(load).slice(0, 10);
    if (day) keys.add(normalizePayWeek(day, now).from);
  }
  const extraWeeks = getDb()
    .prepare(
      `SELECT week_start FROM settlement_one_offs WHERE driver_id = ?
       UNION
       SELECT settlement_week_start FROM driver_reimbursements
       WHERE driver_id = ? AND settlement_week_start != ''`,
    )
    .all(driverId, driverId) as Array<{ week_start: string }>;
  for (const row of extraWeeks) {
    if (row.week_start) keys.add(normalizePayWeek(row.week_start, now).from);
  }
  return [...keys].sort((a, b) => b.localeCompare(a)).map((from) => normalizePayWeek(from, now));
}

function defaultWeek(now: Date): { from: string; to: string } {
  return normalizePayWeek(undefined, now);
}

function parseMoneyInput(value: unknown, label: string): number {
  const amount = Number(String(value ?? "").trim().replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be greater than zero.`);
  if (amount > 100000) throw new Error(`${label} is too large.`);
  return roundMoney(amount);
}

function parseBasis(value: unknown): DeductionBasis {
  const raw = String(value ?? "").trim();
  if (raw !== "fixed" && raw !== "per_load") throw new Error("Pick fixed or per load.");
  return raw;
}

function parseApplies(value: unknown): DeductionAppliesTo {
  const raw = String(value ?? "").trim();
  if (raw !== "company_driver" && raw !== "owner_operator" && raw !== "driver") {
    throw new Error("Pick who this deduction applies to.");
  }
  return raw;
}

export function saveDeductionTemplate(input: {
  id?: number | null;
  name: unknown;
  amount: unknown;
  basis: unknown;
  appliesTo: unknown;
  driverId?: number | null;
  active: boolean;
}): number {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Enter a name.");
  if (name.length > 80) throw new Error("Name must be 80 characters or less.");
  const amount = parseMoneyInput(input.amount, "Amount");
  const basis = parseBasis(input.basis);
  const appliesTo = parseApplies(input.appliesTo);
  const driverId = appliesTo === "driver" ? input.driverId ?? null : null;
  if (appliesTo === "driver") {
    if (!driverId || !getDriver(driverId)) throw new Error("Pick the driver this deduction applies to.");
  }
  const active = input.active ? 1 : 0;
  if (input.id) {
    const existing = getDb().prepare("SELECT id FROM deduction_templates WHERE id = ?").get(input.id) as
      | { id: number }
      | undefined;
    if (!existing) throw new Error("Deduction item not found.");
    getDb()
      .prepare(
        `UPDATE deduction_templates
         SET name = ?, amount = ?, basis = ?, applies_to = ?, driver_id = ?, active = ?
         WHERE id = ?`,
      )
      .run(name, amount, basis, appliesTo, driverId, active, input.id);
    writeAudit("settlement_deduction", "deduction_template", input.id, `${name} ${active ? "on" : "off"}`);
    return input.id;
  }
  const result = getDb()
    .prepare(
      `INSERT INTO deduction_templates (
        name, amount, basis, applies_to, driver_id, active, example, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(name, amount, basis, appliesTo, driverId, active, new Date().toISOString());
  const id = Number(result.lastInsertRowid);
  writeAudit("settlement_deduction", "deduction_template", id, `added ${name}`);
  return id;
}

export function deleteDeductionTemplate(id: number): void {
  const existing = getDb().prepare("SELECT name FROM deduction_templates WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
  if (!existing) throw new Error("Deduction item not found.");
  getDb().prepare("DELETE FROM deduction_templates WHERE id = ?").run(id);
  writeAudit("settlement_deduction", "deduction_template", id, `removed ${existing.name}`);
}

export function addStatementOneOff(input: {
  driverId: number;
  weekStart: string;
  name: unknown;
  amount: unknown;
}): number {
  if (!getDriver(input.driverId)) throw new Error("Driver not found.");
  const week = normalizePayWeek(input.weekStart);
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Enter a name.");
  if (name.length > 80) throw new Error("Name must be 80 characters or less.");
  const amount = parseMoneyInput(input.amount, "Amount");
  const result = getDb()
    .prepare(
      `INSERT INTO settlement_one_offs (driver_id, week_start, name, amount, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.driverId, week.from, name, amount, new Date().toISOString());
  const id = Number(result.lastInsertRowid);
  writeAudit("settlement_one_off", "settlement_one_off", id, name);
  return id;
}

export function deleteStatementOneOff(id: number): void {
  const existing = getDb().prepare("SELECT id, name FROM settlement_one_offs WHERE id = ?").get(id) as
    | { id: number; name: string }
    | undefined;
  if (!existing) throw new Error("Deduction not found.");
  getDb().prepare("DELETE FROM settlement_one_offs WHERE id = ?").run(id);
  writeAudit("settlement_one_off", "settlement_one_off", id, `removed ${existing.name}`);
}

/** Record-only paid stamp. Does not move money, and flips this week's approved reimbursements to paid. */
export function markSettlementRecordPaid(driverId: number, weekInput: string, now = new Date()): { paidAt: string; reimbursements: number } {
  const driver = getDriver(driverId);
  if (!driver) throw new Error("Driver not found.");
  const week = normalizePayWeek(weekInput, now);
  const existing = getDb()
    .prepare("SELECT paid_at FROM settlement_statements WHERE driver_id = ? AND week_start = ?")
    .get(driverId, week.from) as { paid_at?: string } | undefined;
  const already = String(existing?.paid_at ?? "").trim();
  if (already) {
    return { paidAt: already, reimbursements: 0 };
  }
  const paidAt = now.toISOString();
  getDb()
    .prepare(
      `INSERT INTO settlement_statements (driver_id, week_start, week_end, paid_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(driverId, week.from, week.to, paidAt, paidAt);
  const reimbursements = markWeekReimbursementsPaid(driverId, week.from, paidAt);
  writeAudit("settlement_paid", "settlement_statement", driverId, `${week.from} record only`);
  return { paidAt, reimbursements };
}

export function adjacentWeeks(from: string): { previous: string; next: string } {
  return { previous: shiftPayWeek(from, -1).from, next: shiftPayWeek(from, 1).from };
}
