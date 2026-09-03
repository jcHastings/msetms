import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { driverAssignedTrailerMap, driverLoadHasAssignedTrailer } from "@/lib/driver-trailer";
import { getSignedInDriver } from "@/lib/driver-session";
import { formatDateTime } from "@/lib/format";
import { mapsBrowserKey } from "@/lib/load-map";
import { getLoad } from "@/lib/queries";
import { driverAssignedToLoad } from "@/lib/relay-store";

export const dynamic = "force-dynamic";

export default async function DriverLoadTrailerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const load = getLoad(Number.parseInt((await params).id, 10));
  if (!load || !driverAssignedToLoad(load.id, driver.id, load.driver_id)) notFound();
  if (!driverLoadHasAssignedTrailer(load)) redirect(`/driver/loads/${load.id}`);
  const view = await driverAssignedTrailerMap(load);

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-5">
      <Link href={`/driver/loads/${load.id}`} className="text-sm font-medium text-slate-300">
        ← Load {load.load_number}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">Trailer {view.trailerNumber || load.trailer_unit}</h1>
      {view.address ? <p className="mt-2 text-sm text-slate-200">{view.address}</p> : null}
      {view.recordedAt ? <p className="text-xs text-slate-500">{formatDateTime(view.recordedAt)}</p> : null}
      <section className="mt-4 overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10" data-driver-trailer-map="">
        <LoadMapCanvas
          apiKey={mapsBrowserKey()}
          points={view.point ? [view.point] : []}
          cluster={false}
          className="h-[28rem] w-full bg-slate-800"
          missingKeyMessage="Map is off."
          emptyMessage="No trailer location yet."
        />
      </section>
    </div>
  );
}
