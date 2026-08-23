import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadForm } from "@/components/load-form";
import { PageHeader } from "@/components/page-header";
import { LoadStatusBadge } from "@/components/status-badge";
import { RateConApply } from "@/components/rate-con-apply";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { ReeferBadge } from "@/components/reefer-badge";
import { updateLoadAction } from "@/lib/actions";
import { AssignedFleetDocs } from "@/components/assigned-fleet-docs";
import { LoadConfirmationLink } from "@/components/load-confirmation-link";
import { IftaPanel } from "@/components/ifta-panel";
import { QuickbooksInvoicePanel } from "@/components/quickbooks-invoice-panel";
import { listAttachments } from "@/lib/files";
import { ensureDemoIfta, getIftaPanel } from "@/lib/integrations/ifta";
import { previewQuickbooksInvoice } from "@/lib/integrations/quickbooks";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { getLatestReeferForLoad, getTrailerLocationForLoad } from "@/lib/integrations/orbcomm";
import { getHosForLoad, getLocationForLoad } from "@/lib/integrations/samsara";
import { LoadAuditSection } from "@/components/load-audit-section";
import { LoadOps } from "@/components/load-ops";
import { LocationSchedulingCard } from "@/components/location-scheduling";
import { getLoad, listCustomers, listDrivers, listLocations, listTrailers, listTrucks, locationsForLoad } from "@/lib/queries";
import { loadFormSettings } from "@/lib/settings";

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
  const stopLocations = locationsForLoad(load);
  await ensureDemoIfta(load);
  const ifta = getIftaPanel(load);

  return (
    <>
      <PageHeader
        title={load.load_number}
        subtitle={`${load.origin} → ${load.destination}`}
        actions={
          <div className="flex items-center gap-3">
            <LoadStatusBadge status={load.status} />
            <LoadConfirmationLink loadId={load.id} loadNumber={load.load_number} />
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
      {stopLocations.shipper || stopLocations.consignee ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <LocationSchedulingCard title="Shipper scheduling" location={stopLocations.shipper} />
          <LocationSchedulingCard title="Consignee scheduling" location={stopLocations.consignee} />
        </div>
      ) : null}
      {load.driver_type === "owner_operator" && load.oo_pay != null ? (
        <div className="mb-4 card p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner-operator pay</div>
          <div className="mt-1 font-semibold">
            {load.oo_percent}% of {load.rate != null ? `$${load.rate.toLocaleString()}` : "rate"} = $
            {load.oo_pay.toLocaleString()}
          </div>
          <p className="mt-1 text-slate-600">Settled outside QuickBooks. Customer invoices use the load rate.</p>
        </div>
      ) : null}
      {(load.status === "in_transit" || load.status === "picked_up" || load.status === "at_delivery" || load.status === "unloading" || load.status === "delivered" || load.status === "completed" || ifta.report) ? (
        <IftaPanel
          loadId={load.id}
          report={ifta.report}
          canRefresh={ifta.canRefresh}
          configured={ifta.configured}
          reason={ifta.reason}
        />
      ) : null}
      {load.status === "delivered" || load.status === "completed" ? (
        load.rate != null ? (
          <QuickbooksInvoicePanel loadId={load.id} preview={previewQuickbooksInvoice(load)} />
        ) : (
          <section className="card mb-4 p-5 text-sm text-slate-600">
            Set a customer rate on this delivered load to send a QuickBooks invoice.
          </section>
        )
      ) : null}
      <LoadForm
        customers={listCustomers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        locations={listLocations()}
        drivers={listDrivers()}
        load={load}
        {...loadFormSettings()}
        action={boundAction}
        submitLabel="Save load"
      />
      <RateConApply
        load={load}
        customers={listCustomers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        locations={listLocations()}
        drivers={listDrivers()}
        formSettings={loadFormSettings()}
      />
      <LoadOps load={load} />
      <AssignedFleetDocs driverId={load.driver_id} truckId={load.truck_id} trailerId={load.trailer_id} />
      <AttachmentsPanel loadId={load.id} attachments={listAttachments(load.id)} />
      <LoadAuditSection loadId={load.id} />
    </>
  );
}
