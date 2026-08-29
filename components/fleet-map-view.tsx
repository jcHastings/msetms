import Link from "next/link";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { PageHeader } from "@/components/page-header";
import {
  ORBCOMM_REEFER_PIN_COLOR,
  SAMSARA_TRUCK_OFF_COLOR,
  SAMSARA_TRUCK_ON_COLOR,
  fleetMapDisplayPoints,
  type FleetMapModel,
  type OrbcommReeferPinStatus,
} from "@/lib/fleet-map-shared";
import { formatDateTime, shortPlaceLabel } from "@/lib/format";

const REEFER_PIN_LABEL: Record<OrbcommReeferPinStatus, string> = {
  running: "Running",
  off: "Off",
  shutdown: "Shutdown",
  unknown: "No status",
};

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
      {model.title === "Orbcomm" && /live Orbcomm did not update/i.test(model.sourceNote) ? (
        <p className="mb-3 text-sm text-slate-600" data-orbcomm-live-note="">
          {model.sourceNote}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-fleet-map={model.title.toLowerCase()}>
        <section className="card overflow-hidden">
          <LoadMapCanvas
            apiKey={apiKey}
            points={fleetMapDisplayPoints(model.pins)}
            className="h-[36rem] w-full bg-slate-100"
            missingKeyMessage="Map is off."
            emptyMessage="No GPS pins."
          />
          {model.title === "Orbcomm" || model.title === "Samsara" ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-xs text-slate-600" data-orbcomm-pin-legend={model.title === "Orbcomm" ? "" : undefined} data-samsara-pin-legend={model.title === "Samsara" ? "" : undefined}>
              {model.title === "Orbcomm" ? (
                <>
                  {(["running", "off", "shutdown", "unknown"] as const).map((status) => (
                    <li key={status} className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: ORBCOMM_REEFER_PIN_COLOR[status] }}
                        data-reefer-pin={status}
                      />
                      {REEFER_PIN_LABEL[status]}
                    </li>
                  ))}
                  <li data-orbcomm-pin-shape="arrow">Arrow = moving</li>
                  <li data-orbcomm-pin-shape="circle">Circle = stopped</li>
                </>
              ) : (
                <>
                  <li className="inline-flex items-center gap-1.5" data-samsara-pin="on">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: SAMSARA_TRUCK_ON_COLOR }}
                    />
                    On
                  </li>
                  <li className="inline-flex items-center gap-1.5" data-samsara-pin="moving">
                    <span
                      className="inline-block h-0 w-0 border-b-[9px] border-l-[5px] border-r-[5px] border-l-transparent border-r-transparent"
                      style={{ borderBottomColor: SAMSARA_TRUCK_ON_COLOR }}
                    />
                    Moving
                  </li>
                  <li className="inline-flex items-center gap-1.5" data-samsara-pin="off">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: SAMSARA_TRUCK_OFF_COLOR }}
                    />
                    Off
                  </li>
                </>
              )}
            </ul>
          ) : null}
        </section>
        <aside className="card p-4">
          <h2 className="text-sm font-semibold">On the map</h2>
          {model.pins.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No GPS pins.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {model.pins.map((pin) => (
                <li key={pin.id} className="py-1.5">
                  {pin.reeferStatus || pin.pinColor ? (
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{
                        background:
                          pin.pinColor ||
                          (pin.reeferStatus ? ORBCOMM_REEFER_PIN_COLOR[pin.reeferStatus] : undefined),
                      }}
                      data-reefer-pin={pin.reeferStatus}
                      data-fleet-pin-color={pin.pinColor}
                      title={pin.reeferStatus ? REEFER_PIN_LABEL[pin.reeferStatus] : undefined}
                    />
                  ) : null}
                  <Link href={pin.href} className="font-semibold underline">
                    {pin.label}
                  </Link>
                  {pin.reeferStatus ? (
                    <span className="ml-2 text-xs text-slate-600">{REEFER_PIN_LABEL[pin.reeferStatus]}</span>
                  ) : null}
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
                  <td className="whitespace-nowrap text-left">
                    {shortPlaceLabel(row.location) || row.location || "—"}
                  </td>
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
