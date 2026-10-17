import { isOwnerOperator } from "./types";

/**
 * Paystub text parser and name matcher.
 * A real Gusto "download paystub" PDF was not available in this repo, so extraction
 * is label-based. Unlabeled or differently arranged amounts stay blank for manual entry.
 */

export const PAYSTUB_MAX_PDF_BYTES = 15 * 1024 * 1024;
export const PAYSTUB_MAX_FILES = 40;
export const GUSTO_EMPLOYEE_LOGIN_URL = "https://app.gusto.com/login";

export const OWNER_OPERATOR_PAY_NOTE =
  "Owner-operators are 1099 and are paid on settlements, not through Gusto. They are left out of paystub matching.";

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);
const NAME_STOP = new Set([
  "earnings",
  "name",
  "information",
  "details",
  "address",
  "statement",
  "pay",
  "payroll",
  "stub",
  "paystub",
  "employee",
  "company",
]);

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export type PaystubDriverCandidate = {
  id: number;
  name: string;
  driverType: string;
};

export type ParsedPaystub = {
  employeeName: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  gross: string;
  net: string;
};

export type PaystubMatchState =
  | "matched"
  | "overridden"
  | "unmatched"
  | "low_confidence"
  | "owner_operator"
  | "duplicate_file"
  | "duplicate_pay_date"
  | "incomplete";

export type PaystubDecision = {
  outcome: "stored" | "needs_review" | "duplicate" | "error";
  queue: boolean;
  attachDriverId: number | null;
  suggestedDriverId: number | null;
  matchState: PaystubMatchState;
  reason: string;
  employeeName: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  gross: string;
  net: string;
  existingId?: number;
};

export type PaystubPreviewRow = {
  key: string;
  fileName: string;
  employeeName: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  gross: string;
  net: string;
  matchState: PaystubMatchState;
  driverId: number | null;
  reason: string;
  locked: boolean;
};

export type PaystubQueueRow = {
  id: number;
  fileName: string;
  employeeName: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  gross: string;
  net: string;
  matchState: string;
  suggestedDriverId: number | null;
  reason: string;
};

export function personNameTokens(raw: string): string[] {
  let text = String(raw ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  text = text.replace(/[‘’]/g, "'").trim();
  const commaParts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaParts.length >= 2) {
    text = `${commaParts.slice(1).join(" ")} ${commaParts[0]}`;
  }
  text = text.toLowerCase().replace(/['.]/g, "");
  text = text.replace(/-/g, " ");
  text = text.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !SUFFIXES.has(token));
}

export function namesMatchExact(left: string, right: string): boolean {
  const a = personNameTokens(left);
  const b = personNameTokens(right);
  if (a.length < 2 || b.length < 2) return false;
  return a.join(" ") === b.join(" ");
}

export type NameMatch = {
  state: "matched" | "unmatched" | "low_confidence" | "owner_operator";
  driverId: number | null;
  reason: string;
};

export function matchPaystubEmployee(employeeName: string, drivers: PaystubDriverCandidate[]): NameMatch {
  const tokens = personNameTokens(employeeName);
  const company = drivers.filter((driver) => !isOwnerOperator(driver.driverType));
  const owners = drivers.filter((driver) => isOwnerOperator(driver.driverType));
  if (!employeeName.trim() || tokens.length === 0) {
    return { state: "unmatched", driverId: null, reason: "Employee name was not found in the PDF." };
  }
  const exactCompany = company.filter((driver) => namesMatchExact(employeeName, driver.name));
  if (exactCompany.length === 1) {
    return { state: "matched", driverId: exactCompany[0].id, reason: `Matched ${exactCompany[0].name}.` };
  }
  if (exactCompany.length > 1) {
    return {
      state: "low_confidence",
      driverId: null,
      reason: "More than one company driver has this name. Assign by hand.",
    };
  }
  const exactOwners = owners.filter((driver) => namesMatchExact(employeeName, driver.name));
  if (exactOwners.length > 0) {
    return {
      state: "owner_operator",
      driverId: null,
      reason: `${OWNER_OPERATOR_PAY_NOTE} ${exactOwners[0].name} was not matched.`,
    };
  }
  if (tokens.length < 2) {
    return {
      state: "low_confidence",
      driverId: null,
      reason: "Only part of the name was read. Assign the driver by hand.",
    };
  }
  const last = tokens[tokens.length - 1];
  const lastNameHits = company.filter((driver) => personNameTokens(driver.name).at(-1) === last);
  if (lastNameHits.length === 1) {
    return {
      state: "low_confidence",
      driverId: null,
      reason: `Last name matches ${lastNameHits[0].name}, which is not an exact name match. Assign by hand.`,
    };
  }
  if (lastNameHits.length > 1) {
    return {
      state: "low_confidence",
      driverId: null,
      reason: "Several company drivers share this last name. Assign by hand.",
    };
  }
  return { state: "unmatched", driverId: null, reason: "No company driver matches this name." };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  let fullYear = year;
  if (fullYear < 100) fullYear += fullYear >= 70 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || fullYear < 1990 || fullYear > 2100) return "";
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${fullYear}-${pad2(month)}-${pad2(day)}`;
}

type DateHit = { index: number; end: number; iso: string };

function collectDates(text: string): DateHit[] {
  const hits: DateHit[] = [];
  const source = String(text ?? "");
  const word =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;
  const numeric = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g;
  for (const match of source.matchAll(word)) {
    const month = MONTHS[match[1].toLowerCase()];
    const iso = isoDate(Number(match[3]), month, Number(match[2]));
    if (iso) hits.push({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, iso });
  }
  for (const match of source.matchAll(numeric)) {
    const index = match.index ?? 0;
    if (hits.some((hit) => index < hit.end && index + match[0].length > hit.index)) continue;
    const iso = match[1]
      ? isoDate(Number(match[1]), Number(match[2]), Number(match[3]))
      : isoDate(Number(match[6]), Number(match[4]), Number(match[5]));
    if (iso) hits.push({ index, end: index + match[0].length, iso });
  }
  hits.sort((left, right) => left.index - right.index);
  return hits;
}

export function normalizePayDate(raw: string): string {
  const hits = collectDates(String(raw ?? ""));
  return hits[0]?.iso ?? "";
}

export function normalizePayMoney(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const match = text.match(/\$?\s*-?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\$?\s*-?\d+\.\d{2}|\$\s*-?\d+(?:\.\d{2})?/);
  if (!match) return "";
  const cleaned = match[0].replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return "";
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return "";
  return amount.toFixed(2);
}

function firstCurrentMoney(text: string): string {
  const ytd = text.search(/\bYTD\b/i);
  const head = ytd >= 0 ? text.slice(0, ytd) : text;
  return normalizePayMoney(head);
}

function looksLikePersonName(value: string): boolean {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 80 || /\d/.test(cleaned)) return false;
  const tokens = personNameTokens(cleaned);
  if (tokens.length === 0) return false;
  if (tokens.length === 1 && NAME_STOP.has(tokens[0])) return false;
  return /[A-Za-z]/.test(cleaned);
}

const NEXT_LABEL =
  /\b(?:employee name|pay date|check date|payment date|paycheck date|pay period start|period start|period beginning|pay period end|period end|period ending|pay period|gross pay|gross earnings|total gross|gross wages|current gross|net pay|net earnings|take[- ]home(?: pay)?|net wages)\b/i;

function valueUntilNextLabel(rest: string): string {
  const cut = rest.search(NEXT_LABEL);
  return (cut >= 0 ? rest.slice(0, cut) : rest).replace(/\s+/g, " ").trim();
}

type LabelKind = "employee" | "payDate" | "period" | "periodStart" | "periodEnd" | "gross" | "net";

const LABEL_RULES: Array<{ kind: LabelKind; re: RegExp }> = [
  { kind: "periodStart", re: /^(?:pay period start|period start|period beginning)\b[:\s-]*(.*)$/i },
  { kind: "periodEnd", re: /^(?:pay period end|period end|period ending)\b[:\s-]*(.*)$/i },
  { kind: "payDate", re: /^(?:pay date|check date|payment date|paycheck date)\b[:\s-]*(.*)$/i },
  { kind: "period", re: /^(?:pay period|period)\b[:\s-]*(.*)$/i },
  { kind: "employee", re: /^(?:employee name|employee)\b[:\s-]*(.*)$/i },
  { kind: "gross", re: /^(?:gross pay|gross earnings|total gross|gross wages|current gross|gross)\b[:\s$-]*(.*)$/i },
  { kind: "net", re: /^(?:net pay|net earnings|take[- ]home(?: pay)?|net wages|net)\b[:\s$-]*(.*)$/i },
];

function classifyLabel(line: string): { kind: LabelKind; rest: string } | null {
  for (const rule of LABEL_RULES) {
    const match = line.match(rule.re);
    if (match) return { kind: rule.kind, rest: (match[1] ?? "").trim() };
  }
  return null;
}

function lineValue(rest: string, nextLine: string): string {
  const same = valueUntilNextLabel(rest);
  if (same) return same;
  if (!nextLine || classifyLabel(nextLine)) return "";
  return nextLine.trim();
}

export function parsePaystubText(text: string): ParsedPaystub {
  const lines = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed: ParsedPaystub = {
    employeeName: "",
    payDate: "",
    periodStart: "",
    periodEnd: "",
    gross: "",
    net: "",
  };
  for (let index = 0; index < lines.length; index += 1) {
    const labeled = classifyLabel(lines[index]);
    if (!labeled) continue;
    const value = lineValue(labeled.rest, lines[index + 1] ?? "");
    if (labeled.kind === "employee" && !parsed.employeeName) {
      const candidate = valueUntilNextLabel(labeled.rest);
      if (looksLikePersonName(candidate) && personNameTokens(candidate).length >= 2) parsed.employeeName = candidate;
      else if (looksLikePersonName(value) && personNameTokens(value).length >= 1 && !classifyLabel(value)) {
        parsed.employeeName = value;
      }
    } else if (labeled.kind === "payDate" && !parsed.payDate) {
      parsed.payDate = collectDates(value)[0]?.iso ?? "";
    } else if (labeled.kind === "periodStart" && !parsed.periodStart) {
      parsed.periodStart = collectDates(value)[0]?.iso ?? "";
    } else if (labeled.kind === "periodEnd" && !parsed.periodEnd) {
      parsed.periodEnd = collectDates(value)[0]?.iso ?? "";
    } else if (labeled.kind === "period" && !parsed.periodStart) {
      const dates = collectDates(value);
      parsed.periodStart = dates[0]?.iso ?? "";
      if (!parsed.periodEnd) parsed.periodEnd = dates[1]?.iso ?? "";
    } else if (labeled.kind === "gross" && !parsed.gross) {
      parsed.gross = firstCurrentMoney(value);
    } else if (labeled.kind === "net" && !parsed.net) {
      parsed.net = firstCurrentMoney(value);
    }
  }
  if (!parsed.employeeName) {
    const forName = String(text ?? "").match(/\bpay\s*stub\s+for\s+([A-Za-z][A-Za-z.'’, -]{2,80})/i);
    const candidate = forName?.[1]?.trim() ?? "";
    if (looksLikePersonName(candidate)) parsed.employeeName = candidate.replace(/[,.-]+$/, "").trim();
  }
  return parsed;
}

export function missingPaystubFields(fields: ParsedPaystub): string[] {
  const missing: string[] = [];
  if (!fields.payDate) missing.push("pay date");
  if (!fields.periodStart) missing.push("period start");
  if (!fields.periodEnd) missing.push("period end");
  if (!fields.gross) missing.push("gross");
  if (!fields.net) missing.push("net");
  return missing;
}

function resolveDriver(
  employeeName: string,
  drivers: PaystubDriverCandidate[],
  overrideDriverId: number | null | undefined,
): { error?: string; attachable: boolean; suggestedDriverId: number | null; matchState: PaystubMatchState; reason: string } {
  if (overrideDriverId != null) {
    if (!Number.isInteger(overrideDriverId) || overrideDriverId <= 0) {
      return { error: "driver_id is not a driver in this fleet.", attachable: false, suggestedDriverId: null, matchState: "unmatched", reason: "" };
    }
    const driver = drivers.find((item) => item.id === overrideDriverId);
    if (!driver) {
      return {
        error: "driver_id is not a driver in this fleet.",
        attachable: false,
        suggestedDriverId: null,
        matchState: "unmatched",
        reason: "",
      };
    }
    if (isOwnerOperator(driver.driverType)) {
      return {
        attachable: false,
        suggestedDriverId: null,
        matchState: "owner_operator",
        reason: `${OWNER_OPERATOR_PAY_NOTE} ${driver.name} was not attached.`,
      };
    }
    return {
      attachable: true,
      suggestedDriverId: driver.id,
      matchState: "overridden",
      reason: `Assigned to ${driver.name} by hand.`,
    };
  }
  const match = matchPaystubEmployee(employeeName, drivers);
  return {
    attachable: match.state === "matched",
    suggestedDriverId: match.state === "matched" ? match.driverId : null,
    matchState: match.state,
    reason: match.reason,
  };
}

export function decidePaystub(input: {
  parsed: ParsedPaystub;
  drivers: PaystubDriverCandidate[];
  overrideDriverId?: number | null;
  /** Office left the driver blank. Do not put the automatic match back. */
  blockAutoMatch?: boolean;
  duplicateFileId?: number | null;
  duplicatePayDate?: boolean;
  duplicatePayDateId?: number | null;
}): PaystubDecision {
  const fields = input.parsed;
  const base = {
    employeeName: fields.employeeName,
    payDate: fields.payDate,
    periodStart: fields.periodStart,
    periodEnd: fields.periodEnd,
    gross: fields.gross,
    net: fields.net,
  };
  if (input.duplicateFileId) {
    return {
      outcome: "duplicate",
      queue: false,
      attachDriverId: null,
      suggestedDriverId: null,
      matchState: "duplicate_file",
      reason: input.duplicateFileId < 0 ? "This file is already in this upload." : "This file was already uploaded.",
      existingId: input.duplicateFileId > 0 ? input.duplicateFileId : undefined,
    ...base,
  };
  }
  if (input.blockAutoMatch) {
    const missing = missingPaystubFields(fields);
    return {
      outcome: "needs_review",
      queue: true,
      attachDriverId: null,
      suggestedDriverId: null,
      matchState: "unmatched",
      reason: missing.length
        ? `Assign a driver or skip this row. Still need ${missing.join(", ")}.`
        : "Assign a driver or skip this row.",
      ...base,
    };
  }
  const assignment = resolveDriver(fields.employeeName, input.drivers, input.overrideDriverId);
  if (assignment.error) {
    return {
      outcome: "error",
      queue: false,
      attachDriverId: null,
      suggestedDriverId: null,
      matchState: "unmatched",
      reason: assignment.error,
      ...base,
    };
  }
  const missing = missingPaystubFields(fields);
  if (!assignment.attachable) {
    const reason = missing.length ? `${assignment.reason} Still need ${missing.join(", ")}.` : assignment.reason;
    return {
      outcome: "needs_review",
      queue: true,
      attachDriverId: null,
      suggestedDriverId: null,
      matchState: assignment.matchState,
      reason,
      ...base,
    };
  }
  if (missing.length) {
    return {
      outcome: "needs_review",
      queue: true,
      attachDriverId: null,
      suggestedDriverId: assignment.suggestedDriverId,
      matchState: "incomplete",
      reason: `Enter ${missing.join(", ")} before this paystub can be saved.`,
      ...base,
    };
  }
  if (input.duplicatePayDate) {
    return {
      outcome: "duplicate",
      queue: true,
      attachDriverId: null,
      suggestedDriverId: assignment.suggestedDriverId,
      matchState: "duplicate_pay_date",
      reason: "This driver already has a paystub for this pay date.",
      existingId: input.duplicatePayDateId ?? undefined,
      ...base,
    };
  }
  return {
    outcome: "stored",
    queue: false,
    attachDriverId: assignment.suggestedDriverId,
    suggestedDriverId: assignment.suggestedDriverId,
    matchState: assignment.matchState,
    reason: assignment.reason,
    ...base,
  };
}

export function previewDriverId(decision: PaystubDecision): number | null {
  if (decision.matchState === "duplicate_file") return null;
  if (decision.matchState === "matched" || decision.matchState === "overridden" || decision.matchState === "incomplete" || decision.matchState === "duplicate_pay_date") {
    return decision.suggestedDriverId;
  }
  return null;
}

export function formatPayMoney(value: string): string {
  if (!value) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatPayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso || "—";
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export function formatPayPeriod(start: string, end: string): string {
  if (!start && !end) return "—";
  if (start && end) return `${formatPayDate(start)} – ${formatPayDate(end)}`;
  return formatPayDate(start || end);
}

export function matchStateLabel(state: string): string {
  switch (state) {
    case "matched":
      return "Matched";
    case "overridden":
      return "Assigned by hand";
    case "unmatched":
      return "Needs review";
    case "low_confidence":
      return "Low confidence";
    case "owner_operator":
      return "Owner-operator";
    case "duplicate_file":
      return "Duplicate file";
    case "duplicate_pay_date":
      return "Duplicate pay date";
    case "incomplete":
      return "Needs details";
    default:
      return "Needs review";
  }
}
