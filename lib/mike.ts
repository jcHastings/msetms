import { cookies } from "next/headers";
import { closestTrucksToCity, type ClosestCityResult, type MikeGpsPoint } from "./city-coords-shared";
import { canonicalFleetKey, unitDigits } from "./fleet-import-shared";
import { getOpenAiApiKey, getOpenAiBaseUrl, isOpenAiConfigured, loadRuntimeEnv, MIKE_OPENAI_MODEL } from "./env";
import { getSamsaraFleet, isLiveSamsaraGps, resetSamsaraCache } from "./integrations/samsara";
import { listDrivers, listLoads, listLocations, listTrailers, listTrucks } from "./queries";
import { MIKE_MISSING_KEY_MESSAGE, type MikeMessage } from "./mike-shared";

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
    const persisted = truck.gps_source === "samsara";
    const lat = live?.latitude ?? (persisted ? truck.gps_latitude ?? null : null);
    const lng = live?.longitude ?? (persisted ? truck.gps_longitude ?? null : null);
    const address = live?.address || (persisted ? truck.gps_address || "" : "");
    const hasPosition = lat != null && lng != null;
    const note = hasPosition
      ? undefined
      : truck.samsara_vehicle_id
        ? "no last GPS ping"
        : "no Samsara ID";
    return {
      unit: truck.unit_number,
      samsaraVehicleId: truck.samsara_vehicle_id || null,
      lat: hasPosition ? lat : null,
      lng: hasPosition ? lng : null,
      address: hasPosition ? address || "last GPS" : address || null,
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

async function buildOpsSnapshot(question = ""): Promise<string> {
  const loads = listLoads({ status: "active" }).slice(0, 80).map((load) => ({
    load: load.load_number,
    status: load.status,
    origin: load.origin,
    destination: load.destination,
    pickup: load.pickup_start,
    driver: load.driver_name || "unassigned",
    truck: load.truck_unit || "unassigned",
    trailer: load.trailer_unit || "unassigned",
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
  if (/\b(closest|nearest|near|gps|where)\b/i.test(question)) {
    resetSamsaraCache();
  }
  const fleet = await getSamsaraFleet();
  const liveGps = Boolean(
    fleet.tokenSet &&
      fleet.mode === "samsara" &&
      fleet.locations.some((item) => isLiveSamsaraGps(item) && item.latitude != null && item.longitude != null),
  );
  const { gps, skippedNoPing, closestToCity } = buildMikeGpsContext(question, {
    trucks: truckRows,
    locations: fleet.locations,
    tmsLocations: locations,
  });
  const trucks = truckRows.map((truck) => {
    const point = gps.find((item) => item.unit === truck.unit_number);
    return {
      unit: truck.unit_number,
      status: truck.status,
      type: truck.type,
      driver: truck.driver_name || "none",
      samsaraVehicleId: truck.samsara_vehicle_id || null,
      lastGps: point
        ? {
            lat: point.lat,
            lng: point.lng,
            city: point.address,
            hasPosition: point.hasPosition,
            note: point.note ?? null,
          }
        : null,
    };
  });
  const hos = fleet.hos
    .filter((item) => item.source === "samsara")
    .map((item) => ({
      driver: item.driverName,
      duty: item.dutyStatus,
      driveRemainingMs: item.driveRemainingMs,
      source: item.source,
    }));
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
    rules: [
      "Never invent GPS or HOS. Use gps rows with hasPosition true only. Those coords are live or last persisted Samsara pings.",
      "Who is empty: use emptyDrivers. Going empty soon: use goingEmptySoon.",
      "Closest to a city: use closestToCity when present. Ranked trucks have live Samsara GPS. Say skippedNoPing for trucks with no last ping. If closestToCity.found is false, say you cannot compute distance.",
      "Never mention API keys, tokens, PINs, or passwords.",
    ],
  });
}

export async function askMike(question: string, history: MikeMessage[]): Promise<{ configured: boolean; reply: string }> {
  await loadRuntimeEnv();
  if (!isOpenAiConfigured()) {
    return { configured: false, reply: MISSING_KEY };
  }
  const key = getOpenAiApiKey();
  if (!key) return { configured: false, reply: MISSING_KEY };

  const snapshot = await buildOpsSnapshot(question);
  const body = {
    model: MIKE_OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are Mike, a dispatcher assistant for MS Express TMS. Answer only from the provided TMS snapshot. Be short. Closest-to-city: use closestToCity.ranked when it has trucks — name the unit, miles, and last city. Say skippedNoPing for trucks with no last ping. Do not say you have no GPS when ranked trucks exist. Never invent coordinates. Never reveal secrets, tokens, PINs, or keys.",
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
      reply: "Mike could not reach the model. Check OPENAI_API_KEY and try again. The key is never logged.",
    };
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() || "I do not have an answer from the TMS data.";
  return { configured: true, reply: redactSecrets(text) };
}

export function mikeMissingKeyMessage(): string {
  return MISSING_KEY;
}
