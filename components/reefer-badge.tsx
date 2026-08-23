import type { ReeferReading } from "@/lib/types";

export function ReeferBadge({
  setpoint,
  reading,
}: {
  setpoint: number | null;
  reading: ReeferReading | null;
}) {
  if (setpoint == null && !reading) return <span className="text-slate-400">—</span>;
  const temp = reading?.temperature_f;
  const source = reading?.source === "demo" ? "demo" : reading?.source === "samsara" ? "samsara" : "";
  return (
    <div className="text-sm">
      <div className="font-semibold tabular-nums">
        {temp != null ? `${temp}°F` : "—"}
        {setpoint != null ? <span className="font-normal text-slate-500"> / set {setpoint}°F</span> : null}
      </div>
      {source ? (
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{source} data</div>
      ) : null}
      {reading?.alarm ? <div className="text-xs text-rose-700">{reading.alarm}</div> : null}
    </div>
  );
}
