import { renderUtf8Csv } from "./csv";
import { DISPLAY_TIME_ZONE, officeWallToUtc, ymdInTimeZone } from "./format";
import { localWeekRange, normalizeUnit, parseFuelNumber, parseFuelWhen } from "./fuel";
import { parseCsvRecords } from "./location-csv";

export const TOLL_CATEGORIES = [
  { value: "toll", label: "Tolls" },
  { value: "scale_bypass", label: "Scale bypass" },
] as const;

export type TollCategory = (typeof TOLL_CATEGORIES)[number]["value"];
export type TollTxListKind = TollCategory;
export type TollPeriod = "week" | "month";

export const TOLL_CSV_HEADERS = [
  "Date",
  "Time",
  "Transponder ID",
  "Unit",
  "Driver Name",
  "Plaza",
  "State",
  "Category",
  "Amount",
  "Invoice",
  "Reference",
] as const;

export const TOLL_EXPORT_HEADERS = [
  "Date",
  "Time",
  "Driver",
  "Truck",
  "Transponder",
  "Plaza",
  "State",
  "Category",
  "Amount",
  "Invoice",
  "Reference",
  "Source",
] as const;

export type TollTransaction = {
  id: number;
  occurred_at: string;
  driver_id: number | null;
  truck_id: number | null;
  load_id: number | null;
  plaza: string;
  state: string;
  amount: number | null;
  source_file: string;
  source_kind: string;
  provider: string;
  category: string;
  transponder_id: string;
  unit_number: string;
  driver_name_raw: string;
  invoice_number: string;
  reference_number: string;
  raw_json: string;
  dedup_key: string;
  created_at: string;
};

export type TollTransactionView = TollTransaction & {
  driver_name: string | null;
  truck_unit: string | null;
  load_number: string | null;
};

export type TollCsvRowError = { row: number; error: string };

export type ParsedTollCsvRow = {
  row: number;
  occurredAt: string;
  transponderId: string;
  unitNumber: string;
  driverName: string;
  plaza: string;
  state: string;
  category: TollCategory;
  amount: number;
  invoice: string;
  reference: string;
  dedupKey: string;
};

export type TollCsvParseResult = {
  rows: ParsedTollCsvRow[];
  skipped: number;
  errors: TollCsvRowError[];
};

export type TollImportResult = {
  ok: boolean;
  error?: string;
  message?: string;
  created?: number;
  skipped?: number;
  unmatched?: number;
  errors?: TollCsvRowError[];
};

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "txn date", "transaction date", "post date"],
  time: ["time", "txn time", "transaction time"],
  transponder: ["transponder", "transponder id", "tag", "tag id", "tag number", "ponder", "xponder"],
  unit: ["unit", "unit number", "truck", "truck number", "vehicle", "vehicle number"],
  driver: ["driver", "driver name", "operator", "operator name"],
  plaza: ["plaza", "location", "facility", "site"],
  state: ["state", "st"],
  category: ["category", "type", "transaction type", "item"],
  amount: ["amount", "total", "charge", "fee"],
  invoice: ["invoice", "invoice number", "invoice no"],
  reference: ["reference", "reference number", "trip", "trip number", "ticket"],
};

export const TOLL_TX_LISTS = [...TOLL_CATEGORIES];

export function parseTollTxList(value: string | undefined): TollTxListKind {
  return value === "scale_bypass" ? "scale_bypass" : "toll";
}

export function classifyTollCategory(raw: string): TollCategory {
  const key = String(raw ?? "").toLowerCase();
  if (/scale|bypass|weigh/.test(key)) return "scale_bypass";
  return "toll";
}

export function labelForTollCategory(value: string): string {
  return TOLL_CATEGORIES.find((item) => item.value === value)?.label ?? "Tolls";
}

export function tollTxListKind(category: string): TollTxListKind {
  return classifyTollCategory(category);
}

export function groupTollTxByList<T extends { category: string }>(rows: T[]): Record<TollTxListKind, T[]> {
  const groups: Record<TollTxListKind, T[]> = { toll: [], scale_bypass: [] };
  for (const row of rows) {
    groups[tollTxListKind(row.category)].push(row);
  }
  return groups;
}

export function parseTollPeriod(value: string | undefined): TollPeriod {
  return value === "month" ? "month" : "week";
}

export function parseTollWeekStart(value: string | undefined, now = new Date()): string {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return localWeekRange(raw).startYmd;
  return localWeekRange(now).startYmd;
}

export function isCurrentTollWeek(weekStartYmd: string, now = new Date()): boolean {
  return weekStartYmd === localWeekRange(now).startYmd;
}

export function tollWeekAnchorDate(weekStartYmd: string, now = new Date()): Date {
  if (isCurrentTollWeek(weekStartYmd, now)) return now;
  return new Date(localWeekRange(weekStartYmd).end.getTime() - 1);
}

export function tollRangeForPeriod(
  weekStartYmd: string,
  period: TollPeriod,
): { fromIso: string; toIso: string; startYmd: string; endYmd: string } {
  if (period === "week") {
    const range = localWeekRange(weekStartYmd);
    return {
      fromIso: range.start.toISOString(),
      toIso: range.end.toISOString(),
      startYmd: range.startYmd,
      endYmd: range.endYmd,
    };
  }
  const anchor = localWeekRange(weekStartYmd).start;
  const anchorYmd = ymdInTimeZone(anchor, DISPLAY_TIME_ZONE);
  const year = Number(anchorYmd.slice(0, 4));
  const month = Number(anchorYmd.slice(5, 7));
  const startYmd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStartYmd = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
  const start = officeWallToUtc(startYmd, 0, 0, 0);
  const end = officeWallToUtc(nextStartYmd, 0, 0, 0);
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    startYmd,
    endYmd: ymdInTimeZone(new Date(end.getTime() - 1), DISPLAY_TIME_ZONE),
  };
}

export function parseTollReport(text: string): TollCsvParseResult {
  return parseTollCsv(text.replace(/^\uFEFF/, "").trim());
}

export function parseTollCsv(text: string): TollCsvParseResult {
  if (!text.trim()) {
    throw new Error("The file is empty. Upload a toll CSV or Excel export.");
  }
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) {
    throw new Error("The file is empty. Upload a toll CSV or Excel export.");
  }
  const headerMap = mapHeaders(records[0] ?? []);
  if (headerMap.date == null || headerMap.amount == null) {
    throw new Error("Use a toll CSV with Date and Amount columns (download the template).");
  }
  const rows: ParsedTollCsvRow[] = [];
  const errors: TollCsvRowError[] = [];
  let skipped = 0;
  for (const [index, cells] of records.slice(1).entries()) {
    const excelRow = index + 2;
    const get = (key: keyof typeof HEADER_ALIASES) =>
      headerMap[key] == null ? "" : String(cells[headerMap[key]!] ?? "").trim();
    const dateRaw = get("date");
    const timeRaw = get("time");
    const amountRaw = parseFuelNumber(get("amount"));
    const hasValues = [dateRaw, get("amount"), get("transponder"), get("unit"), get("plaza"), get("invoice")].some(Boolean);
    if (!dateRaw) {
      if (hasValues) skipped += 1;
      continue;
    }
    const occurred = parseFuelWhen(dateRaw, timeRaw);
    if (!occurred) {
      errors.push({ row: excelRow, error: `Could not read date/time “${[dateRaw, timeRaw].filter(Boolean).join(" ")}”.` });
      continue;
    }
    if (amountRaw == null) {
      skipped += 1;
      continue;
    }
    const category = classifyTollCategory(get("category"));
    const transponderId = normalizeTransponder(get("transponder"));
    const unitNumber = get("unit");
    const invoice = get("invoice");
    const reference = get("reference");
    rows.push({
      row: excelRow,
      occurredAt: occurred.toISOString(),
      transponderId,
      unitNumber,
      driverName: get("driver"),
      plaza: get("plaza"),
      state: get("state"),
      category,
      amount: amountRaw,
      invoice,
      reference,
      dedupKey: tollRowDedupKey({
        occurred,
        amount: amountRaw,
        category,
        transponderId,
        invoice,
        plaza: get("plaza"),
        state: get("state"),
      }),
    });
  }
  return { rows, skipped, errors };
}

export function normalizeTransponder(value: string): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeTollUnit(value: string): string {
  return normalizeUnit(String(value ?? ""));
}

export function tollRowDedupKey(input: {
  occurred: Date;
  amount: number;
  category: TollCategory;
  transponderId: string;
  invoice: string;
  plaza: string;
  state: string;
}): string {
  const invoice = input.invoice.trim().toLowerCase();
  if (invoice) return `inv|${invoice}|${input.category}|${input.amount.toFixed(2)}`;
  const minute = new Date(input.occurred);
  minute.setSeconds(0, 0);
  const loc = `${input.plaza}|${input.state}`.trim().toLowerCase();
  return `dt|${minute.toISOString()}|${input.amount.toFixed(2)}|${input.category}|${normalizeTransponder(input.transponderId)}|${loc}`;
}

export function renderTollsTemplate(): string {
  return renderUtf8Csv(TOLL_CSV_HEADERS, []);
}

export function renderTollExportCsv(rows: TollTransactionView[]): string {
  return renderUtf8Csv(
    TOLL_EXPORT_HEADERS,
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
        row.driver_name ?? row.driver_name_raw,
        row.truck_unit ?? row.unit_number,
        row.transponder_id,
        row.plaza,
        row.state,
        labelForTollCategory(row.category),
        row.amount == null ? "" : String(row.amount),
        row.invoice_number,
        row.reference_number,
        row.source_file,
      ];
    }),
  );
}

export type TollWeekOption = {
  startYmd: string;
  endYmd: string;
  current: boolean;
};

export function listTollWeekOptions(rows: Array<{ occurred_at: string }>, now = new Date()): TollWeekOption[] {
  const current = localWeekRange(now);
  const starts = new Set<string>([current.startYmd]);
  for (const row of rows) {
    const at = Date.parse(row.occurred_at);
    if (!Number.isFinite(at)) continue;
    starts.add(localWeekRange(new Date(at)).startYmd);
  }
  return [...starts]
    .sort()
    .reverse()
    .map((startYmd) => {
      const range = localWeekRange(startYmd);
      return { startYmd, endYmd: range.endYmd, current: startYmd === current.startYmd };
    });
}

function mapHeaders(cells: string[]): Partial<Record<keyof typeof HEADER_ALIASES, number>> {
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
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
