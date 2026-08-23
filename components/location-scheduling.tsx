import { formatLocationAddress } from "@/lib/locations";
import { labelForLocationScheduling, type Location } from "@/lib/types";

export function LocationScheduling({
  title,
  location,
  fallbackAddress,
  audience = "dispatcher",
}: {
  title: string;
  location: Location | null;
  fallbackAddress?: string;
  audience?: "dispatcher" | "driver";
}) {
  if (!location && !fallbackAddress) return null;
  const address = location ? formatLocationAddress(location) : fallbackAddress;
  return (
    <section
      className={
        audience === "driver"
          ? "mt-3 rounded-2xl bg-white p-4 shadow-sm"
          : "card p-4"
      }
    >
      <div
        className={
          audience === "driver"
            ? "text-xs font-semibold uppercase tracking-wide text-slate-400"
            : "text-xs font-semibold uppercase tracking-wide text-slate-500"
        }
      >
        {title}
      </div>
      {location ? <div className="mt-1 font-semibold">{location.name}</div> : null}
      <div className={location ? "text-sm text-slate-600" : "mt-1 text-sm"}>{address || "—"}</div>
      {location?.phone ? <div className="text-sm text-slate-600">{location.phone}</div> : null}
      <div className="mt-2 text-sm">
        <span className="font-semibold">
          {location ? labelForLocationScheduling(location.scheduling_type) : "—"}
        </span>
        {location?.hours ? <span className="text-slate-600"> · {location.hours}</span> : null}
      </div>
      {location?.scheduling_notes ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{location.scheduling_notes}</p>
      ) : null}
      {audience === "dispatcher" && location?.scheduling_email ? (
        <div className="mt-1 text-sm text-slate-600">{location.scheduling_email}</div>
      ) : null}
      {audience === "dispatcher" && location?.scheduling_portal ? (
        <div className="mt-1 text-sm">
          <a className="underline" href={location.scheduling_portal} target="_blank" rel="noreferrer">
            Scheduling portal
          </a>
        </div>
      ) : null}
    </section>
  );
}
