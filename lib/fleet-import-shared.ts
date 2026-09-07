/** Client-safe fleet bulk-import types and matching. No env, db, or secrets. */

export const SAMSARA_TOKEN_MISSING_MESSAGE = "Samsara is not connected.";

export const SAMSARA_ID_MISSING_MESSAGE =
  "No Samsara ID on this truck — Import from Samsara or paste the vehicle id.";

export const ORBCOMM_CREDS_OR_CSV_MESSAGE = "Orbcomm is not connected. Upload a spreadsheet or connect Orbcomm.";

export type SamsaraMatchBy = "vin" | "samsara_vehicle_id" | "unit_number" | "plate";

export type SamsaraTruckPreviewRow = {
  selectKey: string;
  samsaraVehicleId: string;
  unitNumber: string;
  name: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  plate: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  tmsUnit: string;
  matchTruckId: number | null;
  matchBy: SamsaraMatchBy | null;
  action: "create" | "update";
};

export type OrbcommTrailerPreviewRow = {
  selectKey: string;
  orbcommAssetId: string;
  unitNumber: string;
  name: string;
  vin: string;
  plate: string;
  type: string;
  city: string;
  note: string;
  recordedAt: string;
  latitude: number | null;
  longitude: number | null;
  matchTrailerId: number | null;
  matchBy: "orbcomm_asset_id" | "unit_number" | null;
  action: "create" | "update";
};

export type FleetImportPreviewState<T> = {
  ok: boolean;
  error?: string;
  warning?: string;
  source?: "samsara" | "orbcomm_api" | "orbcomm_csv";
  rows?: T[];
  created?: number;
  updated?: number;
  skipped?: number;
  message?: string;
};

export type SamsaraVehicleInput = {
  id: string;
  name: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  licensePlate: string;
  extraKeys?: string[];
  latitude?: number | null;
  longitude?: number | null;
  city?: string;
  driverId?: string;
  driverName?: string;
  notes?: string;
  active?: boolean;
};

export type SamsaraMatchTruck = {
  id: number;
  unit_number: string;
  samsara_vehicle_id: string;
  vin?: string;
  plate?: string;
};

export type SamsaraMatchVehicle = {
  samsaraVehicleId: string;
  unitNumber?: string;
  name?: string;
  vin?: string;
  licensePlate?: string;
  extraKeys?: string[];
};

export type OrbcommAssetInput = {
  assetId: string;
  unitNumber: string;
  name: string;
  vin: string;
  plate: string;
  type: string;
  city?: string;
  note?: string;
  recordedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export function normalizeFleetKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-#]/g, "");
}

/** Numeric unit keys ignore leading zeros. UUIDs are unchanged. */
export function canonicalFleetKey(value: string): string {
  const key = normalizeFleetKey(value);
  if (/^\d+$/.test(key)) return key.replace(/^0+/, "") || "0";
  return key;
}

export function normalizeVin(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function normalizePlate(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Digits only so labeled names like Truck 12 or #12 match the same TMS unit. Does not tokenize UUIDs. */
export function unitDigits(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

function isYearToken(value: string): boolean {
  return /^(19|20)\d{2}$/.test(value);
}

/** Distinct fleet-unit numbers in a label. Skips years and 8+ digit ids so "2024 Freightliner 28" is 28, not 202428. */
export function fleetUnitTokens(value: string): string[] {
  const text = String(value ?? "");
  if (!text.trim()) return [];
  const tokens: string[] = [];
  const add = (raw: string) => {
    const token = unitDigits(raw);
    if (!token || token.length >= 8 || isYearToken(token) || tokens.includes(token)) return;
    tokens.push(token);
  };
  for (const match of text.matchAll(/(?:unit|truck|tractor|trk|veh(?:icle)?)\s*#?\s*([A-Za-z0-9-]+)/gi)) {
    add(match[1] ?? "");
  }
  for (const match of text.matchAll(/#\s*([A-Za-z0-9-]+)/g)) {
    add(match[1] ?? "");
  }
  for (const match of text.matchAll(/(?<![A-Za-z0-9])(\d+)(?![A-Za-z0-9])/g)) {
    add(match[1] ?? "");
  }
  return tokens;
}

function samsaraUnitTokenSet(vehicle: SamsaraMatchVehicle): string[] {
  const tokens: string[] = [];
  const add = (value: string | undefined) => {
    for (const token of fleetUnitTokens(String(value ?? ""))) {
      if (!tokens.includes(token)) tokens.push(token);
    }
  };
  add(vehicle.unitNumber);
  add(vehicle.name);
  for (const key of vehicle.extraKeys ?? []) add(key);
  return tokens;
}

export function preferFilled(existing: string, incoming: string): string {
  return existing.trim() ? existing : incoming.trim();
}

/** Use Samsara vehicle name as the unit #; strip Unit/Truck/Tractor/# labels and years. */
export function unitNumberFromSamsaraName(name: string, fallbackId: string): string {
  const trimmed = name.trim();
  if (!trimmed) return fallbackId.trim();
  const labeled = trimmed.match(/(?:unit|truck|tractor|trk|veh(?:icle)?)\s*#?\s*([A-Za-z0-9-]+)/i);
  if (labeled?.[1] && !isYearToken(unitDigits(labeled[1]))) return labeled[1];
  const hashed = trimmed.match(/#\s*([A-Za-z0-9-]+)/);
  if (hashed?.[1]) return hashed[1];
  if (/^\d+[A-Za-z0-9-]*$/.test(trimmed) && !isYearToken(unitDigits(trimmed))) {
    return unitDigits(trimmed) || trimmed;
  }
  const tokens = fleetUnitTokens(trimmed);
  if (tokens.length === 1) return tokens[0];
  const leading = trimmed.match(/^(\d+[A-Za-z0-9-]*)\b/);
  if (leading?.[1] && !isYearToken(unitDigits(leading[1]))) return leading[1];
  if (tokens.length > 1) return tokens[tokens.length - 1];
  return trimmed;
}

export function samsaraUnitDigits(vehicle: SamsaraMatchVehicle): string {
  return samsaraExactUnit(vehicle);
}

/** One unit number only. Names that mention two units (28 vs 38) do not count as exact. */
export function samsaraExactUnit(vehicle: { unitNumber?: string; name?: string; extraKeys?: string[] }): string {
  const tokens = samsaraUnitTokenSet({
    samsaraVehicleId: "",
    unitNumber: vehicle.unitNumber,
    name: vehicle.name,
  });
  return tokens.length === 1 ? tokens[0] : "";
}

function unitAgrees(truck: SamsaraMatchTruck, vehicle: SamsaraMatchVehicle): boolean {
  const exact = samsaraExactUnit(vehicle);
  const truckUnit = unitDigits(truck.unit_number);
  if (!exact || !truckUnit) return !exact;
  return exact === truckUnit;
}

function uniqueUnclaimedTruck(
  trucks: SamsaraMatchTruck[],
  claimedTruckIds: Set<number> | undefined,
  predicate: (truck: SamsaraMatchTruck) => boolean,
): SamsaraMatchTruck | null {
  const hits = trucks.filter((truck) => !claimedTruckIds?.has(truck.id) && predicate(truck));
  return hits.length === 1 ? hits[0] : null;
}

/** After import, live GPS follows the stored Samsara vehicle id even if the name has other digits. */
export function matchLinkedSamsaraVehicle(
  trucks: SamsaraMatchTruck[],
  vehicleId: string,
  claimedTruckIds?: Set<number>,
): SamsaraMatchTruck | null {
  const id = canonicalFleetKey(vehicleId);
  if (!id) return null;
  return uniqueUnclaimedTruck(
    trucks,
    claimedTruckIds,
    (truck) => Boolean(truck.samsara_vehicle_id?.trim()) && canonicalFleetKey(truck.samsara_vehicle_id) === id,
  );
}

export function matchTruckForSamsara(
  trucks: SamsaraMatchTruck[],
  vehicle: SamsaraMatchVehicle,
  claimedTruckIds?: Set<number>,
): { id: number; matchBy: SamsaraMatchBy } | null {
  const vin = normalizeVin(vehicle.vin ?? "");
  if (vin) {
    const byVin = uniqueUnclaimedTruck(
      trucks,
      claimedTruckIds,
      (truck) => normalizeVin(truck.vin ?? "") === vin && unitAgrees(truck, vehicle),
    );
    if (byVin) return { id: byVin.id, matchBy: "vin" };
  }

  const exactUnit = samsaraExactUnit(vehicle);
  if (exactUnit) {
    const byUnit = uniqueUnclaimedTruck(
      trucks,
      claimedTruckIds,
      (truck) => unitDigits(truck.unit_number) === exactUnit,
    );
    if (byUnit) return { id: byUnit.id, matchBy: "unit_number" };
  }

  const plate = normalizePlate(vehicle.licensePlate ?? "");
  if (plate) {
    const byPlate = uniqueUnclaimedTruck(
      trucks,
      claimedTruckIds,
      (truck) => normalizePlate(truck.plate ?? "") === plate && unitAgrees(truck, vehicle),
    );
    if (byPlate) return { id: byPlate.id, matchBy: "plate" };
  }

  const vehicleId = canonicalFleetKey(vehicle.samsaraVehicleId);
  if (vehicleId) {
    const byId = uniqueUnclaimedTruck(
      trucks,
      claimedTruckIds,
      (truck) => canonicalFleetKey(truck.samsara_vehicle_id) === vehicleId && unitAgrees(truck, vehicle),
    );
    if (byId) return { id: byId.id, matchBy: "samsara_vehicle_id" };
  }

  return null;
}

/**
 * Live GPS / HOS / driver follow the stored Samsara vehicle id. If that id's
 * payload is wrong in Samsara, the TMS still shows it — do not rematch by unit
 * or name. VIN is a fallback only when the TMS row has no stored id yet.
 */
export function matchTruckForSamsaraLive(
  trucks: SamsaraMatchTruck[],
  vehicle: SamsaraMatchVehicle,
  claimedTruckIds?: Set<number>,
): { id: number; matchBy: SamsaraMatchBy } | null {
  const vehicleId = canonicalFleetKey(vehicle.samsaraVehicleId);
  if (vehicleId) {
    const byId = uniqueUnclaimedTruck(
      trucks,
      claimedTruckIds,
      (truck) => Boolean(truck.samsara_vehicle_id?.trim()) && canonicalFleetKey(truck.samsara_vehicle_id) === vehicleId,
    );
    if (byId) return { id: byId.id, matchBy: "samsara_vehicle_id" };
  }

  const vin = normalizeVin(vehicle.vin ?? "");
  if (vin) {
    const byVin = uniqueUnclaimedTruck(
      trucks,
      claimedTruckIds,
      (truck) => !truck.samsara_vehicle_id?.trim() && normalizeVin(truck.vin ?? "") === vin,
    );
    if (byVin) return { id: byVin.id, matchBy: "vin" };
  }

  return null;
}

export function samsaraVehicleMatchesTruck(
  truck: SamsaraMatchTruck,
  vehicle: { id?: string; samsaraVehicleId?: string; name?: string; unitNumber?: string; vin?: string; licensePlate?: string; extraKeys?: string[] },
): boolean {
  return (
    matchTruckForSamsara([truck], {
      samsaraVehicleId: vehicle.samsaraVehicleId || vehicle.id || "",
      unitNumber: vehicle.unitNumber,
      name: vehicle.name,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      extraKeys: vehicle.extraKeys,
    })?.id === truck.id
  );
}

export function matchTrailerForOrbcomm(
  trailers: Array<{ id: number; unit_number: string; orbcomm_asset_id: string }>,
  asset: { orbcommAssetId: string; unitNumber: string; name?: string },
): { id: number; matchBy: "orbcomm_asset_id" | "unit_number" } | null {
  const unitKeys = [asset.unitNumber, asset.name ?? ""].map(normalizeFleetKey).filter(Boolean);
  if (unitKeys.length) {
    const byUnit = trailers.find((trailer) => unitKeys.includes(normalizeFleetKey(trailer.unit_number)));
    if (byUnit) return { id: byUnit.id, matchBy: "unit_number" };
  }
  const assetId = normalizeFleetKey(asset.orbcommAssetId);
  if (assetId) {
    const byId = trailers.find((trailer) => normalizeFleetKey(trailer.orbcomm_asset_id) === assetId);
    if (byId) return { id: byId.id, matchBy: "orbcomm_asset_id" };
  }
  return null;
}

export function buildSamsaraTruckPreview(
  vehicles: SamsaraVehicleInput[],
  trucks: SamsaraMatchTruck[],
): SamsaraTruckPreviewRow[] {
  const rows: SamsaraTruckPreviewRow[] = [];
  const claimedTruckIds = new Set<number>();
  const seenVehicle = new Set<string>();
  const truckById = new Map(trucks.map((truck) => [truck.id, truck]));

  for (const vehicle of keepActiveSamsaraVehicles(vehicles)) {
    const samsaraVehicleId = vehicle.id.trim();
    const name = vehicle.name.trim();
    const unitNumber = unitNumberFromSamsaraName(name, samsaraVehicleId || vehicle.vin.trim());
    if (!samsaraVehicleId && !unitNumber) continue;
    const dedupe = normalizeFleetKey(samsaraVehicleId || unitNumber);
    if (dedupe && seenVehicle.has(dedupe)) continue;
    if (dedupe) seenVehicle.add(dedupe);
    const match = matchTruckForSamsara(
      trucks,
      {
        samsaraVehicleId,
        unitNumber,
        name,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate,
        extraKeys: vehicle.extraKeys,
      },
      claimedTruckIds,
    );
    if (match) claimedTruckIds.add(match.id);
    const tms = match ? truckById.get(match.id) : undefined;
    rows.push({
      selectKey: samsaraVehicleId || unitNumber,
      samsaraVehicleId,
      unitNumber,
      name: name || unitNumber,
      vin: vehicle.vin.trim(),
      year: vehicle.year.trim(),
      make: vehicle.make.trim(),
      model: vehicle.model.trim(),
      plate: vehicle.licensePlate.trim(),
      city: String(vehicle.city ?? "").trim(),
      latitude: vehicle.latitude ?? null,
      longitude: vehicle.longitude ?? null,
      tmsUnit: tms?.unit_number ?? "",
      matchTruckId: match?.id ?? null,
      matchBy: match?.matchBy ?? null,
      action: match ? "update" : "create",
    });
  }
  return rows;
}

export function samsaraReturnedNames(vehicles: Array<{ id?: string; name?: string }>): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const vehicle of vehicles) {
    const label = String(vehicle.name || vehicle.id || "").trim();
    if (!label) continue;
    const key = normalizeFleetKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(label);
  }
  return names;
}

/** When a TMS unit is not in the Samsara list, say which names did come back. */
export function samsaraUnmatchedUnitsWarning(
  trucks: SamsaraMatchTruck[],
  vehicles: Array<{
    id?: string;
    samsaraVehicleId?: string;
    name?: string;
    unitNumber?: string;
    vin?: string;
    licensePlate?: string;
    extraKeys?: string[];
  }>,
): string {
  if (vehicles.length === 0) return "";
  const unmatched = trucks
    .filter((truck) => truck.unit_number.trim() || truck.samsara_vehicle_id.trim() || truck.vin?.trim() || truck.plate?.trim())
    .filter((truck) => !vehicles.some((vehicle) => samsaraVehicleMatchesTruck(truck, vehicle)))
    .map((truck) => truck.unit_number.trim() || truck.samsara_vehicle_id.trim())
    .filter(Boolean);
  if (unmatched.length === 0) return "";
  const names = samsaraReturnedNames(vehicles);
  const units = [...new Set(unmatched)].join(", ");
  const listed = names.length ? names.join(", ") : "none";
  return `Samsara returned vehicles but none matched these TMS units: ${units}. Names that came back: ${listed}.`;
}

/** Vehicles Samsara sent that never made it into the import preview. */
export function samsaraOmittedVehiclesWarning(
  vehicles: SamsaraVehicleInput[],
  previewRows: Array<{ samsaraVehicleId?: string; unitNumber?: string; name?: string }>,
): string {
  if (vehicles.length === 0) return "";
  const previewed = new Set(
    previewRows.flatMap((row) =>
      [row.samsaraVehicleId, row.unitNumber, row.name]
        .map((value) => canonicalFleetKey(String(value ?? "")))
        .filter(Boolean),
    ),
  );
  const omitted = vehicles.filter((vehicle) => {
    const keys = [vehicle.id, vehicle.name, vehicle.vin].map((value) => canonicalFleetKey(String(value ?? ""))).filter(Boolean);
    return keys.length > 0 && !keys.some((key) => previewed.has(key));
  });
  if (omitted.length === 0) return "";
  const names = samsaraReturnedNames(omitted);
  return `Samsara returned vehicles that were not listed for import: ${names.length ? names.join(", ") : "unnamed"}.`;
}

const INACTIVE_STATUS = /^(inactive|deactivated|retired|archived|deleted|historical|old)$/i;
const INACTIVE_LABEL = /\b(inactive|deactivated|retired|archived|deleted|historical|old)\b/i;
const INACTIVE_OLD_UNIT = /\bold(?:\s+(?:unit|truck|tractor|veh(?:icle)?)|#)?\s*#?\s*\d+/i;

/**
 * Samsara's vehicle object has no official isDeactivated query or field
 * (GET /fleet/vehicles returns every record; retired units are marked on
 * name, notes, or tags). Honor those labels plus driver-style status fields
 * when a payload includes them.
 */
export function samsaraRecordIsActive(item: Record<string, unknown>): boolean {
  const nested = (item.vehicle ?? item.staticAssignedVehicle ?? {}) as Record<string, unknown>;
  if (item.isDeactivated === true || nested.isDeactivated === true) return false;
  if (item.deactivated === true || nested.deactivated === true) return false;
  for (const key of ["deactivatedAt", "deactivatedAtTime", "deactivated_at", "deactivatedAtTime"]) {
    if (asText(item[key]) || asText(nested[key])) return false;
  }
  const status = firstText(item, nested, [
    "status",
    "vehicleStatus",
    "activationStatus",
    "vehicleActivationStatus",
    "assetStatus",
    "driverActivationStatus",
  ]);
  if (status && INACTIVE_STATUS.test(status)) return false;
  for (const label of samsaraRecordLabels(item, nested)) {
    if (INACTIVE_LABEL.test(label) || INACTIVE_OLD_UNIT.test(label)) return false;
  }
  return true;
}

export function samsaraVehicleIsActive(vehicle: Pick<SamsaraVehicleInput, "active" | "name" | "notes">): boolean {
  if (vehicle.active === false) return false;
  return samsaraRecordIsActive({ name: vehicle.name, notes: vehicle.notes ?? "" });
}

export function keepActiveSamsaraVehicles(vehicles: SamsaraVehicleInput[]): SamsaraVehicleInput[] {
  const inactiveIds = new Set<string>();
  const inactiveUnits = new Set<string>();
  for (const vehicle of vehicles) {
    if (samsaraVehicleIsActive(vehicle)) continue;
    const id = canonicalFleetKey(vehicle.id);
    if (id) inactiveIds.add(id);
    const unit = samsaraExactUnit(vehicle);
    if (unit) inactiveUnits.add(unit);
  }
  return vehicles.filter((vehicle) => {
    if (!samsaraVehicleIsActive(vehicle)) return false;
    const id = canonicalFleetKey(vehicle.id);
    if (id && inactiveIds.has(id)) return false;
    const unit = samsaraExactUnit(vehicle);
    if (unit && inactiveUnits.has(unit) && isBareSamsaraUnitEcho(vehicle, unit)) return false;
    return true;
  });
}

function isBareSamsaraUnitEcho(vehicle: SamsaraVehicleInput, unit: string): boolean {
  if (vehicle.vin?.trim() || vehicle.licensePlate?.trim() || vehicle.notes?.trim()) return false;
  const tokens = fleetUnitTokens(vehicle.name);
  return tokens.length === 1 && tokens[0] === unit;
}

export function unionSamsaraVehicles(
  primary: SamsaraVehicleInput[],
  extra: SamsaraVehicleInput[],
): SamsaraVehicleInput[] {
  const out = [...primary];
  const seen = new Set(
    primary
      .map((vehicle) => canonicalFleetKey(vehicle.id) || normalizeFleetKey(vehicle.name))
      .filter(Boolean),
  );
  for (const vehicle of extra) {
    const key = canonicalFleetKey(vehicle.id) || normalizeFleetKey(vehicle.name);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(vehicle);
  }
  return out;
}

/** Identity list plus GPS stats, minus inactive units and stats echoes of those units. */
export function unionActiveSamsaraVehicles(
  identity: SamsaraVehicleInput[],
  stats: SamsaraVehicleInput[],
): SamsaraVehicleInput[] {
  const inactiveIds = new Set<string>();
  const inactiveUnits = new Set<string>();
  for (const vehicle of identity) {
    if (samsaraVehicleIsActive(vehicle)) continue;
    const id = canonicalFleetKey(vehicle.id);
    if (id) inactiveIds.add(id);
    const unit = samsaraExactUnit(vehicle);
    if (unit) inactiveUnits.add(unit);
  }
  const activeIdentity = identity.filter((vehicle) => samsaraVehicleIsActive(vehicle));
  const seen = new Set(
    identity
      .map((vehicle) => canonicalFleetKey(vehicle.id) || normalizeFleetKey(vehicle.name))
      .filter(Boolean),
  );
  const extras: SamsaraVehicleInput[] = [];
  for (const vehicle of stats) {
    const key = canonicalFleetKey(vehicle.id) || normalizeFleetKey(vehicle.name);
    if (key && seen.has(key)) continue;
    if (key && inactiveIds.has(key)) continue;
    if (!samsaraVehicleIsActive(vehicle)) continue;
    const unit = samsaraExactUnit(vehicle);
    if (unit && inactiveUnits.has(unit)) continue;
    if (key) seen.add(key);
    extras.push(vehicle);
  }
  return keepActiveSamsaraVehicles([...activeIdentity, ...extras]);
}

export function inactiveSamsaraVehicleIds(vehicles: SamsaraVehicleInput[]): Set<string> {
  return new Set(
    vehicles
      .filter((vehicle) => !samsaraVehicleIsActive(vehicle))
      .map((vehicle) => canonicalFleetKey(vehicle.id))
      .filter(Boolean),
  );
}

export function inactiveSamsaraUnits(vehicles: SamsaraVehicleInput[]): Set<string> {
  return new Set(
    vehicles
      .filter((vehicle) => !samsaraVehicleIsActive(vehicle))
      .map((vehicle) => samsaraExactUnit(vehicle))
      .filter(Boolean),
  );
}

export function buildOrbcommTrailerPreview(
  assets: OrbcommAssetInput[],
  trailers: Array<{ id: number; unit_number: string; orbcomm_asset_id: string }>,
): OrbcommTrailerPreviewRow[] {
  const rows: OrbcommTrailerPreviewRow[] = [];
  const seen = new Set<string>();
  for (const asset of assets) {
    const orbcommAssetId = asset.assetId.trim();
    const name = asset.name.trim();
    const unitNumber = (asset.unitNumber || name || orbcommAssetId).trim();
    if (!orbcommAssetId && !unitNumber) continue;
    const dedupe = normalizeFleetKey(orbcommAssetId || unitNumber);
    if (dedupe && seen.has(dedupe)) continue;
    if (dedupe) seen.add(dedupe);
    const match = matchTrailerForOrbcomm(trailers, { orbcommAssetId, unitNumber, name });
    rows.push({
      selectKey: orbcommAssetId || unitNumber,
      orbcommAssetId,
      unitNumber,
      name: name || unitNumber,
      vin: asset.vin.trim(),
      plate: asset.plate.trim(),
      type: inferTrailerType(asset.type),
      city: String(asset.city ?? "").trim(),
      note: String(asset.note ?? "").trim(),
      recordedAt: String(asset.recordedAt ?? "").trim(),
      latitude: asset.latitude ?? null,
      longitude: asset.longitude ?? null,
      matchTrailerId: match?.id ?? null,
      matchBy: match?.matchBy ?? null,
      action: match ? "update" : "create",
    });
  }
  return rows;
}

export function inferTrailerType(value: string): string {
  const key = normalizeFleetKey(value);
  if (!key) return "reefer";
  if (/(dry|van|dryvan)/.test(key)) return "dry_van";
  if (/flat/.test(key)) return "flatbed";
  if (/reef|temp|cold/.test(key)) return "reefer";
  if (/other/.test(key)) return "other";
  return "reefer";
}

export function parseSamsaraVehicleRecords(items: Array<Record<string, unknown>>): SamsaraVehicleInput[] {
  const vehicles: SamsaraVehicleInput[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const nested = (item.vehicle ?? item.staticAssignedVehicle ?? {}) as Record<string, unknown>;
    const id = firstText(item, nested, ["id", "vehicleId", "vehicle_id"]);
    const name = firstText(item, nested, ["name", "vehicleName", "vehicle_name"]);
    const vin = firstText(item, nested, ["vin", "vehicleVin", "vehicle_vin"]);
    const licensePlate = firstText(item, nested, ["licensePlate", "license_plate", "licensePlateNumber"]);
    if (!id && !name && !vin && !licensePlate) continue;
    const key = normalizeFleetKey(id || name);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const gps = (item.gps ?? nested.gps ?? {}) as Record<string, unknown>;
    const reverse = (gps.reverseGeo ?? {}) as Record<string, unknown>;
    const driver = (item.staticAssignedDriver ??
      nested.staticAssignedDriver ??
      item.driver ??
      nested.driver ??
      {}) as Record<string, unknown>;
    vehicles.push({
      id,
      name,
      vin,
      year: firstText(item, nested, ["year", "vehicleYear"]),
      make: firstText(item, nested, ["make", "vehicleMake"]),
      model: firstText(item, nested, ["model", "vehicleModel"]),
      licensePlate,
      extraKeys: extraSamsaraIdentityKeys(item, nested),
      latitude: asOptionalNumber(gps.latitude),
      longitude: asOptionalNumber(gps.longitude),
      city:
        typeof reverse.formattedLocation === "string"
          ? reverse.formattedLocation
          : firstText(item, nested, ["location", "city"]),
      driverId: firstText(driver, {}, ["id", "driverId", "driver_id"]),
      driverName: firstText(driver, {}, ["name", "driverName", "driver_name"]),
      notes: firstText(item, nested, ["notes", "note"]),
      active: samsaraRecordIsActive(item),
    });
  }
  return vehicles;
}

export function parseOrbcommFleetText(text: string): OrbcommAssetInput[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed
        ? ((parsed as Record<string, unknown>).data ??
            (parsed as Record<string, unknown>).assets ??
            (parsed as Record<string, unknown>).rows ??
            (parsed as Record<string, unknown>).result ??
            [])
        : [];
    return Array.isArray(rows)
      ? rows.map(orbcommAssetFromUnknown).filter(hasOrbcommIdentity)
      : [];
  }
  return parseOrbcommFleetCsv(trimmed);
}

function parseOrbcommFleetCsv(text: string): OrbcommAssetInput[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, "").trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const { index: headerIdx, delimiter } = findOrbcommHeader(lines);
  if (headerIdx >= lines.length - 1) return [];
  const headers = splitCsvLine(lines[headerIdx], delimiter).map((header) => normalizeHeader(header));
  return lines
    .slice(headerIdx + 1)
    .map((line) => {
      const values = splitCsvLine(line, delimiter);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return orbcommAssetFromUnknown(row);
    })
    .filter(hasOrbcommIdentity);
}

const ORBCOMM_HEADER_HINTS = new Set([
  "asset",
  "asset id",
  "assetid",
  "asset name",
  "trailer",
  "trailer number",
  "trailer id",
  "unit",
  "unit number",
  "mobile",
  "mobile id",
  "device",
  "device id",
  "device serial",
  "serial",
  "vehicle",
  "name",
  "vin",
  "latitude",
  "lat",
  "longitude",
  "lng",
  "lon",
  "long",
  "city",
  "address",
  "location",
]);

function orbcommHeaderHits(headers: string[]): number {
  return headers.filter((header) => {
    const key = normalizeHeader(header);
    if (!key) return false;
    if (ORBCOMM_HEADER_HINTS.has(key)) return true;
    return key.split(" ").some((part) => ORBCOMM_HEADER_HINTS.has(part));
  }).length;
}

function findOrbcommHeader(lines: string[]): { index: number; delimiter: string } {
  const delimiters = [",", "\t", ";"] as const;
  const limit = Math.min(lines.length, 40);
  for (let i = 0; i < limit; i++) {
    for (const delimiter of delimiters) {
      const cells = splitCsvLine(lines[i], delimiter);
      if (normalizeHeader(cells[0] ?? "") === "asset id" && cells.length >= 2) {
        return { index: i, delimiter };
      }
    }
  }
  let best = { index: 0, delimiter: ",", hits: 0 };
  for (let i = 0; i < limit; i++) {
    for (const delimiter of delimiters) {
      const hits = orbcommHeaderHits(splitCsvLine(lines[i], delimiter));
      if (hits >= 2 && hits > best.hits) {
        best = { index: i, delimiter, hits };
      }
    }
  }
  if (best.hits >= 2) return { index: best.index, delimiter: best.delimiter };
  return { index: 0, delimiter: detectDelimiter(lines[0]) };
}

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0 };
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char in counts) counts[char] += 1;
  }
  return (Object.entries(counts).sort((left, right) => right[1] - left[1])[0] ?? [","])[0];
}

function emptyOrbcommAsset(): OrbcommAssetInput {
  return {
    assetId: "",
    unitNumber: "",
    name: "",
    vin: "",
    plate: "",
    type: "",
    city: "",
    note: "",
    recordedAt: "",
    latitude: null,
    longitude: null,
  };
}

export function orbcommAssetFromUnknown(value: unknown): OrbcommAssetInput {
  if (!value || typeof value !== "object") {
    return emptyOrbcommAsset();
  }
  const item = value as Record<string, unknown>;
  const deviceSerial = pickHeader(item, [
    "device serial number",
    "device serial",
    "serial number",
    "serial",
  ]);
  const assetIdColumn = pickHeader(item, [
    "asset id",
    "assetid",
    "asset_id",
    "orbcomm asset id",
    "orbcomm_asset_id",
    "assetId",
    "AssetId",
    "unitId",
    "mobile id",
    "mobileid",
    "device id",
    "deviceid",
    "device",
  ]);
  const unitNumber = pickHeader(item, [
    "trailer #",
    "trailer number",
    "trailernumber",
    "trailer_id",
    "trailerid",
    "trailer",
    "unit",
    "unit #",
    "unit number",
    "unitnumber",
    "unit_number",
    "name",
    "asset name",
    "assetname",
    "vehicle",
    "vehicle name",
    "vehiclename",
  ]);
  const assetId = deviceSerial || assetIdColumn;
  const name = pickHeader(item, [
    "name",
    "asset name",
    "assetname",
    "trailer",
    "trailer number",
    "vehicle",
    "vehicle name",
  ]);
  const city =
    pickHeader(item, ["city", "nearest city", "last city"]) ||
    pickHeader(item, [
      "address",
      "location",
      "formatted address",
      "formatted location",
      "last location",
      "last known location",
    ]);
  return {
    assetId: assetId || pickHeader(item, ["id", "ID"]),
    unitNumber: unitNumber || (deviceSerial ? assetIdColumn : "") || name || assetId,
    name: name || unitNumber,
    vin: pickHeader(item, ["vin", "vehicle identification", "vehicle identification number", "vehicle_vin"]),
    plate: pickHeader(item, ["plate", "license plate", "licenseplate", "license_plate"]),
    type: pickHeader(item, ["type", "asset type", "equipment type", "equipment", "trailer type"]),
    city,
    note: pickHeader(item, ["note", "notes", "comment"]),
    recordedAt: pickHeader(item, [
      "message time",
      "last message time",
      "last ping",
      "recorded at",
      "timestamp",
      "event time",
    ]),
    latitude: pickCoord(item, "lat"),
    longitude: pickCoord(item, "lng"),
  };
}

function pickCoord(item: Record<string, unknown>, kind: "lat" | "lng"): number | null {
  const wanted = kind === "lat" ? new Set(["latitude", "lat"]) : new Set(["longitude", "lng", "lon", "long"]);
  for (const [key, value] of Object.entries(item)) {
    const parts = normalizeHeader(key).split(" ").filter(Boolean);
    if (!parts.some((part) => wanted.has(part))) continue;
    const parsed = asOptionalNumber(value);
    if (parsed != null) return parsed;
  }
  return asOptionalNumber(kind === "lat" ? item.latitude ?? item.lat : item.longitude ?? item.lng ?? item.lon);
}

function hasOrbcommIdentity(row: OrbcommAssetInput): boolean {
  return Boolean(row.assetId || row.unitNumber || row.name);
}

function pickHeader(item: Record<string, unknown>, keys: string[]): string {
  const wanted = new Set(keys.map((key) => normalizeHeader(key)));
  for (const [key, value] of Object.entries(item)) {
    if (!wanted.has(normalizeHeader(key))) continue;
    const text = asText(value);
    if (text) return text;
  }
  return "";
}

function samsaraRecordLabels(item: Record<string, unknown>, nested: Record<string, unknown>): string[] {
  const labels: string[] = [];
  const add = (value: unknown) => {
    const text = asText(value);
    if (text) labels.push(text);
  };
  add(firstText(item, nested, ["name", "vehicleName", "vehicle_name"]));
  add(firstText(item, nested, ["notes", "note"]));
  for (const bag of [item.tags, nested.tags, item.tag, nested.tag]) {
    if (Array.isArray(bag)) {
      for (const tag of bag) {
        if (tag && typeof tag === "object") add((tag as Record<string, unknown>).name);
        else add(tag);
      }
    } else if (bag && typeof bag === "object") {
      add((bag as Record<string, unknown>).name);
    } else {
      add(bag);
    }
  }
  for (const bag of [item.attributes, nested.attributes]) {
    if (!Array.isArray(bag)) continue;
    for (const attr of bag) {
      if (!attr || typeof attr !== "object") continue;
      const rec = attr as Record<string, unknown>;
      add(rec.name);
      add(rec.value);
      if (Array.isArray(rec.stringValues)) rec.stringValues.forEach(add);
    }
  }
  return labels;
}

function extraSamsaraIdentityKeys(
  item: Record<string, unknown>,
  nested: Record<string, unknown>,
): string[] {
  const keys = [
    firstText(item, nested, ["serial", "unit", "unitNumber", "unit_number", "number"]),
  ];
  for (const bag of [item.externalIds, nested.externalIds, item.external_ids, nested.external_ids]) {
    if (!bag || typeof bag !== "object") continue;
    for (const value of Object.values(bag as Record<string, unknown>)) {
      const text = asText(value);
      if (text) keys.push(text);
    }
  }
  return keys.filter(Boolean);
}

function firstText(
  item: Record<string, unknown>,
  nested: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const text = asText(item[key]) || asText(nested[key]);
    if (text) return text;
  }
  return "";
}

function asText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function mergeSamsaraGpsOntoVehicles(
  vehicles: SamsaraVehicleInput[],
  stats: Array<{ id?: string; name?: string; gps?: Record<string, unknown> }>,
): SamsaraVehicleInput[] {
  return vehicles.map((vehicle) => {
    const row = stats.find(
      (item) => canonicalFleetKey(String(item.id ?? "")) === canonicalFleetKey(vehicle.id),
    );
    if (!row) return vehicle;
    const gps = (row.gps ?? {}) as Record<string, unknown>;
    const reverse = (gps.reverseGeo ?? {}) as Record<string, unknown>;
    return {
      ...vehicle,
      latitude: vehicle.latitude ?? asOptionalNumber(gps.latitude),
      longitude: vehicle.longitude ?? asOptionalNumber(gps.longitude),
      city:
        vehicle.city ||
        (typeof reverse.formattedLocation === "string" ? reverse.formattedLocation : ""),
    };
  });
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function splitCsvLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}
