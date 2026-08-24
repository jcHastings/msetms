/** Client-safe fleet bulk-import types and matching. No env, db, or secrets. */

export const SAMSARA_TOKEN_MISSING_MESSAGE =
  "Add SAMSARA_API_TOKEN to .env and restart.";

export const SAMSARA_ID_MISSING_MESSAGE =
  "No Samsara ID on this truck — Import from Samsara or paste the vehicle id.";

export const ORBCOMM_CREDS_OR_CSV_MESSAGE =
  "Add ORBCOMM_USERNAME and ORBCOMM_PASSWORD to .env and restart, or upload an ORBCOMM CSV/export.";

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

export function preferFilled(existing: string, incoming: string): string {
  return existing.trim() ? existing : incoming.trim();
}

/** Use Samsara vehicle name as the unit #; strip a leading Unit/Truck/Tractor/# label. */
export function unitNumberFromSamsaraName(name: string, fallbackId: string): string {
  const trimmed = name.trim();
  if (!trimmed) return fallbackId.trim();
  const labeled = trimmed.match(/^(?:unit|truck|tractor|trk|veh(?:icle)?)\s*#?\s*([A-Za-z0-9-]+)/i);
  if (labeled) return labeled[1];
  const hashed = trimmed.match(/#\s*([A-Za-z0-9-]+)/);
  if (hashed) return hashed[1];
  return trimmed;
}

export function samsaraUnitDigits(vehicle: SamsaraMatchVehicle): string {
  const labeled = unitNumberFromSamsaraName(vehicle.name ?? "", "");
  for (const value of [vehicle.unitNumber, labeled, vehicle.name]) {
    const digits = unitDigits(String(value ?? ""));
    if (digits) return digits;
  }
  for (const value of vehicle.extraKeys ?? []) {
    const digits = unitDigits(String(value ?? ""));
    if (digits) return digits;
  }
  return "";
}

function unitAgrees(truck: SamsaraMatchTruck, vehicle: SamsaraMatchVehicle): boolean {
  const vehicleUnit = samsaraUnitDigits(vehicle);
  const truckUnit = unitDigits(truck.unit_number);
  if (!vehicleUnit || !truckUnit) return true;
  if (vehicleUnit === truckUnit) return true;
  const idDigits = unitDigits(vehicle.samsaraVehicleId ?? "");
  if (idDigits && vehicleUnit === idDigits) return true;
  return vehicleUnit.length >= 8;
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

  const unit = samsaraUnitDigits(vehicle);
  if (unit) {
    const byUnit = uniqueUnclaimedTruck(trucks, claimedTruckIds, (truck) => unitDigits(truck.unit_number) === unit);
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
  const assetId = normalizeFleetKey(asset.orbcommAssetId);
  if (assetId) {
    const byId = trailers.find((trailer) => normalizeFleetKey(trailer.orbcomm_asset_id) === assetId);
    if (byId) return { id: byId.id, matchBy: "orbcomm_asset_id" };
  }
  const unitKeys = [asset.unitNumber, asset.name ?? "", asset.orbcommAssetId]
    .map(normalizeFleetKey)
    .filter(Boolean);
  if (unitKeys.length) {
    const byUnit = trailers.find((trailer) => unitKeys.includes(normalizeFleetKey(trailer.unit_number)));
    if (byUnit) return { id: byUnit.id, matchBy: "unit_number" };
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

  for (const vehicle of vehicles) {
    const samsaraVehicleId = vehicle.id.trim();
    const name = vehicle.name.trim();
    const unitNumber = unitNumberFromSamsaraName(name, samsaraVehicleId);
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
    if (!id && !name) continue;
    const key = normalizeFleetKey(id || name);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const gps = (item.gps ?? nested.gps ?? {}) as Record<string, unknown>;
    const reverse = (gps.reverseGeo ?? {}) as Record<string, unknown>;
    vehicles.push({
      id,
      name,
      vin: firstText(item, nested, ["vin", "vehicleVin", "vehicle_vin"]),
      year: firstText(item, nested, ["year", "vehicleYear"]),
      make: firstText(item, nested, ["make", "vehicleMake"]),
      model: firstText(item, nested, ["model", "vehicleModel"]),
      licensePlate: firstText(item, nested, ["licensePlate", "license_plate", "licensePlateNumber"]),
      extraKeys: extraSamsaraIdentityKeys(item, nested),
      latitude: asOptionalNumber(gps.latitude),
      longitude: asOptionalNumber(gps.longitude),
      city:
        typeof reverse.formattedLocation === "string"
          ? reverse.formattedLocation
          : firstText(item, nested, ["location", "city"]),
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
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => normalizeHeader(header));
  return lines
    .slice(1)
    .map((line) => {
      const values = splitCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return orbcommAssetFromUnknown(row);
    })
    .filter(hasOrbcommIdentity);
}

export function orbcommAssetFromUnknown(value: unknown): OrbcommAssetInput {
  if (!value || typeof value !== "object") {
    return { assetId: "", unitNumber: "", name: "", vin: "", plate: "", type: "" };
  }
  const item = value as Record<string, unknown>;
  const assetId = pickHeader(item, [
    "asset id",
    "assetid",
    "asset_id",
    "orbcomm asset id",
    "orbcomm_asset_id",
    "assetId",
    "AssetId",
    "unitId",
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
  ]);
  const name = pickHeader(item, ["name", "asset name", "assetname", "trailer", "trailer number"]);
  return {
    assetId: assetId || pickHeader(item, ["id", "ID"]),
    unitNumber: unitNumber || name || assetId,
    name: name || unitNumber,
    vin: pickHeader(item, ["vin", "vehicle identification", "vehicle identification number", "vehicle_vin"]),
    plate: pickHeader(item, ["plate", "license plate", "licenseplate", "license_plate"]),
    type: pickHeader(item, ["type", "equipment type", "equipment", "trailer type"]),
  };
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
      (item) =>
        canonicalFleetKey(String(item.id ?? "")) === canonicalFleetKey(vehicle.id) ||
        (item.name && normalizeFleetKey(String(item.name)) === normalizeFleetKey(vehicle.name)),
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

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}
