/**
 * Driver-facing facility fields on a location. Drivers see these through Assist.
 * Private `notes` never leave the office.
 */
export const PARKING_OPTIONS = [
  { value: "", label: "Not on file" },
  { value: "yes", label: "Yes, onsite parking" },
  { value: "limited", label: "Limited parking" },
  { value: "no", label: "No parking" },
] as const;

export const OVERNIGHT_PARKING_OPTIONS = [
  { value: "", label: "Not on file" },
  { value: "yes", label: "Yes, overnight allowed" },
  { value: "no", label: "No overnight" },
] as const;

export type FacilityInfoInput = {
  receiving_hours: string;
  shipping_hours: string;
  parking: string;
  overnight_parking: string;
  parking_notes: string;
  gate_dock_notes: string;
};

export const FACILITY_TEXT_MAX = 500;

export function parseParking(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "yes" || raw === "limited" || raw === "no" ? raw : "";
}

export function parseOvernightParking(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "yes" || raw === "no" ? raw : "";
}

function clip(value: unknown): string {
  return String(value ?? "").trim().slice(0, FACILITY_TEXT_MAX);
}

export function parseFacilityInfo(get: (name: string) => unknown): FacilityInfoInput {
  return {
    receiving_hours: clip(get("receiving_hours")),
    shipping_hours: clip(get("shipping_hours")),
    parking: parseParking(get("parking")),
    overnight_parking: parseOvernightParking(get("overnight_parking")),
    parking_notes: clip(get("parking_notes")),
    gate_dock_notes: clip(get("gate_dock_notes")),
  };
}

export function parkingSentence(parking: string): string {
  if (parking === "yes") return "Onsite parking: yes.";
  if (parking === "limited") return "Onsite parking: limited.";
  if (parking === "no") return "Onsite parking: no.";
  return "";
}

export function overnightSentence(value: string): string {
  if (value === "yes") return "Overnight parking: allowed.";
  if (value === "no") return "Overnight parking: not allowed.";
  return "";
}
