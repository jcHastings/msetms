import Link from "next/link";
import { formatFuelMoney, formatGallons } from "@/lib/format";
import { getDriverFuelRollup } from "@/lib/fuel-store";

export function DriverFuelCard({ driverId }: { driverId: number }) {
  const rollup = getDriverFuelRollup(driverId);
  return (
    <section className="card mb-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">Fuel</h2>
        <Link href={`/fuel?driver=${driverId}`} className="text-sm font-medium text-navy hover:underline">
          View fuel
        </Link>
      </div>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-slate-500">This week</dt>
          <dd className="font-semibold">{formatGallons(rollup?.weekGallons ?? 0)}</dd>
          <dd className="text-slate-600">{formatFuelMoney(rollup?.weekAmount ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">This month</dt>
          <dd className="font-semibold">{formatGallons(rollup?.monthGallons ?? 0)}</dd>
          <dd className="text-slate-600">{formatFuelMoney(rollup?.monthAmount ?? 0)}</dd>
        </div>
      </dl>
    </section>
  );
}
