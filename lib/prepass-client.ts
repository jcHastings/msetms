import {
  getPrepassAccountNumber,
  getPrepassApiBase,
  getPrepassApiKey,
  getPrepassClientId,
  getPrepassClientSecret,
  getPrepassOAuthScope,
  getPrepassTokenUrl,
  getPrepassTransactionsPath,
  isPrepassOAuthReady,
} from "./env";
import { parseFuelNumber } from "./fuel";
import { classifyTollCategory, type TollCategory } from "./tolls";

export const PREPASS_DEFAULT_WINDOW_DAYS = 14;
export const PREPASS_MAX_WINDOW_DAYS = 31;
const PREPASS_FETCH_TIMEOUT_MS = 20_000;
const PREPASS_MAX_PAGES = 20;

export type PrepassApiRow = {
  date: string;
  time?: string;
  transponder_id: string;
  unit_number?: string;
  driver_name?: string;
  plaza?: string;
  state?: string;
  amount: number;
  category: TollCategory;
  invoice_number?: string;
  reference_number?: string;
};

export type PrepassPullSuccess = {
  ok: true;
  rows: PrepassApiRow[];
  message: string;
};

export type PrepassPullFailure = {
  ok: false;
  message: string;
  error?: string;
};

export type PrepassPullResult = PrepassPullSuccess | PrepassPullFailure;

export type PrepassPullStatus = {
  ready: boolean;
  oauthReady: boolean;
  accountReady: boolean;
  legacyKeyOnly: boolean;
  windowDays: number;
  tone: "ready" | "warn";
  message: string;
};

export type PrepassPostDateWindow = {
  startPostDate: string;
  endPostDate: string;
  days: number;
};

type FetchLike = typeof fetch;

const MISSING_OAUTH =
  "PREPASS_CLIENT_ID and PREPASS_CLIENT_SECRET are missing. API pull skipped; manual CSV/XLSX import still works.";
const MISSING_ACCOUNT =
  "OAuth credentials are present. Add PREPASS_ACCOUNT_NUMBER to pull posted tolls. Do not invent the account number. CSV/XLSX import still works.";
const LEGACY_ONLY =
  "Legacy PREPASS_API_KEY is present, but REST pull needs PREPASS_CLIENT_ID, PREPASS_CLIENT_SECRET, and PREPASS_ACCOUNT_NUMBER. CSV/XLSX import still works.";

export function describePrepassPullStatus(): PrepassPullStatus {
  const oauthReady = isPrepassOAuthReady();
  const accountReady = Boolean(getPrepassAccountNumber());
  const legacyKeyOnly = Boolean(getPrepassApiKey()) && !oauthReady;
  const ready = oauthReady && accountReady;
  const message = ready
    ? `Pull PrePass API loads posted tolls for the last ${PREPASS_DEFAULT_WINDOW_DAYS} days. CSV/XLSX import still works.`
    : !oauthReady && legacyKeyOnly
      ? LEGACY_ONLY
      : !oauthReady
        ? MISSING_OAUTH
        : MISSING_ACCOUNT;
  return {
    ready,
    oauthReady,
    accountReady,
    legacyKeyOnly,
    windowDays: PREPASS_DEFAULT_WINDOW_DAYS,
    tone: ready ? "ready" : "warn",
    message,
  };
}

export function defaultPostDateWindow(now = new Date()): PrepassPostDateWindow {
  return postDateWindowEndingOn(now, PREPASS_DEFAULT_WINDOW_DAYS);
}

export function postDateWindowEndingOn(now: Date, days: number): PrepassPostDateWindow {
  const span = Math.min(PREPASS_MAX_WINDOW_DAYS, Math.max(1, Math.floor(days)));
  const end = utcYmd(addUtcDays(utcDateOnly(now), 1));
  const start = utcYmd(addUtcDays(utcDateOnly(now), 1 - span));
  return { startPostDate: start, endPostDate: end, days: span };
}

export function normalizePrepassCategory(raw: string): TollCategory {
  return classifyTollCategory(raw);
}

export function mapPrepassTransaction(raw: unknown): PrepassApiRow | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const amount = parseFuelNumber(firstString(item, ["tollCharge", "amount", "charge", "total"]));
  if (amount == null || !Number.isFinite(amount)) return null;
  const when = firstString(item, [
    "exitDateTimeUtc",
    "exitDateTime",
    "entryDateTimeUtc",
    "entryDateTime",
    "postDateTime",
    "invoiceDateTime",
  ]);
  const occurred = parseWhen(when);
  if (!occurred) return null;
  const transponder = firstString(item, ["deviceNumber", "ppDeviceId", "transponderId", "transponder"]);
  const plaza = firstString(item, ["exitPlazaName", "entryPlazaName", "tollAgencyName", "plaza"]);
  const state = firstString(item, ["tollAgencyState", "plateState", "state"]);
  const category = classifyTollCategory(
    [firstString(item, ["tollCategory", "category"]), plaza, firstString(item, ["tollAgencyName"])].filter(Boolean).join(" "),
  );
  const invoice = firstString(item, ["tollId", "invoiceNumber", "invoice"]);
  return {
    date: occurred.date,
    time: occurred.time,
    transponder_id: transponder,
    unit_number: firstString(item, ["vehicleNumber", "unitNumber", "unit"]),
    plaza,
    state,
    amount,
    category,
    invoice_number: invoice,
    reference_number: firstString(item, ["ppDeviceId", "deviceNumber", "reference"]),
  };
}

export function mapPrepassTransactions(payload: unknown): PrepassApiRow[] {
  const rows: PrepassApiRow[] = [];
  for (const item of extractTransactionList(payload)) {
    const mapped = mapPrepassTransaction(item);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

export async function pullPrepassTransactions(options?: {
  now?: Date;
  fetch?: FetchLike;
}): Promise<PrepassPullResult> {
  const status = describePrepassPullStatus();
  if (!status.ready) {
    return { ok: true, rows: [], message: status.message };
  }
  const accountNumber = getPrepassAccountNumber();
  const clientId = getPrepassClientId();
  const clientSecret = getPrepassClientSecret();
  if (!accountNumber || !clientId || !clientSecret) {
    return { ok: true, rows: [], message: status.message };
  }
  const doFetch = options?.fetch ?? fetch;
  const window = defaultPostDateWindow(options?.now);
  try {
    const token = await requestPrepassAccessToken(doFetch, clientId, clientSecret);
    const payloadRows = await fetchAllPrepassTransactions(doFetch, token, accountNumber, window);
    const rows = mapPrepassTransactions({ transactions: payloadRows });
    if (!payloadRows.length) {
      return {
        ok: true,
        rows: [],
        message: `No PrePass tolls posted ${window.startPostDate} through ${window.endPostDate}. CSV/XLSX import still works.`,
      };
    }
    if (!rows.length) {
      return {
        ok: false,
        message:
          "PrePass returned toll rows, but none mapped to Date + Amount. CSV/XLSX import still works.",
        error:
          "PrePass returned toll rows, but none mapped to Date + Amount. CSV/XLSX import still works.",
      };
    }
    return {
      ok: true,
      rows,
      message: `Pulled ${rows.length} PrePass ${rows.length === 1 ? "row" : "rows"} posted ${window.startPostDate} through ${window.endPostDate}.`,
    };
  } catch (error) {
    const message = publicPrepassError(error);
    return { ok: false, message, error: message };
  }
}

async function requestPrepassAccessToken(
  doFetch: FetchLike,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const scope = getPrepassOAuthScope();
  if (scope) body.set("scope", scope);
  const response = await doFetch(getPrepassTokenUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      client_id: clientId,
      client_secret: clientSecret,
    },
    body: body.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(PREPASS_FETCH_TIMEOUT_MS),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(tokenFailureMessage(response.status, payload));
  }
  const token = firstString(asRecord(payload), ["access_token", "accessToken", "token"]);
  if (!token) {
    throw new Error("PrePass token response did not include an access token. CSV/XLSX import still works.");
  }
  return token;
}

async function fetchAllPrepassTransactions(
  doFetch: FetchLike,
  token: string,
  accountNumber: string,
  window: PrepassPostDateWindow,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let pageNumber = 1;
  let totalPages = 1;
  while (pageNumber <= totalPages && pageNumber <= PREPASS_MAX_PAGES) {
    const url = new URL(`${getPrepassApiBase()}${getPrepassTransactionsPath()}`);
    url.searchParams.set("startPostDate", window.startPostDate);
    url.searchParams.set("endPostDate", window.endPostDate);
    url.searchParams.set("accountNumbers", accountNumber);
    url.searchParams.set("pageNumber", String(pageNumber));
    url.searchParams.set("pageSize", "10000");
    const response = await doFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PREPASS_FETCH_TIMEOUT_MS),
    });
    if (response.status === 204) return rows;
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(transactionsFailureMessage(response.status, payload));
    }
    const pageRows = extractTransactionList(payload);
    rows.push(...pageRows);
    const info = pageInfo(payload);
    totalPages = Math.max(1, info.totalPages);
    if (!pageRows.length || pageNumber >= totalPages) break;
    pageNumber += 1;
  }
  return rows;
}

function extractTransactionList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  const nested = record.transactions ?? record.data ?? record.items ?? record.results;
  if (Array.isArray(nested)) return nested;
  const data = asRecord(record.data);
  if (data && Array.isArray(data.transactions)) return data.transactions;
  return [];
}

function pageInfo(payload: unknown): { pageNumber: number; totalPages: number } {
  const record = asRecord(payload);
  const info = asRecord(record?.pageInfo) ?? asRecord(record?.page_info);
  const pageNumber = Number(info?.pageNumber ?? info?.page_number ?? 1);
  const totalPages = Number(info?.totalPages ?? info?.total_pages ?? 1);
  return {
    pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: "PrePass returned a non-JSON response." };
  }
}

function tokenFailureMessage(status: number, payload: unknown): string {
  if (status === 401 || status === 403) {
    return "PrePass rejected the client credentials. CSV/XLSX import still works.";
  }
  return `PrePass token request failed (${status}${aadErrorSuffix(payload)}). CSV/XLSX import still works.`;
}

function transactionsFailureMessage(status: number, payload: unknown): string {
  if (status === 401 || status === 403) {
    return "PrePass rejected the access token. CSV/XLSX import still works.";
  }
  const validation = firstValidationMessage(payload);
  if (status === 400 && validation) {
    return `PrePass rejected the date or account filter (${validation}). CSV/XLSX import still works.`;
  }
  return `PrePass toll pull failed (${status}). CSV/XLSX import still works.`;
}

function firstValidationMessage(payload: unknown): string {
  const record = asRecord(payload);
  const errors = record?.validationErrors;
  if (!Array.isArray(errors) || !errors.length) return "";
  const first = asRecord(errors[0]);
  return redactSecrets(String(first?.message ?? "").trim());
}

function aadErrorSuffix(payload: unknown): string {
  const record = asRecord(payload);
  const code = firstString(record ?? {}, ["error"]);
  return code ? `; ${redactSecrets(code)}` : "";
}

function publicPrepassError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "PrePass timed out. CSV/XLSX import still works.";
  }
  const raw = error instanceof Error ? error.message : "PrePass pull failed.";
  return redactSecrets(raw) || "PrePass pull failed. CSV/XLSX import still works.";
}

function redactSecrets(value: string): string {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/access_token["']?\s*[:=]\s*["']?[^"'\s,]+/gi, "access_token=[redacted]")
    .replace(/client_secret["']?\s*[:=]\s*["']?[^"'\s,]+/gi, "client_secret=[redacted]");
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseWhen(raw: string): { date: string; time: string } | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const iso = Date.parse(text);
  if (Number.isFinite(iso)) {
    const when = new Date(iso);
    const date = `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}`;
    const time = `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}`;
    return { date, time };
  }
  const ymd = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!ymd) return null;
  const time = text.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
  return { date: ymd[1], time };
}

function utcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function utcYmd(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
