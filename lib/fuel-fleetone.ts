import { US_STATES } from "./locations";

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

const ACTIVITY_KIND = /\bN\s+(Diesel|Reefer|DEF|Money\s*Code)\b/i;
const COMPANY_JUNK =
  /m\s*&\s*s\s*loads|228\s*e\s*route\s*59|nanuet|dispatch@msloads|funded total|report total|grand total|customer\s*(number|#)|page\s*\d+\s*of\s*\d+|voice number|funded activity|date\s+db\s+category/i;

const PRODUCT_RE = /\b(diesel|reefer|def|ulsd)\b/i;
const MONEY_CODE_RE = /\bmoney\s*codes?\b/i;
const SUMMARY_AMOUNTS = new Set([3262.28, 2670.36, 340.25]);

export function looksLikeFleetOneReport(text: string, sourceFile = ""): boolean {
  if (/fleetone|transactionactivityreport/i.test(sourceFile)) return true;
  if (/nname\s*:/i.test(text)) return false;
  const blob = `${text}\n${sourceFile}`;
  if (/\bN\s+(Diesel|Reefer|DEF|Money\s*Code)\b/i.test(text) && /\d{1,2}\/\d{1,2}/.test(text)) return true;
  if (/funded\s*(fuel|activity)/i.test(blob) || /fleet\s*one/i.test(blob) || MONEY_CODE_RE.test(blob)) return true;
  if (/transaction\s*activity\s*report/i.test(blob) && /m\s*&\s*s\s*loads|nanuet|3770001903818|dispatch@msloads/i.test(blob)) {
    return true;
  }
  if (/transaction.?activity.?report/i.test(sourceFile)) return true;
  return /transaction\s*activity\s*report/i.test(text) && PRODUCT_RE.test(text);
}

export function stripFleetOneHeaderLeak(line: string): string {
  return line
    .replace(/\b228\s*E?\s*ROUTE\s*59(?:\s*#?\s*\d+)?/gi, " ")
    .replace(/\bNANUET(?:\s+NY)?(?:\s+10954)?\b/gi, " ")
    .replace(/\bdispatch@msloads\.com\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isFleetOneJunkLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (ACTIVITY_KIND.test(trimmed)) return false;
  if (COMPANY_JUNK.test(trimmed)) return true;
  if (/^transaction activity report$/i.test(trimmed)) return true;
  if (/^funded fuel\b/i.test(trimmed)) return true;
  if (/^report date\b/i.test(trimmed) && !PRODUCT_RE.test(trimmed) && !MONEY_CODE_RE.test(trimmed)) {
    return true;
  }
  if (/\/\s*D[sm]\d{4,}/i.test(trimmed) && !PRODUCT_RE.test(trimmed)) return true;
  if (/\$?\s*3,?262\.28/.test(trimmed) || /\b45\.0820?\b/.test(trimmed) || /\b528\.120\b/.test(trimmed)) return true;
  if (/\b2,?670\.36\b/.test(trimmed)) return true;
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
  const reportYear = reportYearFromText(text);
  const reportDate =
    text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/)?.[1] ??
    new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  for (const raw of lines) {
    excelRow += 1;
    if (isFleetOneJunkLine(raw) && !MONEY_CODE_RE.test(raw) && !ACTIVITY_KIND.test(raw)) {
      skipped += 1;
      continue;
    }
    const line = stripFleetOneHeaderLeak(raw);
    if (!line) {
      skipped += 1;
      continue;
    }
    if (MONEY_CODE_RE.test(line)) {
      const money = parseFleetOneMoneyCode(line, excelRow, reportDate, reportYear);
      if (money) {
        rows.push(money);
        continue;
      }
    }
    const activity = parseFleetOneNProductLine(line, excelRow, reportYear);
    if (activity) {
      rows.push(activity);
      continue;
    }
    if (!PRODUCT_RE.test(line) || !/\d{1,2}\/\d{1,2}/.test(line)) continue;
    const parsed = parseFleetOneFuelLine(line, excelRow, reportYear);
    if (!parsed) {
      errors.push({ row: excelRow, error: "Could not read that funded fuel line." });
      continue;
    }
    rows.push(parsed);
  }

  const kept = dropSummaryMoneyCodes(rows);
  if (kept.length === 0 && errors.length === 0) {
    throw new Error("No FleetOne funded fuel or money-code lines found.");
  }
  return { rows: kept, skipped, errors };
}

export function normalizeFleetOneExtract(text: string): string {
  return normalizeFleetOneText(text);
}

function normalizeFleetOneText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/Funded\s*Fuel/gi, "Funded Fuel")
    .replace(/Money\s*Codes?/gi, "Money Code")
    .replace(/Transaction\s*Activity\s*Report/gi, "Transaction Activity Report")
    .replace(/Report\s*Total/gi, "Report Total")
    .replace(/Funded\s*Total/gi, "Funded Total")
    .replace(/M\s*&\s*S\s*Loads/gi, "M & S Loads")
    .replace(/(\d+\.\d{3})(\d+\.\d{4})(\d+\.\d{2})/g, "$1 $2 $3")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/(\.\d{2,4})(\d+\.\d+)/g, "$1 $2")
    .replace(/([A-Z]{2})(Diesel|Reefer|DEF|ULSD)/gi, "$1 $2")
    .replace(/\b(Diesel|Reefer|DEF|ULSD)(?=\d)/gi, "$1 ")
    .replace(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g, "\n$1 ")
    .replace(/(?<!\d\/)(\d{1,2}\/\d{1,2})(?!\s*\/)\s+N\s+/gi, "\n$1 N ")
    .replace(/(?<!\bN )\s+(Money Code\b)/gi, "\n$1")
    .replace(/\s+(Funded Fuel\b)/gi, "\nFunded Fuel")
    .replace(/\s+(Funded Total\b)/gi, "\nFunded Total")
    .replace(/\s+(Report Total\b)/gi, "\nReport Total")
    .replace(new RegExp(`([A-Za-z]{3,})(${US_STATES.join("|")})(?=\\s+(Diesel|Reefer|DEF|ULSD)\\b)`, "gi"), "$1 $2")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}

function parseFleetOneNProductLine(line: string, row: number, reportYear: number): FleetOneParsedRow | null {
  const head = line.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+N\s+(Diesel|Reefer|DEF)\s+(.+)$/i);
  if (!head) return null;
  const occurred = parseWhen(head[1], reportYear);
  if (!occurred) return null;
  const category = classifyProduct(head[2]);
  if (!category) return null;
  const rest = head[3];
  const unitPrompt = rest.match(/\b(\d{1,3})\s+D\s*(\d{2,4})\b/i);
  if (!unitPrompt || unitPrompt.index == null) return null;
  const unit = unitPrompt[1];
  if (unit === "228" || Number(unit) < 1 || Number(unit) > 199) return null;
  const afterPrompt = rest.slice(unitPrompt.index + unitPrompt[0].length);
  const invoice = afterPrompt.match(/\b(\d{6,})\b/)?.[1] ?? "";
  const nums = [...afterPrompt.matchAll(/-?\d[\d,]*\.\d{2,4}/g)];
  if (nums.length < 2) return null;
  const gallonsTok = nums.find((item) => /\.\d{3}$/.test(item[0])) ?? nums[0];
  const priceTok = nums.find((item) => /\.\d{4}$/.test(item[0])) ?? nums[1];
  const amountTok =
    [...nums].reverse().find((item) => /\.\d{2}$/.test(item[0]) && item !== gallonsTok) ?? nums[nums.length - 1];
  const gallons = parseNum(gallonsTok[0]);
  const pricePerGallon = parseNum(priceTok[0]);
  const amount = parseNum(amountTok[0]);
  if (gallons == null || amount == null || gallons > 400 || gallons <= 0) return null;
  if (SUMMARY_AMOUNTS.has(amount) || gallons === 45.082) return null;
  const gallonsIndex = gallonsTok.index ?? 0;
  const beforeGal = afterPrompt.slice(0, gallonsIndex);
  const stateMatch = [...beforeGal.matchAll(/\b([A-Z]{2})\b/g)].pop();
  const state = stateMatch?.[1] ?? "";
  const stationBefore = (stateMatch ? beforeGal.slice(0, stateMatch.index) : beforeGal)
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const afterAmount = afterPrompt
    .slice((amountTok.index ?? 0) + amountTok[0].length)
    .replace(/[^\sA-Za-z0-9#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const station = (stationBefore.length >= afterAmount.length ? stationBefore : afterAmount) || stationBefore || afterAmount;
  const location = [station, state].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (isFleetOneJunkAmount(gallons, amount, unit, location)) return null;
  return {
    row,
    occurredAt: occurred.toISOString(),
    driverName: extractNProductDriverName(rest.slice(0, unitPrompt.index)),
    unitNumber: unit,
    location,
    gallons,
    pricePerGallon,
    amount,
    cardLast4: "",
    category,
    invoice,
  };
}

function parseFleetOneFuelLine(line: string, row: number, reportYear: number): FleetOneParsedRow | null {
  const structured = line.match(
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{3,6})?\s+([A-Za-z][A-Za-z .'-]+?)\s+(\d{1,3})\s+(.+?)\s+([A-Z]{2})\s+\b(diesel|reefer|def|ulsd)\b\s+([\d,]*\.\d{2,4})\s+([\d,]*\.\d{2,4})\s+([\d,]*\.\d{2})/i,
  );
  if (structured) {
    const occurred = parseWhen(structured[1], reportYear);
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
    if (isFleetOneJunkAmount(gallons, amount, structured[4], location)) return null;
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

  const dateMatch = line.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
  if (!dateMatch) return null;
  const occurred = parseWhen(dateMatch[1], reportYear);
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
  const location = fleetOneLocation(beforeProduct) || fleetOneLocation(line) || stationWords(beforeProduct);
  if (isFleetOneJunkAmount(gallons, amount, fleetOneUnit(beforeProduct), location)) return null;
  if (/nanuet/i.test(location) || /route 59/i.test(location)) return null;

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

function parseFleetOneMoneyCode(
  line: string,
  row: number,
  reportDate: string,
  reportYear: number,
): FleetOneParsedRow | null {
  if (/funded total|report total|grand total/i.test(line)) return null;
  const dateMatch = line.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
  const occurred = parseWhen(dateMatch?.[1] ?? reportDate, reportYear) ?? new Date();
  const money = [...line.matchAll(/-?\d[\d,]*\.\d{2}/g)]
    .map((item) => parseNum(item[0]))
    .filter((value): value is number => value != null);
  if (money.length === 0) return null;
  const amount =
    money.find((value) => value >= 10 && !SUMMARY_AMOUNTS.has(value)) ?? money[money.length - 1];
  if (amount == null || SUMMARY_AMOUNTS.has(amount)) return null;
  return {
    row,
    occurredAt: occurred.toISOString(),
    driverName: "",
    unitNumber: "",
    location: "Money Code",
    gallons: 0,
    pricePerGallon: null,
    amount,
    cardLast4: "",
    category: "money_code",
    invoice: "",
  };
}

function dropSummaryMoneyCodes(rows: FleetOneParsedRow[]): FleetOneParsedRow[] {
  const money = rows.filter((row) => row.category === "money_code");
  const drop = new Set<number>();
  for (const row of money) {
    const others = money.filter((item) => item !== row);
    const sum = others.reduce((total, item) => total + (item.amount ?? 0), 0);
    if (others.length >= 2 && row.amount != null && Math.abs(row.amount - sum) < 0.021) {
      drop.add(row.row);
    }
    if (row.amount != null && SUMMARY_AMOUNTS.has(row.amount)) drop.add(row.row);
  }
  return rows.filter((row) => !drop.has(row.row));
}

function isFleetOneJunkAmount(
  gallons: number | null,
  amount: number | null,
  unit: string,
  location: string,
): boolean {
  if (amount != null && SUMMARY_AMOUNTS.has(amount)) return true;
  if (gallons === 45.082) return true;
  if (unit === "228" && /nanuet|route 59|east brunswick|omaha|loves|sunoco/i.test(location)) return true;
  return false;
}

function classifyProduct(raw: string): string {
  const key = raw.toLowerCase();
  if (/\bdef\b/.test(key)) return "def";
  if (/reefer/.test(key)) return "reefer_diesel";
  if (/diesel|ulsd/.test(key)) return "truck_diesel";
  return "";
}

function stationWords(text: string): string {
  return text
    .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g, (name) =>
      /(diesel|reefer|loves|pilot|sunoco|travel|plaza)/i.test(name) ? name : " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function fleetOneLocation(text: string): string {
  const cleaned = text
    .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, " ")
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

function extractNProductDriverName(beforeUnit: string): string {
  const cleaned = beforeUnit.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const titled = cleaned.match(
    /^([A-Z][a-z]+(?:[.'-][A-Za-z]+)?(?:\s+[A-Z][a-z]+(?:[.'-][A-Za-z]+)?){0,2})$/,
  );
  if (titled) return titled[1];
  const capped = cleaned.match(/^([A-Z]{2,}(?:\s+[A-Z]{2,}){0,2})$/);
  if (capped && !/(DIESEL|REEFER|DEF|SUNOCO|LOVES|PILOT|TRAVEL|PLAZA)/.test(capped[1])) {
    return capped[1]
      .toLowerCase()
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return "";
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

function reportYearFromText(text: string): number {
  const full = text.match(/\b\d{1,2}\/\d{1,2}\/(\d{2,4})\b/);
  if (full) {
    let year = Number(full[1]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return year;
  }
  return new Date().getFullYear();
}

function parseWhen(dateRaw: string, fallbackYear?: number): Date | null {
  const withYear = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (withYear) {
    const month = Number(withYear[1]);
    const day = Number(withYear[2]);
    let year = Number(withYear[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const noYear = dateRaw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!noYear) return null;
  const year = fallbackYear ?? new Date().getFullYear();
  const date = new Date(year, Number(noYear[1]) - 1, Number(noYear[2]));
  return Number.isNaN(date.getTime()) ? null : date;
}
