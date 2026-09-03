import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { mapsBrowserKey } from "@/lib/load-map";
import { loadShareView } from "@/lib/load-share";

export const dynamic = "force-dynamic";

export default async function LoadSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = loadShareView(token);
  if (!view.found) notFound();

  if (view.expired) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10" data-load-share-expired="">
        <BrandMark size="sm" />
        <h1 className="mt-6 text-2xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-sm text-slate-600">Load status is no longer available.</p>
      </main>
    );
  }

  const apiKey = mapsBrowserKey();
  const trailerPoints =
    view.trailerLat != null && view.trailerLng != null
      ? [
          {
            id: "load-share-trailer",
            kind: "trailer" as const,
            label: view.trailerNumber || "Trailer",
            lat: view.trailerLat,
            lng: view.trailerLng,
            pinColor: view.trailerPinColor,
          },
        ]
      : [];

  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-8" data-load-share-live="">
      <BrandMark size="sm" />
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Load {view.loadNumber}</h1>
        <LoadStatusBadge status={view.status} />
      </div>
      <ol className="milestone-timeline mt-6" data-load-share-timeline="">
        {view.milestones.map((step) => (
          <li key={step.key} className="milestone-step" data-load-share-step={step.key}>
            <div className="milestone-dot" aria-hidden />
            <div>
              <div className="font-semibold">{step.title}</div>
              {step.detail ? <div className="text-sm text-slate-600">{step.detail}</div> : null}
              {step.at ? <div className="text-xs text-slate-500">{formatDateTime(step.at)}</div> : null}
            </div>
          </li>
        ))}
      </ol>
      {view.trailerNumber || view.temperatureF != null || view.address || trailerPoints.length ? (
        <section className="card mt-6 p-4" data-load-share-trailer="">
          <h2 className="text-sm font-semibold">Trailer location</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Temperature</dt>
              <dd className="font-semibold">{view.temperatureF == null ? "No reading yet" : `${view.temperatureF}°F`}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Location</dt>
              <dd>{view.address || "No updates yet"}</dd>
            </div>
          </dl>
          {trailerPoints.length ? (
            <div className="mt-4 overflow-hidden rounded-lg">
              <LoadMapCanvas
                apiKey={apiKey}
                points={trailerPoints}
                cluster={false}
                className="h-56 w-full bg-slate-100"
                missingKeyMessage="Map is off."
                emptyMessage="No location updates yet."
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
