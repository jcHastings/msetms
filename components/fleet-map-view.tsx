import Link from "next/link";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { PageHeader } from "@/components/page-header";
import type { FleetMapModel } from "@/lib/fleet-map-shared";
import { formatDateTime } from "@/lib/format";

function messageTime(iso: string | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const shown = formatDateTime(raw);
  return shown === "—" ? "" : shown;
}

export function FleetMapView({ model, apiKey }: { model: FleetMapModel; apiKey: string }) {
  return (
    <>
      <PageHeader title={model.title} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-fleet-map={model.title.toLowerCase()}>
        <section className="card overflow-hidden">
          <LoadMapCanvas
            apiKey={apiKey}
            points={model.pins}
            className="h-[36rem] w-full bg-slate-100"
            missingKeyMessage="Map is off."
            emptyMessage="No GPS pins."
          />
        </section>
        <aside className="card p-4">
          <h2 className="text-sm font-semibold">On the map</h2>
          {model.pins.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No GPS pins.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {model.pins.map((pin) => (
                <li key={pin.id} className="py-1.5">
                  <Link href={pin.href} className="font-semibold underline">
                    {pin.label}
                  </Link>
                  {pin.motion ? (
                    <span className="ml-2 text-xs font-medium text-slate-600" data-fleet-motion={pin.motion}>
                      {pin.motion}
                      {pin.speedMph != null ? ` · ${Math.round(pin.speedMph)} mph` : ""}
                    </span>
                  ) : null}
                  {messageTime(pin.recordedAt) ? (
                    <div className="text-xs text-slate-500" data-orbcomm-message="">
                      {messageTime(pin.recordedAt)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-5 text-sm font-semibold">No GPS</h2>
          {model.missing.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Every listed unit has a position.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {model.missing.map((unit) => (
                <li key={unit.id} className="py-1.5">
                  <Link href={unit.href} className="underline">
                    {unit.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      {model.statusRows?.length ? (
        <section className="card mt-4 overflow-x-auto" data-orbcomm-status-table="">
          <table className="table-grid">
            <thead>
              <tr>
                <th>Trailer</th>
                <th>Power</th>
                <th>Setpoint °F</th>
                <th>Temp °F</th>
                <th>Alarm</th>
                <th>Location</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {model.statusRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={row.href} className="font-semibold underline">
                      {row.trailer}
                    </Link>
                  </td>
                  <td>{row.power}</td>
                  <td>{row.setpointF == null ? "—" : `${row.setpointF}`}</td>
                  <td>{row.temperatureF == null ? "—" : `${row.temperatureF}`}</td>
                  <td className={row.alarm ? "font-semibold text-rose-700" : undefined}>
                    {row.alarm || "—"}
                  </td>
                  <td>{row.location || "—"}</td>
                  <td data-orbcomm-message="">{messageTime(row.messageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
