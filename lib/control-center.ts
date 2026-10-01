import {
  parsePlaceState,
  type ControlCenterItem,
} from "./control-center-shared";
import { orbcommMapPinFromReading, samsaraTruckPinStyle } from "./fleet-map-shared";
import { coordsForStop } from "./geofence";
import { getReeferSnapshots, latestReeferForTrailer } from "./integrations/orbcomm";
import { getSamsaraFleet } from "./integrations/samsara";
import {
  listLoads,
  listTrailers,
  listTrucks,
  persistedTrailerLocation,
  persistedTruckLocation,
} from "./queries";
import { listStops } from "./stops";
import { isActiveLoadStatus, isClosedStatus, labelForLoadStatus, type LoadView, type Trailer, type Truck } from "./types";

export type ControlCenterModel = {
  orders: ControlCenterItem[];
  resources: ControlCenterItem[];
};

function plottable(lat: number | null | undefined, lng: number | null | undefined): { lat: number; lng: number } | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function assignedTrailerIds(loads: LoadView[]): Set<number> {
  return new Set(
    loads.filter((load) => !isClosedStatus(load.status) && load.trailer_id != null).map((load) => load.trailer_id as number),
  );
}

function assignedTruckIds(loads: LoadView[]): Set<number> {
  return new Set(
    loads.filter((load) => !isClosedStatus(load.status) && load.truck_id != null).map((load) => load.truck_id as number),
  );
}

function loadCoords(load: LoadView, truck: Truck | undefined, trailer: Trailer | undefined): {
  lat: number | null;
  lng: number | null;
  address: string;
  state: string;
  pinColor?: string;
  pinShape?: "circle" | "arrow";
  headingDeg?: number | null;
} {
  const truckGps = truck ? persistedTruckLocation(truck) : null;
  const trailerGps = trailer ? persistedTrailerLocation(trailer) : null;
  const truckPoint = plottable(truckGps?.latitude, truckGps?.longitude);
  if (truckPoint && truckGps) {
    const style = samsaraTruckPinStyle({ speedMph: truckGps.speedMph, engineOn: truckGps.engineOn });
    return {
      lat: truckPoint.lat,
      lng: truckPoint.lng,
      address: truckGps.address ?? "",
      state: parsePlaceState(truckGps.address ?? "") || parsePlaceState(load.origin),
      pinColor: style.pinColor,
      pinShape: style.pinShape,
      headingDeg: truckGps.headingDeg,
    };
  }
  const trailerPoint = plottable(trailerGps?.latitude, trailerGps?.longitude);
  if (trailerPoint) {
    const pin = orbcommMapPinFromReading(trailer ? latestReeferForTrailer(trailer) : null);
    return {
      lat: trailerPoint.lat,
      lng: trailerPoint.lng,
      address: trailerGps?.address ?? "",
      state: parsePlaceState(trailerGps?.address ?? "") || parsePlaceState(load.origin),
      ...pin,
    };
  }
  const pickup = listStops(load.id).find((stop) => stop.kind === "pickup");
  const stopPoint = pickup ? coordsForStop(pickup) : null;
  if (stopPoint) {
    return {
      lat: stopPoint.latitude,
      lng: stopPoint.longitude,
      address: [pickup?.city, pickup?.state].filter(Boolean).join(", "),
      state: String(pickup?.state ?? "").trim().toUpperCase() || parsePlaceState(load.origin),
      pinColor: "#0b1f3a",
    };
  }
  return { lat: null, lng: null, address: "", state: parsePlaceState(load.origin), pinColor: "#0b1f3a" };
}

function loadEquipment(load: LoadView, trailer: Trailer | undefined): string {
  if (load.equipment.trim()) return load.equipment;
  if (trailer?.type) return trailer.type;
  return "";
}

function orderItem(load: LoadView, trucks: Truck[], trailers: Trailer[]): ControlCenterItem {
  const truck = load.truck_id != null ? trucks.find((row) => row.id === load.truck_id) : undefined;
  const trailer = load.trailer_id != null ? trailers.find((row) => row.id === load.trailer_id) : undefined;
  const here = loadCoords(load, truck, trailer);
  const reading = trailer ? latestReeferForTrailer(trailer) : null;
  return {
    id: `load-${load.id}`,
    kind: "load",
    refId: load.id,
    title: load.load_number,
    subtitle: load.customer_name,
    status: load.status,
    statusLabel: labelForLoadStatus(load.status),
    state: here.state,
    equipment: loadEquipment(load, trailer),
    origin: load.origin,
    destination: load.destination,
    temperatureF: reading?.temperature_f ?? null,
    setpointF: reading?.setpoint_f ?? load.reefer_setpoint_f,
    address: here.address,
    lat: here.lat,
    lng: here.lng,
    href: `/board?open=${load.id}`,
    pinColor: here.pinColor,
    pinShape: here.pinShape,
    headingDeg: here.headingDeg,
  };
}

function trailerItem(
  trailer: Trailer,
  busy: Set<number>,
  reading: ReturnType<typeof latestReeferForTrailer>,
): ControlCenterItem {
  const stored = persistedTrailerLocation(trailer);
  const point = plottable(stored?.latitude, stored?.longitude);
  const onLoad = busy.has(trailer.id);
  const pin = orbcommMapPinFromReading(reading);
  return {
    id: `trailer-${trailer.id}`,
    kind: "trailer",
    refId: trailer.id,
    title: trailer.unit_number,
    subtitle: onLoad ? "On a load" : "Idle",
    status: onLoad ? "on_load" : "idle",
    statusLabel: onLoad ? "On a load" : "Idle",
    state: parsePlaceState(stored?.address ?? ""),
    equipment: trailer.type || "reefer",
    origin: "",
    destination: "",
    temperatureF: reading?.temperature_f ?? null,
    setpointF: reading?.setpoint_f ?? trailer.reefer_setpoint_f ?? null,
    address: stored?.address ?? "",
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    href: `/fleet/trailers/${trailer.id}`,
    ...pin,
  };
}

function truckItem(truck: Truck, busy: Set<number>): ControlCenterItem {
  const stored = persistedTruckLocation(truck);
  const point = plottable(stored?.latitude, stored?.longitude);
  const onLoad = busy.has(truck.id);
  const style = stored
    ? samsaraTruckPinStyle({ speedMph: stored.speedMph, engineOn: stored.engineOn })
    : null;
  return {
    id: `truck-${truck.id}`,
    kind: "truck",
    refId: truck.id,
    title: truck.unit_number,
    subtitle: onLoad ? "On a load" : "Idle",
    status: onLoad ? "on_load" : "idle",
    statusLabel: onLoad ? "On a load" : "Idle",
    state: parsePlaceState(stored?.address ?? ""),
    equipment: truck.type || "",
    origin: "",
    destination: "",
    temperatureF: null,
    setpointF: null,
    address: stored?.address ?? "",
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    href: `/fleet/trucks/${truck.id}`,
    pinColor: style?.pinColor,
    pinShape: style?.pinShape,
    headingDeg: stored?.headingDeg ?? null,
  };
}

export async function buildControlCenter(): Promise<ControlCenterModel> {
  const loads = listLoads({ status: "all" }).filter(
    (load) => isActiveLoadStatus(load.status) || load.status === "available",
  );
  const trailers = listTrailers().filter((trailer) => trailer.active !== 0);
  const trucks = listTrucks().filter((truck) => truck.active !== 0);
  try {
    await getSamsaraFleet();
  } catch {
    /* persisted truck GPS is enough */
  }
  try {
    await getReeferSnapshots();
  } catch {
    /* persisted trailer GPS is enough */
  }
  const busyTrailers = assignedTrailerIds(loads);
  const busyTrucks = assignedTruckIds(loads);
  const orders = loads.map((load) => orderItem(load, trucks, trailers));
  const idleTrailers = trailers
    .filter((trailer) => !busyTrailers.has(trailer.id) && (trailer.orbcomm_asset_id.trim() || trailer.type === "reefer"))
    .map((trailer) => trailerItem(trailer, busyTrailers, latestReeferForTrailer(trailer)));
  const samsaraTrucks = trucks
    .filter((truck) => persistedTruckLocation(truck))
    .map((truck) => truckItem(truck, busyTrucks));
  return { orders, resources: [...idleTrailers, ...samsaraTrucks] };
}

