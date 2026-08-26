import { isOrbcommConfigured } from "./env";
import { canonicalFleetKey } from "./fleet-import-shared";
import {
  isPlottableCoord,
  motionFromSpeedMph,
  plottableCoord,
  type FleetMapMissing,
  type FleetMapModel,
  type FleetMapPin,
  type FleetStatusRow,
} from "./fleet-map-shared";
import { getReeferSnapshots, latestReeferForTrailer } from "./integrations/orbcomm";
import { getSamsaraFleet } from "./integrations/samsara";
import {
  listLoads,
  listTrailers,
  listTrucks,
  persistedTrailerLocation,
  persistedTruckLocation,
  saveTrailerGps,
} from "./queries";
import { isClosedStatus, type LoadView, type Trailer, type Truck } from "./types";

function currentOpenLoad(loads: LoadView[], match: (load: LoadView) => boolean): LoadView | undefined {
  return loads
    .filter((load) => match(load) && !isClosedStatus(load.status))
    .sort((left, right) => right.id - left.id)[0];
}

function truckHref(truck: Truck, loads: LoadView[]): string {
  const load = currentOpenLoad(loads, (item) => item.truck_id === truck.id);
  return load ? `/loads/${load.id}` : `/fleet/trucks/${truck.id}`;
}

function trailerHref(trailer: Trailer, loads: LoadView[]): string {
  const load = currentOpenLoad(loads, (item) => item.trailer_id === trailer.id);
  return load ? `/loads/${load.id}` : `/fleet/trailers/${trailer.id}`;
}

function activeTrucks(): Truck[] {
  return listTrucks().filter((truck) => truck.active !== 0);
}

function activeReefers(): Trailer[] {
  return listTrailers().filter((trailer) => trailer.active !== 0 && trailer.type === "reefer");
}

function keySet(values: Array<string | null | undefined>): Set<string> {
  return new Set(values.map((value) => canonicalFleetKey(value ?? "")).filter(Boolean));
}

function matchTrailer(
  trailers: Trailer[],
  keys: Array<string | null | undefined>,
  loadId: number | null,
  loads: LoadView[],
): Trailer | undefined {
  const wanted = keySet(keys);
  const byKey = trailers.find(
    (trailer) =>
      wanted.has(canonicalFleetKey(trailer.unit_number)) || wanted.has(canonicalFleetKey(trailer.orbcomm_asset_id)),
  );
  if (byKey) return byKey;
  if (loadId == null) return undefined;
  const load = loads.find((item) => item.id === loadId);
  if (load?.trailer_id == null) return undefined;
  return trailers.find((trailer) => trailer.id === load.trailer_id);
}

function addPin(pins: FleetMapPin[], usedIds: Set<number>, pin: FleetMapPin, id: number): void {
  if (usedIds.has(id)) return;
  usedIds.add(id);
  pins.push(pin);
}

export async function buildSamsaraFleetMap(): Promise<FleetMapModel> {
  const trucks = activeTrucks();
  const loads = listLoads({ status: "all" });
  const truckById = new Map(trucks.map((truck) => [truck.id, truck]));
  const fleet = await getSamsaraFleet();
  const usedTruckIds = new Set<number>();
  const pins: FleetMapPin[] = [];

  for (const location of fleet.locations) {
    if (location.source !== "samsara") continue;
    const coord = plottableCoord(location.latitude, location.longitude);
    if (!coord || location.truckId == null) continue;
    const truck = truckById.get(location.truckId);
    if (!truck) continue;
    addPin(
      pins,
      usedTruckIds,
      {
        id: `truck-${truck.id}`,
        label: truck.unit_number,
        kind: "truck",
        lat: coord.lat,
        lng: coord.lng,
        href: truckHref(truck, loads),
        motion: motionFromSpeedMph(location.speedMph),
        speedMph: location.speedMph,
      },
      truck.id,
    );
  }

  for (const truck of trucks) {
    if (usedTruckIds.has(truck.id)) continue;
    const stored = persistedTruckLocation(truck);
    if (!stored || stored.source !== "samsara") continue;
    const coord = plottableCoord(stored.latitude, stored.longitude);
    if (!coord) continue;
    addPin(
      pins,
      usedTruckIds,
      {
        id: `truck-${truck.id}`,
        label: truck.unit_number,
        kind: "truck",
        lat: coord.lat,
        lng: coord.lng,
        href: truckHref(truck, loads),
      },
      truck.id,
    );
  }

  const missing: FleetMapMissing[] = trucks
    .filter((truck) => !usedTruckIds.has(truck.id))
    .map((truck) => ({
      id: truck.id,
      label: truck.unit_number,
      href: truckHref(truck, loads),
    }));

  const liveCount = fleet.locations.filter(
    (location) =>
      fleet.mode === "samsara" &&
      location.source === "samsara" &&
      isPlottableCoord(location.latitude, location.longitude),
  ).length;
  const sourceNote = liveCount
    ? "Live Samsara GPS for active trucks. Units without a position are listed, not plotted."
    : "Last stored Samsara GPS for active trucks. Live pull is unavailable or returned no positions. No invented pins.";

  return {
    title: "Samsara",
    sourceNote,
    pins,
    missing,
  };
}

export async function buildOrbcommFleetMap(): Promise<FleetMapModel> {
  const trailers = activeReefers();
  const loads = listLoads({ status: "all" });
  const usedTrailerIds = new Set<number>();
  const pins: FleetMapPin[] = [];
  const configured = isOrbcommConfigured();
  const snapshots = configured ? await getReeferSnapshots() : { readings: [] as Awaited<ReturnType<typeof getReeferSnapshots>>["readings"] };

  for (const snapshot of snapshots.readings) {
    if (snapshot.source !== "orbcomm") continue;
    const coord = plottableCoord(snapshot.latitude, snapshot.longitude);
    if (!coord) continue;
    const trailer = matchTrailer(trailers, [snapshot.trailerId], snapshot.loadId, loads);
    if (!trailer) continue;
    saveTrailerGps(trailer.id, {
      latitude: coord.lat,
      longitude: coord.lng,
      address: snapshot.address,
      recordedAt: snapshot.recordedAt,
      source: "orbcomm",
    });
    addPin(
      pins,
      usedTrailerIds,
      {
        id: `trailer-${trailer.id}`,
        label: trailer.unit_number,
        kind: "trailer",
        lat: coord.lat,
        lng: coord.lng,
        href: trailerHref(trailer, loads),
      },
      trailer.id,
    );
  }

  for (const trailer of trailers) {
    if (usedTrailerIds.has(trailer.id)) continue;
    const reading = latestReeferForTrailer(trailer);
    const readingCoord =
      reading && reading.source === "orbcomm" ? plottableCoord(reading.latitude, reading.longitude) : null;
    if (readingCoord) {
      addPin(
        pins,
        usedTrailerIds,
        {
          id: `trailer-${trailer.id}`,
          label: trailer.unit_number,
          kind: "trailer",
          lat: readingCoord.lat,
          lng: readingCoord.lng,
          href: trailerHref(trailer, loads),
        },
        trailer.id,
      );
      continue;
    }
    const stored = persistedTrailerLocation(trailer);
    if (!stored || stored.source !== "orbcomm") continue;
    const coord = plottableCoord(stored.latitude, stored.longitude);
    if (!coord) continue;
    addPin(
      pins,
      usedTrailerIds,
      {
        id: `trailer-${trailer.id}`,
        label: trailer.unit_number,
        kind: "trailer",
        lat: coord.lat,
        lng: coord.lng,
        href: trailerHref(trailer, loads),
      },
      trailer.id,
    );
  }

  const missing: FleetMapMissing[] = trailers
    .filter((trailer) => !usedTrailerIds.has(trailer.id))
    .map((trailer) => ({
      id: trailer.id,
      label: trailer.unit_number,
      href: trailerHref(trailer, loads),
    }));

  const liveCount = snapshots.readings.filter(
    (reading) => reading.source === "orbcomm" && isPlottableCoord(reading.latitude, reading.longitude),
  ).length;
  const sourceNote = configured
    ? liveCount
      ? "Live Orbcomm GPS for reefer trailers. Units without a position are listed, not plotted."
      : "Live Orbcomm returned no positions. Showing last stored trailer GPS from import only."
    : "Live Orbcomm is not connected yet. Showing last stored trailer GPS from import only. Empty units are listed, not plotted.";

  const statusRows: FleetStatusRow[] = trailers.map((trailer) => {
    const snapshot =
      snapshots.readings.find(
        (reading) =>
          canonicalFleetKey(reading.trailerId) === canonicalFleetKey(trailer.unit_number) ||
          canonicalFleetKey(reading.trailerId) === canonicalFleetKey(trailer.orbcomm_asset_id),
      ) ?? latestReeferForTrailer(trailer);
    const power =
      snapshot && "powerOn" in snapshot
        ? snapshot.powerOn === true
          ? "On"
          : snapshot.powerOn === false
            ? "Off"
            : "—"
        : "—";
    const temperatureF =
      snapshot && "temperatureF" in snapshot
        ? snapshot.temperatureF
        : snapshot && "temperature_f" in snapshot
          ? snapshot.temperature_f
          : null;
    const setpointF =
      snapshot && "setpointF" in snapshot
        ? snapshot.setpointF
        : snapshot && "setpoint_f" in snapshot
          ? snapshot.setpoint_f
          : null;
    const alarm =
      snapshot && "alarm" in snapshot ? String(snapshot.alarm ?? "") : "";
    const location =
      snapshot && "address" in snapshot
        ? String(snapshot.address ?? "")
        : persistedTrailerLocation(trailer)?.address ?? "";
    return {
      id: `status-${trailer.id}`,
      trailer: trailer.unit_number,
      href: trailerHref(trailer, loads),
      power,
      setpointF: setpointF ?? null,
      temperatureF: temperatureF ?? null,
      alarm,
      location,
    };
  });

  return {
    title: "Orbcomm",
    sourceNote,
    pins,
    missing,
    statusRows,
  };
}
