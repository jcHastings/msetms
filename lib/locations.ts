import type { Location, LocationInput, LocationRole, LocationSchedulingType } from "./types";
import { isLocationRole, isLocationSchedulingType } from "./types";

export function formatLocationCityState(location: Pick<Location, "city" | "state">): string {
  return [location.city.trim(), location.state.trim().toUpperCase()].filter(Boolean).join(", ");
}

export function formatLocationAddress(location: Pick<Location, "street" | "city" | "state" | "zip">): string {
  const cityState = formatLocationCityState(location);
  const line = [cityState, location.zip.trim()].filter(Boolean).join(" ");
  return [location.street.trim(), line].filter(Boolean).join(", ");
}

export function formatLocationLabel(location: Pick<Location, "name" | "city" | "state">): string {
  const cityState = formatLocationCityState(location);
  return cityState ? `${location.name} — ${cityState}` : location.name;
}

export function locationServesRole(location: Pick<Location, "role">, role: "shipper" | "receiver"): boolean {
  return location.role === "both" || location.role === role;
}

export function parsePlace(line: string): { street: string; city: string; state: string; zip: string } {
  let rest = line.trim();
  const zipMatch = rest.match(/\s(\d{5}(?:-\d{4})?)$/);
  const zip = zipMatch?.[1] ?? "";
  if (zipMatch) rest = rest.slice(0, zipMatch.index).trim();
  const stateMatch = rest.match(/,\s*([A-Za-z]{2})$/);
  const state = stateMatch?.[1]?.toUpperCase() ?? "";
  if (stateMatch) rest = rest.slice(0, stateMatch.index).trim();
  const comma = rest.lastIndexOf(",");
  if (comma >= 0) {
    return {
      street: rest.slice(0, comma).trim(),
      city: rest.slice(comma + 1).trim(),
      state,
      zip,
    };
  }
  return { street: "", city: rest, state, zip };
}

export function locationInputFromStop(input: {
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  notes?: string;
  addressLine: string;
  role: LocationRole;
  scheduling_type?: LocationSchedulingType;
}): LocationInput {
  const parsed = parsePlace(input.addressLine);
  const name = (input.name ?? "").trim() || parsed.city || input.addressLine.trim();
  if (!name) throw new Error("Location name is required.");
  return {
    name,
    street: (input.street ?? "").trim() || parsed.street,
    city: (input.city ?? "").trim() || parsed.city,
    state: (input.state ?? "").trim().toUpperCase() || parsed.state,
    zip: (input.zip ?? "").trim() || parsed.zip,
    phone: (input.phone ?? "").trim(),
    notes: (input.notes ?? "").trim(),
    role: input.role,
    scheduling_type: input.scheduling_type ?? "fcfs",
    hours: "",
    scheduling_notes: "",
    scheduling_email: "",
    scheduling_portal: "",
  };
}

export function parseLocationRole(value: FormDataEntryValue | null): LocationRole {
  const role = String(value ?? "");
  if (!isLocationRole(role)) throw new Error("Pick shipper, receiver, or both.");
  return role;
}

export function parseLocationScheduling(value: FormDataEntryValue | null): LocationSchedulingType {
  const type = String(value ?? "fcfs");
  if (!isLocationSchedulingType(type)) throw new Error("Pick appointment required or FCFS.");
  return type;
}
