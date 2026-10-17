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
    <section className="driver-sheet mt-3 rounded-2xl bg-amber-50 p-4">
      <div className="driver-sheet-label text-xs font-semibold uppercase tracking-wide">{title}</div>
      <div className="driver-sheet-value mt-1 font-medium">{location.name}</div>
      <p className="driver-sheet-value text-sm">{formatLocationAddress(location)}</p>
      <p className="driver-sheet-value mt-2 whitespace-pre-wrap text-base">{formatSchedulingSummary(location)}</p>
    </section>
  );
}
