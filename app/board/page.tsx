import Link from "next/link";
import { Suspense } from "react";
import { AssignDialog } from "@/components/assign-dialog";
import { BoardFilterProvider, BoardFilterRow } from "@/components/board-filter";
import { BoardToolbar } from "@/components/board-toolbar";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { LoadStatusSelect } from "@/components/load-status-select";
import { PageHeader } from "@/components/page-header";
import { ReeferBadge } from "@/components/reefer-badge";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  getDemoReeferForLoad,
  getReeferSnapshots,
  snapshotToReading,
  snapshotToTrailerLocation,
} from "@/lib/integrations/orbcomm";
import {
  getSamsaraFleet,
  hosForLoad,
  locationForLoad,
  samsaraGpsEmptyState,
  samsaraHosEmptyState,
} from "@/lib/integrations/samsara";
import { LoadOverlay } from "@/components/load-overlay";
import { OverlayOpenLink } from "@/components/overlay-open-link";
import { PageOverlayHost } from "@/components/page-overlay-host";
import { overlayHref, overlayReturnTo, parseOpenLoadId } from "@/lib/load-page-shared";
import { loadStatusRowClass, loadStatusTextClass } from "@/lib/load-status-style";
import { sortMasterFamilies } from "@/lib/master-load-shared";
import { assignedLoadName } from "@/lib/owner-operator-shared";
import { listAssignableDrivers, listAssignableTrailers, listAssignableTrucks, listLoads } from "@/lib/queries";
import { extraRelayLabelsByLoad } from "@/lib/relay-store";
import { loadShowsOnDispatchBoard } from "@/lib/load-list-shared";
import { complianceWindows, customLoadStatuses, defaultOoPercent } from "@/lib/settings";
import { isClosedStatus, labelForDriverProgress, type ReeferReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; date?: string; q?: string; open?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? "active";
  const date = params.date ?? "";
  const openId = parseOpenLoadId(params.open);
  const openTab = params.tab;
  const current = { status, date };
  const loads = sortMasterFamilies(
    listLoads({ status, date }).filter((load) => loadShowsOnDispatchBoard(load.status)),
  );
  const assignableTrucks = listAssignableTrucks();
  const assignableTrailers = listAssignableTrailers();
  const assignableDrivers = listAssignableDrivers();
  const relayLabels = extraRelayLabelsByLoad(loads);

  return (
    <PageOverlayHost returnTo={overlayReturnTo("/board", current)} serverOpenId={openId}>
    <BoardFilterProvider>
      <PageHeader
        title="Dispatch board"
        actions={
          <Link href="/loads/new" className="btn btn-primary">
            New load
          </Link>
        }
      />
      <BoardToolbar status={status} date={date} />
      <Suspense fallback={<div className="card h-72 bg-slate-50" data-board-loading="" />}>
        <BoardLiveSection
          loads={loads}
          current={current}
          assignableTrucks={assignableTrucks}
          assignableTrailers={assignableTrailers}
          assignableDrivers={assignableDrivers}
          relayLabels={relayLabels}
        />
      </Suspense>
      {openId ? (
        <LoadOverlay loadId={openId} returnTo={overlayReturnTo("/board", current)} initialTab={openTab} />
      ) : null}
    </BoardFilterProvider>
    </PageOverlayHost>
  );
}

async function BoardLiveSection({
  loads,
  current,
  assignableTrucks,
  assignableTrailers,
  assignableDrivers,
  relayLabels,
}: {
  loads: ReturnType<typeof listLoads>;
  current: { status: string; date: string };
  assignableTrucks: ReturnType<typeof listAssignableTrucks>;
  assignableTrailers: ReturnType<typeof listAssignableTrailers>;
  assignableDrivers: ReturnType<typeof listAssignableDrivers>;
  relayLabels: ReturnType<typeof extraRelayLabelsByLoad>;
}) {
  const [reefers, fleet] = await Promise.all([getReeferSnapshots(), getSamsaraFleet()]);
  const reeferByLoad = new Map<number, ReeferReading | null>();
  for (const load of loads) {
    const live = reefers.readings.find((reading) => reading.loadId === load.id);
    reeferByLoad.set(
      load.id,
      live ? snapshotToReading(live) : reefers.mode === "orbcomm" && !reefers.error ? null : getDemoReeferForLoad(load.id),
    );
  }

  return (
    <>
      {fleet.error ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {fleet.error}
        </p>
      ) : null}
      {reefers.error ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {reefers.error}
        </p>
      ) : null}
      <div className="card overflow-hidden">
        {loads.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-500">No loads match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-grid table-grid-board" data-dispatch-board="">
              <thead>
                <tr>
                  <th className="board-load-cell">Load</th>
                  <th>Status</th>
                  <th>Pickup</th>
                  <th>Delivery</th>
                  <th className="board-unit-cell">Unit</th>
                  <th className="board-place-cell">Tractor</th>
                  <th className="board-place-cell">Trailer</th>
                  <th>HOS</th>
                  <th>Reefer</th>
                  <th>Rate</th>
                  <th>Move</th>
                  <th className="board-edit-head"></th>
                </tr>
              </thead>
              <tbody>
                {loads.map((load) => {
                  const tractorLocation = locationForLoad(fleet, load);
                  const driverHos = hosForLoad(fleet, load);
                  return (
                  <BoardFilterRow
                    key={load.id}
                    className={loadStatusRowClass(load.status)}
                    haystack={[
                      load.load_number,
                      load.customer_name,
                      load.origin,
                      load.destination,
                      load.reference_number,
                      load.po_number,
                      load.customer_reference,
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase()}
                  >
                    <td className="board-load-cell leading-tight">
                      <OverlayOpenLink
                        href={overlayHref("/board", load.id, current)}
                        className={`font-mono text-xs font-semibold hover:underline ${loadStatusTextClass(load.status)}`}
                        title={load.customer_name}
                      >
                        {load.load_number}
                      </OverlayOpenLink>
                      {load.parent_load_id ? (
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Child {load.master_suffix || ""}
                        </div>
                      ) : loads.some((row) => row.parent_load_id === load.id) ? (
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Master</div>
                      ) : null}
                      <div
                        className="truncate whitespace-nowrap text-xs"
                        title={`${load.origin} → ${load.destination}`}
                      >
                        {load.origin}
                        <span className="mx-1 text-slate-400">→</span>
                        {load.destination}
                      </div>
                    </td>
                    <td>
                      <LoadStatusBadge status={load.status} />
                    </td>
                    <td className="whitespace-nowrap text-xs" title={`to ${formatDateTime(load.pickup_end)}`}>
                      {formatDateTime(load.pickup_start)}
                    </td>
                    <td className="whitespace-nowrap text-xs" title={`to ${formatDateTime(load.delivery_end)}`}>
                      {formatDateTime(load.delivery_start)}
                    </td>
                    <td
                      className="board-unit-cell leading-tight text-xs"
                      title={[
                        load.trailer_unit || load.trailer_number ? `Trailer ${load.trailer_unit || load.trailer_number}` : "",
                        load.driver_progress ? labelForDriverProgress(load.driver_progress) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {load.truck_unit ? (
                        <>
                          <div className="truncate">Unit {load.truck_unit}</div>
                          <div className="truncate text-slate-500">
                            {assignedLoadName(load)}
                            {relayLabels.get(load.id) ? ` ${relayLabels.get(load.id)}` : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td
                      className="board-place-cell"
                      title={samsaraGpsEmptyState({
                        truckAssigned: Boolean(load.truck_id),
                        samsaraVehicleId: load.truck_samsara_id,
                        location: tractorLocation,
                      })}
                    >
                      <LocationBadge location={tractorLocation} empty="—" />
                    </td>
                    <td className="board-place-cell">
                      <TrailerLocationBadge
                        location={
                          reefers.readings
                            .filter((item) => item.loadId === load.id)
                            .map(snapshotToTrailerLocation)
                            .find(Boolean) ?? null
                        }
                      />
                    </td>
                    <td title={samsaraHosEmptyState({ assigned: Boolean(load.driver_id), hos: driverHos })}>
                      <HosBadge hos={driverHos} empty="—" />
                    </td>
                    <td>
                      <ReeferBadge
                        setpoint={load.reefer_setpoint_f}
                        reading={reeferByLoad.get(load.id) ?? null}
                      />
                    </td>
                    <td className="whitespace-nowrap">{formatMoney(load.rate)}</td>
                    <td>
                      <LoadStatusSelect
                        loadId={load.id}
                        status={load.status}
                        extraStatuses={customLoadStatuses()}
                      />
                    </td>
                    <td className="board-edit-cell whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        {!isClosedStatus(load.status) ? (
                          <AssignDialog
                            loadId={load.id}
                            loadNumber={load.load_number}
                            trucks={assignableTrucks}
                            trailers={assignableTrailers}
                            drivers={assignableDrivers}
                            defaultOoPercent={defaultOoPercent()}
                            alertWindows={complianceWindows()}
                            label={load.driver_id ? "Change unit" : "Assign"}
                          />
                        ) : null}
                        <OverlayOpenLink href={overlayHref("/board", load.id, current)} className="btn btn-ghost">
                          Edit
                        </OverlayOpenLink>
                      </div>
                    </td>
                  </BoardFilterRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
