import { isLiveSamsaraGps, type VehicleLocation } from "./integrations/samsara";
import { extractStateCode } from "./locations";
import { isDriverLoginEligible, listDrivers, listLoadsForDriver, listTrucks } from "./queries";
import { isBillableStatus, isClosedStatus, type DriverWithTruck, type LoadView } from "./types";

export type NeedCoverReason = "empty" | "soon";

export type NeedCoverRow = {
  driverId: number;
  driverName: string;
  place: string;
  reason: NeedCoverReason;
  when: string;
};

const SOON_MS = 24 * 60 * 60 * 1000;

export function cityStateFromPlace(place: string): string {
  const text = String(place ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const matches = [
    ...text.matchAll(/([A-Za-z][A-Za-z .'-]*?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?/g),
  ];
  const last = matches.at(-1);
  if (last) return `${last[1].replace(/\s+/g, " ").trim()}, ${last[2]}`;
  const state = extractStateCode(text);
  if (!state) return text;
  const city = text
    .replace(new RegExp(`,?\\s*${state}(?:\\s+\\d{5}(?:-\\d{4})?)?$`, "i"), "")
    .split(",")
    .pop()
    ?.trim();
  return city ? `${city}, ${state}` : state;
}

export function deliveringSoon(load: Pick<LoadView, "status" | "delivery_start" | "delivery_end">, now = new Date()): boolean {
  if (load.status === "at_delivery" || load.status === "unloading") return true;
  const end = new Date(load.delivery_end || load.delivery_start);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() - now.getTime() <= SOON_MS;
}

export function listNeedCoverRows(
  input: {
    drivers: Array<Pick<DriverWithTruck, "id" | "name" | "active" | "termination_date" | "truck_id">>;
    loadsByDriver: Map<number, LoadView[]>;
    locations: Array<Pick<VehicleLocation, "truckId" | "address" | "source" | "latitude" | "longitude">>;
    truckIdByDriver?: Map<number, number | null>;
  },
  now = new Date(),
): NeedCoverRow[] {
  const rows: NeedCoverRow[] = [];
  for (const driver of input.drivers) {
    if (!isDriverLoginEligible(driver)) continue;
    const theirs = input.loadsByDriver.get(driver.id) ?? [];
    const open = theirs
      .filter((load) => !isClosedStatus(load.status))
      .sort((a, b) => String(a.pickup_start).localeCompare(String(b.pickup_start)));
    if (open.length >= 2) continue;
    const current = open[0] ?? null;
    if (current && !deliveringSoon(current, now)) continue;
    const lastDone = theirs
      .filter((load) => isBillableStatus(load.status))
      .sort((a, b) => String(b.delivery_end || b.updated_at).localeCompare(String(a.delivery_end || a.updated_at)))[0];
    const truckId =
      input.truckIdByDriver?.get(driver.id) ?? current?.truck_id ?? lastDone?.truck_id ?? driver.truck_id ?? null;
    const gps = input.locations.find((item) => item.truckId === truckId) ?? null;
    const samsaraPlace =
      gps && isLiveSamsaraGps(gps as VehicleLocation) ? cityStateFromPlace(gps.address) : "";
    const loadPlace = cityStateFromPlace((current ?? lastDone)?.destination ?? "");
    rows.push({
      driverId: driver.id,
      driverName: driver.name,
      place: samsaraPlace || loadPlace || "—",
      reason: current ? "soon" : "empty",
      when: current ? current.delivery_end || current.delivery_start : "",
    });
  }
  return rows.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "empty" ? -1 : 1;
    if (a.reason === "soon") return String(a.when).localeCompare(String(b.when));
    return a.driverName.localeCompare(b.driverName);
  });
}

export function listNeedCover(
  locations: Array<Pick<VehicleLocation, "truckId" | "address" | "source" | "latitude" | "longitude">>,
  now = new Date(),
): NeedCoverRow[] {
  const drivers = listDrivers();
  const trucks = listTrucks();
  const loadsByDriver = new Map<number, LoadView[]>();
  const truckIdByDriver = new Map<number, number | null>();
  for (const driver of drivers) {
    loadsByDriver.set(driver.id, listLoadsForDriver(driver.id));
    const assignedTruck = trucks.find((truck) => truck.assigned_driver_id === driver.id);
    truckIdByDriver.set(driver.id, driver.truck_id ?? assignedTruck?.id ?? null);
  }
  return listNeedCoverRows({ drivers, loadsByDriver, locations, truckIdByDriver }, now);
}
