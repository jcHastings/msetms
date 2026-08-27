import { parseCsvRecords } from "./location-csv";
import { renderUtf8Csv } from "./csv";
import { DISPLAY_TIME_ZONE, ymdInTimeZone } from "./format";
import { extractNProductDriverName, looksLikeFleetOneReport, parseFleetOneFuelText } from "./fuel-fleetone";
import type { DriverWithTruck, TruckWithDriver } from "./types";

export const FUEL_BUCKETS = [
  { value: "truck_diesel", label: "Truck diesel" },
  { value: "reefer_diesel", label: "Reefer diesel" },
  { value: "def", label: "DEF" },
  { value: "scale", label: "Scale" },
] as const;

export type FuelBucket = (typeof FUEL_BUCKETS)[number]["value"];

export type FuelBucketTotals = Record<FuelBucket, { gallons: number; amount: number }>;

export const FUEL_CSV_HEADERS = [
  "Date",
  "Time",
  "Driver Name",
  "Driver ID",
  "Unit",
  "Prompt",
  "Invoice",
  "Location",
  "Category",
  "Description",
  "Gallons",
  "Price",
  "Total",
  "Card Number",
] as const;

export const FUEL_EXPORT_HEADERS = [
  "Date",
  "Time",
  "Driver",
  "Truck",
  "Location",
  "Gallons",
  "PPG",
  "Amount",
  "Card Last4",
  "Category",
  "Invoice",
  "Source File",
] as const;

export type FuelTransaction = {
  id: number;
  occurred_at: string;
  driver_id: number | null;
  truck_id: number | null;
  load_id: number | null;
  location: string;
  gallons: number | null;
  price_per_gallon: number | null;
  amount: number | null;
  card_last4: string;
  source_file: string;
  category: string;
  unit_number: string;
  driver_name_raw: string;
  invoice_number: string;
  prompt_data: string;
  dedup_key: string;
  created_at: string;
};

export type FuelTransactionView = FuelTransaction & {
  driver_name: string | null;
  truck_unit: string | null;
  load_number: string | null;
};

export type FuelCsvRowError = { row: number; error: string };

export type ParsedFuelCsvRow = {
  row: number;
  occurredAt: string;
  driverName: string;
  driverIdRaw: string;
  unitNumber: string;
  location: string;
  gallons: number | null;
  pricePerGallon: number | null;
  amount: number | null;
  cardLast4: string;
  category: string;
  invoice: string;
  prompt: string;
  dedupKey: string;
};

export type FuelCsvParseResult = {
  rows: ParsedFuelCsvRow[];
  skipped: number;
  errors: FuelCsvRowError[];
};

export type FuelImportResult = {
  ok: boolean;
  error?: string;
  created?: number;
  skipped?: number;
  unmatched?: number;
  errors?: FuelCsvRowError[];
};

export type FuelPeriodTotals = FuelBucketTotals & { gallons: number; amount: number };

export type FuelRollup = {
  id: number;
  name: string;
  week: FuelPeriodTotals;
  month: FuelPeriodTotals;
  weekGallons: number;
  weekAmount: number;
  monthGallons: number;
  monthAmount: number;
};

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "trx date", "transaction date", "trans date", "post date", "tran date"],
  time: ["time", "trx time", "transaction time", "trans time"],
  driverName: ["driver name", "driver", "name", "nname", "drivername"],
  driverId: ["driver id", "driverid", "emp id", "employee id", "employee"],
  unit: ["unit", "truck", "unit number", "unit no", "truck number", "vehicle", "vehicle number"],
  prompt: ["prompt", "prompt data", "prompt no", "prompt number"],
  invoice: ["invoice", "invoice number", "invoice no", "inv"],
  location: ["location", "city", "location city", "city state", "loc", "site", "location name"],
  gallons: ["gallons", "gal", "qty", "quantity", "volume"],
  price: ["price", "ppg", "price per gallon", "unit price", "pump price"],
  total: ["total", "amount", "amt", "cost", "net total"],
  card: ["card number", "card", "card no", "card last4", "last 4"],
  category: ["category", "product", "fuel type", "item", "item type"],
  description: ["description", "desc", "item description"],
};

export function renderFuelTemplate(): string {
  return renderUtf8Csv(FUEL_CSV_HEADERS, []);
}

export function renderFuelExportCsv(rows: FuelTransactionView[]): string {
  return renderUtf8Csv(
    FUEL_EXPORT_HEADERS,
    rows.map((row) => {
      const when = new Date(row.occurred_at);
      const date = Number.isNaN(when.getTime())
        ? row.occurred_at
        : `${when.getMonth() + 1}/${when.getDate()}/${when.getFullYear()}`;
      const time = Number.isNaN(when.getTime())
        ? ""
        : when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return [
        date,
        time,
        row.driver_name ?? "",
        row.truck_unit ?? row.unit_number,
        row.location,
        row.gallons == null ? "" : String(row.gallons),
        row.price_per_gallon == null ? "" : String(row.price_per_gallon),
        row.amount == null ? "" : String(row.amount),
        row.card_last4,
        labelForFuelBucket(row.category),
        row.invoice_number,
        row.source_file,
      ];
    }),
  );
}

export function emptyBucketTotals(): FuelBucketTotals {
  return {
    truck_diesel: { gallons: 0, amount: 0 },
    reefer_diesel: { gallons: 0, amount: 0 },
    def: { gallons: 0, amount: 0 },
    scale: { gallons: 0, amount: 0 },
  };
}

export function emptyPeriodTotals(): FuelPeriodTotals {
  return { ...emptyBucketTotals(), gallons: 0, amount: 0 };
}

export function classifyFuelCategory(raw: string): FuelBucket | "" {
  const key = raw.toLowerCase();
  if (!key.trim()) return "";
  if (/diesel exhaust|exhaust fluid|\bdef\b/.test(key)) return "def";
  if (/reefer/.test(key)) return "reefer_diesel";
  if (/scale/.test(key)) return "scale";
  if (/diesel|ulsd/.test(key)) return "truck_diesel";
  return "";
}

export function labelForFuelBucket(value: string): string {
  const key = String(value ?? "");
  if (!key || key === "other") return "—";
  if (key === "money_code") return "Money Code";
  return FUEL_BUCKETS.find((item) => item.value === key)?.label ?? key;
}

export function isFuelBucket(value: string): value is FuelBucket {
  return FUEL_BUCKETS.some((item) => item.value === value);
}

export function parseFuelReport(text: string, sourceFile = ""): FuelCsvParseResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("The file is empty. Upload a fuel CSV or a Transaction Activity Report PDF.");
  }
  const fleetOne = looksLikeFleetOneReport(trimmed, sourceFile);
  const efs = looksLikeEfsReport(trimmed);
  if (looksLikeCsvFuel(trimmed) && !efs && !fleetOne) return parseFuelCsv(trimmed);
  if (fleetOne) return toFuelCsvResult(parseFleetOneFuelText(trimmed));
  if (efs) return parseEfsFuelText(trimmed);
  return parseFuelCsv(trimmed);
}

function toFuelCsvResult(parsed: ReturnType<typeof parseFleetOneFuelText>): FuelCsvParseResult {
  return {
    skipped: parsed.skipped,
    errors: parsed.errors,
    rows: parsed.rows.map((row) => ({
      row: row.row,
      occurredAt: row.occurredAt,
      driverName: row.driverName,
      driverIdRaw: "",
      unitNumber: row.unitNumber,
      location: row.location,
      gallons: row.gallons,
      pricePerGallon: row.pricePerGallon,
      amount: row.amount,
      cardLast4: row.cardLast4,
      category: row.category,
      invoice: row.invoice,
      prompt: row.unitNumber,
      dedupKey: fuelRowDedupKey({
        invoice: row.invoice,
        category: row.category,
        gallons: row.gallons,
        occurred: new Date(row.occurredAt),
        amount: row.amount,
        cardLast4: row.cardLast4,
      }),
    })),
  };
}

export function looksLikeEfsReport(text: string): boolean {
  return /nname\s*:/i.test(text);
}

function looksLikeCsvFuel(text: string): boolean {
  const first = text.split(/\r?\n/).find((line) => line.trim());
  if (!first || !first.includes(",")) return false;
  const headerMap = mapFuelHeaders(parseCsvRecords(first)[0] ?? []);
  if (headerMap.date == null) return false;
  return headerMap.gallons != null || headerMap.total != null || headerMap.driverName != null;
}

export function parseFuelCsv(text: string): FuelCsvParseResult {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) {
    throw new Error("The CSV is empty. Download the template or keep the header row.");
  }
  const headerMap = mapFuelHeaders(records[0]);
  if (headerMap.date == null) {
    if (looksLikeEfsReport(text)) return parseEfsFuelText(text);
    throw new Error("Use a fuel-card CSV with a Date column (download the template).");
  }

  const rows: ParsedFuelCsvRow[] = [];
  const errors: FuelCsvRowError[] = [];
  let skipped = 0;

  records.slice(1).forEach((cells, index) => {
    const excelRow = index + 2;
    const get = (key: keyof typeof HEADER_ALIASES) =>
      headerMap[key] == null ? "" : (cells[headerMap[key]!] ?? "").trim();
    const dateRaw = get("date");
    const timeRaw = get("time");
    const driverName = get("driverName");
    const driverIdRaw = get("driverId");
    const unitNumber = get("unit") || get("prompt");
    const prompt = get("prompt");
    const invoice = get("invoice");
    const location = [get("location"), get("description")].filter(Boolean).join(" ").trim() || get("location");
    const gallons = parseFuelNumber(get("gallons"));
    const pricePerGallon = parseFuelNumber(get("price"));
    const amountRaw = parseFuelNumber(get("total"));
    const cardLast4 = cardLast4From(get("card"));
    const categoryRaw = [get("category"), get("description")].filter(Boolean).join(" ");
    const category = classifyFuelCategory(categoryRaw);
    const hasValues = [dateRaw, timeRaw, driverName, unitNumber, location, get("gallons"), get("total"), invoice].some(
      Boolean,
    );
    if (!dateRaw) {
      if (hasValues) skipped += 1;
      return;
    }
    const occurred = parseFuelWhen(dateRaw, timeRaw);
    if (!occurred) {
      errors.push({ row: excelRow, error: `Could not read date/time “${[dateRaw, timeRaw].filter(Boolean).join(" ")}”.` });
      return;
    }
    const gallonsValue =
      gallons ?? (amountRaw != null && pricePerGallon ? Number((amountRaw / pricePerGallon).toFixed(3)) : null);
    const amount =
      amountRaw ?? (gallonsValue != null && pricePerGallon != null ? Number((gallonsValue * pricePerGallon).toFixed(2)) : null);
    if (gallonsValue == null && amount == null) {
      skipped += 1;
      return;
    }
    rows.push({
      row: excelRow,
      occurredAt: occurred.toISOString(),
      driverName,
      driverIdRaw,
      unitNumber,
      location,
      gallons: gallonsValue,
      pricePerGallon,
      amount,
      cardLast4,
      category,
      invoice,
      prompt,
      dedupKey: fuelRowDedupKey({
        invoice,
        category,
        gallons: gallonsValue,
        occurred,
        amount,
        cardLast4,
      }),
    });
  });

  return { rows, skipped, errors };
}

export function fuelDedupKey(
  occurred: Date,
  gallons: number | null,
  amount: number | null,
  cardLast4: string,
): string {
  const minute = new Date(occurred);
  minute.setSeconds(0, 0);
  const gal = gallons == null ? "" : gallons.toFixed(3);
  const amt = amount == null ? "" : amount.toFixed(2);
  return `${minute.toISOString()}|${gal}|${amt}|${cardLast4}`;
}

export function fuelRowDedupKey(input: {
  invoice: string;
  category: string;
  gallons: number | null;
  occurred: Date;
  amount: number | null;
  cardLast4: string;
}): string {
  const classified = classifyFuelCategory(input.category);
  const bucket = classified || input.category.trim().toLowerCase() || "unclassified";
  if (input.invoice.trim()) {
    const qty = input.gallons == null ? "" : input.gallons.toFixed(3);
    return `inv|${input.invoice.trim().toLowerCase()}|${bucket}|${qty}`;
  }
  return `dt|${fuelDedupKey(input.occurred, input.gallons, input.amount, input.cardLast4)}`;
}

export type FuelMatchLoad = {
  truck_id: number | null;
  driver_id: number | null;
  status: string;
};

export function matchFuelDriver(
  row: Pick<ParsedFuelCsvRow, "driverName" | "driverIdRaw" | "unitNumber" | "prompt">,
  drivers: DriverWithTruck[],
  trucks: TruckWithDriver[],
  _loads: FuelMatchLoad[] = [],
): { driverId: number | null; truckId: number | null; unitNumber: string } {
  const truck =
    findTruckByUnit(row.unitNumber, trucks) ?? findTruckByUnit(row.prompt ?? "", trucks);
  const extractedName =
    extractNProductDriverName(row.driverName) || extractNProductDriverName(row.prompt ?? "");
  const byId = findDriverById(row.driverIdRaw, drivers);
  const byName = findDriverByName(row.driverName, drivers) ?? findDriverByName(extractedName, drivers);
  const driver = byId ?? byName;
  return {
    driverId: driver?.id ?? null,
    truckId: truck?.id ?? driver?.truck_id ?? null,
    unitNumber: truck?.unit_number || row.unitNumber.trim() || (row.prompt ?? "").trim(),
  };
}

export function parseEfsFuelText(text: string): FuelCsvParseResult {
  const rows: ParsedFuelCsvRow[] = [];
  const errors: FuelCsvRowError[] = [];
  let skipped = 0;
  let driverName = "";
  const lines = normalizeEfsText(text).split("\n");
  lines.forEach((line, index) => {
    const excelRow = index + 1;
    const nname = line.match(/nname\s*:?\s*(.+)$/i);
    if (nname) {
      driverName = formatNName(nname[1]);
      return;
    }
    if (!/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(line)) return;
    if (!/-?\d[\d,]*\.\d{2,4}/.test(line)) return;
    if (/nanuet|228\s*e\s*route|funded total|report total|m\s*&\s*s\s*loads/i.test(line)) {
      skipped += 1;
      return;
    }
    const parsed = parseEfsDetailLine(line, driverName);
    if (!parsed) {
      errors.push({ row: excelRow, error: "Could not read that activity line." });
      return;
    }
    if (parsed.gallons == null && parsed.amount == null) {
      skipped += 1;
      return;
    }
    rows.push({
      row: excelRow,
      ...parsed,
      driverIdRaw: "",
      dedupKey: fuelRowDedupKey({
        invoice: parsed.invoice,
        category: parsed.category,
        gallons: parsed.gallons,
        occurred: new Date(parsed.occurredAt),
        amount: parsed.amount,
        cardLast4: parsed.cardLast4,
      }),
    });
  });
  if (rows.length === 0 && errors.length === 0) {
    throw new Error("No activity lines found. Upload the Transaction Activity Report PDF or a CSV with Date and Category.");
  }
  return { rows, skipped, errors };
}

function normalizeEfsText(text: string): string {
  const raw = text.replace(/\r\n/g, "\n");
  const complete = raw
    .split("\n")
    .filter((line) => /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(line) && /-?\d[\d,]*\.\d{2,4}/.test(line));
  if (complete.length >= 1) return raw;
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+(nname\s*:)/gi, "\n$1")
    .replace(/\s+(\d{1,2}\/\d{1,2}\/\d{2,4}\b)/g, "\n$1");
}

function formatNName(raw: string): string {
  const cleaned = raw.replace(/nname\s*:?/i, "").replace(/\s{2,}/g, " ").trim();
  const swapped = cleaned.includes(",")
    ? (() => {
        const [last, first] = cleaned.split(",").map((part) => part.trim());
        return [first, last].filter(Boolean).join(" ");
      })()
    : cleaned;
  return swapped
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function parseEfsDetailLine(
  line: string,
  driverName: string,
): Omit<ParsedFuelCsvRow, "row" | "driverIdRaw" | "dedupKey"> | null {
  const trimmed = line.trim();
  const dateMatch = trimmed.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (!dateMatch) return null;
  const occurred = parseFuelWhen(dateMatch[1], "");
  if (!occurred) return null;
  const afterDate = trimmed.slice(dateMatch[0].length).trim();
  const cardMatch = afterDate.match(/^(\d{10,19}|[*X]+\d{4})/i);
  const cardLast4 = cardLast4From(cardMatch?.[1] ?? "");
  const afterCard = cardMatch ? afterDate.slice(cardMatch[0].length).trim() : afterDate;
  const category = classifyFuelCategory(afterCard);
  const money = [...afterCard.matchAll(/-?\d[\d,]*\.\d{2,4}/g)].map((item) => item[0]);
  let gallons: number | null = null;
  let pricePerGallon: number | null = null;
  let amount: number | null = null;
  if (money.length >= 7) {
    gallons = parseFuelNumber(money[money.length - 7]);
    pricePerGallon = parseFuelNumber(money[money.length - 6]);
    amount = parseFuelNumber(money[money.length - 1]);
  } else if (money.length >= 2) {
    gallons = parseFuelNumber(money[0]);
    pricePerGallon = money.length >= 3 ? parseFuelNumber(money[1]) : null;
    amount = parseFuelNumber(money[money.length - 1]);
  } else if (money.length === 1) {
    amount = parseFuelNumber(money[0]);
  }
  const firstMoney = afterCard.search(/-?\d[\d,]*\.\d{2,4}/);
  const head = (firstMoney >= 0 ? afterCard.slice(0, firstMoney) : afterCard).trim();
  const ints = [...head.matchAll(/\b\d{1,14}\b/g)].map((item) => item[0]);
  const small = ints.filter((value) => value.length <= 4);
  const large = ints.filter((value) => value.length >= 5);
  const unitNumber = small[0] ?? "";
  const prompt = small[1] ?? small[0] ?? "";
  const invoice = large[0] ?? "";
  const location = efsLocationFromHead(head);
  return {
    occurredAt: occurred.toISOString(),
    driverName,
    unitNumber,
    location,
    gallons,
    pricePerGallon,
    amount,
    cardLast4,
    category,
    invoice,
    prompt,
  };
}

function efsLocationFromHead(head: string): string {
  const stateMatch = head.match(/\b([A-Z]{2})\b/);
  if (!stateMatch || stateMatch.index == null) {
    return head
      .replace(/\d+/g, " ")
      .replace(/diesel|reefer|ultra|low|sulfur|def|scale|scales|cat|fluid|exhaust/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const before = head
    .slice(0, stateMatch.index)
    .replace(/\d+/g, " ")
    .replace(/diesel|reefer|ultra|low|sulfur|def|scale|scales|cat|fluid|exhaust/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const city = before.slice(-2).join(" ");
  const after = head.slice(stateMatch.index + 2).replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  return [city, stateMatch[1], after].filter(Boolean).join(" ");
}

const WEEKDAY_SUN0: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function padYmdPart(value: number): string {
  return String(value).padStart(2, "0");
}

export function addYmdDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${padYmdPart(utc.getUTCMonth() + 1)}-${padYmdPart(utc.getUTCDate())}`;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(num("year"), num("month") - 1, num("day"), num("hour"), num("minute"), num("second"));
  return asUtc - instant.getTime();
}

export function zonedWallToUtc(
  ymd: string,
  hours: number,
  minutes: number,
  seconds: number,
  timeZone = DISPLAY_TIME_ZONE,
): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const offset1 = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  const instant = utcGuess - offset1;
  const offset2 = timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(utcGuess - offset2);
}

function weekdaySun0InTimeZone(date: Date, timeZone = DISPLAY_TIME_ZONE): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return WEEKDAY_SUN0[label] ?? 0;
}

export function startOfLocalWeek(now = new Date()): Date {
  const ymd = ymdInTimeZone(now, DISPLAY_TIME_ZONE);
  const daysFromMonday = (weekdaySun0InTimeZone(now) + 6) % 7;
  return zonedWallToUtc(addYmdDays(ymd, -daysFromMonday), 0, 0, 0);
}

export function startOfLocalMonth(now = new Date()): Date {
  const ymd = ymdInTimeZone(now, DISPLAY_TIME_ZONE);
  return zonedWallToUtc(`${ymd.slice(0, 8)}01`, 0, 0, 0);
}

export type FuelWeekPaidStats = {
  weekStartYmd: string;
  weekEndYmd: string;
  count: number;
  minAmount: number | null;
  maxAmount: number | null;
  avgAmount: number | null;
  ppgCount: number;
  minPpg: number | null;
  maxPpg: number | null;
  avgPpg: number | null;
};

export function isDieselPaidCategory(category: string): boolean {
  if (category === "truck_diesel" || category === "reefer_diesel") return true;
  const classified = classifyFuelCategory(category);
  return classified === "truck_diesel" || classified === "reefer_diesel";
}

export function isTruckDieselCategory(category: string): boolean {
  if (isMoneyCodeCategory(category)) return false;
  if (category === "truck_diesel") return true;
  return classifyFuelCategory(category) === "truck_diesel";
}

export const FUEL_TX_LISTS = [
  { value: "truck_diesel", label: "Truck diesel" },
  { value: "reefer", label: "Reefer" },
  { value: "scale", label: "Scale" },
  { value: "money_code", label: "Money code" },
  { value: "def", label: "DEF" },
] as const;

export type FuelTxListKind = (typeof FUEL_TX_LISTS)[number]["value"];

export function isMoneyCodeCategory(category: string): boolean {
  const key = String(category ?? "").trim().toLowerCase();
  if (key === "money_code") return true;
  return /money\s*code|cash\s*advance/.test(key);
}

export function fuelTxListKind(category: string): FuelTxListKind | null {
  if (isMoneyCodeCategory(category)) return "money_code";
  if (category === "reefer_diesel" || classifyFuelCategory(category) === "reefer_diesel") return "reefer";
  if (category === "scale" || classifyFuelCategory(category) === "scale") return "scale";
  if (category === "def" || classifyFuelCategory(category) === "def") return "def";
  if (isTruckDieselCategory(category)) return "truck_diesel";
  return null;
}

export function parseFuelTxList(value: string | undefined): FuelTxListKind {
  if (value === "reefer" || value === "scale" || value === "money_code" || value === "def") return value;
  return "truck_diesel";
}

export type FuelPageView = "tx" | "trucks" | "drivers";

export function parseFuelPageView(value: string | undefined): FuelPageView {
  if (value === "trucks" || value === "drivers") return value;
  return "tx";
}

export function groupFuelTxByList<T extends { category: string }>(rows: T[]): Record<FuelTxListKind, T[]> {
  const groups: Record<FuelTxListKind, T[]> = {
    truck_diesel: [],
    reefer: [],
    scale: [],
    money_code: [],
    def: [],
  };
  for (const row of rows) {
    const kind = fuelTxListKind(row.category);
    if (kind) groups[kind].push(row);
  }
  return groups;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function fuelWeekPaidStats(
  rows: Array<Pick<FuelTransaction, "occurred_at" | "category" | "amount" | "price_per_gallon">>,
  now = new Date(),
): FuelWeekPaidStats {
  const weekStart = startOfLocalWeek(now);
  const weekStartYmd = ymdInTimeZone(weekStart, DISPLAY_TIME_ZONE);
  const weekEndYmd = addYmdDays(weekStartYmd, 6);
  const weekEnd = zonedWallToUtc(addYmdDays(weekStartYmd, 7), 0, 0, 0);
  const startMs = weekStart.getTime();
  const endMs = weekEnd.getTime();
  const amounts: number[] = [];
  const ppgs: number[] = [];
  for (const row of rows) {
    if (!isTruckDieselCategory(row.category)) continue;
    const at = Date.parse(row.occurred_at);
    if (!Number.isFinite(at) || at < startMs || at >= endMs) continue;
    if (row.amount != null && Number.isFinite(row.amount)) amounts.push(row.amount);
    if (row.price_per_gallon != null && Number.isFinite(row.price_per_gallon)) ppgs.push(row.price_per_gallon);
  }
  return {
    weekStartYmd,
    weekEndYmd,
    count: amounts.length,
    minAmount: amounts.length ? Math.min(...amounts) : null,
    maxAmount: amounts.length ? Math.max(...amounts) : null,
    avgAmount: mean(amounts),
    ppgCount: ppgs.length,
    minPpg: ppgs.length ? Math.min(...ppgs) : null,
    maxPpg: ppgs.length ? Math.max(...ppgs) : null,
    avgPpg: mean(ppgs),
  };
}

export function parseFuelNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negated = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "$1");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negated ? -parsed : parsed;
}

export function cardLast4From(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "";
  return digits.slice(-4);
}

export function parseFuelWhen(dateRaw: string, timeRaw: string): Date | null {
  const combined = timeRaw.trim() ? `${dateRaw.trim()} ${timeRaw.trim()}` : dateRaw.trim();
  const match = combined.match(
    /^\s*(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})(?:[ T]+(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*(am|pm)?)?\s*$/i,
  );
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  const iso = match[1].length === 4;
  const year = expandYear(iso ? first : third);
  const month = iso ? second : first;
  const day = iso ? third : second;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let hours = match[4] ? Number(match[4]) : 0;
  const minutes = match[5] ? Number(match[5]) : 0;
  const seconds = match[6] ? Number(match[6]) : 0;
  const meridiem = (match[7] ?? "").toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function expandYear(value: number): number {
  if (value >= 100) return value;
  return value >= 70 ? 1900 + value : 2000 + value;
}

function mapFuelHeaders(cells: string[]): Partial<Record<keyof typeof HEADER_ALIASES, number>> {
  const map: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  cells.forEach((cell, index) => {
    const key = canonHeader(cell);
    (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((field) => {
      if (map[field] == null && HEADER_ALIASES[field].includes(key)) map[field] = index;
    });
  });
  return map;
}

function canonHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeUnit(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^unit\s+/, "").replace(/^#/, "").trim();
  const stripped = trimmed.replace(/^0+/, "");
  return stripped || (trimmed ? "0" : "");
}

function findTruckByUnit(unit: string, trucks: TruckWithDriver[]): TruckWithDriver | undefined {
  const key = normalizeUnit(unit);
  if (!key) return undefined;
  return trucks.find((truck) => normalizeUnit(truck.unit_number) === key);
}

function findDriverById(raw: string, drivers: DriverWithTruck[]): DriverWithTruck | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) {
    const byPk = drivers.find((driver) => driver.id === numeric);
    if (byPk) return byPk;
  }
  return drivers.find((driver) => driver.samsara_driver_id && driver.samsara_driver_id.toLowerCase() === value.toLowerCase());
}

function findDriverByName(raw: string, drivers: DriverWithTruck[]): DriverWithTruck | undefined {
  const keys = nameKeys(raw);
  if (keys.length === 0) return undefined;
  const exact = drivers.filter((driver) => nameKeys(driver.name).some((key) => keys.includes(key) && key.includes(" ")));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const folded = keys.map(foldNameKey);
  const fuzzy = drivers.filter((driver) => nameKeys(driver.name).some((key) => folded.includes(foldNameKey(key)) && key.includes(" ")));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) return undefined;
  const rawWords = raw.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length >= 2) return undefined;
  const last = keys.find((key) => !key.includes(" ") && !key.includes(","));
  if (!last) return undefined;
  const lastHits = drivers.filter((driver) => nameKeys(driver.name).includes(last));
  if (lastHits.length === 1) return lastHits[0];
  const lastFolded = foldNameKey(last);
  const lastFuzzy = drivers.filter((driver) => nameKeys(driver.name).some((key) => !key.includes(" ") && foldNameKey(key) === lastFolded));
  return lastFuzzy.length === 1 ? lastFuzzy[0] : undefined;
}

const NAME_ALIASES: Record<string, string> = {
  christoph: "christopher",
  chrisopher: "christopher",
  avilla: "avila",
  howel: "howell",
  jospeh: "joseph",
  jonathon: "jonathan",
  jonatan: "jonathan",
  mike: "michael",
  bob: "robert",
  rob: "robert",
  bill: "william",
  will: "william",
  jim: "james",
  jimmy: "james",
  joe: "joseph",
  tony: "anthony",
  tom: "thomas",
  dave: "david",
  steve: "steven",
};

function aliasToken(token: string): string {
  return NAME_ALIASES[token] ?? token;
}

export function foldNameKey(value: string): string {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(aliasToken);
  return tokens.join("").replace(/(.)\1+/g, "$1");
}

export function nameKeys(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(aliasToken)
    .join(" ");
  if (!normalized) return [];
  const keys = [normalized];
  if (normalized.includes(" ")) {
    const parts = normalized.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      keys.push(`${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`);
      keys.push(parts[parts.length - 1]);
    }
  }
  return keys;
}
