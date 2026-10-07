import { getGoogleMapsApiKey } from "./env";
import { getLoad } from "./queries";
import { listRelays } from "./relay-store";
import { metersToRouteMiles } from "./routing-shared";

export type RelayLeg = {
  relayId: number;
  loadId: number;
  driverId: number | null;
  driverName: string;
  origin: string;
  destination: string;
  miles: number | null;
  role: "from" | "to";
};

async function fetchPairMiles(origin: string, destination: string): Promise<number | null> {
  const key = getGoogleMapsApiKey();
  const from = origin.trim();
  const to = destination.trim();
  if (!key || !from || !to) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", from);
  url.searchParams.set("destination", to);
  url.searchParams.set("units", "imperial");
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      status?: string;
      routes?: Array<{ legs?: Array<{ distance?: { value?: number } }> }>;
    };
    if (payload.status !== "OK" || !payload.routes?.[0]?.legs?.[0]) return null;
    const meters = payload.routes[0].legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
    return metersToRouteMiles(meters);
  } catch {
    return null;
  }
}

export function listRelayLegs(loadId: number): RelayLeg[] {
  const load = getLoad(loadId);
  if (!load) return [];
  const relays = listRelays(loadId);
  const legs: RelayLeg[] = [];
  relays.forEach((relay, index) => {
    const next = relays[index + 1];
    const fromDriverId = relay.from_driver_id ?? (index === 0 ? load.driver_id : relays[index - 1]?.driver_id);
    legs.push({
      relayId: relay.id,
      loadId,
      driverId: fromDriverId,
      driverName: relay.from_driver_name || (fromDriverId === load.driver_id ? load.driver_name : null) || "Unassigned",
      origin: relay.pickup || load.origin,
      destination: relay.delivery,
      miles: relay.from_leg_miles,
      role: "from",
    });
    if (!next) {
      legs.push({
        relayId: relay.id,
        loadId,
        driverId: relay.driver_id,
        driverName: relay.driver_name || "Unassigned",
        origin: relay.delivery,
        destination: load.destination,
        miles: relay.to_leg_miles,
        role: "to",
      });
    }
  });
  return legs;
}

export async function refreshRelayLegMiles(loadId: number): Promise<void> {
  const load = getLoad(loadId);
  if (!load) return;
  const relays = listRelays(loadId);
  const { getDb } = await import("./db");
  for (const [index, relay] of relays.entries()) {
    const next = relays[index + 1];
    const fromMiles = await fetchPairMiles(relay.pickup || load.origin, relay.delivery);
    const toMiles = next ? null : await fetchPairMiles(relay.delivery, load.destination);
    getDb()
      .prepare("UPDATE load_relays SET from_leg_miles = COALESCE(?, from_leg_miles), to_leg_miles = COALESCE(?, to_leg_miles), updated_at = ? WHERE id = ?")
      .run(fromMiles, toMiles, new Date().toISOString(), relay.id);
  }
}

export async function refreshRelayLegMilesQuiet(loadId: number): Promise<void> {
  try {
    await refreshRelayLegMiles(loadId);
  } catch {
    // Fail-soft: relay save still succeeds without Google miles.
  }
}
