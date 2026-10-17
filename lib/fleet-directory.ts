import { directoryNeedle, paginateDirectory, parseDirectoryPage } from "./directory-page";
import type { DriverWithTruck, TrailerWithTruck, TruckWithDriver } from "./types";

export const FLEET_HUB_PAGE_SIZE = 15;

export function filterTrucks(trucks: TruckWithDriver[], q: string): TruckWithDriver[] {
  const needle = directoryNeedle(q);
  if (!needle) return trucks;
  return trucks.filter((truck) =>
    [
      truck.unit_number,
      truck.year,
      truck.make,
      truck.model,
      truck.plate,
      truck.plate_state,
      truck.type,
      truck.samsara_vehicle_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function filterTrailers(trailers: TrailerWithTruck[], q: string): TrailerWithTruck[] {
  const needle = directoryNeedle(q);
  if (!needle) return trailers;
  return trailers.filter((trailer) =>
    [trailer.unit_number, trailer.type, trailer.orbcomm_asset_id, trailer.truck_unit]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function filterDrivers(drivers: DriverWithTruck[], q: string): DriverWithTruck[] {
  const needle = directoryNeedle(q);
  if (!needle) return drivers;
  return drivers.filter((driver) =>
    [
      driver.name,
      driver.phone,
      driver.license,
      driver.license_number,
      driver.license_state,
      driver.company_name,
      driver.truck_unit,
      driver.samsara_driver_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function pageFleetRows<T>(rows: T[], pageValue: unknown, pageSize?: number) {
  return paginateDirectory(rows, parseDirectoryPage(pageValue), pageSize);
}
