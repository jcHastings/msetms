import { formatDateTime } from "@/lib/format";
import type { TrailerLocation } from "@/lib/integrations/orbcomm";
import { formatDutyStatus, formatDurationMs, type HosClock, type VehicleLocation } from "@/lib/integrations/samsara";

export function LocationBadge({ location }: { location: VehicleLocation | null }) {
  if (!location) return <span className="text-slate-400">—</span>;
  const label =
    location.address ||
    (location.latitude != null && location.longitude != null
      ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
      : "—");
  return (
    <div className="text-sm">
      <div>{label}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {location.source} {location.speedMph != null ? `· ${Math.round(location.speedMph)} mph` : ""}
      </div>
      <div className="text-[11px] text-slate-400">{formatDateTime(location.recordedAt)}</div>
    </div>
  );
}

export function TrailerLocationBadge({ location }: { location: TrailerLocation | null }) {
  if (!location) return <span className="text-slate-400">—</span>;
  const label =
    location.address ||
    (location.latitude != null && location.longitude != null
      ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
      : "—");
  return (
    <div className="text-sm">
      <div>{label}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{location.source}</div>
      <div className="text-[11px] text-slate-400">{formatDateTime(location.recordedAt)}</div>
    </div>
  );
}

export function HosBadge({ hos }: { hos: HosClock | null }) {
  if (!hos) return <span className="text-slate-400">—</span>;
  return (
    <div className="text-sm">
      <div className="font-semibold tabular-nums">{formatDurationMs(hos.driveRemainingMs)} drive</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {hos.source} · {formatDutyStatus(hos.dutyStatus)}
      </div>
    </div>
  );
}
