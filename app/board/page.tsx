import Link from "next/link";
import { Suspense } from "react";
import { AssignDialog } from "@/components/assign-dialog";
import { LoadCardFastActions } from "@/components/load-card-fast-actions";
import { listStopAppointmentTargets } from "@/lib/stops";
import { BoardFilterProvider, BoardFilterRow } from "@/components/board-filter";
import { BoardToolbar } from "@/components/board-toolbar";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { LoadStatusSelect } from "@/components/load-status-select";
import { PageHeader } from "@/components/page-header";
import { ReeferBadge } from "@/components/reefer-badge";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatBoardDateTime, formatDateTime, formatMoney } from "@/lib/format";
import { orbcommMapPinFromReading } from "@/lib/fleet-map-shared";
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
import { listFiltersForBoardStatus, loadShowsOnDispatchBoard } from "@/lib/load-list-shared";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
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
  const dispatcher = await getSignedInDispatcher();
  const loads = sortMasterFamilies(
    listLoads(listFiltersForBoardStatus(status, { date, dispatcherId: dispatcher?.id })).filter(
      (load) => status === "accounting" || loadShowsOnDispatchBoard(load.status),
    ),
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

function BoardWhenCell({ start, end }: { start: string; end: string }) {
  const { date, time } = formatBoardDateTime(start);
  return (
    <td className="board-when-cell" title={`to ${formatDateTime(end)}`}>
      <div className="board-when">
        <div className="board-when-date">{date}</div>
        {time ? <div className="board-when-time">{time}</div> : null}
      </div>
    </td>
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
          <div className="board-scroll">
            <table className="table-grid table-grid-board" data-dispatch-board="">
              <thead>
                <tr>
                  <th className="board-load-cell">Load</th>
                  <th className="board-status-cell">Status</th>
                  <th className="board-when-cell">Pickup</th>
                  <th className="board-when-cell">Delivery</th>
                  <th className="board-unit-cell">Unit</th>
                  <th className="board-place-cell">Tractor</th>
                  <th className="board-place-cell board-trailer-cell">Trailer</th>
                  <th className="board-hos-cell">HOS</th>
                  <th className="board-reefer-cell">Reefer</th>
                  <th className="board-rate-cell">Rate</th>
                  <th className="board-move-cell">Move</th>
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
                      <div className="board-lane" title={`${load.origin} → ${load.destination}`}>
                        <div className="board-lane-line">{load.origin}</div>
                        <div className="board-lane-line text-slate-500">→ {load.destination}</div>
                      </div>
                    </td>
                    <td className="board-status-cell">
                      <LoadStatusBadge status={load.status} />
                    </td>
                    <BoardWhenCell start={load.pickup_start} end={load.pickup_end} />
                    <BoardWhenCell start={load.delivery_start} end={load.delivery_end} />
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
                    <td className="board-place-cell board-trailer-cell">
                      <TrailerLocationBadge
                        location={
                          reefers.readings
                            .filter((item) => item.loadId === load.id)
                            .map(snapshotToTrailerLocation)
                            .find(Boolean) ?? null
                        }
                        pinColor={orbcommMapPinFromReading(
                          reefers.readings.find((item) => item.loadId === load.id),
                        ).pinColor}
                      />
                    </td>
                    <td
                      className="board-hos-cell"
                      title={samsaraHosEmptyState({ assigned: Boolean(load.driver_id), hos: driverHos })}
                    >
                      <HosBadge hos={driverHos} empty="—" />
                    </td>
                    <td className="board-reefer-cell">
                      <ReeferBadge
                        setpoint={load.reefer_setpoint_f}
                        reading={reeferByLoad.get(load.id) ?? null}
                      />
                    </td>
                    <td className="board-rate-cell whitespace-nowrap">{formatMoney(load.rate)}</td>
                    <td className="board-move-cell">
                      <LoadStatusSelect
                        loadId={load.id}
                        status={load.status}
                        extraStatuses={customLoadStatuses()}
                      />
                    </td>
                    <td className="board-edit-cell whitespace-nowrap">
                      <div className="flex justify-end gap-2" data-load-card-actions="">
                        <LoadCardFastActions
                          loadId={load.id}
                          loadNumber={load.load_number}
                          stops={listStopAppointmentTargets(load.id)}
                        />
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
