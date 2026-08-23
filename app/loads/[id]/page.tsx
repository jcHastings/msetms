import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadForm } from "@/components/load-form";
import { PageHeader } from "@/components/page-header";
import { LoadStatusBadge } from "@/components/status-badge";
import { RateConApply } from "@/components/rate-con-apply";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { ReeferBadge } from "@/components/reefer-badge";
import { updateLoadAction } from "@/lib/actions";
import { listAttachments, listFleetDocuments } from "@/lib/files";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { getLatestReeferForLoad, getTrailerLocationForLoad } from "@/lib/integrations/orbcomm";
import { getHosForLoad, getLocationForLoad } from "@/lib/integrations/samsara";
import { getLoad, listCustomers, listDrivers, listTrailers, listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const loadId = Number.parseInt(id, 10);
  const load = getLoad(loadId);
  if (!load) notFound();

  const boundAction = updateLoadAction.bind(null, load.id);

  return (
    <>
      <PageHeader
        title={load.load_number}
        subtitle={`${load.origin} → ${load.destination}`}
        actions={
          <div className="flex items-center gap-3">
            <LoadStatusBadge status={load.status} />
            <Link href="/board" className="btn btn-secondary">
              Back to board
            </Link>
          </div>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tractor (Samsara)</div>
          <div className="mt-1">
            <LocationBadge location={await getLocationForLoad(load.id)} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Driver HOS (Samsara)</div>
          <div className="mt-1">
            <HosBadge hos={await getHosForLoad(load.id)} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trailer (ORBCOMM)</div>
          <div className="mt-1">
            <TrailerLocationBadge location={await getTrailerLocationForLoad(load.id)} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reefer (ORBCOMM)</div>
          <div className="mt-1">
            <ReeferBadge setpoint={load.reefer_setpoint_f} reading={await getLatestReeferForLoad(load.id)} />
          </div>
        </div>
      </div>
      {load.driver_type === "owner_operator" && load.oo_pay != null ? (
        <div className="mb-4 card p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner-operator pay</div>
          <div className="mt-1 font-semibold">
            {load.oo_percent}% of {load.rate != null ? `$${load.rate.toLocaleString()}` : "rate"} = $
            {load.oo_pay.toLocaleString()}
          </div>
        </div>
      ) : null}
      <LoadForm
        customers={listCustomers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        drivers={listDrivers()}
        load={load}
        action={boundAction}
        submitLabel="Save load"
      />
      <RateConApply
        load={load}
        customers={listCustomers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        drivers={listDrivers()}
      />
      {(load.driver_id || load.truck_id || load.trailer_id) && (
        <section className="card mt-6 p-6">
          <h2 className="text-sm font-semibold">Assigned unit documents</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {load.driver_id ? (
              <li>
                <Link className="underline" href={`/fleet/drivers/${load.driver_id}`}>
                  Driver CDL / medical card
                </Link>
                {listFleetDocuments("driver", load.driver_id).length
                  ? ` · ${listFleetDocuments("driver", load.driver_id).length} file(s)`
                  : " · none uploaded"}
              </li>
            ) : null}
            {load.truck_id ? (
              <li>
                <Link className="underline" href={`/fleet/trucks/${load.truck_id}`}>
                  Truck registration / DOT
                </Link>
                {listFleetDocuments("truck", load.truck_id).length
                  ? ` · ${listFleetDocuments("truck", load.truck_id).length} file(s)`
                  : " · none uploaded"}
              </li>
            ) : null}
            {load.trailer_id ? (
              <li>
                <Link className="underline" href={`/fleet/trailers/${load.trailer_id}`}>
                  Trailer registration / DOT
                </Link>
                {listFleetDocuments("trailer", load.trailer_id).length
                  ? ` · ${listFleetDocuments("trailer", load.trailer_id).length} file(s)`
                  : " · none uploaded"}
              </li>
            ) : null}
          </ul>
        </section>
      )}
      <AttachmentsPanel loadId={load.id} attachments={listAttachments(load.id)} />
    </>
  );
}
