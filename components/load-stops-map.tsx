import { LoadMapCanvas } from "@/components/load-map-canvas";
import { WorkbenchLaneSketch } from "@/components/workbench-load-card";
import { applyGeofenceArrivals } from "@/lib/geofence";
import { buildStopsMapModel, mapsBrowserKey } from "@/lib/load-map";

export async function LoadStopsMap({ loadId }: { loadId: number }) {
  applyGeofenceArrivals(loadId);
  const [{ points, path }, apiKey] = await Promise.all([
    buildStopsMapModel(loadId),
    Promise.resolve(mapsBrowserKey()),
  ]);
  return (
    <section className="card mb-4 overflow-hidden" data-stops-map="">
      <header className="border-b border-slate-200 px-3 py-1.5">
        <h2 className="text-sm font-semibold">Route</h2>
      </header>
      {apiKey ? (
        <LoadMapCanvas
          apiKey={apiKey}
          points={points}
          path={path}
          className="h-80 w-full bg-slate-100"
          missingKeyMessage="Map is off."
          emptyMessage="No map yet."
        />
      ) : (
        <div className="h-80 w-full" data-stops-lane-sketch="">
          <WorkbenchLaneSketch points={points} path={path} />
        </div>
      )}
    </section>
  );
}
