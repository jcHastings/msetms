import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadForm } from "@/components/load-form";
import { PageHeader } from "@/components/page-header";
import { LoadStatusBadge } from "@/components/status-badge";
import { RateConApply } from "@/components/rate-con-apply";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { ReeferBadge } from "@/components/reefer-badge";
import { updateLoadAction } from "@/lib/actions";
import { listAttachments } from "@/lib/files";
import { HosBadge, LocationBadge } from "@/components/fleet-badges";
import { getLatestReeferForLoad } from "@/lib/integrations/orbcomm";
import { getHosForLoad, getLocationForLoad } from "@/lib/integrations/samsara";
import { getLoad, listCustomers, listDrivers, listTrucks } from "@/lib/queries";

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
      <div className="mb-4 grid gap-3 md:grid-cols-3">
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
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reefer (ORBCOMM)</div>
          <div className="mt-1">
            <ReeferBadge setpoint={load.reefer_setpoint_f} reading={await getLatestReeferForLoad(load.id)} />
          </div>
        </div>
      </div>
      <LoadForm
        customers={listCustomers()}
        trucks={listTrucks()}
        drivers={listDrivers()}
        load={load}
        action={boundAction}
        submitLabel="Save load"
      />
      <RateConApply
        load={load}
        customers={listCustomers()}
        trucks={listTrucks()}
        drivers={listDrivers()}
      />
      <AttachmentsPanel loadId={load.id} attachments={listAttachments(load.id)} />
    </>
  );
}
