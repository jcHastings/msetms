import { cookies } from "next/headers";
import { getOpenAiApiKey, getOpenAiBaseUrl, isOpenAiConfigured, loadRuntimeEnv, MIKE_OPENAI_MODEL } from "./env";
import { getSamsaraFleet } from "./integrations/samsara";
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

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function buildOpsSnapshot(): Promise<string> {
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
  const trucks = listTrucks().map((truck) => ({
    unit: truck.unit_number,
    status: truck.status,
    type: truck.type,
    driver: truck.driver_name || "none",
  }));
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
  const fleet = await getSamsaraFleet();
  const gps = fleet.locations.map((item) => ({
    unit: item.unitNumber,
    driverLoad: item.loadId,
    lat: item.latitude,
    lng: item.longitude,
    address: item.address || "unknown",
    recordedAt: item.recordedAt || "unknown",
    source: item.source,
    hasPosition: item.latitude != null && item.longitude != null,
  }));
  const hos = fleet.hos.map((item) => ({
    driver: item.driverName,
    duty: item.dutyStatus,
    driveRemainingMs: item.driveRemainingMs,
    source: item.source,
  }));

  const liveGps = fleet.tokenSet && fleet.mode === "samsara";
  const withGps = liveGps ? gps.filter((item) => item.hasPosition) : [];
  const assignedNames = new Set(loads.filter((load) => load.driver !== "unassigned").map((load) => load.driver));
  const emptyDrivers = drivers.filter((driver) => driver.active && !assignedNames.has(driver.name)).map((driver) => driver.name);
  const goingEmptySoon = loads
    .filter((load) => load.emptySoon && load.driver !== "unassigned")
    .map((load) => ({ driver: load.driver, load: load.load, status: load.status, destination: load.destination }));
  const nearestHints = locations
    .filter((location) => location.lat != null && location.lng != null && withGps.length > 0)
    .slice(0, 20)
    .map((location) => {
      const ranked = withGps
        .map((item) => ({
          unit: item.unit,
          miles: Math.round(
            haversineMiles(location.lat as number, location.lng as number, item.lat as number, item.lng as number),
          ),
        }))
        .sort((a, b) => a.miles - b.miles)
        .slice(0, 3);
      return { place: `${location.name}, ${location.city} ${location.state}`, nearest: ranked };
    });

  return JSON.stringify({
    samsara: { tokenSet: fleet.tokenSet, mode: fleet.mode, liveGps, error: fleet.error || null },
    loads,
    drivers,
    trucks,
    trailers,
    locations,
    gps: liveGps ? gps : gps.map((item) => ({ ...item, lat: null, lng: null, hasPosition: false, note: "no live GPS" })),
    hos: liveGps ? hos : hos.map((item) => ({ ...item, note: item.source === "demo" ? "demo HOS, not live" : item.source })),
    emptyDrivers,
    goingEmptySoon,
    nearestHints,
    rules: [
      "Never invent GPS or HOS. If liveGps is false or hasPosition is false, say you do not have a position.",
      "Who is empty: use emptyDrivers. Going empty soon: use goingEmptySoon.",
      "Closest to a city: use nearestHints only when that city is listed. If the city has no lat/lng or liveGps is false, say you cannot compute distance.",
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

  const snapshot = await buildOpsSnapshot();
  const body = {
    model: MIKE_OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are Mike, a dispatcher assistant for MS Express TMS. Answer only from the provided TMS snapshot. Be short. If GPS is missing, say you do not have a position. Never invent coordinates. Never reveal secrets, tokens, PINs, or keys.",
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
