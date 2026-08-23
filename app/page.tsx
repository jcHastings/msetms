import Link from "next/link";
import { ExceptionInboxCard } from "@/components/exception-inbox";
import { PageHeader } from "@/components/page-header";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { ComplianceList } from "@/components/compliance-badge";
import { dailyRecap, getHandoffNote, listLiveExceptionInbox } from "@/lib/desk";
import { saveHandoffAction } from "@/lib/dispatcher-actions";
import {
  getDashboardStats,
  listAttentionLoads,
  listDrivers,
  listMovingLoads,
  listTrucks,
  listUpcomingCompliance,
  listWatchedLoads,
} from "@/lib/queries";
import { labelForTruckType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const params = await searchParams;
  const stats = getDashboardStats();
  const unassigned = listAttentionLoads();
  const moving = listMovingLoads();
  const trucks = listTrucks();
  const drivers = listDrivers();
  const availableTrucks = trucks.filter((truck) => truck.status === "available");
  const onDuty = drivers.filter((driver) => driver.status === "on_duty");
  const expirations = listUpcomingCompliance();
  const inbox = listLiveExceptionInbox({ kind: params.kind, q: params.q });
  const recap = dailyRecap();
  const watched = listWatchedLoads();
  const handoff = getHandoffNote();

  return (
    <>
      <PageHeader
        title="Dispatch desk"
        subtitle="Exception inbox first — ranked work, then trucks on the road and loads that still need a unit."
        actions={
          <Link href="/loads/new" className="btn btn-primary">
            New load
          </Link>
        }
      />

      <ExceptionInboxCard inbox={inbox} kind={params.kind} q={params.q} />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open loads" value={stats.openLoads} hint="Not delivered, completed, or cancelled" href="/board" />
        <Kpi label="Rolling" value={stats.inTransit} hint="Dispatched through unloading" href="/board?status=in_transit" />
        <Kpi
          label="Available trucks"
          value={stats.availableTrucks}
          hint={`${trucks.length} in the fleet`}
          href="/fleet"
        />
        <Kpi
          label="Unassigned loads"
          value={stats.unassignedLoads}
          hint="Need a truck and driver"
          href="/board?status=available"
        />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Shift handoff</h2>
          <p className="mt-1 text-sm text-slate-500">What’s on fire for the next desk.</p>
          <form action={saveHandoffAction} className="mt-3">
            <textarea
              name="handoff_note"
              rows={4}
              defaultValue={handoff}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Late PU on MSE-1045, reefer alarm, Tyrell med card expired…"
            />
            <button className="btn btn-secondary mt-2" type="submit">
              Save handoff
            </button>
          </form>
        </section>
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Daily recap</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Delivered today</dt>
              <dd className="font-semibold">{recap.delivered}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Late</dt>
              <dd className="font-semibold">{recap.late}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">On-time %</dt>
              <dd className="font-semibold">{recap.onTimePct}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Claims opened</dt>
              <dd className="font-semibold">{recap.claims}</dd>
            </div>
          </dl>
          <Link href="/reports" className="mt-3 inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
            Open reports
          </Link>
        </section>
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Watch list</h2>
          {watched.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Pin a load from its page.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {watched.map((load) => (
                <li key={load.id} className="flex justify-between gap-2">
                  <Link href={`/loads/${load.id}`} className="font-mono font-semibold hover:underline">
                    {load.load_number}
                  </Link>
                  <LoadStatusBadge status={load.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold">Needs a unit</h2>
            <Link href="/board?status=available" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Open board
            </Link>
          </header>
          {unassigned.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">Every active load has a truck.</p>
          ) : (
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Load</th>
                  <th>Lane</th>
                  <th>Pickup</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {unassigned.map((load) => (
                  <tr key={load.id}>
                    <td>
                      <div className="font-mono text-sm font-semibold">{load.load_number}</div>
                      <div className="text-xs text-slate-500">{load.customer_name}</div>
                    </td>
                    <td>
                      {load.origin}
                      <span className="mx-1 text-slate-400">→</span>
                      {load.destination}
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(load.pickup_start)}</td>
                    <td className="text-right">
                      <Link href={`/loads/${load.id}`} className="btn btn-ghost">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Fleet snapshot</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Trucks available</dt>
              <dd className="font-semibold">{availableTrucks.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Drivers on duty</dt>
              <dd className="font-semibold">{onDuty.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">In maintenance</dt>
              <dd className="font-semibold">
                {trucks.filter((truck) => truck.status === "maintenance").length}
              </dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2 text-sm">
            {availableTrucks.slice(0, 4).map((truck) => (
              <li key={truck.id} className="flex justify-between text-slate-600">
                <span>Unit {truck.unit_number}</span>
                <span>{labelForTruckType(truck.type)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 xl:col-span-3">
          <h2 className="text-sm font-semibold">Upcoming / expired documents</h2>
          <p className="mt-1 text-sm text-slate-500">
            License and medical card: 30 days. Registration: 60 days. DOT inspection: 30 days. Full list on{" "}
            <Link href="/compliance" className="font-medium underline">
              Compliance
            </Link>
            .
          </p>
          <div className="mt-3">
            {expirations.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing expiring in those windows.</p>
            ) : (
              <ComplianceList alerts={expirations} />
            )}
          </div>
        </section>

        <section className="card overflow-hidden xl:col-span-3">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold">On the road</h2>
            <Link href="/board?status=in_transit" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              All moving loads
            </Link>
          </header>
          {moving.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">Nothing on the road right now.</p>
          ) : (
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Load</th>
                  <th>Status</th>
                  <th>Lane</th>
                  <th>Unit</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {moving.map((load) => (
                  <tr key={load.id}>
                    <td>
                      <Link href={`/loads/${load.id}`} className="font-mono text-sm font-semibold hover:underline">
                        {load.load_number}
                      </Link>
                      <div className="text-xs text-slate-500">{load.customer_name}</div>
                    </td>
                    <td>
                      <LoadStatusBadge status={load.status} />
                    </td>
                    <td>
                      {load.origin}
                      <span className="mx-1 text-slate-400">→</span>
                      {load.destination}
                    </td>
                    <td>
                      {load.truck_unit ? `Unit ${load.truck_unit}` : "—"}
                      <div className="text-xs text-slate-500">{load.driver_name ?? "Unassigned"}</div>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(load.delivery_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href} className="card block p-5 transition hover:border-slate-300">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{hint}</div>
    </Link>
  );
}
