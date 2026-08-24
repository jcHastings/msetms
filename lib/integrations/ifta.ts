import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import { addAttachment } from "../files";
import { getIftaReport, getLoad, getTruck, saveIftaReport } from "../queries";
import { isIftaEligibleStatus, type IftaJurisdictionRow, type IftaReport, type LoadView } from "../types";

const SAMSARA_BASE = "https://api.samsara.com";
const FETCH_TIMEOUT_MS = 15_000;
const DETAIL_POLL_ATTEMPTS = 8;
const DETAIL_POLL_MS = 1_200;
const METERS_PER_MILE = 1609.344;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type IftaPanel = {
  report: IftaReport | null;
  canRefresh: boolean;
  configured: boolean;
  reason: string;
};

class IftaHttpError extends Error {
  status: number;
  constructor(status: number, context: string) {
    super(iftaStatusMessage(status, context));
    this.name = "IftaHttpError";
    this.status = status;
  }
}

export function resetIftaForTests(): void {
  // Reserved for request-level cache if added later.
}

export function metersToMiles(meters: number): number {
  return Math.round((meters / METERS_PER_MILE) * 10) / 10;
}

export function extractJurisdiction(place: string): string | null {
  const trimmed = place.trim();
  const comma = trimmed.match(/,\s*([A-Za-z]{2})\s*$/);
  if (comma) return comma[1].toUpperCase();
  const trailing = trimmed.match(/\s([A-Za-z]{2})$/);
  if (trailing) return trailing[1].toUpperCase();
  return null;
}

export function jurisdictionName(code: string): string {
  return JURISDICTION_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

export function buildDemoIftaBreakdown(origin: string, destination: string): IftaJurisdictionRow[] {
  const start = extractJurisdiction(origin);
  const end = extractJurisdiction(destination);
  if (!start && !end) {
    return [{ jurisdiction: "XX", name: "Unknown (demo)", miles: 250 }];
  }
  const path = pathBetween(start ?? end!, end ?? start!);
  const hops = path.length <= 1 ? [path[0]] : path;
  const total = estimatedCorridorMiles(hops);
  if (hops.length === 1) {
    return [{ jurisdiction: hops[0], name: jurisdictionName(hops[0]), miles: total }];
  }
  const weights = hops.map((_, index) => (index === 0 || index === hops.length - 1 ? 1.15 : 1));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  return hops.map((code, index) => ({
    jurisdiction: code,
    name: jurisdictionName(code),
    miles: Math.round(((total * weights[index]) / weightSum) * 10) / 10,
  }));
}

export function mapIftaVehicleReports(input: {
  vehicleReports: Array<{
    vehicle?: { id?: string | number; name?: string };
    jurisdictions?: Array<{ jurisdiction?: string; taxableMeters?: number; totalMeters?: number }>;
  }>;
  vehicleId: string;
}): IftaJurisdictionRow[] {
  const report =
    input.vehicleReports.find((item) => String(item.vehicle?.id ?? "") === input.vehicleId) ??
    input.vehicleReports[0];
  if (!report) return [];
  return (report.jurisdictions ?? [])
    .map((row) => {
      const meters = row.totalMeters ?? row.taxableMeters ?? 0;
      return {
        jurisdiction: String(row.jurisdiction ?? "").toUpperCase(),
        name: jurisdictionName(String(row.jurisdiction ?? "")),
        miles: metersToMiles(meters),
      };
    })
    .filter((row) => row.jurisdiction);
}

export function parseIftaDetailCsv(csv: string): IftaJurisdictionRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
  const jurisdictionIndex = header.findIndex((value) => value === "jurisdiction");
  const metersIndex = header.findIndex((value) => value === "distance_meters" || value === "distancemeters");
  if (jurisdictionIndex < 0 || metersIndex < 0) return [];
  const totals = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const code = (cols[jurisdictionIndex] ?? "").trim().toUpperCase();
    const meters = Number.parseFloat(cols[metersIndex] ?? "");
    if (!code || Number.isNaN(meters)) continue;
    totals.set(code, (totals.get(code) ?? 0) + meters);
  }
  return [...totals.entries()]
    .map(([jurisdiction, meters]) => ({
      jurisdiction,
      name: jurisdictionName(jurisdiction),
      miles: metersToMiles(meters),
    }))
    .sort((a, b) => b.miles - a.miles || a.jurisdiction.localeCompare(b.jurisdiction));
}

export function getIftaPanel(load: LoadView): IftaPanel {
  const report = getIftaReport(load.id);
  const eligible = isIftaEligibleStatus(load.status);
  if (!eligible) {
    return {
      report,
      canRefresh: false,
      configured: isSamsaraTokenSet(),
      reason: "IFTA refresh is available after the load is in transit or delivered.",
    };
  }
  if (!load.truck_id) {
    return {
      report,
      canRefresh: !isSamsaraTokenSet(),
      configured: isSamsaraTokenSet(),
      reason: isSamsaraTokenSet()
        ? "Assign a truck with a Samsara vehicle ID to pull live IFTA miles."
        : "Demo IFTA uses origin and destination. Assign a truck to record a vehicle id.",
    };
  }
  const truck = getTruck(load.truck_id);
  if (isSamsaraTokenSet() && !truck?.samsara_vehicle_id) {
    return {
      report,
      canRefresh: false,
      configured: true,
      reason: "Map a Samsara vehicle ID on the assigned truck, then refresh.",
    };
  }
  return { report, canRefresh: true, configured: isSamsaraTokenSet(), reason: "" };
}

export async function ensureDemoIfta(load: LoadView): Promise<IftaReport | null> {
  const existing = getIftaReport(load.id);
  if (existing) return existing;
  if (isSamsaraTokenSet()) return null;
  if (!isIftaEligibleStatus(load.status)) return null;
  return refreshIftaForLoad(load.id);
}

export async function refreshIftaForLoad(loadId: number): Promise<IftaReport> {
  await loadRuntimeEnv();
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (!isIftaEligibleStatus(load.status)) {
    throw new Error("Refresh IFTA after the load is in transit or delivered.");
  }
  const window = loadWindow(load);
  const truck = load.truck_id ? getTruck(load.truck_id) : null;
  const vehicleId = truck?.samsara_vehicle_id || (truck ? `demo-${truck.unit_number}` : "demo-unassigned");

  if (!isSamsaraTokenSet()) {
    const rows = buildDemoIftaBreakdown(load.origin, load.destination);
    return persistReport({
      load,
      source: "demo",
      vehicleId,
      window,
      rows,
      note: "Demo IFTA — estimated from origin and destination. Not Samsara GPS.",
    });
  }

  if (!truck?.samsara_vehicle_id) {
    throw new Error("Map a Samsara vehicle ID on the assigned truck before pulling live IFTA.");
  }

  const live = await fetchLiveIfta({
    vehicleId: truck.samsara_vehicle_id,
    window,
  });
  return persistReport({
    load,
    source: "samsara",
    vehicleId: live.vehicleId || truck.samsara_vehicle_id,
    window,
    rows: live.rows,
    note: live.note,
  });
}

async function persistReport(input: {
  load: LoadView;
  source: "demo" | "samsara";
  vehicleId: string;
  window: { start: string; end: string };
  rows: IftaJurisdictionRow[];
  note: string;
}): Promise<IftaReport> {
  const generatedAt = new Date().toISOString();
  const totalMiles = Math.round(input.rows.reduce((sum, row) => sum + row.miles, 0) * 10) / 10;
  const csv = renderIftaCsv({
    loadNumber: input.load.load_number,
    origin: input.load.origin,
    destination: input.load.destination,
    source: input.source,
    vehicleId: input.vehicleId,
    generatedAt,
    window: input.window,
    note: input.note,
    rows: input.rows,
    totalMiles,
  });
  const attachment = addAttachment({
    loadId: input.load.id,
    kind: "ifta",
    originalName: `IFTA-${input.load.load_number}.csv`,
    buffer: Buffer.from(csv, "utf8"),
    mimeType: "text/csv",
    uploadedBy: "dispatcher",
  });
  return saveIftaReport({
    loadId: input.load.id,
    source: input.source,
    vehicleId: input.vehicleId,
    generatedAt,
    windowStart: input.window.start,
    windowEnd: input.window.end,
    totalMiles,
    note: input.note,
    attachmentId: attachment.id,
    rows: input.rows,
  });
}

function renderIftaCsv(input: {
  loadNumber: string;
  origin: string;
  destination: string;
  source: string;
  vehicleId: string;
  generatedAt: string;
  window: { start: string; end: string };
  note: string;
  rows: IftaJurisdictionRow[];
  totalMiles: number;
}): string {
  const lines = [
    `# IFTA mileage — ${input.loadNumber}`,
    `# ${input.origin} → ${input.destination}`,
    `# Source: ${input.source}`,
    `# Vehicle: ${input.vehicleId}`,
    `# Generated: ${input.generatedAt}`,
    `# Window: ${input.window.start} to ${input.window.end}`,
    `# Note: ${input.note.replaceAll("\n", " ")}`,
    `# Total miles: ${input.totalMiles}`,
    "jurisdiction,name,miles",
    ...input.rows.map((row) => `${csvEscape(row.jurisdiction)},${csvEscape(row.name)},${row.miles}`),
    "",
  ];
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function loadWindow(load: LoadView): { start: string; end: string } {
  const start = load.pickup_start || load.pickup_end || load.created_at;
  let end = load.delivery_end || load.delivery_start || new Date().toISOString();
  if (load.status === "in_transit") {
    const now = new Date().toISOString();
    if (new Date(end).getTime() > Date.now()) end = now;
  }
  if (new Date(end) < new Date(start)) end = start;
  return { start, end };
}

async function fetchLiveIfta(input: {
  vehicleId: string;
  window: { start: string; end: string };
}): Promise<{ rows: IftaJurisdictionRow[]; vehicleId: string; note: string }> {
  try {
    return await fetchIftaDetailJob(input);
  } catch (error) {
    if (isAuthError(error)) throw error;
    const monthly = await fetchIftaVehicleMonths(input);
    if (monthly.rows.length > 0 || monthly.completed) {
      return monthly;
    }
    throw error;
  }
}

async function fetchIftaDetailJob(input: {
  vehicleId: string;
  window: { start: string; end: string };
}): Promise<{ rows: IftaJurisdictionRow[]; vehicleId: string; note: string }> {
  const startHour = toHour(input.window.start);
  let endHour = toHour(input.window.end);
  if (endHour <= startHour) {
    const next = new Date(startHour);
    next.setUTCHours(next.getUTCHours() + 1);
    endHour = next.toISOString();
  }
  const created = await samsaraRequest<{ data?: { jobId?: string; id?: string; jobStatus?: string } }>(
    "/ifta-detail/csv",
    {
      method: "POST",
      body: JSON.stringify({
        startHour,
        endHour,
        vehicleIds: input.vehicleId,
      }),
    },
    "IFTA detail job",
  );
  const jobId = created.data?.jobId || created.data?.id;
  if (!jobId) throw new Error("Samsara did not return an IFTA detail job id.");

  for (let attempt = 0; attempt < DETAIL_POLL_ATTEMPTS; attempt += 1) {
    const job = await samsaraRequest<{
      data?: {
        jobStatus?: string;
        files?: Array<{ downloadUrl?: string }>;
      };
    }>(`/ifta-detail/csv/${jobId}`, { method: "GET" }, "IFTA detail job status");
    const status = job.data?.jobStatus ?? "";
    if (status === "Failed") throw new Error("Samsara IFTA detail job failed.");
    if (status === "Completed") {
      const url = job.data?.files?.[0]?.downloadUrl;
      if (!url) {
        return {
          rows: [],
          vehicleId: input.vehicleId,
          note: `Samsara IFTA detail job completed with no segments for ${startHour}–${endHour}.`,
        };
      }
      const csv = await downloadText(url);
      return {
        rows: parseIftaDetailCsv(csv),
        vehicleId: input.vehicleId,
        note: `Samsara IFTA detail segments for this load window (${startHour} to ${endHour}).`,
      };
    }
    await sleep(DETAIL_POLL_MS);
  }
  throw new Error("Samsara IFTA detail job is still processing. Try Refresh IFTA again.");
}

async function fetchIftaVehicleMonths(input: {
  vehicleId: string;
  window: { start: string; end: string };
}): Promise<{ rows: IftaJurisdictionRow[]; vehicleId: string; note: string; completed: boolean }> {
  const months = monthsInRange(input.window.start, input.window.end);
  const combined = new Map<string, number>();
  const labels: string[] = [];
  for (const month of months) {
    const body = await samsaraRequest<{
      data?: {
        month?: string;
        year?: number;
        vehicleReports?: Array<{
          vehicle?: { id?: string | number; name?: string };
          jurisdictions?: Array<{ jurisdiction?: string; taxableMeters?: number; totalMeters?: number }>;
        }>;
      };
    }>(
      `/fleet/reports/ifta/vehicle?year=${month.year}&month=${month.month}&vehicleIds=${encodeURIComponent(input.vehicleId)}`,
      { method: "GET" },
      "IFTA vehicle report",
    );
    const reports = body.data?.vehicleReports ?? [];
    const rows = mapIftaVehicleReports({ vehicleReports: reports, vehicleId: input.vehicleId });
    for (const row of rows) {
      combined.set(row.jurisdiction, (combined.get(row.jurisdiction) ?? 0) + row.miles);
    }
    labels.push(`${month.month} ${month.year}`);
  }
  const rows = [...combined.entries()]
    .map(([jurisdiction, miles]) => ({
      jurisdiction,
      name: jurisdictionName(jurisdiction),
      miles: Math.round(miles * 10) / 10,
    }))
    .sort((a, b) => b.miles - a.miles || a.jurisdiction.localeCompare(b.jurisdiction));
  return {
    rows,
    vehicleId: input.vehicleId,
    completed: true,
    note: `Samsara IFTA vehicle report for ${labels.join(", ")} (monthly jurisdiction miles for this truck, not a trip-only split). Token needs Read IFTA (US); trip-window CSV jobs also need Write IFTA (US).`,
  };
}

async function samsaraRequest<T>(pathname: string, init: RequestInit, context: string): Promise<T> {
  const token = getSamsaraApiToken();
  if (!token) throw new Error("SAMSARA_API_TOKEN is not set.");
  const url = pathname.startsWith("http") ? pathname : `${SAMSARA_BASE}${pathname}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new IftaHttpError(response.status, context);
  return (await response.json()) as T;
}

async function downloadText(url: string): Promise<string> {
  const token = getSamsaraApiToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new IftaHttpError(response.status, "IFTA detail download");
  return response.text();
}

function monthsInRange(startIso: string, endIso: string): Array<{ year: number; month: string }> {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months: Array<{ year: number; month: string }> = [];
  while (cursor <= last && months.length < 3) {
    months.push({ year: cursor.getUTCFullYear(), month: MONTH_NAMES[cursor.getUTCMonth()] });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months.length ? months : [{ year: start.getUTCFullYear(), month: MONTH_NAMES[start.getUTCMonth()] }];
}

function toHour(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ":00.000Z");
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function isAuthError(error: unknown): boolean {
  return error instanceof IftaHttpError && (error.status === 401 || error.status === 403);
}

function iftaStatusMessage(status: number, context: string): string {
  if (status === 401 || status === 403) {
    return `Samsara ${context} failed (HTTP ${status}). Check SAMSARA_API_TOKEN and the Read IFTA (US) / Write IFTA (US) scopes.`;
  }
  if (status === 429) return `Samsara rate-limited the ${context} request.`;
  return `Samsara ${context} failed (HTTP ${status}).`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimatedCorridorMiles(path: string[]): number {
  if (path.length <= 1) return 120;
  let miles = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    miles += haversineMiles(CENTROIDS[path[i]], CENTROIDS[path[i + 1]]) * 1.18;
  }
  return Math.max(80, Math.round(miles));
}

function haversineMiles(
  a: { lat: number; lon: number } | undefined,
  b: { lat: number; lon: number } | undefined,
): number {
  if (!a || !b) return 220;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sin =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(sin), Math.sqrt(1 - sin));
}

function pathBetween(start: string, end: string): string[] {
  if (start === end) return [start];
  const queue: string[][] = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    for (const next of NEIGHBORS[last] ?? []) {
      if (seen.has(next)) continue;
      if (next === end) return [...path, next];
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return [start, end];
}

const JURISDICTION_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
  ON: "Ontario",
  QC: "Quebec",
  MB: "Manitoba",
  SK: "Saskatchewan",
  AB: "Alberta",
  BC: "British Columbia",
  NB: "New Brunswick",
  NS: "Nova Scotia",
  PE: "Prince Edward Island",
  NL: "Newfoundland and Labrador",
};

const NEIGHBORS: Record<string, string[]> = {
  AL: ["MS", "TN", "GA", "FL"],
  AR: ["MO", "TN", "MS", "LA", "TX", "OK"],
  AZ: ["CA", "NV", "UT", "CO", "NM"],
  CA: ["OR", "NV", "AZ"],
  CO: ["WY", "NE", "KS", "OK", "NM", "AZ", "UT"],
  CT: ["NY", "MA", "RI"],
  DE: ["MD", "PA", "NJ"],
  FL: ["AL", "GA"],
  GA: ["FL", "AL", "TN", "NC", "SC"],
  IA: ["MN", "WI", "IL", "MO", "NE", "SD"],
  ID: ["WA", "OR", "NV", "UT", "WY", "MT"],
  IL: ["WI", "IA", "MO", "KY", "IN"],
  IN: ["IL", "KY", "OH", "MI"],
  KS: ["NE", "MO", "OK", "CO"],
  KY: ["IL", "IN", "OH", "WV", "VA", "TN", "MO"],
  LA: ["TX", "AR", "MS"],
  MA: ["RI", "CT", "NY", "NH", "VT"],
  MD: ["VA", "WV", "PA", "DE"],
  ME: ["NH"],
  MI: ["IN", "OH", "WI"],
  MN: ["ND", "SD", "IA", "WI"],
  MO: ["IA", "IL", "KY", "TN", "AR", "OK", "KS", "NE"],
  MS: ["LA", "AR", "TN", "AL"],
  MT: ["ID", "WY", "SD", "ND"],
  NC: ["VA", "TN", "GA", "SC"],
  ND: ["MT", "SD", "MN"],
  NE: ["SD", "IA", "MO", "KS", "CO", "WY"],
  NH: ["VT", "ME", "MA"],
  NJ: ["NY", "PA", "DE"],
  NM: ["AZ", "CO", "OK", "TX"],
  NV: ["OR", "ID", "UT", "AZ", "CA"],
  NY: ["PA", "NJ", "CT", "MA", "VT"],
  OH: ["MI", "IN", "KY", "WV", "PA"],
  OK: ["KS", "MO", "AR", "TX", "NM", "CO"],
  OR: ["WA", "ID", "NV", "CA"],
  PA: ["OH", "WV", "MD", "DE", "NJ", "NY"],
  RI: ["CT", "MA"],
  SC: ["GA", "NC"],
  SD: ["ND", "MN", "IA", "NE", "WY", "MT"],
  TN: ["KY", "VA", "NC", "GA", "AL", "MS", "AR", "MO"],
  TX: ["NM", "OK", "AR", "LA"],
  UT: ["ID", "WY", "CO", "AZ", "NV"],
  VA: ["MD", "WV", "KY", "TN", "NC"],
  VT: ["NY", "NH", "MA"],
  WA: ["OR", "ID"],
  WI: ["MN", "IA", "IL", "MI"],
  WV: ["OH", "PA", "MD", "VA", "KY"],
  WY: ["MT", "SD", "NE", "CO", "UT", "ID"],
  ON: ["MB", "NY", "MI", "MN"],
  MB: ["ON", "SK", "ND", "MN"],
  SK: ["MB", "AB", "MT", "ND"],
  AB: ["SK", "BC", "MT"],
  BC: ["AB", "WA"],
  QC: ["ON", "NB", "NY", "VT", "NH", "ME"],
  NB: ["QC", "NS", "PE", "ME"],
  NS: ["NB", "PE"],
  PE: ["NB", "NS"],
  NL: ["QC"],
};

const CENTROIDS: Record<string, { lat: number; lon: number }> = {
  AL: { lat: 32.8, lon: -86.8 },
  AR: { lat: 35.2, lon: -92.4 },
  AZ: { lat: 34.3, lon: -111.7 },
  CA: { lat: 36.8, lon: -119.4 },
  CO: { lat: 39.0, lon: -105.5 },
  CT: { lat: 41.6, lon: -72.7 },
  DE: { lat: 39.0, lon: -75.5 },
  FL: { lat: 27.8, lon: -81.7 },
  GA: { lat: 32.7, lon: -83.4 },
  IA: { lat: 42.0, lon: -93.5 },
  ID: { lat: 44.4, lon: -114.7 },
  IL: { lat: 40.0, lon: -89.0 },
  IN: { lat: 39.8, lon: -86.1 },
  KS: { lat: 38.5, lon: -98.4 },
  KY: { lat: 37.8, lon: -85.8 },
  LA: { lat: 31.2, lon: -91.9 },
  MA: { lat: 42.2, lon: -71.5 },
  MD: { lat: 39.0, lon: -76.8 },
  ME: { lat: 45.3, lon: -69.2 },
  MI: { lat: 43.3, lon: -84.5 },
  MN: { lat: 46.3, lon: -94.3 },
  MO: { lat: 38.4, lon: -92.5 },
  MS: { lat: 32.7, lon: -89.7 },
  MT: { lat: 47.0, lon: -110.4 },
  NC: { lat: 35.6, lon: -79.4 },
  ND: { lat: 47.4, lon: -100.5 },
  NE: { lat: 41.5, lon: -99.8 },
  NH: { lat: 43.7, lon: -71.6 },
  NJ: { lat: 40.1, lon: -74.7 },
  NM: { lat: 34.4, lon: -106.1 },
  NV: { lat: 39.3, lon: -116.6 },
  NY: { lat: 42.9, lon: -75.5 },
  OH: { lat: 40.4, lon: -82.8 },
  OK: { lat: 35.6, lon: -97.5 },
  OR: { lat: 43.9, lon: -120.6 },
  PA: { lat: 40.9, lon: -77.8 },
  RI: { lat: 41.7, lon: -71.5 },
  SC: { lat: 33.9, lon: -81.0 },
  SD: { lat: 44.4, lon: -100.2 },
  TN: { lat: 35.8, lon: -86.6 },
  TX: { lat: 31.5, lon: -99.3 },
  UT: { lat: 39.3, lon: -111.7 },
  VA: { lat: 37.5, lon: -78.9 },
  VT: { lat: 44.1, lon: -72.6 },
  WA: { lat: 47.4, lon: -120.5 },
  WI: { lat: 44.3, lon: -89.6 },
  WV: { lat: 38.6, lon: -80.6 },
  WY: { lat: 43.0, lon: -107.6 },
  ON: { lat: 50.0, lon: -85.0 },
  QC: { lat: 52.0, lon: -72.0 },
  MB: { lat: 53.8, lon: -98.8 },
  SK: { lat: 54.0, lon: -106.0 },
  AB: { lat: 55.0, lon: -115.0 },
  BC: { lat: 53.7, lon: -127.6 },
};
