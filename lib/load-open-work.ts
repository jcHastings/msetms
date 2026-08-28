import { after } from "next/server";
import { applyGeofenceArrivalsWithGeocode } from "./geofence";
import { getLoad } from "./queries";
import { refreshLoadRouteQuiet } from "./routing";
import { isOfficialDrivingRoute } from "./routing-shared";

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
      if (load && isOfficialDrivingRoute(load)) return;
      await refreshLoadRouteQuiet(loadId);
    } catch {
      // Official miles stay on file; leftovers are cleared when Directions runs.
    }
  });
}
