import { formatDateTime, isAppointmentSchedule } from "./format";

export type DriverStopPlace = {
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  window_start?: string;
  window_end?: string;
  schedule_type?: string;
};

export function driverLanePlace(stop: DriverStopPlace | null | undefined): string {
  if (!stop) return "";
  const cityState = [stop.city, stop.state].map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
  return cityState || String(stop.name ?? "").trim() || String(stop.street ?? "").trim();
}

export function driverWindowText(
  start?: string | null,
  end?: string | null,
  scheduleType?: string | null,
): string {
  if (isAppointmentSchedule(scheduleType)) {
    const from = formatDateTime(String(start ?? "").trim());
    return from === "—" ? "" : from;
  }
  const from = formatDateTime(String(start ?? "").trim());
  const to = formatDateTime(String(end ?? "").trim());
  if (from === "—" && to === "—") return "";
  if (to === "—" || from === to) return from === "—" ? "" : from;
  return `${from} – ${to}`;
}

/** Header times win. If those are empty, use Pickup 1 / Delivery 1 windows and city. Never invent a place. */
export function driverStopWhen(
  headerStart: string | null | undefined,
  headerEnd: string | null | undefined,
  stop: DriverStopPlace | null | undefined,
): string {
  if (isAppointmentSchedule(stop?.schedule_type)) {
    const when = driverWindowText(stop?.window_start || headerStart, "", stop?.schedule_type);
    const place = driverLanePlace(stop);
    if (when && place) return `${place} · ${when}`;
    return when || place || "—";
  }
  const headerWindow = driverWindowText(headerStart, headerEnd);
  if (headerWindow) return headerWindow;
  const stopWindow = driverWindowText(stop?.window_start, stop?.window_end, stop?.schedule_type);
  const place = driverLanePlace(stop);
  if (stopWindow && place) return `${place} · ${stopWindow}`;
  return stopWindow || place || "—";
}

export function driverLaneEnds(
  origin: string | null | undefined,
  destination: string | null | undefined,
  pickup: DriverStopPlace | null | undefined,
  delivery: DriverStopPlace | null | undefined,
): string {
  const from = String(origin ?? "").trim() || driverLanePlace(pickup);
  const to = String(destination ?? "").trim() || driverLanePlace(delivery);
  if (from && to) return `${from} → ${to}`;
  return from || to;
}
