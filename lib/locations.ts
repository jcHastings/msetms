import type { Location, LocationRole, SchedulingType } from "./types";
import { labelForSchedulingType } from "./types";

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
] as const;

export type LocationInput = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  notes: string;
  role: LocationRole;
  scheduling_type: SchedulingType;
  hours: string;
  scheduling_notes: string;
};

export function formatLocationCityState(location: Pick<Location, "city" | "state" | "name">): string {
  const cityState = [location.city.trim(), location.state.trim()].filter(Boolean).join(", ");
  return cityState || location.name;
}

export function formatLocationAddress(location: Location): string {
  const line2 = [location.city.trim(), location.state.trim()].filter(Boolean).join(", ");
  const cityZip = [line2, location.zip.trim()].filter(Boolean).join(" ");
  return [location.street.trim(), cityZip].filter(Boolean).join(", ");
}

export function formatLocationLabel(location: Location): string {
  const place = formatLocationCityState(location);
  return place && place !== location.name ? `${location.name} — ${place}` : location.name;
}

export function formatSchedulingSummary(location: Location): string {
  const parts = [labelForSchedulingType(location.scheduling_type)];
  if (location.hours.trim()) parts.push(`Hours: ${location.hours.trim()}`);
  if (location.scheduling_notes.trim()) parts.push(location.scheduling_notes.trim());
  return parts.join(" · ");
}

export function locationMatchesRole(location: Location, role: "shipper" | "receiver"): boolean {
  return location.role === "both" || location.role === role;
}

export function extractStateCode(place: string): string {
  const trimmed = place.trim();
  const zip = trimmed.match(/,\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (zip) return zip[1].toUpperCase();
  const tail = trimmed.match(/\b([A-Za-z]{2})$/);
  return tail ? tail[1].toUpperCase() : "";
}
