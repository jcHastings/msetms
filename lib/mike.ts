import { cookies } from "next/headers";
import {
  closestTrucksToCity,
  extractCityFromQuestion,
  findCityCenter,
  formatClosestCityReply,
  isClosestCityQuestion,
  rankTrucksToCoords,
  type ClosestCityResult,
  type MikeGpsPoint,
} from "./city-coords-shared";
import { canonicalFleetKey, unitDigits } from "./fleet-import-shared";
import { getOpenAiApiKey, getOpenAiBaseUrl, isOpenAiConfigured, loadRuntimeEnv, MIKE_OPENAI_MODEL } from "./env";
import { getSamsaraFleet, isLiveSamsaraGps, resetSamsaraCache } from "./integrations/samsara";
import { listDrivers, listLoads, listLocations, listTrailers, listTrucks } from "./queries";
import { MIKE_MISSING_KEY_MESSAGE, type MikeMessage, type MikeProposal } from "./mike-shared";
import { mikeWorkReply, proposeMikeWork } from "./mike-work";
import {
  buildMikeTmsSnapshot,
  formatMikeTmsStatsReply,
  parseMikeTmsStatsQuestion,
  tmsMilesForLoad,
} from "./mike-tms-stats";
import { geocodeAddress } from "./places";

export type { MikeMessage };

const COOKIE = "tms_mike";
const MAX_MESSAGES = 8;
const MISSING_KEY = MIKE_MISSING_KEY_MESSAGE;

function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/SAMSARA_API_TOKEN\s*=\s*\S+/gi, "SAMSARA_API_TOKEN=[redacted]")
    .replace(/OPENAI_API_KEY\s*=\s*\S+/gi, "OPENAI_API_KEY=[redacted]")
    .replace(/\b\d{4,6}\b/g, (match, offset, full) => {
      const around = full.slice(Math.max(0, offset - 12), offset + match.length + 12).toLowerCase();
      return around.includes("pin") ? "[pin hidden]" : match;
    });
}

export async function readMikeHistory(): Promise<MikeMessage[]> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MikeMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-MAX_MESSAGES)
      .map((item) => ({ role: item.role, content: item.content.slice(0, 2000) }));
  } catch {
    return [];
  }
}

export async function writeMikeHistory(messages: MikeMessage[]): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, JSON.stringify(messages.slice(-MAX_MESSAGES)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export function mikeGpsPointsFromFleet(input: {
  liveGps?: boolean;
  trucks: Array<{
    id?: number;
    unit_number: string;
    samsara_vehicle_id: string;
    gps_latitude?: number | null;
    gps_longitude?: number | null;
    gps_address?: string;
    gps_source?: string;
  }>;
  locations: Array<{
    truckId?: number | null;
    vehicleId?: string;
    unitNumber: string;
    latitude: number | null;
    longitude: number | null;
    address: string;
    source: string;
  }>;
}): MikeGpsPoint[] {
  return input.trucks.map((truck) => {
    const live = input.locations.find((item) => {
      if (item.source !== "samsara") return false;
      if (truck.id != null && item.truckId === truck.id) return true;
      if (
        truck.samsara_vehicle_id &&
        item.vehicleId &&
        canonicalFleetKey(item.vehicleId) === canonicalFleetKey(truck.samsara_vehicle_id)
      ) {
        return true;
      }
      const locUnit = unitDigits(item.unitNumber);
      const truckUnit = unitDigits(truck.unit_number);
      return Boolean(locUnit && truckUnit && locUnit === truckUnit);
    });
    const persisted =
      truck.gps_source === "samsara" ||
      Boolean(
        truck.samsara_vehicle_id &&
          (truck.gps_latitude != null || truck.gps_longitude != null || String(truck.gps_address ?? "").trim()),
      );
    const lat = live?.latitude ?? (persisted ? truck.gps_latitude ?? null : null);
    const lng = live?.longitude ?? (persisted ? truck.gps_longitude ?? null : null);
    const address = (live?.address || (persisted ? truck.gps_address || "" : "")).trim();
    const hasCoords = lat != null && lng != null;
    const hasPosition = hasCoords || Boolean(address);
    const note = hasPosition
      ? undefined
      : truck.samsara_vehicle_id
        ? "no last GPS ping"
        : "no Samsara ID";
    return {
      unit: truck.unit_number,
      samsaraVehicleId: truck.samsara_vehicle_id || null,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      address: hasPosition ? address || "last GPS" : null,
      hasPosition,
      note,
    };
  });
}

export function buildMikeGpsContext(
  question: string,
  input: {
    trucks: Array<{
      id?: number;
      unit_number: string;
      samsara_vehicle_id: string;
      gps_latitude?: number | null;
      gps_longitude?: number | null;
      gps_address?: string;
      gps_source?: string;
    }>;
    locations: Array<{
      truckId?: number | null;
      vehicleId?: string;
      unitNumber: string;
      latitude: number | null;
      longitude: number | null;
      address: string;
      source: string;
    }>;
    tmsLocations?: Array<{ name: string; city: string; state: string; lat: number | null; lng: number | null }>;
  },
): { gps: MikeGpsPoint[]; skippedNoPing: number; closestToCity: ClosestCityResult | null } {
  const gps = mikeGpsPointsFromFleet({
    trucks: input.trucks,
    locations: input.locations.filter((item) => item.source === "samsara"),
  });
  return {
    gps,
    skippedNoPing: gps.filter((item) => !item.hasPosition).length,
    closestToCity: closestTrucksToCity(question, gps, input.tmsLocations ?? []),
  };
}

export async function resolveClosestCityRanking(
  question: string,
  input: {
    trucks: Array<{
      id?: number;
      unit_number: string;
      samsara_vehicle_id: string;
      gps_latitude?: number | null;
      gps_longitude?: number | null;
      gps_address?: string;
      gps_source?: string;
    }>;
    locations: Array<{
      truckId?: number | null;
      vehicleId?: string;
      unitNumber: string;
      latitude: number | null;
      longitude: number | null;
      address: string;
      source: string;
    }>;
    tmsLocations?: Array<{ name: string; city: string; state: string; lat: number | null; lng: number | null }>;
  },
  geocode: (address: string) => Promise<{ latitude: number; longitude: number } | null> = geocodeAddress,
): Promise<ClosestCityResult | null> {
  const gps = mikeGpsPointsFromFleet({
    trucks: input.trucks,
    locations: input.locations.filter((item) => item.source === "samsara"),
  });
  const skippedNoPing = gps.filter((item) => !item.hasPosition).length;
  const skippedNoSamsaraId = gps.filter((point) => !String(point.samsaraVehicleId ?? "").trim()).length;
  if (!isClosestCityQuestion(question)) {
    return closestTrucksToCity(question, gps, input.tmsLocations ?? []);
  }
  const asked = extractCityFromQuestion(question).trim();
  if (!asked) {
    return { asked: "", found: false, reason: "city_not_found", ranked: [], skippedNoPing, skippedNoSamsaraId };
  }
  const geo = await geocode(asked);
  const table = findCityCenter(asked, input.tmsLocations ?? []);
  const lat = geo?.latitude ?? table?.lat;
  const lng = geo?.longitude ?? table?.lng;
  if (lat == null || lng == null) {
    return {
      asked,
      found: false,
      reason: "city_not_found",
      ranked: [],
      skippedNoPing,
      skippedNoSamsaraId,
    };
  }
  const ranked = rankTrucksToCoords(gps, lat, lng, input.tmsLocations ?? []);
  return {
    asked,
    found: true,
    city: table?.label || asked,
    lat,
    lng,
    ranked,
    reason: ranked.length === 0 ? "no_gps" : undefined,
    skippedNoPing,
    skippedNoSamsaraId,
  };
}

export function attachMikeFleetTelemetry(input: {
  question?: string;
  trucks: Array<{
    id?: number;
    unit_number: string;
    type?: string;
    status?: string;
    driver_name?: string | null;
    assigned_driver_id?: number | null;
    samsara_vehicle_id: string;
    gps_latitude?: number | null;
    gps_longitude?: number | null;
    gps_address?: string;
    gps_source?: string;
  }>;
  locations: Array<{
    truckId?: number | null;
    vehicleId?: string;
    unitNumber: string;
    latitude: number | null;
    longitude: number | null;
    address: string;
    source: string;
  }>;
  hos: Array<{
    driverId?: number | null;
    driverName: string;
    dutyStatus: string;
    driveRemainingMs: number | null;
    source: string;
  }>;
  tmsLocations?: Array<{ name: string; city: string; state: string; lat: number | null; lng: number | null }>;
}): {
  trucks: Array<{
    unit: string;
    status?: string;
    type?: string;
    driver: string;
    samsaraVehicleId: string | null;
    lastGps: { lat: number | null; lng: number | null; city: string | null; hasPosition: boolean; note: string | null };
    hos: { driver: string; duty: string; driveRemainingMs: number | null; note: string | null } | null;
  }>;
  gps: MikeGpsPoint[];
  hos: Array<{ driver: string; duty: string; driveRemainingMs: number | null; source: string }>;
  skippedNoPing: number;
  closestToCity: ClosestCityResult | null;
} {
  const { gps, skippedNoPing, closestToCity } = buildMikeGpsContext(input.question ?? "", {
    trucks: input.trucks,
    locations: input.locations,
    tmsLocations: input.tmsLocations,
  });
  const samsaraHos = input.hos.filter((item) => item.source === "samsara");
  const trucks = input.trucks.map((truck) => {
    const point = gps.find((item) => item.unit === truck.unit_number);
    const clock = samsaraHos.find(
      (item) =>
        (truck.assigned_driver_id != null && item.driverId === truck.assigned_driver_id) ||
        Boolean(
          truck.driver_name &&
            item.driverName &&
            item.driverName.trim().toLowerCase() === truck.driver_name.trim().toLowerCase(),
        ),
    );
    return {
      unit: truck.unit_number,
      status: truck.status,
      type: truck.type,
      driver: truck.driver_name || "none",
      samsaraVehicleId: truck.samsara_vehicle_id || null,
      lastGps: {
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        city: point?.address ?? null,
        hasPosition: Boolean(point?.hasPosition),
        note: point?.note ?? null,
      },
      hos: truck.samsara_vehicle_id
        ? clock
          ? {
              driver: clock.driverName,
              duty: clock.dutyStatus,
              driveRemainingMs: clock.driveRemainingMs,
              note: null,
            }
          : { driver: truck.driver_name || "", duty: "", driveRemainingMs: null, note: "no live HOS" }
        : null,
    };
  });
  return {
    trucks,
    gps,
    hos: samsaraHos.map((item) => ({
      driver: item.driverName,
      duty: item.dutyStatus,
      driveRemainingMs: item.driveRemainingMs,
      source: item.source,
    })),
    skippedNoPing,
    closestToCity,
  };
}

async function buildOpsSnapshot(question = ""): Promise<string> {
  const loads = listLoads({ status: "all" }).slice(0, 200).map((load) => ({
    load: load.load_number,
    ref: load.customer_reference || load.reference_number || "",
    status: load.status,
    customer: load.customer_name,
    billed: load.rate,
    commodity: load.commodity,
    origin: load.origin,
    destination: load.destination,
    pickup: load.pickup_start,
    delivery: load.delivery_start,
    driver: load.driver_name || "unassigned",
    truck: load.truck_unit || "unassigned",
    trailer: load.trailer_unit || "unassigned",
    tmsMiles: tmsMilesForLoad(load),
    emptySoon: load.status === "at_delivery" || load.status === "unloading" || load.status === "delivered",
  }));
  const drivers = listDrivers().map((driver) => ({
    name: driver.name,
    status: driver.status,
    truck: driver.truck_unit || "none",
    type: driver.driver_type,
    active: driver.active !== 0,
  }));
  const truckRows = listTrucks();
  const trailers = listTrailers().map((trailer) => ({
    unit: trailer.unit_number,
    type: trailer.type,
    truck: trailer.truck_unit || "none",
    status: trailer.status,
  }));
  const locations = listLocations().slice(0, 120).map((location) => ({
    name: location.name,
    city: location.city,
    state: location.state,
    role: location.role,
    lat: location.latitude,
    lng: location.longitude,
  }));
  resetSamsaraCache();
  const fleet = await getSamsaraFleet();
  const liveGps = Boolean(
    fleet.tokenSet &&
      fleet.mode === "samsara" &&
      fleet.locations.some((item) => isLiveSamsaraGps(item) && (item.latitude != null || Boolean(item.address.trim()))),
  );
  const { trucks, gps, hos, skippedNoPing, closestToCity } = attachMikeFleetTelemetry({
    question,
    trucks: truckRows,
    locations: fleet.locations,
    hos: fleet.hos,
    tmsLocations: locations,
  });
  const assignedNames = new Set(loads.filter((load) => load.driver !== "unassigned").map((load) => load.driver));
  const emptyDrivers = drivers.filter((driver) => driver.active && !assignedNames.has(driver.name)).map((driver) => driver.name);
  const goingEmptySoon = loads
    .filter((load) => load.emptySoon && load.driver !== "unassigned")
    .map((load) => ({ driver: load.driver, load: load.load, status: load.status, destination: load.destination }));

  return JSON.stringify({
    samsara: { tokenSet: fleet.tokenSet, mode: fleet.mode, liveGps, error: fleet.error || null },
    loads,
    drivers,
    trucks,
    trailers,
    locations,
    gps,
    hos,
    emptyDrivers,
    goingEmptySoon,
    skippedNoPing,
    closestToCity,
    tmsStats: buildMikeTmsSnapshot(),
    rules: [
      "Never invent GPS or HOS. Every truck with a Samsara vehicle id has lastGps (lat/lng or city) and hos. Use those. Coords are live or last persisted Samsara pings — never invent them.",
      "Who is empty: use emptyDrivers. Going empty soon: use goingEmptySoon.",
      "Closest to a city: use closestToCity.ranked — name the unit, miles, and last city. If closestToCity.found is false, say that city could not be placed. Never say no trucks ranked closest. Never invent trucks. Say skippedNoPing for trucks with no last ping. Do not say there is no GPS when any lastGps.hasPosition is true.",
      "TMS totals: use tmsStats. Billed freight is the customer/load rate, not driver pay. Miles are TMS loaded + empty miles, not Samsara IFTA. Never invent totals.",
      "Never mention API keys, tokens, PINs, or passwords.",
    ],
  });
}

export async function askMike(
  question: string,
  history: MikeMessage[],
): Promise<{ configured: boolean; reply: string; proposals: MikeProposal[] }> {
  await loadRuntimeEnv();
  const work = proposeMikeWork(question);
  if (isClosestCityQuestion(question)) {
    const truckRows = listTrucks();
    const tmsLocations = listLocations().slice(0, 120).map((location) => ({
      name: location.name,
      city: location.city,
      state: location.state,
      lat: location.latitude,
      lng: location.longitude,
    }));
    resetSamsaraCache();
    const fleet = await getSamsaraFleet();
    const closest = await resolveClosestCityRanking(question, {
      trucks: truckRows,
      locations: fleet.locations,
      tmsLocations,
    });
    const reply = formatClosestCityReply(closest, extractCityFromQuestion(question));
    return {
      configured: isOpenAiConfigured(),
      reply: work.reply ? `${reply}\n\n${work.reply}` : reply,
      proposals: work.proposals,
    };
  }
  const tmsQuestion = parseMikeTmsStatsQuestion(question);
  if (tmsQuestion) {
    const reply = formatMikeTmsStatsReply(tmsQuestion);
    return {
      configured: isOpenAiConfigured(),
      reply: work.reply ? `${reply}\n\n${work.reply}` : reply,
      proposals: work.proposals,
    };
  }
  if (!isOpenAiConfigured()) {
    return {
      configured: false,
      reply: mikeWorkReply(false, MISSING_KEY, work.reply),
      proposals: work.proposals,
    };
  }
  const key = getOpenAiApiKey();
  if (!key) {
    return {
      configured: false,
      reply: mikeWorkReply(false, MISSING_KEY, work.reply),
      proposals: work.proposals,
    };
  }

  const snapshot = await buildOpsSnapshot(question);
  const body = {
    model: MIKE_OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are Mike, a dispatcher assistant for MS Express TMS. Answer only from the provided TMS snapshot. Be short. You can draft work (detention email, classify a doc, suggest a status, start a load from a rate-con, flag invoice/compliance, draft a driver message) but never send or change anything — the dispatcher must confirm. Every linked truck has lastGps (lat/lng or city) and hos. Closest-to-city: use closestToCity.ranked — name the unit, miles, and last city. If closestToCity.found is false, say that city could not be placed. Never say no trucks ranked closest. Never invent trucks. Say skippedNoPing for trucks with no last ping. Do not say you have no GPS when any lastGps.hasPosition is true. Never invent coordinates. Never reveal secrets, tokens, PINs, or keys.",
      },
      { role: "system", content: `TMS snapshot:\n${snapshot}` },
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: question.slice(0, 2000) },
    ],
  };

  const response = await fetch(`${getOpenAiBaseUrl().replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return {
      configured: true,
      reply: mikeWorkReply(
        true,
        "Mike could not reach the model. Try again.",
        work.reply,
      ),
      proposals: work.proposals,
    };
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() || "I do not have an answer from the TMS data.";
  return {
    configured: true,
    reply: mikeWorkReply(true, redactSecrets(text), work.reply),
    proposals: work.proposals,
  };
}

export function mikeMissingKeyMessage(): string {
  return MISSING_KEY;
}
