import Link from "next/link";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { LOAD_MAP_MARKER_COLOR, pathThroughStops, type LoadMapPoint } from "@/lib/load-map-shared";
import { buildStopsMapModel, mapsBrowserKey } from "@/lib/load-map";
import type { InboxExceptionGroup } from "@/lib/exceptions";
import { ExceptionIssueLine } from "@/components/exception-issue-line";

function WorkbenchLaneSketch({ points, path }: { points: LoadMapPoint[]; path: Array<{ lat: number; lng: number }> }) {
  const coords = path.length >= 2 ? path : points;
  if (coords.length === 0) {
    return (
      <div className="flex h-56 min-h-[14rem] items-center justify-center bg-slate-100 text-sm text-slate-600 md:h-full">
        Lane map not ready.
      </div>
    );
  }
  const lats = coords.map((p) => p.lat);
  const lngs = coords.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const dLat = Math.max(maxLat - minLat, 0.35);
  const dLng = Math.max(maxLng - minLng, 0.35);
  const xOf = (lng: number) => ((lng - minLng) / dLng) * 80 + 10;
  const yOf = (lat: number) => (1 - (lat - minLat) / dLat) * 70 + 12;
  const line = coords.map((p) => `${xOf(p.lng).toFixed(1)},${yOf(p.lat).toFixed(1)}`).join(" ");
  const pickup = points.find((p) => p.kind === "pickup") ?? points[0];
  const drop = [...points].reverse().find((p) => p.kind === "delivery") ?? points[points.length - 1];
  const truck = points.find((p) => p.kind === "truck");
  return (
    <div className="relative h-56 min-h-[14rem] bg-[#e8eef4] md:h-full" data-workbench-lane-sketch="">
      <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <polyline points={line} fill="none" stroke="#12315c" strokeWidth="1.6" strokeLinejoin="round" />
        {pickup ? <circle cx={xOf(pickup.lng)} cy={yOf(pickup.lat)} r="2.4" fill="#166534" /> : null}
        {drop ? <circle cx={xOf(drop.lng)} cy={yOf(drop.lat)} r="2.4" fill="#be123c" /> : null}
        {truck ? <circle cx={xOf(truck.lng)} cy={yOf(truck.lat)} r="2.2" fill="#0b1f3a" /> : null}
      </svg>
    </div>
  );
}

export async function WorkbenchLoadCard({ group }: { group: InboxExceptionGroup }) {
  const apiKey = mapsBrowserKey();
  const model = await buildStopsMapModel(group.loadId);
  const path = model.path.length >= 2 ? model.path : pathThroughStops(model.points);

  return (
    <article
      className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]"
      data-workbench-card=""
      data-attention-load={group.loadNumber}
    >
      <div className="grid md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        {apiKey ? (
          <LoadMapCanvas
            apiKey={apiKey}
            points={model.points}
            path={path}
            className="h-56 w-full min-h-[14rem] bg-slate-100 md:h-full"
            missingKeyMessage="Map is off."
            emptyMessage="Lane map not ready."
          />
        ) : (
          <WorkbenchLaneSketch points={model.points} path={path} />
        )}
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/loads/${group.loadId}`} className="font-mono text-sm font-semibold hover:underline">
                {group.loadNumber}
              </Link>
              <div className="mt-0.5 text-xs text-slate-500">
                {group.customerName}
                <span className="mx-1 text-slate-300">·</span>
                {group.origin}
                <span className="mx-1 text-slate-400">→</span>
                {group.destination}
              </div>
            </div>
            <Link href={`/loads/${group.loadId}`} className="text-sm font-medium text-slate-600">
              Open
            </Link>
          </div>
          <ul className="mt-3 space-y-3">
            {group.items.map((item) => (
              <ExceptionIssueLine key={item.id} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
