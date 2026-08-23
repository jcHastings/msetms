import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadForm } from "@/components/load-form";
import { PageHeader } from "@/components/page-header";
import { LoadStatusBadge } from "@/components/status-badge";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { ReeferBadge } from "@/components/reefer-badge";
import { updateLoadAction } from "@/lib/actions";
import { listAttachments } from "@/lib/files";
import { getLatestReeferForLoad } from "@/lib/integrations/samsara";
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
      <div className="mb-4 card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reefer</div>
        <div className="mt-1">
          <ReeferBadge setpoint={load.reefer_setpoint_f} reading={getLatestReeferForLoad(load.id)} />
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
      <AttachmentsPanel loadId={load.id} attachments={listAttachments(load.id)} />
    </>
  );
}
