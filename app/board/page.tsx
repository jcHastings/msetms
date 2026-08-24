import Link from "next/link";
import { AssignDialog } from "@/components/assign-dialog";
import { BoardToolbar } from "@/components/board-toolbar";
import { HosBadge, LocationBadge, TrailerLocationBadge } from "@/components/fleet-badges";
import { LoadStatusSelect } from "@/components/load-status-select";
import { MikeChat } from "@/components/mike-chat";
import { PageHeader } from "@/components/page-header";
import { ReeferBadge } from "@/components/reefer-badge";
import { LoadStatusBadge } from "@/components/status-badge";
import { isOpenAiConfigured } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getLatestReeferForLoad, getReeferSnapshots, snapshotToTrailerLocation } from "@/lib/integrations/orbcomm";
import { getSamsaraFleet } from "@/lib/integrations/samsara";
import { readMikeHistory } from "@/lib/mike";
import { listAssignableDrivers, listAssignableTrailers, listAssignableTrucks, listLoads } from "@/lib/queries";
import { extraRelayLabelsByLoad } from "@/lib/relay-store";
import { complianceWindows, customLoadStatuses, defaultOoPercent } from "@/lib/settings";
import { isClosedStatus, labelForDriverProgress, type ReeferReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; date?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? "active";
  const date = params.date ?? "";
  const q = params.q ?? "";
  const loads = listLoads({ status, date, q });
  const relayLabels = extraRelayLabelsByLoad(loads);
  const reefers = await getReeferSnapshots();
  const fleet = await getSamsaraFleet();
  const reeferByLoad = new Map<number, ReeferReading | null>();
  for (const load of loads) {
    reeferByLoad.set(load.id, await getLatestReeferForLoad(load.id));
  }

  return (
    <>
      <PageHeader
        title="Dispatch board"
        subtitle="Filter by status or pickup date, assign a unit, and move loads through the lane."
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
      <div className="flex flex-col gap-6 xl:flex-row">
      <div className="min-w-0 flex-1">
      <BoardToolbar status={status} date={date} q={q} />
      <div className="card overflow-hidden">
        {loads.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-500">No loads match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-grid">
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
                {loads.map((load) => (
                  <tr key={load.id} className={load.status === "available" ? "shadow-[inset_3px_0_0_#d4a017]" : ""}>
                    <td>
                      <Link href={`/loads/${load.id}`} className="font-mono text-sm font-semibold hover:underline">
                        {load.load_number}
                      </Link>
                      <div className="text-xs text-slate-500">{load.customer_name}</div>
                      <div className="mt-1 text-sm">
                        {load.origin}
                        <span className="mx-1 text-slate-400">→</span>
                        {load.destination}
                      </div>
                    </td>
                    <td>
                      <LoadStatusBadge status={load.status} />
                    </td>
                    <td className="whitespace-nowrap">
                      <div>{formatDateTime(load.pickup_start)}</div>
                      <div className="text-xs text-slate-500">to {formatDateTime(load.pickup_end)}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div>{formatDateTime(load.delivery_start)}</div>
                      <div className="text-xs text-slate-500">to {formatDateTime(load.delivery_end)}</div>
                    </td>
                    <td>
                      {load.truck_unit ? (
                        <>
                          <div>Unit {load.truck_unit}</div>
                          {load.trailer_unit || load.trailer_number ? (
                            <div className="text-xs text-slate-500">
                              Trailer {load.trailer_unit || load.trailer_number}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500">
                            {load.driver_name}
                            {relayLabels.get(load.id) ? ` ${relayLabels.get(load.id)}` : ""}
                          </div>
                          {load.driver_progress ? (
                            <div className="text-xs text-indigo-700">
                              {labelForDriverProgress(load.driver_progress)}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <LocationBadge location={fleet.locations.find((item) => item.loadId === load.id) ?? null} />
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
                      <HosBadge hos={fleet.hos.find((item) => item.loadId === load.id) ?? null} />
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
                        <Link href={`/loads/${load.id}`} className="btn btn-ghost">
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      <MikeChat configured={isOpenAiConfigured()} initialMessages={await readMikeHistory()} />
      </div>
    </>
  );
}
