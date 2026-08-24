import {
  buildOrbcommTrailerPreview,
  buildSamsaraTruckPreview,
  inferTrailerType,
  matchTruckForSamsara,
  preferFilled,
  type OrbcommAssetInput,
  type OrbcommTrailerPreviewRow,
  type SamsaraTruckPreviewRow,
  type SamsaraVehicleInput,
} from "./fleet-import-shared";
import {
  createTrailer,
  createTruck,
  getTrailer,
  getTruck,
  listTrailers,
  listTrucks,
  saveTruckGps,
  updateTrailer,
  updateTruck,
} from "./queries";
import type { TrailerType } from "./types";

export function previewSamsaraTrucks(vehicles: SamsaraVehicleInput[]): SamsaraTruckPreviewRow[] {
  return buildSamsaraTruckPreview(
    vehicles,
    listTrucks().map((truck) => ({
      id: truck.id,
      unit_number: truck.unit_number,
      samsara_vehicle_id: truck.samsara_vehicle_id,
      vin: truck.vin,
      plate: truck.plate,
    })),
  );
}

export function previewOrbcommTrailers(assets: OrbcommAssetInput[]): OrbcommTrailerPreviewRow[] {
  return buildOrbcommTrailerPreview(
    assets,
    listTrailers().map((trailer) => ({
      id: trailer.id,
      unit_number: trailer.unit_number,
      orbcomm_asset_id: trailer.orbcomm_asset_id,
    })),
  );
}

export function applySamsaraTruckImport(rows: SamsaraTruckPreviewRow[]): {
  created: number;
  updated: number;
  skipped: number;
} {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const usedTruckIds = new Set<number>();
  const usedVehicleIds = new Set<string>();

  for (const row of rows) {
    const unitNumber = row.unitNumber.trim();
    const samsaraVehicleId = row.samsaraVehicleId.trim();
    if (!unitNumber && !samsaraVehicleId) {
      skipped += 1;
      continue;
    }
    if (samsaraVehicleId && usedVehicleIds.has(samsaraVehicleId)) {
      skipped += 1;
      continue;
    }

    const preview = previewSamsaraTrucks([
      {
        id: samsaraVehicleId,
        name: row.name || unitNumber,
        vin: row.vin,
        year: row.year,
        make: row.make,
        model: row.model,
        licensePlate: row.plate,
        extraKeys: [unitNumber, row.name],
        latitude: row.latitude,
        longitude: row.longitude,
        city: row.city,
      },
    ])[0];
    if (!preview && !row.matchTruckId) {
      skipped += 1;
      continue;
    }
    const rematchedId = preview?.matchTruckId ?? null;
    const confirmed = row.matchTruckId ? getTruck(row.matchTruckId) : null;
    const confirmedStillMatches = Boolean(
      confirmed &&
        !usedTruckIds.has(confirmed.id) &&
        matchTruckForSamsara([confirmed], {
          samsaraVehicleId,
          unitNumber,
          name: row.name || unitNumber,
          vin: row.vin,
          licensePlate: row.plate,
        }),
    );
    const matchTruckId = confirmedStillMatches ? confirmed!.id : rematchedId;
    if (matchTruckId && usedTruckIds.has(matchTruckId)) {
      skipped += 1;
      continue;
    }

    if (matchTruckId) {
      const existing = getTruck(matchTruckId);
      if (!existing) {
        skipped += 1;
        continue;
      }
      updateTruck(existing.id, {
        unit_number: existing.unit_number,
        type: existing.type,
        capacity_lbs: existing.capacity_lbs,
        status: existing.status,
        samsara_vehicle_id: samsaraVehicleId || existing.samsara_vehicle_id,
        samsara_trailer_id: existing.samsara_trailer_id,
        orbcomm_asset_id: existing.orbcomm_asset_id,
        trailer_number: existing.trailer_number,
        registration_issued: existing.registration_issued,
        registration_expires: existing.registration_expires,
        dot_inspected_on: existing.dot_inspected_on,
        dot_expires: existing.dot_expires,
        vin: preferFilled(existing.vin, row.vin),
        plate: preferFilled(existing.plate, row.plate),
        year: preferFilled(existing.year, row.year),
        make: preferFilled(existing.make, row.make),
        model: preferFilled(existing.model, row.model),
        notes: existing.notes,
        active: existing.active,
        assigned_driver_id: existing.assigned_driver_id,
      });
      usedTruckIds.add(existing.id);
      persistImportedGps(existing.id, row);
      updated += 1;
    } else {
      const newUnit = unitNumber || samsaraVehicleId;
      try {
        const id = createTruck({
          unit_number: newUnit,
          type: "dry_van",
          capacity_lbs: 45000,
          status: "available",
          samsara_vehicle_id: samsaraVehicleId,
          vin: row.vin.trim(),
          plate: row.plate.trim(),
          year: row.year.trim(),
          make: row.make.trim(),
          model: row.model.trim(),
        });
        usedTruckIds.add(id);
        persistImportedGps(id, row);
        created += 1;
      } catch (error) {
        if (!String(error).includes("already exists")) throw error;
        skipped += 1;
      }
    }
    if (samsaraVehicleId) usedVehicleIds.add(samsaraVehicleId);
  }

  return { created, updated, skipped };
}

function persistImportedGps(
  truckId: number,
  row: Pick<SamsaraTruckPreviewRow, "latitude" | "longitude" | "city">,
): void {
  if (row.latitude == null && row.longitude == null && !String(row.city ?? "").trim()) return;
  saveTruckGps(truckId, {
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    address: String(row.city ?? "").trim(),
    recordedAt: new Date().toISOString(),
    source: "samsara",
  });
}

export function applyOrbcommTrailerImport(rows: OrbcommTrailerPreviewRow[]): {
  created: number;
  updated: number;
  skipped: number;
} {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const usedTrailerIds = new Set<number>();
  const usedAssetIds = new Set<string>();

  for (const row of rows) {
    const unitNumber = row.unitNumber.trim();
    const orbcommAssetId = row.orbcommAssetId.trim();
    if (!unitNumber && !orbcommAssetId) {
      skipped += 1;
      continue;
    }
    if (orbcommAssetId && usedAssetIds.has(orbcommAssetId)) {
      skipped += 1;
      continue;
    }

    const preview = previewOrbcommTrailers([
      {
        assetId: orbcommAssetId,
        unitNumber,
        name: row.name || unitNumber,
        vin: row.vin,
        plate: row.plate,
        type: row.type,
      },
    ])[0];
    if (!preview) {
      skipped += 1;
      continue;
    }
    if (preview.matchTrailerId && usedTrailerIds.has(preview.matchTrailerId)) {
      skipped += 1;
      continue;
    }

    if (preview.matchTrailerId) {
      const existing = getTrailer(preview.matchTrailerId);
      if (!existing) {
        skipped += 1;
        continue;
      }
      updateTrailer(existing.id, {
        unit_number: existing.unit_number,
        type: existing.type,
        orbcomm_asset_id: orbcommAssetId || existing.orbcomm_asset_id,
        registration_issued: existing.registration_issued,
        registration_expires: existing.registration_expires,
        dot_inspected_on: existing.dot_inspected_on,
        dot_expires: existing.dot_expires,
        status: existing.status,
        vin: preferFilled(existing.vin, row.vin),
        plate: preferFilled(existing.plate, row.plate),
        truck_id: existing.truck_id,
        notes: existing.notes,
        reefer_setpoint_f: existing.reefer_setpoint_f,
        active: existing.active,
      });
      usedTrailerIds.add(existing.id);
      updated += 1;
    } else {
      const newUnit = unitNumber || orbcommAssetId;
      const type = inferTrailerType(row.type) as TrailerType;
      try {
        const id = createTrailer({
          unit_number: newUnit,
          type: type === "dry_van" || type === "flatbed" || type === "other" ? type : "reefer",
          orbcomm_asset_id: orbcommAssetId,
          vin: row.vin.trim(),
          plate: row.plate.trim(),
        });
        usedTrailerIds.add(id);
        created += 1;
      } catch (error) {
        if (!String(error).includes("already exists")) throw error;
        skipped += 1;
      }
    }
    if (orbcommAssetId) usedAssetIds.add(orbcommAssetId);
  }

  return { created, updated, skipped };
}
