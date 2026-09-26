export const CUSTODY_LEFT_WHERE = [
  { value: "shipper", label: "Shipper" },
  { value: "receiver", label: "Receiver" },
  { value: "yard", label: "Yard" },
  { value: "plant", label: "Plant" },
  { value: "other", label: "Other" },
] as const;

export type CustodyLeftWhere = (typeof CUSTODY_LEFT_WHERE)[number]["value"];

export function labelForCustodyLeftWhere(value: string): string {
  return CUSTODY_LEFT_WHERE.find((item) => item.value === value)?.label ?? "";
}

export function labelForCustodySource(value: string): string {
  switch (value) {
    case "load_assign":
      return "Assigned";
    case "load_drop":
      return "Dropped";
    case "office_drop":
      return "Office";
    case "driver_drop":
      return "Driver";
    default:
      return "";
  }
}
