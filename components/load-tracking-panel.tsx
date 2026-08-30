import { LoadLogSection } from "@/components/load-log-section";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { formatDateTime } from "@/lib/format";
import { buildLoadMapPoints, listLoadTrackingEvents, mapsBrowserKey } from "@/lib/load-map";

export async function LoadTrackingPanel({ loadId }: { loadId: number }) {
  const [points, events, apiKey] = await Promise.all([
    buildLoadMapPoints(loadId),
    listLoadTrackingEvents(loadId),
    Promise.resolve(mapsBrowserKey()),
  ]);
  return (
    <section id="load-map" data-load-tab="log" className="card p-3">
      <h2 className="text-sm font-semibold">Load map</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <LoadMapCanvas apiKey={apiKey} points={points} />
          {points.length ? (
            <ul className="divide-y divide-slate-100 px-3 py-2 text-xs text-slate-600">
              {points
                .filter((point) => point.kind !== "track")
                .map((point) => (
                  <li key={point.id} className="py-1">
                    <span className="font-semibold capitalize">{point.kind}</span> · {point.label}
                    {point.detail ? ` · ${point.detail}` : ""}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Recent events</h3>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No check calls or GPS pings on this load yet.</p>
          ) : (
            <ol className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
              {events.slice(0, 20).map((event) => (
                <li key={event.id} className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold uppercase tracking-wide">{event.source.replaceAll("_", " ")}</span>
                    <span>{formatDateTime(event.at)}</span>
                  </div>
                  <div className="mt-1">
                    {event.who} · {event.note}
                  </div>
                  {event.gps ? <div className="mt-1 text-xs text-slate-500">{event.gps}</div> : null}
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4">
            <LoadLogSection loadId={loadId} />
          </div>
        </div>
      </div>
    </section>
  );
}
