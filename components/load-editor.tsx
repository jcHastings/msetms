import { AssignedFleetDocs } from "@/components/assigned-fleet-docs";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { IftaPanel } from "@/components/ifta-panel";
import { LoadExtraDetails } from "@/components/load-extra-details";
import { LoadAuditSection } from "@/components/load-audit-section";
import { LoadLogSection } from "@/components/load-log-section";
import { LoadConfirmationLink } from "@/components/load-confirmation-link";
import { LoadForm } from "@/components/load-form";
import { LoadPayItems } from "@/components/load-pay-items";
import { LoadRelaysPanel } from "@/components/load-relays-panel";
import { LoadRoutingGuide } from "@/components/load-routing-guide";
import { LoadStopsPanel } from "@/components/load-stops-panel";
import { LoadTabPanel } from "@/components/load-tab-panel";
import { LoadWorkspace } from "@/components/load-workspace";
import { PageHeader } from "@/components/page-header";
import { QuickbooksInvoicePanel } from "@/components/quickbooks-invoice-panel";
import { TmsInvoicePanel } from "@/components/tms-invoice-panel";
import { MakeBolPanel } from "@/components/make-bol-button";
import { RateConApply } from "@/components/rate-con-apply";
import { ReeferBadge } from "@/components/reefer-badge";
import { LoadStatusBadge } from "@/components/status-badge";
import { updateLoadAction } from "@/lib/actions";
import { listAttachments } from "@/lib/files";
import { ensureDemoIfta, getIftaPanel } from "@/lib/integrations/ifta";
import { getLatestReeferForLoad, getTrailerLocationForLoad } from "@/lib/integrations/orbcomm";
import { previewQuickbooksInvoice } from "@/lib/integrations/quickbooks";
import { buildTmsInvoice } from "@/lib/invoice";
import { getHosForLoad, getLocationForLoad, samsaraGpsEmptyState, samsaraHosEmptyState } from "@/lib/integrations/samsara";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { parseLoadTab } from "@/lib/load-tabs";
import { canDeleteDocuments, canViewIfta, canViewLoadFinancials } from "@/lib/settings-shared";
import { isGooglePlacesConfigured, isTwilioConfigured } from "@/lib/env";
import { routeGuideFromLoad } from "@/lib/routing-shared";
import { formatLoadSummary } from "@/lib/load-summary";
import { formatRelayLane } from "@/lib/relays";
import { relayForDriver } from "@/lib/relay-store";
import { listPayItems } from "@/lib/pay-items";
import { getLoad, listCustomers, listDrivers, listLocations, listTrailers, listTrucks } from "@/lib/queries";
import { listRelays } from "@/lib/relay-store";
import { equipmentOptions, listDispatcherUsers, loadFormSettings } from "@/lib/settings";
import { listClaims, requiredDocumentsForLoad } from "@/lib/desk";
import { ensureDefaultStops } from "@/lib/stops";
import { EQUIPMENT_REQUIRED, labelForAttachmentKind } from "@/lib/types";

export async function LoadEditor({
  loadId,
  returnTo,
  initialTab,
  variant = "page",
}: {
  loadId: number;
  returnTo: string;
  initialTab?: string;
  variant?: "page" | "overlay";
}) {
  const load = getLoad(loadId);
  if (!load) return null;
  const dispatcher = await getSignedInDispatcher();
  const role = dispatcher?.role ?? "dispatcher";
  const showFinancials = canViewLoadFinancials(role);
  const requestedTab = parseLoadTab(initialTab);
  const tab = requestedTab === "financials" && !showFinancials ? "basics" : requestedTab;
  const boundAction = updateLoadAction.bind(null, load.id);
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
  const equipment = equipmentOptions();
  const equipmentChoices = equipment.length > 0 ? [{ value: "", label: "Any" }, ...equipment] : [...EQUIPMENT_REQUIRED];
  const claims = listClaims(load.id);
  const dispatchers = listDispatcherUsers(false).map((person) => ({ id: person.id, name: person.name }));
  const relays = listRelays(load.id);
  const tractorLocation = await getLocationForLoad(load.id);
  const driverHos = await getHosForLoad(load.id);
  const stops = ensureDefaultStops(load.id);
  const payItems = listPayItems(load.id);
  const yours = load.driver_id ? relayForDriver(load.id, load.driver_id) : null;

  return (
    <div className={variant === "overlay" ? "load-overlay-editor" : undefined}>
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
        initialTab={tab}
        loadSummary={formatLoadSummary({
          ...load,
          your_leg: yours ? formatRelayLane(yours.pickup, yours.delivery) : "",
        })}
        driverAssigned={Boolean(load.driver_id)}
        driverPhone={load.driver_phone ?? ""}
        dispatcherId={load.dispatcher_id}
        dispatchers={dispatchers}
        docsRequested={Boolean(load.docs_requested)}
        smsConfigured={isTwilioConfigured()}
        role={role}
        returnTo={returnTo}
        watched={Boolean(load.watched)}
      >
        <LoadTabPanel when={["basics", "customer", "assets"]}>
          <LoadForm
            customers={customers}
            trucks={trucks}
            trailers={trailers}
            locations={locations}
            drivers={drivers}
            load={load}
            equipmentChoices={equipmentChoices}
            returnTo={returnTo}
            {...formSettings}
            action={boundAction}
            submitLabel="Save load"
          />
        </LoadTabPanel>

        <LoadTabPanel when="assets">
          <LoadRelaysPanel
            loadId={load.id}
            relays={relays}
            drivers={drivers.map((driver) => ({
              id: driver.id,
              name: driver.name,
              driver_type: driver.driver_type,
            }))}
            primaryDriverId={load.driver_id}
          />
        </LoadTabPanel>

        <LoadTabPanel when="stops">
          <LoadStopsPanel loadId={load.id} stops={stops} locations={locations} />
          <LoadRoutingGuide
            loadId={load.id}
            guide={routeGuideFromLoad(load)}
            mapsConfigured={isGooglePlacesConfigured()}
          />
        </LoadTabPanel>

        <LoadTabPanel when="financials">
          {showFinancials ? (
            <>
              <TmsInvoicePanel
                loadId={load.id}
                status={load.status}
                invoice={
                  load.tms_invoice_number
                    ? (() => {
                        try {
                          return buildTmsInvoice(load);
                        } catch {
                          return null;
                        }
                      })()
                    : null
                }
              />
              <LoadPayItems
                loadId={load.id}
                items={payItems}
                customerName={load.customer_name}
                driverName={load.driver_name}
                driverType={load.driver_type}
                ownerOperators={drivers
                  .filter((driver) => driver.driver_type === "owner_operator")
                  .map((driver) => driver.name)}
              />
            </>
          ) : null}
        </LoadTabPanel>

        <LoadTabPanel when="log">
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tractor (Samsara)</div>
              <div className="mt-1">
                <LocationBadge
                  location={tractorLocation}
                  empty={samsaraGpsEmptyState({
                    truckAssigned: Boolean(load.truck_id),
                    samsaraVehicleId: load.truck_samsara_id,
                    location: tractorLocation,
                  })}
                />
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Driver HOS (Samsara)</div>
              <div className="mt-1">
                <HosBadge
                  hos={driverHos}
                  empty={samsaraHosEmptyState({ assigned: Boolean(load.driver_id), hos: driverHos })}
                />
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
          {canViewIfta(role) &&
          (load.status === "in_transit" ||
            load.status === "picked_up" ||
            load.status === "at_delivery" ||
            load.status === "unloading" ||
            load.status === "delivered" ||
            load.status === "completed" ||
            ifta.report) ? (
            <IftaPanel
              loadId={load.id}
              report={ifta.report}
              canRefresh={ifta.canRefresh}
              configured={ifta.configured}
              reason={ifta.reason}
            />
          ) : null}
          <LoadExtraDetails load={load} claims={claims} />
          <LoadLogSection loadId={load.id} />
          <LoadAuditSection loadId={load.id} />
        </LoadTabPanel>

        <LoadTabPanel when="docs">
          <AssignedFleetDocs driverId={load.driver_id} truckId={load.truck_id} trailerId={load.trailer_id} />
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
          {showFinancials && (load.status === "delivered" || load.status === "completed") ? (
            load.rate != null ? (
              <QuickbooksInvoicePanel loadId={load.id} preview={previewQuickbooksInvoice(load)} />
            ) : (
              <section className="card mb-4 p-5 text-sm text-slate-600">
                Add a customer income line item on a delivered load to send a QuickBooks invoice.
              </section>
            )
          ) : null}
          <MakeBolPanel loadId={load.id} attachments={attachments} />
          <AttachmentsPanel loadId={load.id} attachments={attachments} canDelete={canDeleteDocuments(role)} />
        </LoadTabPanel>
      </LoadWorkspace>
    </div>
  );
}
