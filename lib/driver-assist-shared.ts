/** Chip questions the Assist sheet sends. No LLM. The server intent router answers these. */
export const DRIVER_ASSIST_CHIPS = [
  { label: "Appointment time", question: "Appointment time" },
  { label: "Shipper hours", question: "Shipper hours" },
  { label: "Pickup address", question: "Pickup address" },
  { label: "My truck docs", question: "My truck docs" },
] as const;

export function assistCabDocKindLabel(kind: string): string {
  switch (kind) {
    case "registration":
      return "Registration";
    case "dot_inspection":
      return "DOT";
    case "insurance":
      return "Insurance";
    case "cdl":
      return "CDL";
    case "med_card":
      return "Med card";
    case "insurance_card":
      return "Insurance card";
    case "ifta_license":
      return "IFTA license";
    default:
      return "Other";
  }
}

export function assistCabDocOwnerLabel(owner: string): string {
  if (owner === "truck") return "Truck";
  if (owner === "trailer") return "Trailer";
  if (owner === "driver") return "Driver";
  if (owner === "company") return "MS Express";
  return "Owner";
}
