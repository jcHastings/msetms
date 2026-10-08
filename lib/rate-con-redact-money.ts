/**
 * Money spans on one line of a broker rate confirmation.
 * Dates, times, temperatures, weights, phones, zips, and PO/reference
 * numbers are left alone. Dollar amounts and rate-word amounts are marked.
 */

export type MoneySpan = {
  start: number;
  end: number;
  text: string;
};

const RATE_KEYWORD =
  "(?:fuel|carrier\\s+pay|line\\s*-?\\s*haul|linehaul|fuel\\s+surcharge|all[-\\s]in(?:\\s+(?:rate|total))?|quick\\s*pay(?:\\s+(?:fee|discount))?|accessorials?|fsc|tonu|layover|lumper|detention|amount|total|flat|pay|rate)";

const RATE_KEYWORD_RE = new RegExp(`(?<![\\w])${RATE_KEYWORD}(?![\\w])(?!\\s*(?:confirmation|con\\b|agreement|sheet))`, "i");

function collect(re: RegExp, line: string): Array<{ start: number; end: number }> {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const matcher = new RegExp(re.source, flags);
  const found: Array<{ start: number; end: number }> = [];
  for (const match of line.matchAll(matcher)) {
    const text = match[0];
    if (!text || match.index == null) continue;
    found.push({ start: match.index, end: match.index + text.length });
  }
  return found;
}

function protectedSpans(line: string): Array<{ start: number; end: number }> {
  const patterns = [
    /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b/gi,
    /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi,
    /\b\d{1,2}\.\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi,
    /\b(?:appt|appointment|arrive|arrival|eta|window)\b[^0-9]{0,20}\d{1,2}\.\d{2}\b/gi,
    /-?\d+(?:\.\d+)?\s*°\s*[FfCc]?\b/g,
    /-?\d+(?:\.\d+)?\s*degrees?\s*[FfCc]?\b/gi,
    /\b(?:temp(?:erature)?|setpoint|reefer)\s*[:=]?\s*-?\d+(?:\.\d+)?\s*°?\s*[FfCc]?\b/gi,
    /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:lbs?|pounds?|kgs?|kilograms?)\b/gi,
    /(?<![$.,\d])\b\d{5}(?:-\d{4})?\b(?!\.\d)/g,
    /\b(?:p\.?\s*o\.?|purchase\s+order|ref(?:erence)?|pro\b|bol|seal|trailer|load|order|confirmation|pickup|delivery|pu|del)\s*(?:#|no\.?|number|:)?\s*#?\s*[A-Z0-9][A-Z0-9./-]{2,}/gi,
    /\bafter\s+\d+(?:\.\d+)?\s*(?:hrs?|hours?)\b/gi,
    /\b\d+(?:\.\d+)?\s*(?:hrs?|hours?|minutes?|mins?)\b/gi,
    /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:miles|mi)\b/gi,
  ];
  return patterns.flatMap((pattern) => collect(pattern, line));
}

function overlaps(span: { start: number; end: number }, guards: Array<{ start: number; end: number }>): boolean {
  return guards.some((guard) => span.start < guard.end && guard.start < span.end);
}

function isClockNumber(token: string): boolean {
  const match = token.match(/^(\d{1,2})\.(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function rateContext(line: string, start: number, end: number): boolean {
  const around = line.slice(Math.max(0, start - 28), Math.min(line.length, end + 28));
  if (/\$/.test(line.slice(Math.max(0, start - 2), start + 1))) return true;
  if (/(?:\/\s*mi(?:le)?|per\s+mile|\/\s*(?:hr|hour)|per\s+hour)/i.test(line.slice(end, end + 16))) return true;
  return RATE_KEYWORD_RE.test(around);
}

function immediatelyAfterRateKeyword(line: string, numberStart: number): boolean {
  const before = line.slice(Math.max(0, numberStart - 32), numberStart);
  return new RegExp(
    `${RATE_KEYWORD}(?![\\w])(?!\\s*(?:confirmation|con\\b|agreement|sheet))\\s*[:#]?\\s*(?:usd\\s*)?\\$?\\s*$`,
    "i",
  ).test(before);
}

function dropClockFalsePositives(line: string, span: MoneySpan): boolean {
  const compact = span.text.replace(/[$,\s]/g, "");
  if (!/^\d{1,2}\.\d{2}$/.test(compact) || !isClockNumber(compact)) return false;
  if (/\$|usd/i.test(span.text)) return false;
  const at = line.indexOf(compact, span.start);
  const numberStart = at >= 0 ? at : span.start;
  const after = line.slice(numberStart + compact.length, numberStart + compact.length + 16);
  if (/(?:\/\s*mi(?:le)?|per\s+mile|\/\s*(?:hr|hour)|per\s+hour)/i.test(after)) return false;
  if (immediatelyAfterRateKeyword(line, numberStart)) return false;
  return true;
}

function pushSpan(spans: MoneySpan[], line: string, start: number, end: number): void {
  let from = start;
  let to = end;
  while (from < to && /\s/.test(line[from] ?? "")) from += 1;
  while (to > from && /\s/.test(line[to - 1] ?? "")) to -= 1;
  if (to <= from) return;
  spans.push({ start: from, end: to, text: line.slice(from, to) });
}

function moneyCandidates(line: string, previousLine = ""): MoneySpan[] {
  const spans: MoneySpan[] = [];
  const patterns: RegExp[] = [
    /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?(?:\s*\/\s*(?:mi(?:le)?|hr|hour)|\s+per\s+(?:mile|hour))?/gi,
    /\bUSD\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/gi,
    /\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\s*USD\b/gi,
    /(?<![\d$.,])\d+\.\d{2,4}\s*(?:\/\s*mi(?:le)?|per\s+mile)\b/gi,
    /(?<![$])\b\d+(?:\.\d{2})?\s*\/\s*(?:hr|hour)\b/gi,
    /\b\d{1,3}(?:,\d{3})+\.\d{2}\b/g,
  ];
  for (const pattern of patterns) {
    for (const range of collect(pattern, line)) {
      pushSpan(spans, line, range.start, range.end);
    }
  }

  const keyword = new RegExp(
    `(?<![\\w])${RATE_KEYWORD}(?![\\w])(?!\\s*(?:confirmation|con\\b|agreement|sheet))\\s*[:#]?\\s*(?:usd\\s*)?\\$?\\s*(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{2})?|\\d+\\.\\d{2}|\\d{2,7})`,
    "gi",
  );
  for (const match of line.matchAll(keyword)) {
    const number = match[1];
    if (!number || match.index == null) continue;
    const numberStart = match.index + match[0].length - number.length;
    if (rejectedBareInteger(line, number, numberStart)) continue;
    pushSpan(spans, line, numberStart, numberStart + number.length);
  }

  const trailing = new RegExp(
    `(\\$?\\s*(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d{2})?|\\d+\\.\\d{2}))\\s*(?:${RATE_KEYWORD})(?![\\w])`,
    "gi",
  );
  for (const match of line.matchAll(trailing)) {
    const token = match[1];
    if (!token || match.index == null) continue;
    pushSpan(spans, line, match.index, match.index + token.length);
  }

  const accessorial = new RegExp(
    `(?<![\\w])(?:detention|lumper|layover|tonu|stop\\s*off|extra\\s+stop|fuel\\s+surcharge|fsc|accessorials?)\\b[\\s\\S]{0,48}?(\\d{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+\\.\\d{2})`,
    "gi",
  );
  for (const match of line.matchAll(accessorial)) {
    const number = match[1];
    if (!number || match.index == null) continue;
    const numberStart = match.index + match[0].length - number.length;
    pushSpan(spans, line, numberStart, numberStart + number.length);
  }

  if (/quick\s*pay/i.test(line) || /quick\s*pay/i.test(previousLine)) {
    for (const range of collect(/\d+(?:\.\d+)?\s*%/g, line)) {
      pushSpan(spans, line, range.start, range.end);
    }
  }
  for (const range of collect(/\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:will\s+be\s+)?deducted/gi, line)) {
    pushSpan(spans, line, range.start, range.end);
  }

  // Table rows: "Flat Rate | 1 | 1234.00 | $ 1,234.00". Once a line has a
  // dollar amount or a rate word, every other bare decimal on it is money.
  if (spans.some((span) => /\$|usd/i.test(span.text)) || RATE_KEYWORD_RE.test(line)) {
    for (const range of collect(/(?<![\w$.,:/-])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?![\w.%/-])/g, line)) {
      pushSpan(spans, line, range.start, range.end);
    }
  }

  return spans;
}

function rejectedBareInteger(line: string, number: string, start: number): boolean {
  if (number.includes(".") || number.includes(",")) return false;
  const after = line.slice(start + number.length, start + number.length + 14);
  if (/^\s*(?:hrs?|hours?|miles?|mi\b|lbs?|pounds?|kgs?|°|degrees|a\.?m\.?|p\.?m\.?|pallets?|cases?|stops?|ft\b|feet|mins?|minutes?|°f|°c)\b/i.test(after)) {
    return true;
  }
  if (number.length >= 6 && !rateContext(line, start, start + number.length)) return true;
  return false;
}

function mergeSpans(spans: MoneySpan[]): MoneySpan[] {
  const ordered = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MoneySpan[] = [];
  for (const span of ordered) {
    const last = merged[merged.length - 1];
    if (!last || span.start > last.end) {
      merged.push({ ...span });
      continue;
    }
    last.end = Math.max(last.end, span.end);
    last.text = "";
  }
  return merged;
}

/** Character ranges that must be painted out of a driver copy. */
export function findMoneySpans(line: string, previousLine = ""): MoneySpan[] {
  const guards = protectedSpans(line);
  const kept = moneyCandidates(line, previousLine).filter((span) => {
    if (overlaps(span, guards)) return false;
    if (dropClockFalsePositives(line, span)) return false;
    return true;
  });
  const merged = mergeSpans(kept);
  for (const span of merged) span.text = line.slice(span.start, span.end);
  return merged;
}

export function lineHasMoney(line: string, previousLine = ""): boolean {
  return findMoneySpans(line, previousLine).length > 0;
}

/** Replace money spans so tests can see what would be covered. */
export function maskMoney(line: string, previousLine = ""): string {
  const spans = findMoneySpans(line, previousLine);
  let cursor = 0;
  let out = "";
  for (const span of spans) {
    out += line.slice(cursor, span.start);
    out += "█".repeat(Math.max(1, span.end - span.start));
    cursor = span.end;
  }
  out += line.slice(cursor);
  return out;
}

const BROKERAGE_NAME = /m\s*&\s*s\s+loads|m\s+and\s+s\s+loads/i;
const LEGAL_CARRIER_NAME = /m\s*&\s*s\s+loads\s+dba\s+ms\s+express/gi;
const HEADER_STOP = /^(?:carrier|pickup|delivery|deliver|shipper|consignee|stop)\b/i;
const BROKERAGE_ANCHOR =
  /228\s+e(?:ast)?\.?\s+route\s+59|nanuet\s*,?\s*ny|deerfield\s+beach\s*,?\s*fl|\bMC\s*-?\s*970613\b/i;

function withoutLegalCarrierName(text: string): string {
  return text.replace(LEGAL_CARRIER_NAME, " ");
}

function headerLinesOf(text: string): string[] {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header: string[] = [];
  for (const line of lines) {
    if (HEADER_STOP.test(line)) break;
    header.push(line);
    if (header.length >= 10) break;
  }
  return header;
}

function headerHasBrokerageAnchor(lines: string[]): boolean {
  return lines.some((line) => BROKERAGE_ANCHOR.test(line));
}

/** Older MS Express confirmations used the profile name "M&S Loads" with the Hastings office. */
function headerIsMsExpressOffice(lines: string[]): boolean {
  if (headerHasBrokerageAnchor(lines)) return false;
  const text = lines.join("\n");
  if (/600\s+e(?:ast)?\.?\s+39(?:th)?/i.test(text)) return true;
  if (/\bMC\s*-?\s*0?56299\b/i.test(text)) return true;
  if (/402[\s.\-]*302[\s.\-]*0097/.test(text)) return true;
  return false;
}

/**
 * True when this rate confirmation is issued by the M&S Loads brokerage.
 * The letterhead (before Carrier/Pickup), a Broker: field, or the brokerage
 * office address / MC counts. Ascend prints the name only in the logo.
 * "M&S Loads DBA MS Express" and the Hastings / MC056299 / 402 office do not.
 */
export function documentIssuedByBrokerage(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = headerLinesOf(text);
  if (headerIsMsExpressOffice(header)) return false;
  if (BROKERAGE_NAME.test(withoutLegalCarrierName(header.join("\n")))) return true;
  // Ascend letterheads carry the name only in a raster logo; the office address / MC is text.
  if (headerHasBrokerageAnchor(header)) return true;
  return lines.some((line) => {
    if (!/\bbroker\s*:/i.test(line)) return false;
    return BROKERAGE_NAME.test(withoutLegalCarrierName(line));
  });
}

/**
 * OCR of a driver copy still shows brokerage letterhead or footer identity.
 * "M&S Loads DBA MS Express" is the carrier legal name and does not count.
 */
export function brokerageIdentityVisible(text: string): boolean {
  const withoutLegalName = text.replace(/m\s*&\s*s\s+loads\s+dba\s+ms\s+express/gi, " ");
  return (
    /\bnanuet\b/i.test(withoutLegalName) ||
    /route\s*59/i.test(withoutLegalName) ||
    /\b970613\b/.test(withoutLegalName) ||
    /billing@msloads/i.test(withoutLegalName) ||
    /deerfield\s+beach/i.test(withoutLegalName) ||
    /m\s*&\s*s\s+loads(?!\s+dba)/i.test(withoutLegalName) ||
    /brokerage\s*&\s*logistics/i.test(withoutLegalName) ||
    /845[\s.-]*694[\s.-]*6059/.test(withoutLegalName) ||
    /unit\s*190/i.test(withoutLegalName) ||
    /\b10954\b/.test(withoutLegalName)
  );
}

/** True for an MS Express confirmation that uses the Hastings office, not the brokerage letterhead. */
export function documentIsMsExpressCarrier(text: string): boolean {
  return headerIsMsExpressOffice(headerLinesOf(text));
}

/** Bare "M&S Loads" on a carrier confirmation. The "DBA MS Express" legal name stays. */
export function findBareMsLoadsSpans(line: string): MoneySpan[] {
  const spans: MoneySpan[] = [];
  for (const range of collect(/M\s*(?:&|and)\s*S\s+Loads(?:\s+LLC)?(?!\s+DBA\b)/gi, line)) {
    pushSpan(spans, line, range.start, range.end);
  }
  const merged = mergeSpans(spans);
  for (const span of merged) span.text = line.slice(span.start, span.end);
  return merged;
}

/** A line that marks the brokerage letterhead: issuer name or office address, not a Carrier: row. */
export function lineAnchorsBrokerageLetterhead(line: string): boolean {
  if (/^\s*carrier\b/i.test(line)) return false;
  const stripped = withoutLegalCarrierName(line);
  if (BROKERAGE_NAME.test(stripped)) return true;
  if (/\bMC\s*-?\s*970613\b/i.test(line) || /\bdocket\s*:/i.test(line)) return true;
  if (/228\s+e(?:ast)?\.?\s+route\s+59|nanuet|deerfield\s+beach/i.test(line)) return true;
  if (/\b10954\b/.test(line) && /nanuet|route\s+59/i.test(line)) return true;
  if (/\b33441\b/.test(line) && /deerfield/i.test(line)) return true;
  return false;
}

function isMsExpressPhone(text: string): boolean {
  return text.replace(/\D/g, "").includes("4023020097");
}

const ADDRESS_PATTERNS = [
  /228\s+e(?:ast)?\.?\s+route\s+59(?:\s*(?:unit|suite|ste\.?|#)\s*\w+)?(?:\s*,?\s*nanuet\s*,?\s*ny\s+10954)?/gi,
  /nanuet\s*,?\s*ny\s+10954/gi,
  /deerfield\s+beach\s*,?\s*fl\s+33441/gi,
];

export type BrokerageSpanContext = {
  /** Line sits in the letterhead block with the brokerage name or address. */
  letterhead?: boolean;
};

/** Brokerage letterhead, MC, offices, and broker contact. Requirement fields and shippers stay. */
export function findBrokerageSpans(line: string, context: BrokerageSpanContext = {}): MoneySpan[] {
  const spans: MoneySpan[] = [];
  const patterns = [
    /M\s*&\s*S\s+Loads(?:\s+LLC)?(?!\s+DBA\b)/gi,
    /M\s+and\s+S\s+Loads(?:\s+LLC)?(?!\s+DBA\b)/gi,
    /MC\s*-?\s*970613/gi,
    /\b970613\b/g,
    /[A-Z0-9._%+-]+@msloads\.com\b/gi,
  ];
  for (const pattern of patterns) {
    for (const range of collect(pattern, line)) {
      const text = line.slice(range.start, range.end);
      if (/^ar@msloads\.com$/i.test(text)) continue;
      pushSpan(spans, line, range.start, range.end);
    }
  }
  let addressMatched = false;
  for (const pattern of ADDRESS_PATTERNS) {
    for (const range of collect(pattern, line)) {
      addressMatched = true;
      pushSpan(spans, line, range.start, range.end);
    }
  }
  const footerGroups = [
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s*\(\s*M\s*(?:&|and)\s*S\s+Loads\s+LLC\.?\s*\)\.?/gi,
    /\(\s*M\s*(?:&|and)\s*S\s+Loads\s+LLC\.?\s*\)\.?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}/gi,
  ];
  for (const pattern of footerGroups) {
    for (const range of collect(pattern, line)) pushSpan(spans, line, range.start, range.end);
  }
  const coverPhones = context.letterhead || addressMatched || /@msloads\.com/i.test(line);
  if (coverPhones) {
    for (const range of collect(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g, line)) {
      const text = line.slice(range.start, range.end);
      if (isMsExpressPhone(text)) continue;
      pushSpan(spans, line, range.start, range.end);
    }
  }
  if (/@msloads\.com/i.test(line)) {
    for (const range of collect(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, line)) {
      const text = line.slice(range.start, range.end);
      if (/deerfield\s+beach/i.test(text)) continue;
      pushSpan(spans, line, range.start, range.end);
    }
  }
  const merged = mergeSpans(spans);
  for (const span of merged) span.text = line.slice(span.start, span.end);
  return merged;
}

export function maskBrokerage(line: string, context: BrokerageSpanContext = {}): string {
  const spans = findBrokerageSpans(line, context);
  let cursor = 0;
  let out = "";
  for (const span of spans) {
    out += line.slice(cursor, span.start);
    out += "█".repeat(Math.max(1, span.end - span.start));
    cursor = span.end;
  }
  out += line.slice(cursor);
  return out;
}

const EXTRACTED_MONEY =
  /\$\s*\d|\b\d{1,3}(?:,\d{3})+\.\d{2}\b|\b\d+\.\d{2}\s*(?:\/\s*mi|per\s+mile|usd)\b|\busd\s*\$?\s*\d/i;

/** Verification regex for a driver copy. Dates and temps do not match. */
export function textHasExtractableMoney(text: string): boolean {
  return EXTRACTED_MONEY.test(text);
}
