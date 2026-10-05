import { formatDateTime } from "@/lib/format";
import { labelForReeferMode, type ReeferMode } from "@/lib/reefer-shared";
import type { ReeferReading, ReeferStatus } from "@/lib/types";

function asStatus(reading: ReeferReading | ReeferStatus | null): ReeferStatus | null {
  if (!reading) return null;
  if ("temperatureF" in reading) return reading;
  return {
    trailerId: reading.trailer_id,
    temperatureF: reading.temperature_f,
    setpointF: reading.setpoint_f,
    returnAirF: reading.return_air_f,
    supplyAirF: reading.supply_air_f,
    alarm: reading.alarm,
    recordedAt: reading.recorded_at,
    source: reading.source,
  };
}

export function ReeferBadge({
  setpoint,
  mode,
  reading,
}: {
  setpoint: number | null;
  mode?: ReeferMode | string | null;
  reading: ReeferReading | ReeferStatus | null;
}) {
  const status = asStatus(reading);
  const shownSet = setpoint ?? status?.setpointF ?? null;
  if (shownSet == null && !status) return <span className="text-xs text-slate-400">—</span>;
  const ret = status?.returnAirF ?? status?.temperatureF;
  const bits = [
    shownSet != null ? `set ${shownSet}°` : "",
    ret != null ? `ret ${ret}°` : "",
  ].filter(Boolean);
  const title = [
    bits.join(" · "),
    labelForReeferMode(mode as ReeferMode),
    status?.trailerId,
    status?.supplyAirF != null ? `sup ${status.supplyAirF}°F` : "",
    status?.recordedAt ? formatDateTime(status.recordedAt) : "",
    status?.alarm,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="leading-tight text-xs tabular-nums" title={title}>
      <div>{bits.join(" · ") || "—"}</div>
      {status?.alarm ? <div className="text-rose-700">{status.alarm}</div> : null}
    </div>
  );
}
