import { getSamsaraApiToken, isSamsaraTokenSet, loadRuntimeEnv } from "../env";
import {
  parseSamsaraVehicleRecords,
  SAMSARA_ID_MISSING_MESSAGE,
  SAMSARA_TOKEN_MISSING_MESSAGE,
  samsaraVehicleMatchesTruck,
  type SamsaraVehicleInput,
} from "../fleet-import-shared";
import { listDrivers, listLoads, listTrucks } from "../queries";

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

export type SamsaraFleetResult = {
  mode: "demo" | "samsara";
  tokenSet: boolean;
  error?: string;
  fetchedAt: string;
  locations: VehicleLocation[];
  hos: HosClock[];
};

type CacheEntry = { expiresAt: number; result: SamsaraFleetResult };
let cache: CacheEntry | null = null;

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

export function resetSamsaraCacheForTests(): void {
  cache = null;
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
    return { ok: true, vehicles: parseSamsaraVehicles(items) };
  } catch (error) {
    return { ok: false, error: publicSamsaraImportError(error) };
  }
}

export async function getSamsaraFleet(): Promise<SamsaraFleetResult> {
  await loadRuntimeEnv();
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.result;
  const result = await loadSamsaraFleet();
  cache = { expiresAt: now + CACHE_TTL_MS, result };
  return result;
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
  const load = listLoads({ status: "all" }).find((item) => item.id === loadId);
  if (!load) return fleet.locations.find((item) => item.loadId === loadId) ?? null;
  return locationForLoad(fleet, load);
}

export async function getHosForLoad(loadId: number): Promise<HosClock | null> {
  const fleet = await getSamsaraFleet();
  const load = listLoads({ status: "all" }).find((item) => item.id === loadId);
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
  return hosForDriver(fleet, truck?.assigned_driver_id ?? null);
}

export async function getHosForDriver(driverId: number): Promise<HosClock | null> {
  const fleet = await getSamsaraFleet();
  return hosForDriver(fleet, driverId);
}

async function loadSamsaraFleet(): Promise<SamsaraFleetResult> {
  const demo = demoFleet();
  if (!isSamsaraTokenSet()) return demo;

  try {
    const [vehicles, clocks] = await Promise.all([
      fetchAllPages("/fleet/vehicles/stats", "gps"),
      fetchAllPages("/fleet/hos/clocks"),
    ]);
    return {
      mode: "samsara",
      tokenSet: true,
      fetchedAt: new Date().toISOString(),
      locations: mapVehicleLocations({
        vehicles,
        trucks: listTrucks().map((truck) => ({
          id: truck.id,
          unit_number: truck.unit_number,
          samsara_vehicle_id: truck.samsara_vehicle_id,
        })),
        loads: listLoads({ status: "all" }).map((load) => ({
          id: load.id,
          truck_id: load.truck_id,
        })),
      }),
      hos: mapHosClocks({
        clocks,
        drivers: listDrivers().map((driver) => ({
          id: driver.id,
          name: driver.name,
          samsara_driver_id: driver.samsara_driver_id,
        })),
        loads: listLoads({ status: "all" }).map((load) => ({
          id: load.id,
          driver_id: load.driver_id,
        })),
      }),
    };
  } catch (error) {
    return {
      mode: "samsara",
      tokenSet: true,
      error: publicSamsaraError(error),
      fetchedAt: new Date().toISOString(),
      locations: [],
      hos: [],
    };
  }
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

export function mapVehicleLocations(input: {
  vehicles: Array<Record<string, unknown>>;
  trucks: Array<{ id: number; unit_number: string; samsara_vehicle_id: string }>;
  loads: Array<{ id: number; truck_id: number | null }>;
}): VehicleLocation[] {
  const locations: VehicleLocation[] = [];
  for (const truck of input.trucks) {
    const vehicle = input.vehicles.find((item) =>
      samsaraVehicleMatchesTruck(truck, {
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
      }),
    );
    if (!vehicle) continue;
    const gps = (vehicle.gps ?? {}) as Record<string, unknown>;
    const reverse = (gps.reverseGeo ?? {}) as Record<string, unknown>;
    const load = input.loads.find((item) => item.truck_id === truck.id);
    locations.push({
      truckId: truck.id,
      loadId: load?.id ?? null,
      vehicleId: String(vehicle.id ?? truck.samsara_vehicle_id),
      unitNumber: truck.unit_number,
      latitude: asNumber(gps.latitude),
      longitude: asNumber(gps.longitude),
      speedMph: asNumber(gps.speedMilesPerHour),
      address: typeof reverse.formattedLocation === "string" ? reverse.formattedLocation : "",
      recordedAt: typeof gps.time === "string" ? gps.time : new Date().toISOString(),
      source: "samsara",
    });
  }
  return locations;
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
  return clocks;
}

async function fetchAllPages(pathname: string, types?: string): Promise<Array<Record<string, unknown>>> {
  const token = getSamsaraApiToken();
  if (!token) throw new Error("SAMSARA_API_TOKEN is not set.");

  const items: Array<Record<string, unknown>> = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(pathname, SAMSARA_BASE);
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
    return `Samsara rejected the API token (HTTP ${status}). Check SAMSARA_API_TOKEN and token scopes, then restart.`;
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
      return `Samsara rejected the API token (HTTP ${error.status}). Check SAMSARA_API_TOKEN and token scopes, then restart.`;
    }
    if (error.status === 429) return "Samsara rate-limited the request. Try again in a minute.";
    return `Samsara request failed (HTTP ${error.status}).`;
  }
  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    return "Samsara request timed out.";
  }
  return "Samsara request failed.";
}
