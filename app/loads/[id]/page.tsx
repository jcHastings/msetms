import { notFound } from "next/navigation";
import { AssignedFleetDocs } from "@/components/assigned-fleet-docs";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { IftaPanel } from "@/components/ifta-panel";
import { CustomerSnapshot } from "@/components/customer-snapshot";
import { LoadExtraDetails, LoadWatchRow } from "@/components/load-extra-details";
import { LoadAuditSection } from "@/components/load-audit-section";
import { LoadLogSection } from "@/components/load-log-section";
import { LoadConfirmationLink } from "@/components/load-confirmation-link";
import { LoadForm } from "@/components/load-form";
import { LoadRelaysPanel } from "@/components/load-relays-panel";
import { LoadStopsPanel } from "@/components/load-stops-panel";
import { LoadTabPanel } from "@/components/load-tab-panel";
import { LoadWorkspace } from "@/components/load-workspace";
import { LocationSchedulingCard } from "@/components/location-scheduling";
import { PageHeader } from "@/components/page-header";
import { QuickbooksInvoicePanel } from "@/components/quickbooks-invoice-panel";
import { MakeBolPanel } from "@/components/make-bol-button";
import { RateConApply } from "@/components/rate-con-apply";
import { ReeferBadge } from "@/components/reefer-badge";
import { LoadStatusBadge } from "@/components/status-badge";
import { updateLoadAction } from "@/lib/actions";
import { listAttachments } from "@/lib/files";
import { ensureDemoIfta, getIftaPanel } from "@/lib/integrations/ifta";
import { getLatestReeferForLoad, getTrailerLocationForLoad } from "@/lib/integrations/orbcomm";
import { previewQuickbooksInvoice } from "@/lib/integrations/quickbooks";
import { getHosForLoad, getLocationForLoad } from "@/lib/integrations/samsara";
import { parseLoadTab } from "@/lib/load-tabs";
import { isTwilioConfigured } from "@/lib/env";
import { formatLoadSummary } from "@/lib/load-summary";
import { getCustomer, getLoad, listCustomers, listDrivers, listLocations, listTrailers, listTrucks, locationsForLoad } from "@/lib/queries";
import { listRelays } from "@/lib/relay-store";
import { formatRelayLane } from "@/lib/relays";
import { equipmentOptions, listDispatcherUsers, loadFormSettings } from "@/lib/settings";
import { listClaims, requiredDocumentsForLoad } from "@/lib/desk";
import { EQUIPMENT_REQUIRED, labelForAttachmentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LoadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const loadId = Number.parseInt(id, 10);
  const load = getLoad(loadId);
  if (!load) notFound();

  const boundAction = updateLoadAction.bind(null, load.id);
  const stopLocations = locationsForLoad(load);
  await ensureDemoIfta(load);
  const ifta = getIftaPanel(load);
  const attachments = listAttachments(load.id);
  const checklist = requiredDocumentsForLoad(load);
  const formSettings = loadFormSettings();
  const customers = listCustomers();
  const trucks = listTrucks();
  const trailers = listTrailers();
  const locations = listLocations();
  const drivers = listDrivers();
  const customer = load.customer_id ? getCustomer(load.customer_id) : null;
  const equipment = equipmentOptions();
  const equipmentChoices = equipment.length > 0 ? [{ value: "", label: "Any" }, ...equipment] : [...EQUIPMENT_REQUIRED];
  const claims = listClaims(load.id);
  const dispatchers = listDispatcherUsers(false).map((person) => ({ id: person.id, name: person.name }));
  const relays = listRelays(load.id);

  return (
    <>
      <PageHeader
        title={load.load_number}
        subtitle={`${load.origin} → ${load.destination}`}
        actions={
          <div className="flex items-center gap-3">
            <LoadStatusBadge status={load.status} />
            <LoadConfirmationLink loadId={load.id} loadNumber={load.load_number} hasRelays={relays.length > 0} />
            {load.qbo_invoice_number || load.qbo_invoice_id ? (
              <span className="text-sm text-slate-600">
                QBO {load.qbo_invoice_number || load.qbo_invoice_id}
              </span>
            ) : null}
          </div>
        }
      />
      <LoadWorkspace
        loadId={load.id}
        status={load.status}
        initialTab={parseLoadTab(tab)}
        loadSummary={formatLoadSummary(load)}
        driverAssigned={Boolean(load.driver_id)}
        driverPhone={load.driver_phone ?? ""}
        dispatcherId={load.dispatcher_id}
        dispatchers={dispatchers}
        docsRequested={Boolean(load.docs_requested)}
        smsConfigured={isTwilioConfigured()}
      >
        <LoadForm
          customers={customers}
          trucks={trucks}
          trailers={trailers}
          locations={locations}
          drivers={drivers}
          load={load}
          {...formSettings}
          action={boundAction}
          submitLabel="Save load"
        />

        <LoadTabPanel when="customer">
          <CustomerSnapshot customer={customer} />
        </LoadTabPanel>

        <LoadTabPanel when="basics">
          <LoadWatchRow load={load} />
          {relays.length > 0 ? (
            <section className="card mb-4 p-5">
              <h2 className="text-sm font-semibold">Relay markers</h2>
              <p className="mt-1 text-xs text-slate-500">Internal handoffs. Not billed customer stops.</p>
              <ol className="mt-2 space-y-1 text-sm">
                {relays.map((relay) => (
                  <li key={relay.id}>
                    <span className="font-medium">{formatRelayLane(relay.pickup, relay.delivery)}</span>
                    <span className="text-slate-500"> · {relay.driver_name || "Unassigned"}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </LoadTabPanel>

        <LoadTabPanel when="assets">
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
                <ReeferBadge
                  setpoint={load.reefer_setpoint_f}
                  mode={load.reefer_mode || (load.reefer_setpoint_f != null ? "continuous" : "")}
                  reading={await getLatestReeferForLoad(load.id)}
                />
              </div>
            </div>
          </div>
          <AssignedFleetDocs driverId={load.driver_id} truckId={load.truck_id} trailerId={load.trailer_id} />
          <LoadRelaysPanel
            loadId={load.id}
            origin={load.origin}
            destination={load.destination}
            drivers={drivers}
            trucks={trucks}
            trailers={trailers}
          />
        </LoadTabPanel>

        <LoadTabPanel when="stops">
          {stopLocations.shipper || stopLocations.consignee ? (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <LocationSchedulingCard title="Shipper scheduling" location={stopLocations.shipper} />
              <LocationSchedulingCard title="Consignee scheduling" location={stopLocations.consignee} />
            </div>
          ) : null}
          <LoadStopsPanel loadId={load.id} />
        </LoadTabPanel>

        <LoadTabPanel when="financials">
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
          {(load.status === "in_transit" ||
            load.status === "picked_up" ||
            load.status === "at_delivery" ||
            load.status === "unloading" ||
            load.status === "delivered" ||
            load.status === "completed" ||
            ifta.report) && (
            <IftaPanel
              loadId={load.id}
              report={ifta.report}
              canRefresh={ifta.canRefresh}
              configured={ifta.configured}
              reason={ifta.reason}
            />
          )}
          {load.status === "delivered" || load.status === "completed" ? (
            load.rate != null ? (
              <QuickbooksInvoicePanel loadId={load.id} preview={previewQuickbooksInvoice(load)} />
            ) : (
              <section className="card mb-4 p-5 text-sm text-slate-600">
                Set a customer rate on this delivered load to send a QuickBooks invoice.
              </section>
            )
          ) : null}
        </LoadTabPanel>

        <LoadExtraDetails load={load} equipmentChoices={equipmentChoices} claims={claims} />

        <LoadTabPanel when="log">
          <LoadLogSection loadId={load.id} />
          <LoadAuditSection loadId={load.id} />
        </LoadTabPanel>

        <LoadTabPanel when="docs">
          <RateConApply
            load={load}
            customers={customers}
            trucks={trucks}
            trailers={trailers}
            locations={locations}
            drivers={drivers}
            formSettings={formSettings}
          />
          <section className="card mb-4 p-5">
            <h2 className="text-sm font-semibold">Document checklist</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {checklist.map((doc) => {
                const have = attachments.some((file) => file.kind === doc.kind);
                return (
                  <li
                    key={doc.kind}
                    className={have ? "text-emerald-800" : doc.required ? "text-rose-800" : "text-slate-600"}
                  >
                    {have ? "Have" : doc.required ? "Missing" : "Optional"} · {labelForAttachmentKind(doc.kind)}
                  </li>
                );
              })}
            </ul>
          </section>
          <MakeBolPanel loadId={load.id} attachments={attachments} />
          <AttachmentsPanel loadId={load.id} attachments={attachments} />
        </LoadTabPanel>
      </LoadWorkspace>
    </>
  );
}
