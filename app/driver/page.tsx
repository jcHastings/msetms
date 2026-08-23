import Link from "next/link";
import { redirect } from "next/navigation";
import { driverLogoutAction } from "@/lib/driver-actions";
import { getSignedInDriver } from "@/lib/driver-session";
import { formatDateTime } from "@/lib/format";
import { getLatestReeferForLoad } from "@/lib/integrations/samsara";
import { listLoadsForDriver } from "@/lib/queries";
import { LoadStatusBadge } from "@/components/status-badge";
import { labelForDriverProgress } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverHomePage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const loads = listLoadsForDriver(driver.id).filter((load) => load.status !== "delivered");
  const done = listLoadsForDriver(driver.id).filter((load) => load.status === "delivered");

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            My dispatch
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{driver.name}</h1>
          <p className="text-sm text-slate-500">
            {driver.truck_unit ? `Unit ${driver.truck_unit}` : "No assigned truck"}
          </p>
        </div>
        <form action={driverLogoutAction}>
          <button className="btn btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </header>

      {loads.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-base text-slate-600 shadow-sm">
          Nothing assigned to you right now.
        </div>
      ) : (
        <ul className="space-y-3">
          {loads.map((load) => {
            const reefer = getLatestReeferForLoad(load.id);
            return (
              <li key={load.id}>
                <Link href={`/driver/loads/${load.id}`} className="block rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-lg font-semibold">{load.load_number}</div>
                    <LoadStatusBadge status={load.status} />
                  </div>
                  <div className="mt-2 text-lg font-medium">
                    {load.origin} → {load.destination}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{load.customer_name}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs uppercase text-slate-400">Pickup</div>
                      {formatDateTime(load.pickup_start)}
                    </div>
                    <div>
                      <div className="text-xs uppercase text-slate-400">Delivery</div>
                      {formatDateTime(load.delivery_end)}
                    </div>
                  </div>
                  {load.driver_progress ? (
                    <div className="mt-3 text-sm font-medium text-indigo-700">
                      {labelForDriverProgress(load.driver_progress)}
                    </div>
                  ) : null}
                  {load.reefer_setpoint_f != null || reefer ? (
                    <div className="mt-2 text-sm text-slate-600">
                      Reefer {reefer?.temperature_f ?? "—"}°F
                      {load.reefer_setpoint_f != null ? ` / set ${load.reefer_setpoint_f}°F` : ""}
                      {reefer?.source === "demo" ? " · demo" : ""}
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Recently delivered</h2>
          <ul className="space-y-2 text-sm">
            {done.slice(0, 4).map((load) => (
              <li key={load.id}>
                <Link href={`/driver/loads/${load.id}`} className="text-slate-700 underline">
                  {load.load_number} · {load.destination}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
