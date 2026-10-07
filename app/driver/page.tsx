import { redirect } from "next/navigation";
import { driverLogoutAction } from "@/lib/driver-actions";
import { getSignedInDriver } from "@/lib/driver-session";
import { driverShouldAcknowledge } from "@/lib/dispatch-ack";
import { formatDateTime } from "@/lib/format";
import { formatDurationMs, getHosForDriver } from "@/lib/integrations/samsara";
import { listLoadsForDriver } from "@/lib/queries";
import { DriverAckState } from "@/components/driver-got-it";
import { DriverDestinations } from "@/components/driver-destinations";
import { DriverAssistSheet } from "@/components/driver-assist-sheet";
import { pickDriverDestinationLoad } from "@/lib/driver-destinations-shared";
import { driverTrailerPageHref } from "@/lib/driver-trailer";
import { isActiveLoadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverHomePage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const active = listLoadsForDriver(driver.id).filter((load) => isActiveLoadStatus(load.status));
  const delivered = listLoadsForDriver(driver.id).filter(
    (load) => load.status === "delivered" || load.status === "completed",
  );
  const hos = await getHosForDriver(driver.id);

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
        <div className="flex flex-col items-end gap-2">
          <DriverAssistSheet />
          <form action={driverLogoutAction}>
            <button className="btn btn-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {active
        .filter((load) => driverShouldAcknowledge(load, driver.id))
        .map((load) => (
          <section
            key={load.id}
            className="mb-4 rounded-2xl bg-slate-900 p-4 ring-1 ring-amber-400/80"
            data-new-dispatch={load.load_number}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">New dispatch</div>
            <h2 className="mt-1 font-mono text-xl font-semibold text-white">{load.load_number}</h2>
            <p className="mt-1 text-lg font-medium text-white">
              {load.origin} → {load.destination}
            </p>
            <p className="mt-1 text-sm text-slate-300">Pickup {formatDateTime(load.pickup_start)}</p>
            <DriverAckState loadId={load.id} acknowledgedClock={null} />
          </section>
        ))}

      {(() => {
        const current = pickDriverDestinationLoad(active, delivered);
        const loadHref = current ? `/driver/loads/${current.id}` : "";
        const trailerHref = driverTrailerPageHref(current);
        const items = [
          { href: "/driver/dispatch", label: "Dispatch", featured: true },
          { href: current ? `${loadHref}#upload` : "/driver/dispatch", label: "Upload", disabled: !current },
          {
            href: current ? `/api/loads/${current.id}/confirmation?packet=internal` : "/driver/dispatch",
            label: "Confirmation",
            disabled: !current,
          },
          { href: "/driver/fuel", label: "Fuel" },
          { href: "/driver/paystubs", label: "Paystubs" },
          {
            href: trailerHref ?? "",
            label: "Trailer",
            disabled: !trailerHref,
          },
          { href: "/driver/pay", label: "My pay" },
          { href: "/driver/reimbursements", label: "Reimbursements" },
        ];
        return <DriverDestinations items={items} />;
      })()}
    </div>
  );
}
