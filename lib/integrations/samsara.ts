import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import {
  canonicalFleetKey,
  keepActiveSamsaraVehicles,
  inactiveSamsaraUnits,
  inactiveSamsaraVehicleIds,
  matchTruckForSamsaraLive,
  mergeSamsaraGpsOntoVehicles,
  parseSamsaraVehicleRecords,
  SAMSARA_ID_MISSING_MESSAGE,
  SAMSARA_TOKEN_MISSING_MESSAGE,
  samsaraExactUnit,
  samsaraRecordIsActive,
  unionActiveSamsaraVehicles,
  type SamsaraVehicleInput,
} from "../fleet-import-shared";
import {
  getLoad,
  getTruck,
  listDrivers,
  listLoads,
  listTrucks,
  persistedTruckLocation,
  recordTruckGpsReading,
  saveTruckGps,
  saveTruckOdometer,
} from "../queries";

export { SAMSARA_ID_MISSING_MESSAGE };

const SAMSARA_BASE = "https://api.samsara.com";
const CACHE_TTL_MS = 45_000;
const MAX_PAGES = 20;
const FETCH_TIMEOUT_MS = 15_000;

export type VehicleLocation = {
  truckId: number | null;
  loadId: number | null;
  vehicleId: string;
  unitNumber: string;
  latitude: number | null;
  longitude: number | null;
  speedMph: number | null;
  headingDeg?: number | null;
  address: string;
  recordedAt: string;
  source: "demo" | "samsara";
};

export type HosClock = {
  driverId: number | null;
  loadId: number | null;
  samsaraDriverId: string;
  driverName: string;
  dutyStatus: string;
  driveRemainingMs: number | null;
  shiftRemainingMs: number | null;
  cycleRemainingMs: number | null;
  timeUntilBreakMs: number | null;
  recordedAt: string;
  source: "demo" | "samsara";
};

export type SamsaraTruckDriver = {
  truckId: number;
  samsaraDriverId: string;
  samsaraDriverName: string;
  tmsDriverId: number | null;
};

export type SamsaraFleetResult = {
  mode: "demo" | "samsara";
  tokenSet: boolean;
  error?: string;
  fetchedAt: string;
  locations: VehicleLocation[];
  hos: HosClock[];
  truckDrivers: SamsaraTruckDriver[];
};

type CacheEntry = { expiresAt: number; result: SamsaraFleetResult };
let cache: CacheEntry | null = null;
let inflight: Promise<SamsaraFleetResult> | null = null;

class SamsaraHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(samsaraStatusMessage(status));
    this.name = "SamsaraHttpError";
    this.status = status;
  }
}

export function isSamsaraConfigured(): boolean {
  return isSamsaraTokenSet();
}

export function resetSamsaraCache(): void {
  cache = null;
  inflight = null;
}

export function resetSamsaraCacheForTests(): void {
  resetSamsaraCache();
}

export function parseSamsaraVehicles(items: Array<Record<string, unknown>>): SamsaraVehicleInput[] {
  return parseSamsaraVehicleRecords(items);
}

export async function listSamsaraVehicles(): Promise<
  { ok: true; vehicles: SamsaraVehicleInput[] } | { ok: false; error: string }
> {
  await loadRuntimeEnv();
  if (!isSamsaraTokenSet()) {
    return { ok: false, error: SAMSARA_TOKEN_MISSING_MESSAGE };
  }
  try {
    let items: Array<Record<string, unknown>>;
    try {
      items = await fetchAllPages("/fleet/vehicles");
    } catch (error) {
      if (error instanceof SamsaraHttpError && error.status === 404) {
        items = await fetchAllPages("/vehicles");
      } else {
        throw error;
      }
    }
    let vehicles = parseSamsaraVehicles(items);
    try {
      const stats = await fetchAllPages("/fleet/vehicles/stats", "gps");
      vehicles = unionActiveSamsaraVehicles(vehicles, parseSamsaraVehicles(stats));
      vehicles = mergeSamsaraGpsOntoVehicles(vehicles, stats);
    } catch {
      vehicles = keepActiveSamsaraVehicles(vehicles);
    }
    return { ok: true, vehicles: keepActiveSamsaraVehicles(vehicles) };
  } catch (error) {
    return { ok: false, error: publicSamsaraImportError(error) };
  }
}

export async function getSamsaraFleet(): Promise<SamsaraFleetResult> {
  await loadRuntimeEnv();
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.result;
  if (cache) {
    void refreshSamsaraFleetCache();
    return cache.result;
  }
  return refreshSamsaraFleetCache();
}

async function refreshSamsaraFleetCache(): Promise<SamsaraFleetResult> {
  if (inflight) return inflight;
  inflight = loadSamsaraFleet()
    .then((result) => {
      cache = { expiresAt: Date.now() + CACHE_TTL_MS, result };
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function isLiveSamsaraGps(location: VehicleLocation | null | undefined): location is VehicleLocation {
  if (!location || location.source !== "samsara") return false;
  return (
    (location.latitude != null && location.longitude != null) || Boolean(location.address.trim())
  );
}

export function isLiveSamsaraHos(hos: HosClock | null | undefined): hos is HosClock {
  return Boolean(hos && hos.source === "samsara");
}

export function locationForTruck(fleet: SamsaraFleetResult, truckId: number | null | undefined): VehicleLocation | null {
  if (truckId == null) return null;
  return fleet.locations.find((item) => item.truckId === truckId) ?? null;
}

export function hosForDriver(fleet: SamsaraFleetResult, driverId: number | null | undefined): HosClock | null {
  if (driverId == null) return null;
  return fleet.hos.find((item) => item.driverId === driverId) ?? null;
}

export function driverForTruck(fleet: SamsaraFleetResult, truckId: number | null | undefined): SamsaraTruckDriver | null {
  if (truckId == null) return null;
  return fleet.truckDrivers.find((item) => item.truckId === truckId) ?? null;
}

export function truckUnitForDriver(
  driver: { id: number; name: string; truck_unit?: string | null; samsara_driver_id?: string | null },
  trucks: Array<{ id: number; unit_number: string }>,
  fleet: Pick<SamsaraFleetResult, "truckDrivers">,
): string {
  if (driver.truck_unit) return driver.truck_unit;
  const row = fleet.truckDrivers.find(
    (item) =>
      item.tmsDriverId === driver.id ||
      (driver.samsara_driver_id &&
        item.samsaraDriverId &&
        normalizeKey(item.samsaraDriverId) === normalizeKey(driver.samsara_driver_id)) ||
      (driver.name && item.samsaraDriverName && normalizeKey(item.samsaraDriverName) === normalizeKey(driver.name)),
  );
  if (!row) return "";
  return trucks.find((truck) => truck.id === row.truckId)?.unit_number ?? "";
}

export function hosForAssignedTruck(
  fleet: SamsaraFleetResult,
  truck: { id: number; assigned_driver_id?: number | null },
): HosClock | null {
  const assigned = driverForTruck(fleet, truck.id);
  if (assigned?.samsaraDriverId) {
    const bySamsara = fleet.hos.find(
      (item) => item.samsaraDriverId && normalizeKey(item.samsaraDriverId) === normalizeKey(assigned.samsaraDriverId),
    );
    if (bySamsara) return bySamsara;
  }
  if (assigned?.tmsDriverId) return hosForDriver(fleet, assigned.tmsDriverId);
  return hosForDriver(fleet, truck.assigned_driver_id ?? null);
}

export function locationForLoad(
  fleet: SamsaraFleetResult,
  load: { id: number; truck_id: number | null },
): VehicleLocation | null {
  return fleet.locations.find((item) => item.loadId === load.id) ?? locationForTruck(fleet, load.truck_id);
}

export function hosForLoad(
  fleet: SamsaraFleetResult,
  load: { id: number; driver_id: number | null },
): HosClock | null {
  return fleet.hos.find((item) => item.loadId === load.id) ?? hosForDriver(fleet, load.driver_id);
}

export function samsaraGpsEmptyState(input: {
  truckAssigned: boolean;
  samsaraVehicleId?: string | null;
  location?: VehicleLocation | null;
}): string {
  if (!input.truckAssigned) return "No truck assigned.";
  if (isLiveSamsaraGps(input.location ?? null)) return "";
  if (input.location?.source === "samsara") return "No live GPS from Samsara for this truck.";
  if (!String(input.samsaraVehicleId ?? "").trim()) return SAMSARA_ID_MISSING_MESSAGE;
  return "No live GPS from Samsara for this truck.";
}

export function samsaraHosEmptyState(input: { assigned: boolean; hos?: HosClock | null }): string {
  if (!input.assigned) return "—";
  if (isLiveSamsaraHos(input.hos ?? null)) return "";
  return "No live HOS from Samsara.";
}

export async function getLocationForLoad(loadId: number): Promise<VehicleLocation | null> {
  const fleet = await getSamsaraFleet();
  const load = getLoad(loadId);
  if (!load) return fleet.locations.find((item) => item.loadId === loadId) ?? null;
  return locationForLoad(fleet, load);
}

export async function getHosForLoad(loadId: number): Promise<HosClock | null> {
  const fleet = await getSamsaraFleet();
  const load = getLoad(loadId);
  if (!load) return fleet.hos.find((item) => item.loadId === loadId) ?? null;
  return hosForLoad(fleet, load);
}

export async function getLocationForTruck(truckId: number): Promise<VehicleLocation | null> {
  const fleet = await getSamsaraFleet();
  return locationForTruck(fleet, truckId);
}

export async function getHosForTruck(truckId: number): Promise<HosClock | null> {
  const fleet = await getSamsaraFleet();
  const truck = listTrucks().find((item) => item.id === truckId);
  if (!truck) return null;
  return hosForAssignedTruck(fleet, truck);
}

export async function getSamsaraDriverForTruck(truckId: number): Promise<SamsaraTruckDriver | null> {
  const fleet = await getSamsaraFleet();
  return driverForTruck(fleet, truckId);
}

export async function getHosForDriver(driverId: number): Promise<HosClock | null> {
  const fleet = await getSamsaraFleet();
  return hosForDriver(fleet, driverId);
}

async function loadSamsaraFleet(): Promise<SamsaraFleetResult> {
  const demo = demoFleet();
  if (!isSamsaraTokenSet()) return demo;

  const [stats, clocks, identities] = await Promise.all([
    fetchVehicleStats(),
    fetchFleetPages("/fleet/hos/clocks"),
    fetchFleetPages("/fleet/vehicles"),
  ]);
  const trucks = listTrucks();
  const drivers = listDrivers();
  const parsedIdentity = parseSamsaraVehicles(identities.items);
  const parsedStats = parseSamsaraVehicles(stats.items);
  const identityVehicles = identities.items.length
    ? unionActiveSamsaraVehicles(parsedIdentity, parsedStats)
    : keepActiveSamsaraVehicles(parsedStats);
  const inactiveSource = identities.items.length ? parsedIdentity : parsedStats;
  const activeVehicleIds = new Set(
    identityVehicles.map((vehicle) => canonicalFleetKey(vehicle.id)).filter(Boolean),
  );
  const inactiveVehicleIds = inactiveSamsaraVehicleIds(inactiveSource);
  const inactiveUnits = inactiveSamsaraUnits(inactiveSource);
  persistLiveOdometer(stats.items, trucks);
  const locations = persistLiveGps(
    mapVehicleLocations({
      vehicles: stats.items,
      trucks: trucks.map((truck) => ({
        id: truck.id,
        unit_number: truck.unit_number,
        samsara_vehicle_id: truck.samsara_vehicle_id,
        vin: truck.vin,
        plate: truck.plate,
      })),
      loads: listLoads({ status: "all" }).map((load) => ({
        id: load.id,
        truck_id: load.truck_id,
      })),
      activeVehicleIds,
      inactiveVehicleIds,
      inactiveUnits,
    }),
  );
  const truckDrivers = [
    ...mapTruckDrivers({ vehicles: identityVehicles, trucks, drivers }),
  ];
  const claimed = new Set(truckDrivers.map((item) => item.truckId));
  truckDrivers.push(
    ...mapHosCurrentVehicleDrivers({
      clocks: clocks.items,
      trucks,
      drivers,
      claimed,
      activeVehicleIds,
      inactiveVehicleIds,
      inactiveUnits,
    }),
  );
  const error = clocks.error || identities.error || (stats.items.length ? "" : stats.error) || undefined;
  return {
    mode: "samsara",
    tokenSet: true,
    error,
    fetchedAt: new Date().toISOString(),
    locations: mergePersistedGps(locations, trucks, inactiveVehicleIds),
    hos: mapHosClocks({
      clocks: clocks.items,
      drivers: drivers.map((driver) => ({
        id: driver.id,
        name: driver.name,
        samsara_driver_id: driver.samsara_driver_id,
      })),
      loads: listLoads({ status: "all" }).map((load) => ({
        id: load.id,
        driver_id: load.driver_id,
      })),
    }),
    truckDrivers,
  };
}

function demoFleet(): SamsaraFleetResult {
  const trucks = listTrucks();
  const drivers = listDrivers();
  const loads = listLoads({ status: "all" });
  const locations = demoLocations().flatMap((demo) => {
    const truck = trucks.find((item) => item.unit_number === demo.unitNumber);
    if (!truck) return [];
    const load = loads.find((item) => item.truck_id === truck.id);
    return [
      {
        ...demo,
        truckId: truck.id,
        loadId: load?.id ?? null,
      },
    ];
  });
  const hos = demoHos().flatMap((demo) => {
    const driver = drivers.find((item) => item.name === demo.driverName);
    if (!driver) return [];
    const load = loads.find((item) => item.driver_id === driver.id);
    return [
      {
        ...demo,
        driverId: driver.id,
        loadId: load?.id ?? null,
      },
    ];
  });
  return {
    mode: "demo",
    tokenSet: isSamsaraTokenSet(),
    fetchedAt: new Date().toISOString(),
    locations,
    hos,
    truckDrivers: [],
  };
}

function demoLocations(): VehicleLocation[] {
  const now = new Date().toISOString();
  return [
    {
      truckId: null,
      loadId: null,
      vehicleId: "demo-112",
      unitNumber: "112",
      latitude: 32.7767,
      longitude: -96.797,
      speedMph: 58,
      headingDeg: 185,
      address: "Dallas, TX",
      recordedAt: now,
      source: "demo",
    },
    {
      truckId: null,
      loadId: null,
      vehicleId: "demo-102",
      unitNumber: "102",
      latitude: 39.7684,
      longitude: -86.1581,
      speedMph: 0,
      address: "Indianapolis, IN",
      recordedAt: now,
      source: "demo",
    },
    {
      truckId: null,
      loadId: null,
      vehicleId: "demo-118",
      unitNumber: "118",
      latitude: 38.627,
      longitude: -90.1994,
      speedMph: 47,
      headingDeg: 95,
      address: "St. Louis, MO",
      recordedAt: now,
      source: "demo",
    },
    {
      truckId: null,
      loadId: null,
      vehicleId: "demo-205",
      unitNumber: "205",
      latitude: 36.1627,
      longitude: -86.7816,
      speedMph: 0,
      address: "Nashville, TN",
      recordedAt: now,
      source: "demo",
    },
  ];
}

function demoHos(): HosClock[] {
  const now = new Date().toISOString();
  return [
    hosDemo("Denise Ortega", "driving", 6.2, now),
    hosDemo("Marcus Hale", "onDuty", 8.5, now),
    hosDemo("James Whitaker", "driving", 3.1, now),
    hosDemo("Cole Brennan", "onDuty", 10, now),
  ];
}

function hosDemo(name: string, status: string, driveHours: number, recordedAt: string): HosClock {
  return {
    driverId: null,
    loadId: null,
    samsaraDriverId: "",
    driverName: name,
    dutyStatus: status,
    driveRemainingMs: Math.round(driveHours * 3600000),
    shiftRemainingMs: Math.round(11 * 3600000),
    cycleRemainingMs: Math.round(54 * 3600000),
    timeUntilBreakMs: Math.round(3 * 3600000),
    recordedAt,
    source: "demo",
  };
}

export function extractSamsaraGps(vehicle: Record<string, unknown>): {
  latitude: number | null;
  longitude: number | null;
  speedMph: number | null;
  headingDeg: number | null;
  address: string;
  recordedAt: string;
} {
  const nested = (vehicle.vehicle ?? {}) as Record<string, unknown>;
  const raw = vehicle.gps ?? nested.gps ?? vehicle.location ?? nested.location;
  const gps = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  const rec = gps && typeof gps === "object" ? gps : {};
  const reverse = (rec.reverseGeo ?? rec.reverse_geo ?? {}) as Record<string, unknown>;
  const address =
    (typeof reverse.formattedLocation === "string" && reverse.formattedLocation) ||
    (typeof rec.formattedLocation === "string" && rec.formattedLocation) ||
    (typeof rec.location === "string" && rec.location) ||
    "";
  return {
    latitude: asNumber(rec.latitude ?? rec.lat),
    longitude: asNumber(rec.longitude ?? rec.lng ?? rec.lon),
    speedMph: asNumber(rec.speedMilesPerHour ?? rec.speedMph),
    headingDeg: samsaraHeadingDeg(rec),
    address: address.trim(),
    recordedAt: typeof rec.time === "string" ? rec.time : "",
  };
}

function samsaraHeadingDeg(rec: Record<string, unknown>): number | null {
  const heading = asNumber(rec.headingDegrees ?? rec.headingDegree ?? rec.heading ?? rec.course);
  if (heading == null || !Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

const METERS_PER_MILE = 1609.344;

export function extractSamsaraOdometerMiles(vehicle: Record<string, unknown>): {
  miles: number | null;
  recordedAt: string;
} {
  const nested = (vehicle.vehicle ?? {}) as Record<string, unknown>;
  const raw =
    vehicle.obdOdometerMeters ??
    nested.obdOdometerMeters ??
    vehicle.gpsOdometerMeters ??
    nested.gpsOdometerMeters;
  const rec = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | number | undefined;
  let meters: number | null = null;
  let recordedAt = "";
  if (typeof rec === "number") {
    meters = rec;
  } else if (rec && typeof rec === "object") {
    meters = asNumber(rec.value ?? rec.meters);
    recordedAt = typeof rec.time === "string" ? rec.time : "";
  }
  if (meters == null || meters < 0) return { miles: null, recordedAt };
  return { miles: meters / METERS_PER_MILE, recordedAt };
}

export function mapVehicleLocations(input: {
  vehicles: Array<Record<string, unknown>>;
  trucks: Array<{ id: number; unit_number: string; samsara_vehicle_id: string; vin?: string; plate?: string }>;
  loads: Array<{ id: number; truck_id: number | null }>;
  activeVehicleIds?: Set<string>;
  inactiveVehicleIds?: Set<string>;
  inactiveUnits?: Set<string>;
}): VehicleLocation[] {
  const locations: VehicleLocation[] = [];
  const claimedTruckIds = new Set<number>();
  for (const vehicle of input.vehicles) {
    if (!samsaraRecordIsActive(vehicle)) continue;
    const nested = (vehicle.vehicle ?? {}) as Record<string, unknown>;
    const vehicleId = String(vehicle.id ?? nested.id ?? "");
    const activeKey = canonicalFleetKey(vehicleId);
    if (input.inactiveVehicleIds?.has(activeKey)) continue;
    const exactUnit = samsaraExactUnit({
      unitNumber: String(vehicle.unitNumber ?? nested.unitNumber ?? ""),
      name: String(vehicle.name ?? nested.name ?? ""),
    });
    if (exactUnit && input.inactiveUnits?.has(exactUnit)) continue;
    if (input.activeVehicleIds?.size && activeKey && !input.activeVehicleIds.has(activeKey)) continue;
    const match = matchTruckForSamsaraLive(
      input.trucks,
      {
        samsaraVehicleId: vehicleId,
        name: String(vehicle.name ?? nested.name ?? ""),
        unitNumber: String(vehicle.unitNumber ?? nested.unitNumber ?? ""),
        vin: String(vehicle.vin ?? nested.vin ?? ""),
        licensePlate: String(vehicle.licensePlate ?? nested.licensePlate ?? ""),
      },
      claimedTruckIds,
    );
    if (!match) continue;
    claimedTruckIds.add(match.id);
    const truck = input.trucks.find((item) => item.id === match.id);
    if (!truck) continue;
    const gps = extractSamsaraGps(vehicle);
    const load = input.loads.find((item) => item.truck_id === truck.id);
    locations.push({
      truckId: truck.id,
      loadId: load?.id ?? null,
      vehicleId: vehicleId || truck.samsara_vehicle_id,
      unitNumber: truck.unit_number,
      latitude: gps.latitude,
      longitude: gps.longitude,
      speedMph: gps.speedMph,
      headingDeg: gps.headingDeg,
      address: gps.address,
      recordedAt: gps.recordedAt || new Date().toISOString(),
      source: "samsara",
    });
  }
  return locations;
}

function persistLiveGps(locations: VehicleLocation[]): VehicleLocation[] {
  for (const location of locations) {
    if (location.source !== "samsara" || location.truckId == null) continue;
    if (location.latitude == null && location.longitude == null && !location.address.trim()) continue;
    saveTruckGps(location.truckId, {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      recordedAt: location.recordedAt,
      source: "samsara",
      speedMph: location.speedMph,
      headingDeg: location.headingDeg,
    });
  }
  return locations;
}

function persistLiveOdometer(
  vehicles: Array<Record<string, unknown>>,
  trucks: Array<{ id: number; unit_number: string; samsara_vehicle_id: string; vin?: string; plate?: string }>,
): void {
  const claimedTruckIds = new Set<number>();
  for (const vehicle of vehicles) {
    if (!samsaraRecordIsActive(vehicle)) continue;
    const nested = (vehicle.vehicle ?? {}) as Record<string, unknown>;
    const vehicleId = String(vehicle.id ?? nested.id ?? "");
    const match = matchTruckForSamsaraLive(
      trucks,
      {
        samsaraVehicleId: vehicleId,
        name: String(vehicle.name ?? nested.name ?? ""),
        unitNumber: String(vehicle.unitNumber ?? nested.unitNumber ?? ""),
        vin: String(vehicle.vin ?? nested.vin ?? ""),
        licensePlate: String(vehicle.licensePlate ?? nested.licensePlate ?? ""),
      },
      claimedTruckIds,
    );
    if (!match) continue;
    claimedTruckIds.add(match.id);
    const odometer = extractSamsaraOdometerMiles(vehicle);
    if (odometer.miles == null) continue;
    saveTruckOdometer(match.id, {
      miles: odometer.miles,
      recordedAt: odometer.recordedAt || new Date().toISOString(),
      source: "samsara",
    });
  }
}

function mergePersistedGps(
  locations: VehicleLocation[],
  trucks: Array<{
    id: number;
    unit_number: string;
    samsara_vehicle_id: string;
    gps_latitude?: number | null;
    gps_longitude?: number | null;
    gps_address?: string;
    gps_recorded_at?: string;
    gps_source?: string;
  }>,
  inactiveVehicleIds?: Set<string>,
): VehicleLocation[] {
  const seen = new Set(locations.map((item) => item.truckId).filter((id): id is number => id != null));
  const merged = [...locations];
  for (const truck of trucks) {
    if (seen.has(truck.id)) continue;
    const storedId = canonicalFleetKey(truck.samsara_vehicle_id);
    if (storedId && inactiveVehicleIds?.has(storedId)) continue;
    const persisted = persistedTruckLocation(truck);
    if (!persisted) continue;
    merged.push(persisted);
  }
  return merged;
}

export function mapHosClocks(input: {
  clocks: Array<Record<string, unknown>>;
  drivers: Array<{ id: number; name: string; samsara_driver_id: string }>;
  loads: Array<{ id: number; driver_id: number | null }>;
}): HosClock[] {
  const clocks: HosClock[] = [];
  for (const driver of input.drivers) {
    const row = input.clocks.find((item) => {
      const info = (item.driver ?? {}) as Record<string, unknown>;
      const id = normalizeKey(String(info.id ?? ""));
      const name = normalizeKey(String(info.name ?? ""));
      return (
        (driver.samsara_driver_id && id === normalizeKey(driver.samsara_driver_id)) ||
        name === normalizeKey(driver.name)
      );
    });
    if (!row) continue;
    const clock = (row.clocks ?? {}) as Record<string, unknown>;
    const drive = (clock.drive ?? {}) as Record<string, unknown>;
    const shift = (clock.shift ?? {}) as Record<string, unknown>;
    const cycle = (clock.cycle ?? {}) as Record<string, unknown>;
    const brk = (clock.break ?? {}) as Record<string, unknown>;
    const status = (row.currentDutyStatus ?? {}) as Record<string, unknown>;
    const load = input.loads.find((item) => item.driver_id === driver.id);
    clocks.push({
      driverId: driver.id,
      loadId: load?.id ?? null,
      samsaraDriverId: String(((row.driver ?? {}) as Record<string, unknown>).id ?? driver.samsara_driver_id),
      driverName: driver.name,
      dutyStatus: String(status.hosStatusType ?? ""),
      driveRemainingMs: asNumber(drive.driveRemainingDurationMs),
      shiftRemainingMs: asNumber(shift.shiftRemainingDurationMs),
      cycleRemainingMs: asNumber(cycle.cycleRemainingDurationMs),
      timeUntilBreakMs: asNumber(brk.timeUntilBreakDurationMs),
      recordedAt: new Date().toISOString(),
      source: "samsara",
    });
  }
  const seen = new Set(clocks.map((item) => normalizeKey(item.samsaraDriverId)).filter(Boolean));
  for (const row of input.clocks) {
    const info = (row.driver ?? {}) as Record<string, unknown>;
    const samsaraDriverId = String(info.id ?? "");
    const key = normalizeKey(samsaraDriverId);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const clock = (row.clocks ?? {}) as Record<string, unknown>;
    const drive = (clock.drive ?? {}) as Record<string, unknown>;
    const shift = (clock.shift ?? {}) as Record<string, unknown>;
    const cycle = (clock.cycle ?? {}) as Record<string, unknown>;
    const brk = (clock.break ?? {}) as Record<string, unknown>;
    const status = (row.currentDutyStatus ?? {}) as Record<string, unknown>;
    clocks.push({
      driverId: null,
      loadId: null,
      samsaraDriverId,
      driverName: String(info.name ?? ""),
      dutyStatus: String(status.hosStatusType ?? ""),
      driveRemainingMs: asNumber(drive.driveRemainingDurationMs),
      shiftRemainingMs: asNumber(shift.shiftRemainingDurationMs),
      cycleRemainingMs: asNumber(cycle.cycleRemainingDurationMs),
      timeUntilBreakMs: asNumber(brk.timeUntilBreakDurationMs),
      recordedAt: new Date().toISOString(),
      source: "samsara",
    });
  }
  return clocks;
}

export function mapTruckDrivers(input: {
  vehicles: SamsaraVehicleInput[];
  trucks: Array<{ id: number; unit_number: string; samsara_vehicle_id: string; vin?: string; plate?: string }>;
  drivers: Array<{ id: number; name: string; samsara_driver_id: string }>;
}): SamsaraTruckDriver[] {
  const claimed = new Set<number>();
  const out: SamsaraTruckDriver[] = [];
  for (const vehicle of input.vehicles) {
    if (!vehicle.driverName && !vehicle.driverId) continue;
    const match = matchTruckForSamsaraLive(input.trucks, {
      samsaraVehicleId: vehicle.id,
      unitNumber: vehicle.name,
      name: vehicle.name,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
    }, claimed);
    if (!match) continue;
    claimed.add(match.id);
    out.push(truckDriverRow(match.id, vehicle.driverId ?? "", vehicle.driverName ?? "", input.drivers));
  }
  return out;
}

/** Pair the HOS clock's currentVehicle to the TMS truck with that Samsara vehicle id. */
export function mapHosCurrentVehicleDrivers(input: {
  clocks: Array<Record<string, unknown>>;
  trucks: Array<{ id: number; unit_number: string; samsara_vehicle_id: string; vin?: string; plate?: string }>;
  drivers: Array<{ id: number; name: string; samsara_driver_id: string }>;
  claimed?: Set<number>;
  activeVehicleIds?: Set<string>;
  inactiveVehicleIds?: Set<string>;
  inactiveUnits?: Set<string>;
}): SamsaraTruckDriver[] {
  const claimed = input.claimed ?? new Set<number>();
  const out: SamsaraTruckDriver[] = [];
  for (const row of input.clocks) {
    const driver = (row.driver ?? {}) as Record<string, unknown>;
    const vehicle = (row.currentVehicle ?? {}) as Record<string, unknown>;
    const driverId = String(driver.id ?? "");
    const driverName = String(driver.name ?? "");
    if (!driverId && !driverName) continue;
    if (!vehicle.id && !vehicle.name) continue;
    if (!samsaraRecordIsActive(vehicle)) continue;
    const activeKey = canonicalFleetKey(String(vehicle.id ?? ""));
    if (activeKey && input.inactiveVehicleIds?.has(activeKey)) continue;
    const exactUnit = samsaraExactUnit({
      unitNumber: String(vehicle.unitNumber ?? ""),
      name: String(vehicle.name ?? ""),
    });
    if (exactUnit && input.inactiveUnits?.has(exactUnit)) continue;
    if (input.activeVehicleIds?.size && activeKey && !input.activeVehicleIds.has(activeKey)) continue;
    const match = matchTruckForSamsaraLive(
      input.trucks,
      {
        samsaraVehicleId: String(vehicle.id ?? ""),
        unitNumber: String(vehicle.name ?? ""),
        name: String(vehicle.name ?? ""),
        vin: String(vehicle.vin ?? ""),
      },
      claimed,
    );
    if (!match) continue;
    claimed.add(match.id);
    out.push(truckDriverRow(match.id, driverId, driverName, input.drivers));
  }
  return out;
}

function truckDriverRow(
  truckId: number,
  samsaraDriverId: string,
  samsaraDriverName: string,
  drivers: Array<{ id: number; name: string; samsara_driver_id: string }>,
): SamsaraTruckDriver {
  const tms = drivers.find(
    (driver) =>
      (samsaraDriverId && normalizeKey(driver.samsara_driver_id) === normalizeKey(samsaraDriverId)) ||
      (samsaraDriverName && normalizeKey(driver.name) === normalizeKey(samsaraDriverName)),
  );
  return {
    truckId,
    samsaraDriverId,
    samsaraDriverName: samsaraDriverName || tms?.name || "",
    tmsDriverId: tms?.id ?? null,
  };
}

const gpsHistoryFetchedAt = new Map<number, number>();

function parseHistoryGpsPoints(vehicle: Record<string, unknown>): Array<{
  latitude: number;
  longitude: number;
  recordedAt: string;
  address: string;
}> {
  const raw = vehicle.gps ?? vehicle.locations ?? [];
  const rows = Array.isArray(raw) ? raw : [raw];
  const points: Array<{ latitude: number; longitude: number; recordedAt: string; address: string }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const gps = extractSamsaraGps({ gps: rec });
    if (gps.latitude == null || gps.longitude == null) continue;
    points.push({
      latitude: gps.latitude,
      longitude: gps.longitude,
      recordedAt: gps.recordedAt || "",
      address: gps.address,
    });
  }
  return points;
}

export async function refreshTruckGpsHistoryForLoad(loadId: number): Promise<void> {
  await loadRuntimeEnv();
  if (!isSamsaraTokenSet()) return;
  const load = getLoad(loadId);
  if (!load?.truck_id) return;
  const truck = getTruck(load.truck_id);
  const vehicleId = String(truck?.samsara_vehicle_id ?? "").trim();
  if (!vehicleId) return;
  const last = gpsHistoryFetchedAt.get(load.truck_id) ?? 0;
  if (Date.now() - last < 60_000) return;
  const start = load.pickup_start || new Date(Date.now() - 3 * 86400000).toISOString();
  const end = new Date().toISOString();
  try {
    const points = await fetchVehicleGpsHistory(vehicleId, start, end);
    gpsHistoryFetchedAt.set(load.truck_id, Date.now());
    for (const point of points) {
      if (!point.recordedAt) continue;
      recordTruckGpsReading(load.truck_id, {
        latitude: point.latitude,
        longitude: point.longitude,
        address: point.address,
        recordedAt: point.recordedAt,
        source: "samsara",
      });
    }
  } catch {
    // Fail soft: list keeps blank Arrived/Departed.
  }
}

async function fetchVehicleGpsHistory(
  vehicleId: string,
  startTime: string,
  endTime: string,
): Promise<Array<{ latitude: number; longitude: number; recordedAt: string; address: string }>> {
  const token = getSamsaraApiToken();
  if (!token) return [];
  const url = new URL("/fleet/vehicles/stats/history", SAMSARA_BASE);
  url.searchParams.set("vehicleIds", vehicleId);
  url.searchParams.set("types", "gps");
  url.searchParams.set("startTime", startTime);
  url.searchParams.set("endTime", endTime);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { data?: unknown };
  const rows = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
  const points: Array<{ latitude: number; longitude: number; recordedAt: string; address: string }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    points.push(...parseHistoryGpsPoints(row as Record<string, unknown>));
  }
  return points.slice(0, 400);
}

async function fetchVehicleStats(): Promise<{ items: Array<Record<string, unknown>>; error?: string }> {
  const withOdometer = await fetchFleetPages(
    "/fleet/vehicles/stats",
    "gps,obdOdometerMeters,gpsOdometerMeters",
  );
  if (withOdometer.items.length || !withOdometer.error) return withOdometer;
  return fetchFleetPages("/fleet/vehicles/stats", "gps");
}

async function fetchFleetPages(
  pathname: string,
  types?: string,
): Promise<{ items: Array<Record<string, unknown>>; error?: string }> {
  try {
    return { items: await fetchAllPages(pathname, types) };
  } catch (error) {
    return { items: [], error: publicSamsaraError(error) };
  }
}

async function fetchAllPages(pathname: string, types?: string): Promise<Array<Record<string, unknown>>> {
  const token = getSamsaraApiToken();
  if (!token) throw new Error("SAMSARA_API_TOKEN is not set.");

  const items: Array<Record<string, unknown>> = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(pathname, SAMSARA_BASE);
    url.searchParams.set("limit", "512");
    if (types) url.searchParams.set("types", types);
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) throw new SamsaraHttpError(response.status);

    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
      pagination?: { endCursor?: string; hasNextPage?: boolean };
    };
    items.push(...(body.data ?? []));
    if (!body.pagination?.hasNextPage || !body.pagination.endCursor) break;
    after = body.pagination.endCursor;
  }

  return items;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${hours}h ${minutes}m`;
}

export function formatDutyStatus(value: string): string {
  switch (value) {
    case "offDuty":
      return "Off duty";
    case "onDuty":
      return "On duty";
    case "driving":
      return "Driving";
    case "sleeperBerth":
      return "Sleeper";
    default:
      return value || "—";
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-#]/g, "");
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function samsaraStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `Samsara rejected the API token (HTTP ${status}).`;
  }
  if (status === 429) return "Samsara rate-limited the request. Try again in a minute.";
  return `Samsara request failed (HTTP ${status}).`;
}

function publicSamsaraError(error: unknown): string {
  if (error instanceof SamsaraHttpError) return error.message;
  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    return "Samsara request timed out.";
  }
  return "Samsara request failed.";
}

function publicSamsaraImportError(error: unknown): string {
  if (error instanceof SamsaraHttpError) {
    if (error.status === 401 || error.status === 403) {
      return `Samsara rejected the API token (HTTP ${error.status}).`;
    }
    if (error.status === 429) return "Samsara rate-limited the request. Try again in a minute.";
    return `Samsara request failed (HTTP ${error.status}).`;
  }
  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    return "Samsara request timed out.";
  }
  return "Samsara request failed.";
}
