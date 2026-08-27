import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatMoney } from "@/lib/format";
import {
  buildIftaQuarterEstimate,
  listIftaQuarterChoices,
  parseIftaQuarter,
} from "@/lib/ifta-quarter";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { canSeeNavHref } from "@/lib/settings-shared";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function IftaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !canSeeNavHref(dispatcher.role, "/ifta")) redirect("/");
  const params = await searchParams;
  const quarter = parseIftaQuarter(params.quarter ?? params.year, params.quarter);
  const estimate = buildIftaQuarterEstimate(quarter);
  const choices = listIftaQuarterChoices();
  const states = new Set([
    ...estimate.fuelByState.map((row) => row.state),
    ...estimate.milesByState.map((row) => row.state),
  ]);
  const rows = [...states].sort().map((state) => {
    const fuel = estimate.fuelByState.find((row) => row.state === state);
    const miles = estimate.milesByState.find((row) => row.state === state);
    return {
      state,
      name: miles?.name ?? state,
      gallons: fuel?.gallons ?? 0,
      amount: fuel?.amount ?? 0,
      miles: miles?.miles ?? 0,
    };
  });

  return (
    <>
      <PageHeader title="IFTA" subtitle="Fuel and miles by state for the quarter." />
      <section className="card mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Estimate</p>
            <h2 className="text-sm font-semibold text-slate-900">{estimate.label}</h2>
          </div>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <div className="field">
              <label htmlFor="ifta-quarter">Quarter</label>
              <select id="ifta-quarter" name="quarter" defaultValue={`${quarter.year}-${quarter.quarter}`}>
                {choices.map((item) => (
                  <option key={`${item.year}-${item.quarter}`} value={`${item.year}-${item.quarter}`}>
                    Q{item.quarter} {item.year}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-secondary" type="submit">
              Show
            </button>
          </form>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Fuel gallons" value={estimate.fuelGallons.toLocaleString("en-US")} />
          <Stat label="Fuel dollars" value={formatMoney(estimate.fuelAmount)} />
          <Stat label="Stored miles" value={`${estimate.miles.toLocaleString("en-US")} mi`} />
        </div>
      </section>

      <section className="card mb-4 overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">By state</h2>
        </header>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No imported fuel or stored route miles in this quarter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2">State</th>
                <th className="px-5 py-2">Gallons</th>
                <th className="px-5 py-2">Fuel $</th>
                <th className="px-5 py-2">Miles</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.state} className="border-t border-slate-100">
                  <td className="px-5 py-2 font-semibold">
                    {row.state}
                    <span className="ml-2 font-normal text-slate-500">{row.name}</span>
                  </td>
                  <td className="px-5 py-2 tabular-nums">{row.gallons.toLocaleString("en-US")}</td>
                  <td className="px-5 py-2 tabular-nums">{formatMoney(row.amount)}</td>
                  <td className="px-5 py-2 tabular-nums">
                    {row.miles > 0 ? `${row.miles.toLocaleString("en-US")} mi` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Waypoint review</h2>
          {estimate.loadsWithoutMiles > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {estimate.loadsWithoutMiles} load{estimate.loadsWithoutMiles === 1 ? "" : "s"} in the quarter have no stored miles.
            </p>
          ) : null}
        </header>
        {estimate.waypoints.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No loads with stored state miles this quarter.</p>
        ) : (
          <ul>
            {estimate.waypoints.map((item) => (
              <li key={item.loadId} className="border-t border-slate-100 px-5 py-3 first:border-t-0">
                <Link href={`/loads/${item.loadId}`} className="font-mono text-sm font-semibold hover:underline">
                  {item.loadNumber}
                </Link>
                <span className="ml-2 text-sm text-slate-600">{item.lane}</span>
                <div className="mt-1 text-xs text-slate-500">
                  {item.states.map((state) => `${state.state} ${state.miles}`).join(" · ")} mi
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
