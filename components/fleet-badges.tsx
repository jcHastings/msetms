import { formatDateTime, gpsMotionLabel, shortPlaceLabel } from "@/lib/format";
import type { TrailerLocation } from "@/lib/integrations/orbcomm";
import {
  formatDutyStatus,
  formatDurationMs,
  isLiveSamsaraGps,
  isLiveSamsaraHos,
  type HosClock,
  type VehicleLocation,
} from "@/lib/integrations/samsara";

function coordsLabel(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return "";
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export function LocationBadge({
  location,
  empty = "—",
}: {
  location: VehicleLocation | null;
  empty?: string;
}) {
  if (!isLiveSamsaraGps(location)) {
    return <span className="text-xs text-slate-600">{empty}</span>;
  }
  const city =
    shortPlaceLabel(location.address) || coordsLabel(location.latitude, location.longitude) || empty;
  const motion = gpsMotionLabel(location.speedMph);
  const title = [location.address, motion, formatDateTime(location.recordedAt)].filter(Boolean).join(" · ");
  return (
    <div className="whitespace-nowrap text-left text-xs leading-tight" title={title}>
      <div>{city}</div>
      {motion ? <div className="text-slate-500">{motion}</div> : null}
    </div>
  );
}

export function TrailerLocationBadge({ location }: { location: TrailerLocation | null }) {
  if (!location) return <span className="text-xs text-slate-400">—</span>;
  const city =
    shortPlaceLabel(location.address) || coordsLabel(location.latitude, location.longitude) || "—";
  const title = [location.address, formatDateTime(location.recordedAt)].filter(Boolean).join(" · ");
  return (
    <div className="whitespace-nowrap text-left text-xs leading-tight" title={title}>
      {city}
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
    return <span className="text-xs text-slate-600">{empty}</span>;
  }
  const drive = formatDurationMs(hos.driveRemainingMs);
  const title = [
    formatDutyStatus(hos.dutyStatus),
    drive !== "—" ? `${drive} drive` : "",
    hos.shiftRemainingMs != null ? `${formatDurationMs(hos.shiftRemainingMs)} on-duty` : "",
    hos.cycleRemainingMs != null ? `${formatDurationMs(hos.cycleRemainingMs)} cycle` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="leading-tight text-xs tabular-nums" title={title}>
      {drive !== "—" ? drive : formatDutyStatus(hos.dutyStatus) || "HOS"}
    </div>
  );
}
