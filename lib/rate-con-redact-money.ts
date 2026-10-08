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

/**
 * True when this rate confirmation is issued by the M&S Loads brokerage.
 * The carrier legal name "M&S Loads DBA MS Express" does not count.
 */
export function documentIssuedByBrokerage(text: string): boolean {
  const withoutLegal = text.replace(/m\s*&\s*s\s+loads\s+dba\s+ms\s+express/gi, " ");
  return /m\s*&\s*s\s+loads|m\s+and\s+s\s+loads/i.test(withoutLegal);
}

/** Brokerage letterhead, MC, offices, and broker contact. Shipper lines stay. */
export function findBrokerageSpans(line: string): MoneySpan[] {
  const spans: MoneySpan[] = [];
  const patterns = [
    /M\s*&\s*S\s+Loads(?:\s+LLC)?(?!\s+DBA\b)/gi,
    /M\s+and\s+S\s+Loads(?:\s+LLC)?(?!\s+DBA\b)/gi,
    /MC\s*-?\s*970613/gi,
    /\b970613\b/g,
    /\bEsti\s+Katz\b/g,
    /[A-Z0-9._%+-]+@msloads\.com\b/gi,
  ];
  for (const pattern of patterns) {
    for (const range of collect(pattern, line)) {
      const text = line.slice(range.start, range.end);
      if (/^ar@msloads\.com$/i.test(text)) continue;
      pushSpan(spans, line, range.start, range.end);
    }
  }
  const address =
    /nanuet|deerfield\s+beach|228\s+e(?:ast)?\.?\s+route\s+59/i.test(line) ||
    (/\b10954\b/.test(line) && /nanuet|\bny\b|route\s+59/i.test(line)) ||
    (/\b33441\b/.test(line) && /deerfield|\bfl\b/i.test(line));
  if (address) pushSpan(spans, line, 0, line.length);
  const identityLine = address || /m\s*&\s*s\s+loads|m\s+and\s+s\s+loads|970613|@msloads\.com|esti\s+katz/i.test(line);
  if (identityLine) {
    for (const range of collect(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g, line)) {
      pushSpan(spans, line, range.start, range.end);
    }
    if (/@msloads\.com/i.test(line)) {
      for (const range of collect(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, line)) {
        const text = line.slice(range.start, range.end);
        if (/deerfield\s+beach/i.test(text)) continue;
        pushSpan(spans, line, range.start, range.end);
      }
    }
  }
  const merged = mergeSpans(spans);
  for (const span of merged) span.text = line.slice(span.start, span.end);
  return merged;
}

export function maskBrokerage(line: string): string {
  const spans = findBrokerageSpans(line);
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
