import Link from "next/link";
import { formatFuelMoney, formatGallons } from "@/lib/format";
import { FUEL_BUCKETS, type FuelBucket } from "@/lib/fuel";
import { getDriverFuelRollup } from "@/lib/fuel-store";

function cell(bucket: FuelBucket, gallons: number, amount: number): string {
  if (bucket === "scale") return formatFuelMoney(amount);
  return `${formatGallons(gallons)} · ${formatFuelMoney(amount)}`;
}

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
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
        {FUEL_BUCKETS.map((bucket) => (
          <div key={bucket.value}>
            <dt className="text-slate-500">{bucket.label}</dt>
            <dd className="font-semibold">
              {cell(bucket.value, rollup.month[bucket.value].gallons, rollup.month[bucket.value].amount)}
            </dd>
            <dd className="text-xs text-slate-600">
              Week {cell(bucket.value, rollup.week[bucket.value].gallons, rollup.week[bucket.value].amount)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
