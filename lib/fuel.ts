import { parseCsvRecords } from "./location-csv";
import { renderUtf8Csv } from "./csv";
import type { DriverWithTruck, TruckWithDriver } from "./types";

export const FUEL_CSV_HEADERS = [
  "Date",
  "Time",
  "Driver Name",
  "Driver ID",
  "Unit",
  "Location",
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
  "Source File",
] as const;

export type FuelTransaction = {
  id: number;
  occurred_at: string;
  driver_id: number | null;
  truck_id: number | null;
  location: string;
  gallons: number | null;
  price_per_gallon: number | null;
  amount: number | null;
  card_last4: string;
  source_file: string;
  category: string;
  unit_number: string;
  driver_name_raw: string;
  dedup_key: string;
  created_at: string;
};

export type FuelTransactionView = FuelTransaction & {
  driver_name: string | null;
  truck_unit: string | null;
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

export type FuelRollup = {
  driverId: number;
  driverName: string;
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
  location: ["location", "city", "location city", "city state", "loc", "site", "location name"],
  gallons: ["gallons", "gal", "qty", "quantity", "volume"],
  price: ["price", "ppg", "price per gallon", "unit price", "pump price"],
  total: ["total", "amount", "amt", "cost", "net total"],
  card: ["card number", "card", "card no", "card last4", "last4", "last 4"],
  category: ["category", "product", "fuel type", "item", "item type"],
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
        row.category,
        row.source_file,
      ];
    }),
  );
}

export function parseFuelCsv(text: string): FuelCsvParseResult {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) {
    throw new Error("The CSV is empty. Download the template or keep the header row.");
  }
  const headerMap = mapFuelHeaders(records[0]);
  if (headerMap.date == null) {
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
    const unitNumber = get("unit");
    const location = get("location");
    const gallons = parseFuelNumber(get("gallons"));
    const pricePerGallon = parseFuelNumber(get("price"));
    const amountRaw = parseFuelNumber(get("total"));
    const cardLast4 = cardLast4From(get("card"));
    const category = get("category");
    const hasValues = [dateRaw, timeRaw, driverName, unitNumber, location, get("gallons"), get("total")].some(
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
      dedupKey: fuelDedupKey(occurred, gallonsValue, amount, cardLast4),
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

export function matchFuelDriver(
  row: Pick<ParsedFuelCsvRow, "driverName" | "driverIdRaw" | "unitNumber">,
  drivers: DriverWithTruck[],
  trucks: TruckWithDriver[],
): { driverId: number | null; truckId: number | null; unitNumber: string } {
  const truck = findTruckByUnit(row.unitNumber, trucks);
  const byId = findDriverById(row.driverIdRaw, drivers);
  const byName = findDriverByName(row.driverName, drivers);
  const driver = byId ?? byName ?? (truck?.assigned_driver_id ? drivers.find((item) => item.id === truck.assigned_driver_id) : undefined);
  return {
    driverId: driver?.id ?? null,
    truckId: truck?.id ?? driver?.truck_id ?? null,
    unitNumber: truck?.unit_number || row.unitNumber.trim(),
  };
}

export function startOfLocalWeek(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function startOfLocalMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
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
  const last = keys.find((key) => !key.includes(" ") && !key.includes(","));
  if (!last) return undefined;
  const lastHits = drivers.filter((driver) => nameKeys(driver.name).includes(last));
  return lastHits.length === 1 ? lastHits[0] : undefined;
}

function nameKeys(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
