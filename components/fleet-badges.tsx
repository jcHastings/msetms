import { formatDateTime } from "@/lib/format";
import type { TrailerLocation } from "@/lib/integrations/orbcomm";
import {
  formatDutyStatus,
  formatDurationMs,
  isLiveSamsaraGps,
  isLiveSamsaraHos,
  type HosClock,
  type VehicleLocation,
} from "@/lib/integrations/samsara";

export function LocationBadge({
  location,
  empty = "—",
}: {
  location: VehicleLocation | null;
  empty?: string;
}) {
  if (!isLiveSamsaraGps(location)) {
    return <span className="text-sm text-slate-600">{empty}</span>;
  }
  const label =
    location.address ||
    (location.latitude != null && location.longitude != null
      ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
      : empty);
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

export function HosBadge({
  hos,
  empty = "—",
}: {
  hos: HosClock | null;
  empty?: string;
}) {
  if (!isLiveSamsaraHos(hos)) {
    return <span className="text-sm text-slate-600">{empty}</span>;
  }
  return (
    <div className="text-sm">
      <div className="font-semibold">{formatDutyStatus(hos.dutyStatus) || "HOS"}</div>
      <div className="tabular-nums text-[11px] text-slate-600">
        {formatDurationMs(hos.driveRemainingMs)} drive
        {hos.shiftRemainingMs != null ? ` · ${formatDurationMs(hos.shiftRemainingMs)} on-duty` : ""}
        {hos.cycleRemainingMs != null ? ` · ${formatDurationMs(hos.cycleRemainingMs)} cycle` : ""}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{hos.source}</div>
    </div>
  );
}
