import { Suspense } from "react";
import { AssignedFleetDocs } from "@/components/assigned-fleet-docs";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { IftaPanel } from "@/components/ifta-panel";
import { LoadExtraDetails } from "@/components/load-extra-details";
import { LoadAuditSection } from "@/components/load-audit-section";
import { LoadTrackingPanel } from "@/components/load-tracking-panel";
import { LoadConfirmationLink } from "@/components/load-confirmation-link";
import { LoadForm } from "@/components/load-form";
import { LoadPayItems } from "@/components/load-pay-items";
import { LoadRelaysPanel } from "@/components/load-relays-panel";
import { LoadRoutingGuide } from "@/components/load-routing-guide";
import { LoadStopsMap } from "@/components/load-stops-map";
import { LoadStopsPanel } from "@/components/load-stops-panel";
import { LoadTabPanel } from "@/components/load-tab-panel";
import { LoadWorkspace } from "@/components/load-workspace";
import { CopyTripNumber } from "@/components/copy-trip-number";
import { LoadMailPanel } from "@/components/load-mail-panel";
import { LoadMoneyBox } from "@/components/load-money-box";
import { PageHeader } from "@/components/page-header";
import { QuickbooksInvoicePanel } from "@/components/quickbooks-invoice-panel";
import { TmsInvoicePanel } from "@/components/tms-invoice-panel";
import { DefaultedDocuments } from "@/components/defaulted-documents";
import { MakeBolPanel } from "@/components/make-bol-button";
import { bolPrefillForLoad } from "@/lib/bol";
import { listDefaultedDocuments } from "@/lib/load-documents";
import { RateConApply } from "@/components/rate-con-apply";
import { ReeferBadge } from "@/components/reefer-badge";
import { CriticalTag, LoadStatusBadge } from "@/components/status-badge";
import { updateLoadAction } from "@/lib/actions";
import { listAttachments } from "@/lib/files";
import { ensureDemoIfta, getIftaPanel } from "@/lib/integrations/ifta";
import { getLatestReeferForLoad, getTrailerLocationForLoad } from "@/lib/integrations/orbcomm";
import { previewQuickbooksInvoice } from "@/lib/integrations/quickbooks";
import { buildTmsInvoice } from "@/lib/invoice";
import { getHosForLoad, getLocationForLoad, samsaraGpsEmptyState, samsaraHosEmptyState } from "@/lib/integrations/samsara";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { parseLoadTab } from "@/lib/load-tabs";
import { SendToAccountingControls } from "@/components/send-to-accounting";
import { loadIsOnAccountingDesk } from "@/lib/accounting-desk-shared";
import { canAccessAccounting, canDeleteDocuments, canEditLoads, canSendSms, canViewIfta, canViewLoadFinancials } from "@/lib/settings-shared";
import { isTwilioConfigured, isWhatsAppConfigured } from "@/lib/env";
import { loadNeedsCriticalTag } from "@/lib/exceptions";
import { emptyStateMilesFromLoad, officialEmptyMiles, routeGuideFromLoad } from "@/lib/routing-shared";
import { scheduleLoadOpenWork } from "@/lib/load-open-work";
import { usableRouteStops } from "@/lib/routing";
import { lastLoadMail, resolveLoadCustomerEmail, resolveLoadDriverEmail } from "@/lib/load-mail";
import { formatLoadSummary } from "@/lib/load-summary";
import { formatDateTime } from "@/lib/format";
import { formatLoadLaneFromStops } from "@/lib/locations";
import { formatRelayLane } from "@/lib/relays";
import { relayForDriver } from "@/lib/relay-store";
import { listPayItems } from "@/lib/pay-items";
import { getLoad, listCustomers, listDrivers, listLocations, listTrailers, listTrucks } from "@/lib/queries";
import { listRelays } from "@/lib/relay-store";
import { equipmentOptions, listDispatcherUsers, loadFormSettings } from "@/lib/settings";
import { listClaims, requiredDocumentsForLoad } from "@/lib/desk";
import { ensureDefaultStops } from "@/lib/stops";
import { EQUIPMENT_REQUIRED, isOwnerOperator, labelForAttachmentKind, type LoadView } from "@/lib/types";

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
  const stops = ensureDefaultStops(load.id);
  scheduleLoadOpenWork(load.id);
  const routed = getLoad(load.id) ?? load;
  const routeGuide = routeGuideFromLoad(routed, { stopCount: usableRouteStops(stops).length });
  const payItems = listPayItems(load.id);
  const yours = load.driver_id ? relayForDriver(load.id, load.driver_id) : null;

  return (
    <div className={variant === "overlay" ? "load-overlay-editor" : undefined}>
      <LoadWorkspace
        header={
          <PageHeader
            title={load.load_number}
            subtitle={formatLoadLaneFromStops(stops, locations) || `${load.origin} → ${load.destination}`}
            actions={
              <div className="flex items-center gap-3">
                <CopyTripNumber value={load.load_number} />
                <LoadStatusBadge status={load.status} />
                {loadNeedsCriticalTag(load.id) ? <CriticalTag /> : null}
                <LoadConfirmationLink loadId={load.id} loadNumber={load.load_number} hasRelays={relays.length > 0} />
                {load.qbo_invoice_number || load.qbo_invoice_id ? (
                  <span className="text-sm text-slate-600">
                    QBO {load.qbo_invoice_number || load.qbo_invoice_id}
                  </span>
                ) : null}
                {canEditLoads(role) || canAccessAccounting(role) ? (
                  <SendToAccountingControls
                    loadId={load.id}
                    loadNumber={load.load_number}
                    status={load.status}
                    desk={load.accounting_desk}
                    canSend={canEditLoads(role) && !load.non_revenue}
                    canReturn={canAccessAccounting(role)}
                    variant="header"
                  />
                ) : null}
              </div>
            }
          />
        }
        loadId={load.id}
        status={load.status}
        initialTab={tab}
        loadSummary={formatLoadSummary({
          ...load,
          stops,
          your_leg: yours ? formatRelayLane(yours.pickup, yours.delivery) : "",
        })}
        loadSummaryEs={formatLoadSummary({
          ...load,
          stops,
          your_leg: yours ? formatRelayLane(yours.pickup, yours.delivery) : "",
          locale: "es",
        })}
        driverName={load.driver_name ?? ""}
        driverAssigned={Boolean(load.driver_id)}
        driverPhone={load.driver_phone ?? ""}
        dispatcherId={load.dispatcher_id}
        dispatchers={dispatchers}
        docsRequested={Boolean(load.docs_requested)}
        smsConfigured={isTwilioConfigured()}
        whatsappConfigured={isWhatsAppConfigured()}
        role={role}
        returnTo={returnTo}
        watched={Boolean(load.watched)}
        loadNumber={load.load_number}
        customerName={load.customer_name}
        contactEmail={resolveLoadCustomerEmail(load)}
        driverEmail={resolveLoadDriverEmail(load)}
        readyToInvoice={Boolean(load.ready_to_invoice)}
        nonRevenue={Boolean(load.non_revenue)}
        accountingDesk={load.accounting_desk}
        canSendToAccounting={canEditLoads(role) && !load.non_revenue}
        canReturnFromAccounting={canAccessAccounting(role)}
      >
        <LoadTabPanel when="basics">
          <LoadMoneyBox load={load} />
          {canSendSms(role) ? (
            <LoadMailPanel
              loadId={load.id}
              loadNumber={load.load_number}
              driverEmail={resolveLoadDriverEmail(load)}
              customerEmail={resolveLoadCustomerEmail(load)}
              driverAssigned={Boolean(load.driver_id)}
              lastDriverSent={(() => {
                const row = lastLoadMail(load.id, "driver_load");
                return row ? formatDateTime(row.created_at) : "";
              })()}
              lastCustomerSent={(() => {
                const row = lastLoadMail(load.id, "customer_update");
                return row ? formatDateTime(row.created_at) : "";
              })()}
            />
          ) : null}
        </LoadTabPanel>
        <LoadTabPanel when={["basics", "customer", "assets"]} keepMounted>
          {loadIsOnAccountingDesk(load) && !canAccessAccounting(role) ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              This load is in Accounting. Ask Accounting to send it back before changing it.
            </p>
          ) : null}
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
          <Suspense fallback={<section className="card mb-4 px-5 py-10 text-sm text-slate-500">Opening route…</section>}>
            <LoadStopsMap loadId={load.id} />
          </Suspense>
          <LoadStopsPanel
            loadId={load.id}
            stops={stops}
            locations={locations}
            routeGuide={routeGuide}
            placesEnabled={formSettings.placesEnabled}
          />
          <LoadRoutingGuide
            loadId={load.id}
            guide={routeGuide}
            emptyMiles={officialEmptyMiles(routed.empty_miles, routed.empty_source)}
            emptyLane={routed.empty_from && routed.empty_to ? `${routed.empty_from} → ${routed.empty_to}` : ""}
            emptyStates={emptyStateMilesFromLoad(routed)}
          />
        </LoadTabPanel>

        <LoadTabPanel when="financials">
          {showFinancials ? (
            <>
              <div className="mb-4">
                <SendToAccountingControls
                  loadId={load.id}
                  loadNumber={load.load_number}
                  status={load.status}
                  desk={load.accounting_desk}
                  canSend={canEditLoads(role) && !load.non_revenue}
                  canReturn={canAccessAccounting(role)}
                />
              </div>
              <TmsInvoicePanel
                loadId={load.id}
                status={load.status}
                saved={Boolean(load.tms_invoice_number)}
                invoices={attachments.filter((file) => file.kind === "invoice")}
                invoice={(() => {
                  try {
                    return buildTmsInvoice(load);
                  } catch {
                    return null;
                  }
                })()}
              />
              <LoadPayItems
                loadId={load.id}
                items={payItems}
                customerName={load.customer_name}
                driverName={load.driver_name}
                driverType={load.driver_type}
                status={load.status}
                invoiceAttachmentId={attachments.find((file) => file.kind === "invoice")?.id ?? null}
                rateFallback={load.rate}
                ooPay={load.oo_pay}
                ownerOperators={drivers
                  .filter((driver) => isOwnerOperator(driver.driver_type))
                  .map((driver) => driver.name)}
              />
              {loadIsOnAccountingDesk(load) ? (
                <QuickbooksInvoicePanel loadId={load.id} preview={previewQuickbooksInvoice(load)} />
              ) : null}
            </>
          ) : null}
        </LoadTabPanel>

        <LoadTabPanel when="log">
          <div>
          <Suspense fallback={<p className="px-5 py-6 text-sm text-slate-500">Opening log…</p>}>
            <LoadLogLiveCards load={load} role={role} />
          </Suspense>
          <LoadExtraDetails load={load} claims={claims} />
          <LoadTrackingPanel loadId={load.id} />
          <LoadAuditSection loadId={load.id} />
          </div>
        </LoadTabPanel>

        <LoadTabPanel when="docs">
          <div data-load-tab="docs" className="space-y-4">
          <div className="load-docs-actions mb-3 px-4 py-3">
            <div className="load-actions-label mb-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
              Document actions
            </div>
            <p className="text-sm text-slate-700">
              Defaulted documents stay on this load. Print / view opens the preview — it does not close the load.
            </p>
          </div>
          <DefaultedDocuments
            loadId={load.id}
            loadNumber={load.load_number}
            documents={listDefaultedDocuments(load.id)}
          />
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
          <section className="card mb-4 overflow-hidden">
            <div className="section-head px-5 py-3">
              <h2 className="text-sm font-semibold">Document checklist</h2>
            </div>
            <ul className="space-y-1 p-5 text-sm">
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
          <MakeBolPanel loadId={load.id} attachments={attachments} prefill={bolPrefillForLoad(load)} />
          <AttachmentsPanel loadId={load.id} attachments={attachments} canDelete={canDeleteDocuments(role)} />
          </div>
        </LoadTabPanel>
      </LoadWorkspace>
    </div>
  );
}

async function LoadLogLiveCards({ load, role }: { load: LoadView; role: string }) {
  await ensureDemoIfta(load);
  const ifta = getIftaPanel(load);
  const tractorLocation = await getLocationForLoad(load.id);
  const driverHos = await getHosForLoad(load.id);
  return (
    <>
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
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trailer (Orbcomm)</div>
          <div className="mt-1">
            <TrailerLocationBadge location={await getTrailerLocationForLoad(load.id)} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reefer (Orbcomm)</div>
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
        <IftaPanel loadId={load.id} report={ifta.report} canRefresh={ifta.canRefresh} />
      ) : null}
    </>
  );
}
