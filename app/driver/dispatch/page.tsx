import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedInDriver } from "@/lib/driver-session";
import { presentDispatchAck } from "@/lib/dispatch-ack";
import { formatDateTime } from "@/lib/format";
import { getDemoReeferForLoad, readStoredReeferSnapshots, snapshotToReading } from "@/lib/integrations/orbcomm";
import { archiveCutoff } from "@/lib/working-loads";
import { isArchivedLoad } from "@/lib/working-loads-shared";
import { listLoadsForDriver } from "@/lib/queries";
import { driverSwapLegView } from "@/lib/driver-leg";
import { relayForDriver } from "@/lib/relay-store";
import { formatRelayLane } from "@/lib/relays";
import { DriverAckState } from "@/components/driver-got-it";
import { DriverDispatchBoard } from "@/components/driver-dispatch-board";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatReeferHeader, resolveReeferSpec } from "@/lib/reefer-shared";
import { isActiveLoadStatus, labelForDriverProgress, type ReeferReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverDispatchPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const active = listLoadsForDriver(driver.id).filter((load) => isActiveLoadStatus(load.status));
  const cutoff = archiveCutoff();
  const delivered = listLoadsForDriver(driver.id).filter(
    (load) => (load.status === "delivered" || load.status === "completed") && !isArchivedLoad(load, cutoff),
  );
  const reefers = readStoredReeferSnapshots();
  const reeferByLoad = new Map<number, ReeferReading | null>();
  for (const load of active) {
    const snap = reefers.readings.find((row) => row.loadId === load.id);
    reeferByLoad.set(load.id, snap ? snapshotToReading(snap) : getDemoReeferForLoad(load.id));
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href="/driver" className="text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">Dispatch</h1>
      <p className="mt-1 text-sm text-slate-400">Active and delivered loads assigned to you.</p>

      <DriverDispatchBoard
        active={
          active.length === 0 ? (
            <div className="rounded-2xl bg-slate-900 p-6 text-base text-slate-300 ring-1 ring-white/10">
              Nothing assigned to you right now.
            </div>
          ) : (
            <ul className="space-y-3">
              {active.map((load) => {
                const reefer = reeferByLoad.get(load.id);
                const spec = resolveReeferSpec(load);
                return (
                  <li key={load.id} className="rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10">
                    <Link
                      href={`/driver/loads/${load.id}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-lg font-semibold text-white">{load.load_number}</div>
                        <LoadStatusBadge status={load.status} />
                      </div>
                      {load.docs_requested ? (
                        <div className="mt-2 rounded-lg bg-amber-400/15 px-2 py-1 text-sm font-medium text-amber-200">
                          Dispatch asked for documents
                        </div>
                      ) : null}
                      {(() => {
                        const leg = relayForDriver(load.id, driver.id);
                        const swapLeg = driverSwapLegView({
                          driverId: driver.id,
                          origin: load.origin,
                          destination: load.destination,
                          trailerNumber: load.trailer_number || load.trailer_unit || "",
                          truckUnit: load.truck_unit || "",
                          relay: leg,
                        });
                        if (swapLeg) {
                          return (
                            <div className="mt-2 text-lg font-medium text-white">
                              {swapLeg.lane}
                              <div className="mt-1 text-sm font-medium text-slate-300">
                                Swap {swapLeg.swapPoint}
                                {swapLeg.swapAt ? ` · ${formatDateTime(swapLeg.swapAt)}` : ""}
                                {swapLeg.trailer ? ` · Trailer ${swapLeg.trailer}` : ""}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <>
                            <div className="mt-2 text-lg font-medium text-white">
                              {load.origin} → {load.destination}
                            </div>
                            {leg ? (
                              <div className="mt-1 text-sm font-medium text-slate-300">
                                Your leg: {formatRelayLane(leg.pickup, leg.delivery)}
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                      <div className="mt-2 text-sm text-slate-400">{load.customer_name}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-300">
                        <div>
                          <div className="text-xs uppercase text-slate-500">Pickup</div>
                          {formatDateTime(load.pickup_start)}
                        </div>
                        <div>
                          <div className="text-xs uppercase text-slate-500">Delivery</div>
                          {formatDateTime(load.delivery_end)}
                        </div>
                      </div>
                      {load.driver_progress ? (
                        <div className="mt-3 text-sm font-medium text-sky-300">
                          {labelForDriverProgress(load.driver_progress)}
                        </div>
                      ) : null}
                      {spec.isReefer || reefer ? (
                        <div className="mt-2 text-sm font-medium text-sky-200">
                          {formatReeferHeader(spec) || "Reefer"}
                          {reefer?.temperature_f != null ? ` · live ${reefer.temperature_f}°F` : ""}
                          {reefer?.source === "demo" ? " · demo" : reefer?.source === "orbcomm" ? " · Orbcomm" : ""}
                        </div>
                      ) : null}
                    </Link>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase text-slate-500">Trailer</div>
                        <div className="text-base font-medium text-white" data-current-trailer="">
                          {load.trailer_unit || load.trailer_number || "None yet"}
                        </div>
                      </div>
                      <Link
                        href={`/driver/loads/${load.id}/trailer/change`}
                        className="btn btn-secondary"
                        style={{ minHeight: "3.5rem", fontSize: "1.0625rem" }}
                        data-change-trailer=""
                        aria-label={`Change trailer for ${load.load_number}`}
                      >
                        Change trailer
                      </Link>
                    </div>
                    {(() => {
                      const ack = presentDispatchAck(load);
                      if (ack.state === "none") return null;
                      return (
                        <DriverAckState
                          loadId={load.id}
                          acknowledgedClock={ack.state === "acknowledged" ? ack.clock : null}
                        />
                      );
                    })()}
                  </li>
                );
              })}
            </ul>
          )
        }
        delivered={
          delivered.length === 0 ? (
            <div className="rounded-2xl bg-slate-900 p-6 text-base text-slate-400 ring-1 ring-white/10">
              No delivered trips yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {delivered.map((load) => (
                <li key={load.id}>
                  <Link
                    href={`/driver/loads/${load.id}`}
                    className="block rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-lg font-semibold text-white">{load.load_number}</div>
                      <LoadStatusBadge status={load.status} />
                    </div>
                    {(() => {
                      const swapLeg = driverSwapLegView({
                        driverId: driver.id,
                        origin: load.origin,
                        destination: load.destination,
                        trailerNumber: load.trailer_number || load.trailer_unit || "",
                        truckUnit: load.truck_unit || "",
                        relay: relayForDriver(load.id, driver.id),
                      });
                      return (
                        <div className="mt-2 text-lg font-medium text-white">
                          {swapLeg?.lane || `${load.origin} → ${load.destination}`}
                        </div>
                      );
                    })()}
                    <div className="mt-2 text-sm text-slate-400">{load.customer_name}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      />
    </div>
  );
}
