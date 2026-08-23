import { formatLocationAddress, formatSchedulingSummary } from "@/lib/locations";
import { labelForSchedulingType, type Location } from "@/lib/types";

export function LocationSchedulingCard({
  title,
  location,
}: {
  title: string;
  location: Location | null;
}) {
  if (!location) return null;
  return (
    <section className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 font-semibold">{location.name}</div>
      <div className="text-sm text-slate-600">{formatLocationAddress(location) || "—"}</div>
      {location.phone ? <div className="text-sm text-slate-600">{location.phone}</div> : null}
      <div className="mt-2 text-sm">
        <span className="font-medium">{labelForSchedulingType(location.scheduling_type)}</span>
        {location.hours ? <span className="text-slate-600"> · {location.hours}</span> : null}
      </div>
      {location.scheduling_notes ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{location.scheduling_notes}</p>
      ) : null}
    </section>
  );
}

export function DriverSchedulingBlock({
  title,
  location,
}: {
  title: string;
  location: Location | null;
}) {
  if (!location) return null;
  return (
    <section className="mt-3 rounded-2xl bg-amber-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">{title}</div>
      <div className="mt-1 font-medium text-amber-950">{location.name}</div>
      <p className="text-sm text-amber-950">{formatLocationAddress(location)}</p>
      <p className="mt-2 whitespace-pre-wrap text-base text-amber-950">{formatSchedulingSummary(location)}</p>
    </section>
  );
}
