import { renderUtf8Csv } from "./csv";
import {
  labelForDriverKind,
  labelForDriverStatus,
  labelForTrailerType,
  labelForTruckStatus,
  labelForTruckType,
  type DriverWithTruck,
  type TrailerWithTruck,
  type TruckWithDriver,
} from "./types";

export const DRIVER_CSV_HEADERS = [
  "Name",
  "Phone",
  "Email",
  "Type",
  "Settlement %",
  "Truck",
  "CDL Number",
  "CDL State",
  "CDL Exp",
  "Medical Issued",
  "Medical Exp",
  "Duty Status",
  "Active",
  "PIN Set",
  "Notes",
] as const;

export const TRUCK_CSV_HEADERS = [
  "Unit",
  "Year",
  "Make",
  "Model",
  "Type",
  "Plate",
  "Plate State",
  "VIN",
  "Driver",
  "Status",
  "Active",
  "Registration Issued",
  "Registration Exp",
  "DOT Inspected",
  "DOT Exp",
  "Samsara Vehicle ID",
  "Notes",
] as const;

export const TRAILER_CSV_HEADERS = [
  "Unit",
  "Type",
  "VIN",
  "Plate",
  "Truck",
  "Active",
  "Registration Issued",
  "Registration Exp",
  "DOT Inspected",
  "DOT Exp",
  "Orbcomm Asset ID",
  "Reefer Setpoint F",
  "Notes",
] as const;

function activeLabel(active: number): string {
  return active === 0 ? "Inactive" : "Active";
}

export function renderDriversCsv(drivers: DriverWithTruck[]): string {
  return renderUtf8Csv(
    DRIVER_CSV_HEADERS,
    drivers.map((driver) => [
      driver.name,
      driver.phone,
      driver.email,
      labelForDriverKind(driver.driver_type),
      driver.pay_percent != null ? String(driver.pay_percent) : "",
      driver.truck_unit ?? "",
      driver.license_number,
      driver.license_state,
      driver.license_expires,
      driver.medical_issued,
      driver.medical_expires,
      labelForDriverStatus(driver.status),
      activeLabel(driver.active),
      driver.pin ? "Yes" : "No",
      driver.notes,
    ]),
  );
}

export function renderTrucksCsv(trucks: TruckWithDriver[]): string {
  return renderUtf8Csv(
    TRUCK_CSV_HEADERS,
    trucks.map((truck) => [
      truck.unit_number,
      truck.year,
      truck.make,
      truck.model,
      labelForTruckType(truck.type),
      truck.plate,
      truck.plate_state,
      truck.vin,
      truck.driver_name ?? "",
      labelForTruckStatus(truck.status),
      activeLabel(truck.active),
      truck.registration_issued,
      truck.registration_expires,
      truck.dot_inspected_on,
      truck.dot_expires,
      truck.samsara_vehicle_id,
      truck.notes,
    ]),
  );
}

export function renderTrailersCsv(trailers: TrailerWithTruck[]): string {
  return renderUtf8Csv(
    TRAILER_CSV_HEADERS,
    trailers.map((trailer) => [
      trailer.unit_number,
      labelForTrailerType(trailer.type),
      trailer.vin,
      trailer.plate,
      trailer.truck_unit ?? "",
      activeLabel(trailer.active),
      trailer.registration_issued,
      trailer.registration_expires,
      trailer.dot_inspected_on,
      trailer.dot_expires,
      trailer.orbcomm_asset_id,
      trailer.reefer_setpoint_f != null ? String(trailer.reefer_setpoint_f) : "",
      trailer.notes,
    ]),
  );
}
