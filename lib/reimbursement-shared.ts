export const REIMBURSEMENT_CATEGORIES = [
  { value: "lumper", label: "Lumper" },
  { value: "washout", label: "Washout" },
  { value: "scale", label: "Scale" },
  { value: "parts", label: "Parts" },
  { value: "tolls", label: "Tolls" },
  { value: "other", label: "Other" },
] as const;

export type ReimbursementCategory = (typeof REIMBURSEMENT_CATEGORIES)[number]["value"];
export type ReimbursementStatus = "submitted" | "approved" | "rejected" | "paid";

export function labelForReimbursementCategory(value: string): string {
  return REIMBURSEMENT_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

export function labelForReimbursementStatus(value: string): string {
  if (value === "submitted") return "Submitted";
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "paid") return "Paid";
  return value;
}
