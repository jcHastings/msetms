import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { applyGeofenceArrivalsWithGeocode } from "./geofence";
import { getLoad } from "./queries";
import { refreshLoadRouteQuiet, usableRouteStops } from "./routing";
import { isOfficialDrivingRoute } from "./routing-shared";
import { listStops } from "./stops";

/** Recalc route/geofence after the load UI has painted so Edit is not blocked. */
export function scheduleLoadOpenWork(loadId: number): void {
  after(async () => {
    try {
      await applyGeofenceArrivalsWithGeocode(loadId);
    } catch {
      // Stored GPS still applies on the next open.
    }
    try {
      const load = getLoad(loadId);
      const stopCount = usableRouteStops(listStops(loadId)).length;
      if (load && isOfficialDrivingRoute(load, { stopCount })) return;
      await refreshLoadRouteQuiet(loadId);
      revalidatePath("/", "layout");
    } catch {
      // Leftover air totals are cleared when Directions cannot run.
    }
  });
}
