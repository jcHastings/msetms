import Link from "next/link";
import { redirect } from "next/navigation";
import { driverLogoutAction } from "@/lib/driver-actions";
import { getSignedInDriver } from "@/lib/driver-session";
import { formatDateTime } from "@/lib/format";
import { getLatestReeferForLoad } from "@/lib/integrations/orbcomm";
import { formatDurationMs, getHosForDriver } from "@/lib/integrations/samsara";
import { listLoadsForDriver } from "@/lib/queries";
import { relayForDriver } from "@/lib/relay-store";
import { formatRelayLane } from "@/lib/relays";
import { DriverDestinations } from "@/components/driver-destinations";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatReeferHeader, resolveReeferSpec } from "@/lib/reefer-shared";
import { labelForDriverProgress, type ReeferReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverHomePage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const active = listLoadsForDriver(driver.id).filter((load) => load.status !== "delivered");
  const delivered = listLoadsForDriver(driver.id).filter((load) => load.status === "delivered");
  const hos = await getHosForDriver(driver.id);
  const reeferByLoad = new Map<number, ReeferReading | null>();
  for (const load of active) {
    reeferByLoad.set(load.id, await getLatestReeferForLoad(load.id));
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
            My dispatch
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-white">{driver.name}</h1>
          <p className="text-sm text-slate-400">
            {driver.truck_unit ? `Unit ${driver.truck_unit}` : "No assigned truck"}
            {hos ? ` · ${formatDurationMs(hos.driveRemainingMs)} drive left` : ""}
          </p>
        </div>
        <form action={driverLogoutAction}>
          <button className="btn btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </header>

      {(() => {
        const current = active[0];
        const loadHref = current ? `/driver/loads/${current.id}` : "";
        return (
          <DriverDestinations
            items={[
              { href: "#active", label: "Dispatch" },
              { href: "#active", label: "Active" },
              { href: "#delivered", label: "Delivered" },
              { href: current ? `${loadHref}#fuel` : "#active", label: "Fuel", disabled: !current },
              { href: current ? `${loadHref}#upload` : "#active", label: "Upload", disabled: !current },
              { href: current ? `${loadHref}#bol` : "#active", label: "BOL", disabled: !current },
              {
                href: current ? `/api/loads/${current.id}/confirmation?packet=internal` : "#active",
                label: "Confirmation",
                disabled: !current,
              },
            ]}
          />
        );
      })()}

      <section id="active" className="mt-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Active</h2>
        {active.length === 0 ? (
          <div className="rounded-2xl bg-slate-900 p-6 text-base text-slate-300 ring-1 ring-white/10">
            Nothing assigned to you right now.
          </div>
        ) : (
          <ul className="space-y-3">
            {active.map((load) => {
              const reefer = reeferByLoad.get(load.id);
              const spec = resolveReeferSpec(load);
              return (
                <li key={load.id}>
                  <Link
                    href={`/driver/loads/${load.id}`}
                    className="block rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10"
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
                    <div className="mt-2 text-lg font-medium text-white">
                      {load.origin} → {load.destination}
                    </div>
                    {(() => {
                      const leg = relayForDriver(load.id, driver.id);
                      return leg ? (
                        <div className="mt-1 text-sm font-medium text-slate-300">
                          Your leg: {formatRelayLane(leg.pickup, leg.delivery)}
                        </div>
                      ) : null;
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
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="delivered" className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Delivered</h2>
        {delivered.length === 0 ? (
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
                  <div className="mt-2 text-lg font-medium text-white">
                    {load.origin} → {load.destination}
                  </div>
                  <div className="mt-2 text-sm text-slate-400">{load.customer_name}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
