/** Client-safe fleet bulk-import types and matching. No env, db, or secrets. */

export const SAMSARA_TOKEN_MISSING_MESSAGE =
  "Add SAMSARA_API_TOKEN to .env and restart.";

export const SAMSARA_ID_MISSING_MESSAGE =
  "No Samsara ID on this truck — Import from Samsara or paste the vehicle id.";

export const ORBCOMM_CREDS_OR_CSV_MESSAGE =
  "Add ORBCOMM_USERNAME and ORBCOMM_PASSWORD to .env and restart, or upload an ORBCOMM CSV/export.";

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
  matchTruckId: number | null;
  matchBy: "samsara_vehicle_id" | "unit_number" | null;
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

export function preferFilled(existing: string, incoming: string): string {
  return existing.trim() ? existing : incoming.trim();
}

/** Use Samsara vehicle name as the unit #; strip a leading Unit/Truck/Tractor/# label. */
export function unitNumberFromSamsaraName(name: string, fallbackId: string): string {
  const trimmed = name.trim();
  if (!trimmed) return fallbackId.trim();
  const labeled = trimmed.match(/^(?:unit|truck|tractor)\s*#?\s*([A-Za-z0-9-]+)/i);
  if (labeled) return labeled[1];
  const hashed = trimmed.match(/#\s*([A-Za-z0-9-]+)/);
  if (hashed) return hashed[1];
  return trimmed;
}

function unitTokensFromText(...values: Array<string | undefined>): string[] {
  const tokens: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    tokens.push(text);
    tokens.push(unitNumberFromSamsaraName(text, ""));
    for (const part of text.match(/\b\d{1,6}\b/g) ?? []) tokens.push(part);
  }
  return tokens;
}

export function samsaraVehicleMatchKeys(vehicle: {
  id?: string;
  samsaraVehicleId?: string;
  name?: string;
  unitNumber?: string;
  extraKeys?: string[];
}): string[] {
  return [
    ...new Set(
      unitTokensFromText(
        vehicle.id,
        vehicle.samsaraVehicleId,
        vehicle.name,
        vehicle.unitNumber,
        ...(vehicle.extraKeys ?? []),
      )
        .map(normalizeFleetKey)
        .filter(Boolean),
    ),
  ];
}

export function truckSamsaraMatchKeys(truck: { unit_number: string; samsara_vehicle_id: string }): string[] {
  return [...new Set([truck.samsara_vehicle_id, truck.unit_number].map(normalizeFleetKey).filter(Boolean))];
}

export function samsaraVehicleMatchesTruck(
  truck: { unit_number: string; samsara_vehicle_id: string },
  vehicle: { id?: string; samsaraVehicleId?: string; name?: string; unitNumber?: string },
): boolean {
  const vehicleKeys = new Set(samsaraVehicleMatchKeys(vehicle));
  return truckSamsaraMatchKeys(truck).some((key) => vehicleKeys.has(key));
}

export function matchTruckForSamsara(
  trucks: Array<{ id: number; unit_number: string; samsara_vehicle_id: string }>,
  vehicle: { samsaraVehicleId: string; unitNumber: string; name?: string; extraKeys?: string[] },
): { id: number; matchBy: "samsara_vehicle_id" | "unit_number" } | null {
  const vehicleId = normalizeFleetKey(vehicle.samsaraVehicleId);
  if (vehicleId) {
    const byId = trucks.find((truck) => normalizeFleetKey(truck.samsara_vehicle_id) === vehicleId);
    if (byId) return { id: byId.id, matchBy: "samsara_vehicle_id" };
  }
  const unitKeys = samsaraVehicleMatchKeys(vehicle);
  if (unitKeys.length) {
    const byStoredId = trucks.find((truck) => unitKeys.includes(normalizeFleetKey(truck.samsara_vehicle_id)));
    if (byStoredId) return { id: byStoredId.id, matchBy: "samsara_vehicle_id" };
    const byUnit = trucks.find((truck) => unitKeys.includes(normalizeFleetKey(truck.unit_number)));
    if (byUnit) return { id: byUnit.id, matchBy: "unit_number" };
  }
  return null;
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
  trucks: Array<{ id: number; unit_number: string; samsara_vehicle_id: string }>,
): SamsaraTruckPreviewRow[] {
  const rows: SamsaraTruckPreviewRow[] = [];
  const seenVehicle = new Set<string>();
  for (const vehicle of vehicles) {
    const samsaraVehicleId = vehicle.id.trim();
    const name = vehicle.name.trim();
    const unitNumber = unitNumberFromSamsaraName(name, samsaraVehicleId);
    if (!samsaraVehicleId && !unitNumber) continue;
    const dedupe = normalizeFleetKey(samsaraVehicleId || unitNumber);
    if (dedupe && seenVehicle.has(dedupe)) continue;
    if (dedupe) seenVehicle.add(dedupe);
    const match = matchTruckForSamsara(trucks, {
      samsaraVehicleId,
      unitNumber,
      name,
      extraKeys: vehicle.extraKeys,
    });
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

/** When JC’s unit (112) is not in the Samsara list, say which names did come back. */
export function samsaraUnmatchedUnitsWarning(
  trucks: Array<{ unit_number: string; samsara_vehicle_id: string }>,
  vehicles: Array<{ id?: string; samsaraVehicleId?: string; name?: string; unitNumber?: string; extraKeys?: string[] }>,
): string {
  if (vehicles.length === 0) return "";
  const unmatched = trucks
    .filter((truck) => truckSamsaraMatchKeys(truck).length > 0)
    .filter((truck) => !vehicles.some((vehicle) => samsaraVehicleMatchesTruck(truck, vehicle)))
    .map((truck) => truck.unit_number.trim() || truck.samsara_vehicle_id.trim())
    .filter(Boolean);
  if (unmatched.length === 0) return "";
  const names = samsaraReturnedNames(vehicles);
  const units = [...new Set(unmatched)].join(", ");
  const listed = names.length ? names.join(", ") : "none";
  return `Samsara returned vehicles but none matched unit ${units}. Names that came back: ${listed}.`;
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
    vehicles.push({
      id,
      name,
      vin: firstText(item, nested, ["vin", "vehicleVin", "vehicle_vin"]),
      year: firstText(item, nested, ["year", "vehicleYear"]),
      make: firstText(item, nested, ["make", "vehicleMake"]),
      model: firstText(item, nested, ["model", "vehicleModel"]),
      licensePlate: firstText(item, nested, ["licensePlate", "license_plate", "licensePlateNumber"]),
      extraKeys: extraSamsaraIdentityKeys(item, nested),
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
