import {
  buildDriverImportPreview,
  driverValuesFromRecords,
  parseDriverRosterText,
  type DriverImportPreviewRow,
  type DriverImportValues,
} from "./driver-import-shared";
import { createDriver, getDriver, listDrivers, updateDriver } from "./queries";
import { recordsFromXlsx } from "./xlsx-first-sheet";

export function previewDriversFromText(text: string): DriverImportPreviewRow[] {
  return buildDriverImportPreview(
    parseDriverRosterText(text),
    listDrivers().map((driver) => ({ id: driver.id, name: driver.name })),
  );
}

export function previewDriversFromXlsx(buffer: Uint8Array): DriverImportPreviewRow[] {
  return buildDriverImportPreview(
    driverValuesFromRecords(recordsFromXlsx(buffer)),
    listDrivers().map((driver) => ({ id: driver.id, name: driver.name })),
  );
}

export function applyDriverImport(rows: DriverImportPreviewRow[]): {
  created: number;
  updated: number;
  skipped: number;
} {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const used = new Set<number>();
  const usedNames = new Set<string>();

  for (const row of rows) {
    const name = row.name.trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const nameKey = name.toLowerCase();
    if (usedNames.has(nameKey)) {
      skipped += 1;
      continue;
    }
    usedNames.add(nameKey);

    const match = listDrivers().find((driver) => driver.name.trim().toLowerCase() === nameKey);
    if (match) {
      if (used.has(match.id)) {
        skipped += 1;
        continue;
      }
      writeDriverUpdate(match.id, row);
      used.add(match.id);
      updated += 1;
    } else {
      writeDriverCreate(row);
      created += 1;
    }
  }

  return { created, updated, skipped };
}

function writeDriverCreate(row: DriverImportValues): number {
  return createDriver({
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    active: row.active,
    license: row.license_number,
    license_number: row.license_number,
    license_expires: row.license_expires,
    medical_issued: row.medical_issued,
    medical_expires: row.medical_expires,
    driver_type: row.driver_type,
    truck_id: null,
    status: "available",
    alt_phone: row.alt_phone,
    cell_phone: row.cell_phone,
    pager: row.pager,
    address: row.address,
    country: row.country || "USA",
    city: row.city,
    state: row.state,
    postal_zip: row.postal_zip,
    date_of_birth: row.date_of_birth,
    date_of_hire: row.date_of_hire,
    drug_test_last: row.drug_test_last,
    drug_test_next: row.drug_test_next,
    termination_date: row.termination_date,
  });
}

function writeDriverUpdate(id: number, row: DriverImportValues): void {
  const current = getDriver(id);
  if (!current) throw new Error("Driver not found.");
  updateDriver(id, {
    name: current.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    active: row.active,
    license: row.license_number || current.license,
    pin: "",
    samsara_driver_id: current.samsara_driver_id,
    license_number: row.license_number,
    license_state: current.license_state,
    license_expires: row.license_expires,
    medical_issued: row.medical_issued,
    medical_expires: row.medical_expires,
    driver_type: row.driver_type,
    pay_percent: current.pay_percent,
    cdl_endorsements: current.cdl_endorsements,
    truck_id: current.truck_id,
    status: current.status,
    alt_phone: row.alt_phone,
    cell_phone: row.cell_phone,
    pager: row.pager,
    address: row.address,
    country: row.country || current.country || "USA",
    city: row.city,
    state: row.state,
    postal_zip: row.postal_zip,
    date_of_birth: row.date_of_birth,
    date_of_hire: row.date_of_hire,
    drug_test_last: row.drug_test_last,
    drug_test_next: row.drug_test_next,
    termination_date: row.termination_date,
  });
}
