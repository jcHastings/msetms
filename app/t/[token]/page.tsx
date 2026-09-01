import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { mapsBrowserKey } from "@/lib/load-map";
import { getReeferSnapshots } from "@/lib/integrations/orbcomm";
import { trailerShareView } from "@/lib/trailer-share";

export const dynamic = "force-dynamic";

export default async function TrailerSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = trailerShareView(token);
  if (!preview.found) notFound();
  if (!preview.expired) {
    try {
      await getReeferSnapshots();
    } catch {
      // Keep stored pings if live Orbcomm is down.
    }
  }
  const view = trailerShareView(token);
  if (!view.found) notFound();

  if (view.expired) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10" data-trailer-share-expired="">
        <BrandMark size="sm" />
        <h1 className="mt-6 text-2xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-sm text-slate-600">Trailer location is no longer available.</p>
      </main>
    );
  }

  const apiKey = mapsBrowserKey();
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8" data-trailer-share-live="">
      <BrandMark size="sm" />
      <h1 className="mt-6 text-2xl font-semibold">Trailer {view.trailerNumber}</h1>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Temperature</dt>
          <dd className="font-semibold" data-trailer-share-temp="">
            {view.temperatureF == null ? "No reading yet" : `${view.temperatureF}°F`}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Location</dt>
          <dd data-trailer-share-location="">{view.address || "No updates yet"}</dd>
        </div>
      </dl>
      <section className="card mt-6 overflow-hidden">
        <LoadMapCanvas
          apiKey={apiKey}
          points={view.points}
          className="h-[22rem] w-full bg-slate-100"
          missingKeyMessage="Map is off."
          emptyMessage="No location updates yet."
        />
      </section>
    </main>
  );
}
