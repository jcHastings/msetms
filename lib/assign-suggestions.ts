import type { AssignSuggestion } from "./assign-suggestion-shared";
import { findCityCenter, rankTrucksToCoords, type MikeGpsPoint } from "./city-coords-shared";
import { collectAssignmentAlerts, complianceShortLabel } from "./compliance";
import { getDb } from "./db";
import { isSamsaraTokenSet, loadRuntimeEnv } from "./env";
import {
  formatDurationMs,
  getSamsaraFleet,
  hosForAssignedTruck,
  type HosClock,
  type SamsaraFleetResult,
  type SamsaraTruckDriver,
} from "./integrations/samsara";
import { mikeGpsPointsFromFleet } from "./mike";
import { listDrivers, listLocations, listTrailers, listTrucks, persistedTruckLocation } from "./queries";
import { resolveReeferSpec } from "./reefer-shared";
import { complianceWindows, getCompanySettings, getWorkflowSettings } from "./settings";
import { listPickupStops } from "./stops";
import type { ComplianceWindows } from "./settings-shared";
import type { Driver, LoadView, Trailer, Truck, TruckWithDriver } from "./types";
import { LOAD_STATUSES, statusNeedsAssets } from "./types";
import { assignmentHardBlocks } from "./workflow";

export type { AssignSuggestion } from "./assign-suggestion-shared";

/**
 * Same short Samsara budget the fuel page uses for engine hours.
 * A cold suggestion fetch stops here and ranks on saved GPS instead of hanging the dialog.
 */
export const ASSIGN_SUGGESTION_BUDGET_MS = 1200;
export const ASSIGN_SUGGESTION_LIMIT = 3;

/**
 * Ranking weights. Lower score is a better suggestion. Miles stay the main factor;
 * the other weights are mile-equivalents so one bad factor does not hide a nearby truck.
 * JC can retune these without touching the sort.
 */
export const ASSIGN_SUGGESTION_WEIGHTS = {
  /** Stand-in miles when the truck has no GPS, so unknown sits near a regional deadhead. */
  unknownMiles: 250,
  /** Drive hours assumed when Samsara has no clock. Middle of an 11-hour day, not a zero. */
  unknownHosHours: 6,
  hosTargetHours: 11,
  /** Added score per hour short of a full drive clock. */
  hosHourWeight: 15,
  reeferAvailable: 40,
  reeferOnAnotherTruck: 120,
  reeferNone: 180,
  docsExpiring: 60,
  docsBlocked: 220,
} as const;

const OVERLAP_STATUSES = new Set(
  LOAD_STATUSES.filter((status) => status === "hold" || statusNeedsAssets(status)),
);

export type AssignLoadFacts = {
  id: number;
  origin: string;
  pickup_start: string;
  pickup_end?: string;
  delivery_start?: string;
  delivery_end?: string;
  equipment?: string | null;
  reefer_mode?: string | null;
  reefer_setpoint_f?: number | null;
  special_instructions?: string | null;
  temperature_f?: number | null;
  shipper_location_id?: number | null;
};

export type OverlapLoad = {
  id: number;
  truck_id: number | null;
  driver_id: number | null;
  status: string;
  pickup_start: string;
  pickup_end?: string;
  delivery_start?: string;
  delivery_end?: string;
};

type GpsLocation = {
  truckId?: number | null;
  vehicleId?: string;
  unitNumber: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  recordedAt?: string;
  source: string;
};

type CityLocation = {
  name: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
};

export type RankAssignSuggestionsInput = {
  load: AssignLoadFacts;
  pickup: { lat: number; lng: number; label: string } | null;
  trucks: TruckWithDriver[];
  drivers: Driver[];
  trailers: Trailer[];
  otherLoads: OverlapLoad[];
  gpsLocations?: GpsLocation[];
  hos?: HosClock[];
  truckDrivers?: SamsaraTruckDriver[];
  cityLocations?: CityLocation[];
  tokenSet: boolean;
  timedOut?: boolean;
  quietHours?: number;
  windows?: ComplianceWindows;
  hardBlocks?: (input: { driver?: Driver | null; truck?: Truck | null; trailer?: Trailer | null }) => string[];
  now?: Date;
};

type RankedRow = AssignSuggestion & { tier: number; score: number };

export function fleetWithinBudget<T>(
  load: () => Promise<T>,
  budgetMs: number,
  fallback: () => T,
): Promise<{ value: T; timedOut: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ value, timedOut });
    };
    const timer = setTimeout(() => finish(fallback(), true), Math.max(1, budgetMs));
    Promise.resolve()
      .then(load)
      .then(
        (value) => finish(value, false),
        () => finish(fallback(), true),
      );
  });
}

function persistedSuggestionFleet(error: string): SamsaraFleetResult {
  const locations = listTrucks().flatMap((truck) => {
    const row = persistedTruckLocation(truck);
    return row ? [row] : [];
  });
  return {
    mode: isSamsaraTokenSet() ? "samsara" : "demo",
    tokenSet: isSamsaraTokenSet(),
    error,
    fetchedAt: new Date().toISOString(),
    locations,
    hos: [],
    truckDrivers: [],
  };
}

/** Cold Samsara read for suggestions. Stops at the fuel-page budget and keeps saved GPS. */
export async function loadAssignSuggestionFleet(
  budgetMs = ASSIGN_SUGGESTION_BUDGET_MS,
): Promise<{ fleet: SamsaraFleetResult; timedOut: boolean }> {
  await loadRuntimeEnv();
  if (!isSamsaraTokenSet()) {
    return { fleet: persistedSuggestionFleet("Samsara is not connected."), timedOut: false };
  }
  return fleetWithinBudget(
    () => getSamsaraFleet(),
    budgetMs,
    () => persistedSuggestionFleet("Samsara did not answer in time."),
  );
}

export function pickupPointForSuggestion(
  load: { origin: string; shipper_location_id?: number | null },
  pickupStop: { city: string; state: string; location_id: number | null } | null,
  locations: Array<{
    id: number;
    name: string;
    city: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
  }>,
): { lat: number; lng: number; label: string } | null {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const stopLoc = pickupStop?.location_id != null ? byId.get(pickupStop.location_id) : undefined;
  if (stopLoc && stopLoc.latitude != null && stopLoc.longitude != null) {
    return { lat: stopLoc.latitude, lng: stopLoc.longitude, label: placeLabel(stopLoc) };
  }
  const shipper = load.shipper_location_id != null ? byId.get(load.shipper_location_id) : undefined;
  if (shipper && shipper.latitude != null && shipper.longitude != null) {
    return { lat: shipper.latitude, lng: shipper.longitude, label: placeLabel(shipper) };
  }
  const cities = locations.map((location) => ({
    name: location.name,
    city: location.city,
    state: location.state,
    lat: location.latitude,
    lng: location.longitude,
  }));
  const fromStop = pickupStop ? findCityCenter(`${pickupStop.city}, ${pickupStop.state}`, cities) : null;
  if (fromStop) return { lat: fromStop.lat, lng: fromStop.lng, label: fromStop.label };
  const fromOrigin = findCityCenter(load.origin || "", cities);
  if (fromOrigin) return { lat: fromOrigin.lat, lng: fromOrigin.lng, label: fromOrigin.label };
  return null;
}

function placeLabel(location: { name: string; city: string; state: string }): string {
  const city = [location.city, location.state].filter(Boolean).join(", ");
  return city || location.name;
}

function windowBounds(load: {
  pickup_start?: string;
  pickup_end?: string;
  delivery_start?: string;
  delivery_end?: string;
}): { start: string; end: string } {
  const start = load.pickup_start || load.pickup_end || load.delivery_start || "";
  const end = load.delivery_end || load.delivery_start || load.pickup_end || load.pickup_start || "";
  return { start, end };
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const startA = Date.parse(aStart);
  const endA = Date.parse(aEnd);
  const startB = Date.parse(bStart);
  const endB = Date.parse(bEnd);
  if (![startA, endA, startB, endB].every(Number.isFinite)) return false;
  return startA < endB && startB < endA;
}

function truckOverlapsLoad(
  truckId: number,
  driverId: number | null,
  load: AssignLoadFacts,
  others: OverlapLoad[],
): boolean {
  const here = windowBounds(load);
  for (const other of others) {
    if (other.id === load.id) continue;
    if (!OVERLAP_STATUSES.has(other.status as (typeof LOAD_STATUSES)[number])) continue;
    const sameTruck = other.truck_id === truckId;
    const sameDriver = driverId != null && other.driver_id === driverId;
    if (!sameTruck && !sameDriver) continue;
    const there = windowBounds(other);
    if (rangesOverlap(here.start, here.end, there.start, there.end)) return true;
  }
  return false;
}

function servicePhrase(truck: Truck): string | null {
  if (truck.active === 0) return "inactive";
  if (truck.status === "out_of_service") return "out of service";
  if (truck.status === "maintenance") return "in maintenance";
  return null;
}

function trailerCanAssign(trailer: Trailer): boolean {
  return trailer.active !== 0 && trailer.status !== "maintenance" && trailer.status !== "out_of_service";
}

function gpsAgePhrase(recordedAt: string, now: Date, quietHours: number): string | null {
  const trimmed = recordedAt.trim();
  if (!trimmed) return null;
  const ping = new Date(trimmed).getTime();
  if (!Number.isFinite(ping)) return null;
  const silentHours = (now.getTime() - ping) / 3_600_000;
  if (silentHours < quietHours) return null;
  if (silentHours >= 1) return `GPS ${Math.round(silentHours)}h old`;
  return `GPS ${Math.max(1, Math.round(silentHours * 60))}m old`;
}

function recordedAtFor(truck: TruckWithDriver, locations: GpsLocation[]): string {
  const live = locations.find((location) => {
    if (location.source !== "samsara") return false;
    if (location.truckId != null && location.truckId === truck.id) return true;
    return location.unitNumber === truck.unit_number;
  });
  return (live?.recordedAt || truck.gps_recorded_at || "").trim();
}

type ReeferFit = { phrase: string; penalty: number; trailerId: number | null };

function reeferFit(
  load: AssignLoadFacts,
  truck: TruckWithDriver,
  driver: Driver | null,
  trailers: Trailer[],
): ReeferFit {
  const needs = resolveReeferSpec({
    equipment: load.equipment,
    reefer_mode: load.reefer_mode,
    reefer_setpoint_f: load.reefer_setpoint_f,
    special_instructions: load.special_instructions,
    temperature_f: load.temperature_f,
  }).isReefer;
  if (!needs) {
    const last = driver?.last_trailer_id
      ? trailers.find((trailer) => trailer.id === driver.last_trailer_id && trailerCanAssign(trailer))
      : null;
    return { phrase: "reefer not needed", penalty: 0, trailerId: last?.id ?? null };
  }
  const reefers = trailers
    .filter((trailer) => trailer.type === "reefer" && trailerCanAssign(trailer))
    .sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }));
  const hooked = reefers.find((trailer) => trailer.truck_id === truck.id);
  if (hooked) return { phrase: `reefer ${hooked.unit_number}`, penalty: 0, trailerId: hooked.id };
  const last = driver?.last_trailer_id
    ? reefers.find((trailer) => trailer.id === driver.last_trailer_id)
    : undefined;
  if (last && (last.truck_id == null || last.truck_id === truck.id)) {
    return { phrase: `reefer ${last.unit_number}`, penalty: 0, trailerId: last.id };
  }
  const loose = reefers.find((trailer) => trailer.truck_id == null);
  if (loose) {
    return {
      phrase: `reefer ${loose.unit_number} available`,
      penalty: ASSIGN_SUGGESTION_WEIGHTS.reeferAvailable,
      trailerId: loose.id,
    };
  }
  const other = reefers.find((trailer) => trailer.truck_id != null && trailer.truck_id !== truck.id);
  if (other) {
    return {
      phrase: `reefer ${other.unit_number} on another truck`,
      penalty: ASSIGN_SUGGESTION_WEIGHTS.reeferOnAnotherTruck,
      trailerId: other.id,
    };
  }
  return { phrase: "no reefer", penalty: ASSIGN_SUGGESTION_WEIGHTS.reeferNone, trailerId: null };
}

function docsPhrase(
  driver: Driver | null,
  truck: Truck,
  trailer: Trailer | null,
  windows: ComplianceWindows | undefined,
  hardBlocks: (input: { driver?: Driver | null; truck?: Truck | null; trailer?: Trailer | null }) => string[],
): { phrase: string; penalty: number } {
  const alerts = collectAssignmentAlerts({ driver, truck, trailer }, windows);
  const label = complianceShortLabel(alerts);
  const blocked = hardBlocks({ driver, truck, trailer }).length > 0;
  if (label === "expired docs" || label === "failed test") {
    return { phrase: label === "failed test" ? "failed test" : "expired docs", penalty: ASSIGN_SUGGESTION_WEIGHTS.docsBlocked };
  }
  if (blocked) return { phrase: "docs blocked", penalty: ASSIGN_SUGGESTION_WEIGHTS.docsBlocked };
  if (label === "docs expiring") return { phrase: "docs expiring", penalty: ASSIGN_SUGGESTION_WEIGHTS.docsExpiring };
  return { phrase: "docs OK", penalty: 0 };
}

function hosDriveMs(
  truckId: number,
  driverId: number | null,
  hos: HosClock[],
  truckDrivers: SamsaraTruckDriver[],
): number | null {
  const clock = hosForAssignedTruck(
    {
      mode: "samsara",
      tokenSet: true,
      fetchedAt: "",
      locations: [],
      hos: hos.filter((row) => row.source === "samsara"),
      truckDrivers,
    },
    { id: truckId, assigned_driver_id: driverId },
  );
  if (!clock || clock.source !== "samsara" || clock.driveRemainingMs == null) return null;
  return clock.driveRemainingMs;
}

/** Roster link, then the live Samsara driver, then the driver on this truck's open load. */
function seatedDriverId(
  truck: TruckWithDriver,
  drivers: Driver[],
  others: OverlapLoad[],
  truckDrivers: SamsaraTruckDriver[],
): number | null {
  const live = truckDrivers.find((row) => row.truckId === truck.id)?.tmsDriverId ?? null;
  const fromLoad = others
    .filter((row) => row.truck_id === truck.id && row.driver_id != null)
    .sort((a, b) => String(b.pickup_start || "").localeCompare(String(a.pickup_start || "")))[0]?.driver_id;
  const candidates = [truck.assigned_driver_id, live, fromLoad];
  for (const id of candidates) {
    if (id == null) continue;
    if (drivers.some((driver) => driver.id === id)) return id;
  }
  return null;
}

function emptyMilesByUnit(points: MikeGpsPoint[], pickup: { lat: number; lng: number } | null, cities: CityLocation[]): Map<string, number> {
  if (!pickup || points.length === 0) return new Map();
  const ranked = rankTrucksToCoords(points, pickup.lat, pickup.lng, cities, Math.max(points.length, 1));
  return new Map(ranked.map((row) => [row.unit, row.miles]));
}

/**
 * Top truck suggestions for one load. Reuses Mike's closest-truck miles
 * (`rankTrucksToCoords`), Samsara HOS clocks, reefer fit, and assign-time compliance.
 * Nothing here is stored. Accepting or skipping a row does not change the next rank.
 */
export function rankAssignSuggestions(input: RankAssignSuggestionsInput): AssignSuggestion[] {
  const now = input.now ?? new Date();
  const quietHours = input.quietHours ?? 2;
  const windows = input.windows;
  const hardBlocks = input.hardBlocks ?? (() => []);
  const locations = input.gpsLocations ?? [];
  const cities = input.cityLocations ?? [];
  const points = mikeGpsPointsFromFleet({
    trucks: input.trucks,
    locations: locations.filter((location) => location.source === "samsara"),
  });
  const milesByUnit = emptyMilesByUnit(points, input.pickup, cities);
  const weights = ASSIGN_SUGGESTION_WEIGHTS;
  const rows: RankedRow[] = [];

  for (const truck of input.trucks) {
    const seatedId = seatedDriverId(truck, input.drivers, input.otherLoads, input.truckDrivers ?? []);
    const driver = seatedId != null ? input.drivers.find((item) => item.id === seatedId) ?? null : null;
    const driverSelectable = Boolean(driver && driver.active !== 0 && driver.status !== "off_duty");
    const chosenDriver = driverSelectable ? driver : null;
    const service = servicePhrase(truck);
    const overlapping = truckOverlapsLoad(truck.id, driver?.id ?? null, input.load, input.otherLoads);
    const miles = milesByUnit.get(truck.unit_number);
    const driveMs = hosDriveMs(truck.id, chosenDriver?.id ?? driver?.id ?? null, input.hos ?? [], input.truckDrivers ?? []);
    const fit = reeferFit(input.load, truck, chosenDriver, input.trailers);
    const trailer = fit.trailerId != null ? input.trailers.find((item) => item.id === fit.trailerId) ?? null : null;
    const docs = docsPhrase(chosenDriver, truck, trailer, windows, hardBlocks);
    const age = gpsAgePhrase(recordedAtFor(truck, locations), now, quietHours);

    let tier = 0;
    const blocks: string[] = [];
    if (service) {
      tier = 2;
      blocks.push(service);
    } else if (overlapping) {
      tier = 1;
      blocks.push("on overlapping load");
    } else if (!driver) {
      tier = 1;
      blocks.push("no driver");
    } else if (!driverSelectable) {
      tier = 1;
      blocks.push(driver?.status === "off_duty" ? "driver off duty" : "no driver");
    }

    const milesScore = miles ?? weights.unknownMiles;
    const driveHours = driveMs == null ? null : driveMs / 3_600_000;
    const hosScore =
      Math.max(0, weights.hosTargetHours - (driveHours ?? weights.unknownHosHours)) * weights.hosHourWeight;
    const score = milesScore + hosScore + fit.penalty + docs.penalty;

    const parts = [
      miles == null ? "miles unknown" : `${miles} empty mi`,
      input.pickup ? null : "pickup not on map",
      age,
      input.timedOut ? "live GPS timed out" : null,
      !input.tokenSet ? "no Samsara token" : null,
      miles == null && input.tokenSet && !input.timedOut && !age ? "no GPS" : null,
      driveMs == null ? "HOS unknown" : `${formatDurationMs(driveMs)} drive left`,
      fit.phrase,
      docs.phrase,
      ...blocks,
    ].filter((part): part is string => Boolean(part));

    rows.push({
      truckId: truck.id,
      driverId: driverSelectable ? driver?.id ?? null : null,
      trailerId: fit.trailerId,
      unit: truck.unit_number,
      driverName: driverSelectable ? driver?.name ?? "" : "",
      reason: parts.join(" · "),
      selectable: service == null,
      caution: tier > 0,
      tier,
      score,
    });
  }

  rows.sort(
    (a, b) => a.tier - b.tier || a.score - b.score || a.unit.localeCompare(b.unit, undefined, { numeric: true }),
  );
  const preferred = rows.filter((row) => row.tier < 2);
  const picked = (preferred.length >= ASSIGN_SUGGESTION_LIMIT ? preferred : rows).slice(0, ASSIGN_SUGGESTION_LIMIT);
  return picked.map((row) => ({
    truckId: row.truckId,
    driverId: row.driverId,
    trailerId: row.trailerId,
    unit: row.unit,
    driverName: row.driverName,
    reason: row.reason,
    selectable: row.selectable,
    caution: row.caution,
  }));
}

function listOverlapLoads(): OverlapLoad[] {
  return getDb()
    .prepare(
      `SELECT id, truck_id, driver_id, status, pickup_start, pickup_end, delivery_start, delivery_end
       FROM loads
       WHERE status NOT IN ('delivered', 'completed', 'accounting', 'cancelled')`,
    )
    .all() as OverlapLoad[];
}

/** Rank every load on the board from a fleet snapshot the page already loaded. */
export function suggestAssignmentsForBoard(input: {
  loads: LoadView[];
  fleet: SamsaraFleetResult;
  trucks?: TruckWithDriver[];
  drivers?: Driver[];
  trailers?: Trailer[];
  now?: Date;
  timedOut?: boolean;
}): Map<number, AssignSuggestion[]> {
  const trucks = input.trucks ?? listTrucks();
  const drivers = input.drivers ?? listDrivers();
  const trailers = input.trailers ?? listTrailers();
  const locations = listLocations();
  const pickupByLoad = new Map(listPickupStops().map((stop) => [stop.load_id, stop]));
  const otherLoads = listOverlapLoads();
  const windows = complianceWindows();
  const workflow = getWorkflowSettings();
  const quietHours = getCompanySettings().alert_gps_quiet_hours || 2;
  const timedOut = input.timedOut ?? /did not answer|timed out/i.test(input.fleet.error ?? "");
  const tokenSet = input.fleet.mode === "samsara" && input.fleet.tokenSet;
  const suggestions = new Map<number, AssignSuggestion[]>();
  for (const load of input.loads) {
    const stop = pickupByLoad.get(load.id) ?? null;
    suggestions.set(
      load.id,
      rankAssignSuggestions({
        load,
        pickup: pickupPointForSuggestion(load, stop, locations),
        trucks,
        drivers,
        trailers,
        otherLoads,
        gpsLocations: input.fleet.locations,
        hos: input.fleet.hos,
        truckDrivers: input.fleet.truckDrivers,
        cityLocations: locations.map((location) => ({
          name: location.name,
          city: location.city,
          state: location.state,
          lat: location.latitude,
          lng: location.longitude,
        })),
        tokenSet,
        timedOut,
        quietHours,
        windows,
        hardBlocks: (assets) => assignmentHardBlocks(assets, workflow),
        now: input.now,
      }),
    );
  }
  return suggestions;
}
