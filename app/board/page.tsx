import Link from "next/link";
import { AssignDialog } from "@/components/assign-dialog";
import { BoardFilterProvider, BoardFilterRow } from "@/components/board-filter";
import { BoardToolbar } from "@/components/board-toolbar";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { LoadStatusSelect } from "@/components/load-status-select";
import { PageHeader } from "@/components/page-header";
import { ReeferBadge } from "@/components/reefer-badge";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getLatestReeferForLoad, getReeferSnapshots, snapshotToTrailerLocation } from "@/lib/integrations/orbcomm";
import {
  getSamsaraFleet,
  hosForLoad,
  locationForLoad,
  samsaraGpsEmptyState,
  samsaraHosEmptyState,
} from "@/lib/integrations/samsara";
import { LoadOverlay } from "@/components/load-overlay";
import { overlayHref, overlayReturnTo, parseOpenLoadId } from "@/lib/load-page-shared";
import { loadStatusRowClass, loadStatusTextClass } from "@/lib/load-status-style";
import { listAssignableDrivers, listAssignableTrailers, listAssignableTrucks, listLoads } from "@/lib/queries";
import { extraRelayLabelsByLoad } from "@/lib/relay-store";
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
  const loads = listLoads({ status, date });
  const relayLabels = extraRelayLabelsByLoad(loads);
  const reefers = await getReeferSnapshots();
  const fleet = await getSamsaraFleet();
  const reeferByLoad = new Map<number, ReeferReading | null>();
  for (const load of loads) {
    reeferByLoad.set(load.id, await getLatestReeferForLoad(load.id));
  }

  return (
    <BoardFilterProvider>
      <PageHeader
        title="Dispatch board"
        actions={
          <Link href="/loads/new" className="btn btn-primary">
            New load
          </Link>
        }
      />
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
      <BoardToolbar status={status} date={date} />
      <div className="card overflow-hidden">
        {loads.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-500">No loads match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-grid table-grid-board" data-dispatch-board="">
              <thead>
                <tr>
                  <th>Load</th>
                  <th>Status</th>
                  <th>Pickup</th>
                  <th>Delivery</th>
                  <th>Unit</th>
                  <th>Tractor</th>
                  <th>Trailer</th>
                  <th>HOS</th>
                  <th>Reefer</th>
                  <th>Rate</th>
                  <th>Move</th>
                  <th></th>
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
                    <td className="leading-tight">
                      <Link
                        href={overlayHref("/board", load.id, current)}
                        className={`font-mono text-xs font-semibold hover:underline ${loadStatusTextClass(load.status)}`}
                        title={load.customer_name}
                      >
                        {load.load_number}
                      </Link>
                      <div className="text-xs">
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
                      className="leading-tight text-xs"
                      title={[
                        load.trailer_unit || load.trailer_number ? `Trailer ${load.trailer_unit || load.trailer_number}` : "",
                        load.driver_progress ? labelForDriverProgress(load.driver_progress) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {load.truck_unit ? (
                        <>
                          <div>Unit {load.truck_unit}</div>
                          <div className="text-slate-500">
                            {load.driver_name}
                            {relayLabels.get(load.id) ? ` ${relayLabels.get(load.id)}` : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <LocationBadge
                        location={tractorLocation}
                        empty={samsaraGpsEmptyState({
                          truckAssigned: Boolean(load.truck_id),
                          samsaraVehicleId: load.truck_samsara_id,
                          location: tractorLocation,
                        })}
                      />
                    </td>
                    <td>
                      <TrailerLocationBadge
                        location={
                          reefers.readings
                            .filter((item) => item.loadId === load.id)
                            .map(snapshotToTrailerLocation)
                            .find(Boolean) ?? null
                        }
                      />
                    </td>
                    <td>
                      <HosBadge
                        hos={driverHos}
                        empty={samsaraHosEmptyState({ assigned: Boolean(load.driver_id), hos: driverHos })}
                      />
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
                    <td className="whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        {!isClosedStatus(load.status) ? (
                          <AssignDialog
                            loadId={load.id}
                            loadNumber={load.load_number}
                            trucks={listAssignableTrucks(load.id)}
                            trailers={listAssignableTrailers(load.id)}
                            drivers={listAssignableDrivers(load.id)}
                            defaultOoPercent={defaultOoPercent()}
                            alertWindows={complianceWindows()}
                            label={load.driver_id ? "Change unit" : "Assign"}
                          />
                        ) : null}
                        <Link href={overlayHref("/board", load.id, current)} className="btn btn-ghost">
                          Edit
                        </Link>
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
      {openId ? (
        <LoadOverlay loadId={openId} returnTo={overlayReturnTo("/board", current)} initialTab={openTab} />
      ) : null}
    </BoardFilterProvider>
  );
}
