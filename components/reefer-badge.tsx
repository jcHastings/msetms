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
  if (shownSet == null && !status) return <span className="text-slate-400">—</span>;
  const temp = status?.temperatureF;
  const source = status?.source === "demo" ? "demo" : status?.source === "orbcomm" ? "orbcomm" : "";
  return (
    <div className="text-sm">
      <div className="font-semibold tabular-nums">
        {temp != null ? `${temp}°F` : "—"}
        {shownSet != null ? <span className="font-normal text-slate-500"> / set {shownSet}°F</span> : null}
        {labelForReeferMode(mode as ReeferMode) ? (
          <span className="ml-1 font-normal text-slate-600">· {labelForReeferMode(mode as ReeferMode)}</span>
        ) : null}
      </div>
      {status?.trailerId ? <div className="text-xs text-slate-500">{status.trailerId}</div> : null}
      {status?.returnAirF != null || status?.supplyAirF != null ? (
        <div className="text-[11px] text-slate-500">
          {status.returnAirF != null ? `ret ${status.returnAirF}°F` : ""}
          {status.returnAirF != null && status.supplyAirF != null ? " · " : ""}
          {status.supplyAirF != null ? `sup ${status.supplyAirF}°F` : ""}
        </div>
      ) : null}
      {source ? (
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{source} data</div>
      ) : null}
      {status?.recordedAt ? (
        <div className="text-[11px] text-slate-400">{formatDateTime(status.recordedAt)}</div>
      ) : null}
      {status?.alarm ? <div className="text-xs text-rose-700">{status.alarm}</div> : null}
    </div>
  );
}
