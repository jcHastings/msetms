export type FleetOneParsedRow = {
  row: number;
  occurredAt: string;
  driverName: string;
  unitNumber: string;
  location: string;
  gallons: number | null;
  pricePerGallon: number | null;
  amount: number | null;
  cardLast4: string;
  category: string;
  invoice: string;
};

const COMPANY_JUNK =
  /m\s*&\s*s\s*loads|228\s*e\s*route\s*59|nanuet|dispatch@msloads|funded total|report total|grand total|customer\s*(number|#)|page\s*\d+\s*of\s*\d+/i;

const PRODUCT_RE = /\b(diesel|reefer|def|ulsd)\b/i;
const MONEY_CODE_RE = /\bmoney\s*codes?\b/i;

export function looksLikeFleetOneReport(text: string): boolean {
  if (/nname\s*:/i.test(text) || /\/[A-Za-z]{2}\d{4,}/.test(text)) return false;
  return (
    /funded fuel/i.test(text) ||
    /fleet\s*one/i.test(text) ||
    MONEY_CODE_RE.test(text) ||
    (/transaction activity report/i.test(text) && /m\s*&\s*s\s*loads|nanuet|3770001903818/i.test(text))
  );
}

export function isFleetOneJunkLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (COMPANY_JUNK.test(trimmed)) return true;
  if (/^transaction activity report$/i.test(trimmed)) return true;
  if (/^funded fuel\b/i.test(trimmed)) return true;
  if (/^report date\b/i.test(trimmed) && !PRODUCT_RE.test(trimmed) && !MONEY_CODE_RE.test(trimmed)) {
    return true;
  }
  return false;
}

export function parseFleetOneFuelText(text: string): {
  rows: FleetOneParsedRow[];
  skipped: number;
  errors: Array<{ row: number; error: string }>;
} {
  const lines = normalizeFleetOneText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: FleetOneParsedRow[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  let skipped = 0;
  let excelRow = 0;
  const reportDate =
    text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/)?.[1] ??
    new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  for (const line of lines) {
    excelRow += 1;
    if (isFleetOneJunkLine(line)) {
      skipped += 1;
      continue;
    }
    if (MONEY_CODE_RE.test(line)) {
      const money = parseFleetOneMoneyCode(line, excelRow, reportDate);
      if (money) {
        rows.push(money);
        continue;
      }
    }
    if (!PRODUCT_RE.test(line) || !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) continue;
    const parsed = parseFleetOneFuelLine(line, excelRow);
    if (!parsed) {
      errors.push({ row: excelRow, error: "Could not read that funded fuel line." });
      continue;
    }
    rows.push(parsed);
  }

  if (rows.length === 0 && errors.length === 0) {
    throw new Error("No FleetOne funded fuel or money-code lines found.");
  }
  return { rows, skipped, errors };
}

function normalizeFleetOneText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\s+(\d{1,2}\/\d{1,2}\/\d{2,4}\b)/g, "\n$1")
    .replace(/\s+(Money\s+Codes?\b)/gi, "\n$1");
}

function parseFleetOneFuelLine(line: string, row: number): FleetOneParsedRow | null {
  const structured = line.match(
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{3,6})?\s+([A-Za-z][A-Za-z .'-]+?)\s+(\d{1,3})\s+(.+?)\s+([A-Z]{2})\s+\b(diesel|reefer|def|ulsd)\b\s+([\d,]*\.\d{2,4})\s+([\d,]*\.\d{2,4})\s+([\d,]*\.\d{2})/i,
  );
  if (structured) {
    const occurred = parseWhen(structured[1]);
    if (!occurred) return null;
    const category = classifyProduct(structured[7]);
    if (!category) return null;
    const gallons = parseNum(structured[8]);
    const pricePerGallon = parseNum(structured[9]);
    const amount = parseNum(structured[10]);
    if (gallons == null || amount == null || gallons > 400 || gallons <= 0) return null;
    const words = structured[5].trim().split(/\s+/);
    const last = words[words.length - 1] ?? "";
    const prev = words[words.length - 2] ?? "";
    const twoWordCity = /^(east|west|north|south|white|sioux|new|san|fort|saint)$/i.test(prev);
    const city = twoWordCity ? `${prev} ${last}` : last;
    const stationName = words.slice(0, twoWordCity ? -2 : -1).join(" ");
    const location = `${stationName}, ${city} ${structured[6]}`.replace(/\s+/g, " ").trim();
    if (/nanuet/i.test(location) || /route 59/i.test(location)) return null;
    return {
      row,
      occurredAt: occurred.toISOString(),
      driverName: structured[3].trim(),
      unitNumber: structured[4],
      location,
      gallons,
      pricePerGallon,
      amount,
      cardLast4: last4(structured[2] ?? ""),
      category,
      invoice: "",
    };
  }

  const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (!dateMatch) return null;
  const occurred = parseWhen(dateMatch[1]);
  if (!occurred) return null;

  const productMatch = line.match(/\b(diesel|reefer|def|ulsd)\b/i);
  if (!productMatch) return null;
  const category = classifyProduct(productMatch[1]);
  if (!category) return null;

  const afterProduct = line.slice((productMatch.index ?? 0) + productMatch[0].length);
  const money = [...afterProduct.matchAll(/-?\d[\d,]*\.\d{2,4}/g)].map((item) => item[0]);
  if (money.length < 3) return null;
  const gallons = parseNum(money[0]);
  const pricePerGallon = parseNum(money[1]);
  const amount = parseNum(money[money.length - 1]);
  if (gallons == null || amount == null) return null;
  if (gallons > 400 || gallons <= 0) return null;

  const beforeProduct = line.slice(0, productMatch.index ?? 0);
  const location = fleetOneLocation(beforeProduct) || fleetOneLocation(line);
  if (!location || /nanuet/i.test(location)) return null;

  return {
    row,
    occurredAt: occurred.toISOString(),
    driverName: fleetOneDriver(beforeProduct),
    unitNumber: fleetOneUnit(beforeProduct),
    location,
    gallons,
    pricePerGallon,
    amount,
    cardLast4: last4(fleetOneCard(beforeProduct, line)),
    category,
    invoice: fleetOneInvoice(line),
  };
}

function parseFleetOneMoneyCode(line: string, row: number, reportDate: string): FleetOneParsedRow | null {
  const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  const occurred = parseWhen(dateMatch?.[1] ?? reportDate) ?? new Date();
  const money = [...line.matchAll(/-?\d[\d,]*\.\d{2}/g)]
    .map((item) => parseNum(item[0]))
    .filter((value): value is number => value != null);
  if (money.length === 0) return null;
  const amount = money.find((value) => value >= 10 && value !== 3262.28) ?? money[money.length - 1];
  if (amount == null || amount === 3262.28) return null;
  return {
    row,
    occurredAt: occurred.toISOString(),
    driverName: fleetOneDriver(line),
    unitNumber: fleetOneUnit(line),
    location: "Money Code",
    gallons: 0,
    pricePerGallon: null,
    amount,
    cardLast4: last4(fleetOneCard(line, line)),
    category: "money_code",
    invoice: "",
  };
}

function classifyProduct(raw: string): string {
  const key = raw.toLowerCase();
  if (/\bdef\b/.test(key)) return "def";
  if (/reefer/.test(key)) return "reefer_diesel";
  if (/diesel|ulsd/.test(key)) return "truck_diesel";
  return "";
}

function fleetOneLocation(text: string): string {
  const cleaned = text
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b(diesel|reefer|def|ulsd|funded|fuel)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stateMatch = cleaned.match(/\b([A-Z]{2})\b/);
  if (!stateMatch || stateMatch.index == null) return "";
  const before = cleaned.slice(0, stateMatch.index).trim().split(" ").filter(Boolean);
  const station = before.slice(-5).join(" ");
  if (/nanuet/i.test(station) || /route/i.test(station)) return "";
  return [station, stateMatch[1]].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function fleetOneUnit(text: string): string {
  const ints = [...text.matchAll(/\b(\d{1,3})\b/g)].map((item) => item[1]);
  return (
    ints.find((value) => {
      const n = Number(value);
      return n >= 1 && n <= 199 && value !== "228";
    }) ?? ""
  );
}

function fleetOneCard(head: string, full: string): string {
  const fromHead = head.match(/\b(\d{4,6})\b/g)?.find((value) => value.length >= 4 && value !== "228");
  if (fromHead) return fromHead;
  const fromFull = full.match(/\b(\d{4,6})\b/g)?.filter((value) => value !== "228") ?? [];
  return fromFull[fromFull.length - 1] ?? "";
}

function fleetOneInvoice(text: string): string {
  return text.match(/\b(\d{6,})\b/)?.[1] ?? "";
}

function fleetOneDriver(text: string): string {
  const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/);
  return match?.[1] ?? "";
}

function parseNum(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function last4(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function parseWhen(dateRaw: string): Date | null {
  const match = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}
