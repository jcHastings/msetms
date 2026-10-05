import { formatDate } from "./format";

export const DRUG_TEST_TYPES = [
  { value: "pre-employment", label: "Pre-employment" },
  { value: "random", label: "Random" },
  { value: "post-accident", label: "Post-accident" },
  { value: "reasonable-suspicion", label: "Reasonable suspicion" },
  { value: "return-to-duty", label: "Return-to-duty" },
  { value: "follow-up", label: "Follow-up" },
  { value: "other", label: "Other" },
] as const;

export const DRUG_TEST_RESULTS = [
  { value: "pending", label: "Pending" },
  { value: "negative", label: "Negative" },
  { value: "positive", label: "Positive" },
  { value: "refused", label: "Refused" },
  { value: "cancelled", label: "Cancelled" },
  { value: "dilute", label: "Dilute" },
] as const;

export const DRUG_TEST_STATUSES = [
  { value: "ordered", label: "Ordered" },
  { value: "pending", label: "Pending" },
  { value: "clear", label: "Clear" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type DrugTestType = (typeof DRUG_TEST_TYPES)[number]["value"];
export type DrugTestResult = (typeof DRUG_TEST_RESULTS)[number]["value"];
export type DrugTestStatus = (typeof DRUG_TEST_STATUSES)[number]["value"];

export type DrugTest = {
  id: number;
  driver_id: number;
  driver_name: string;
  test_type: DrugTestType;
  vendor: string;
  ordered_on: string;
  collected_on: string;
  result: DrugTestResult;
  status: DrugTestStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DrugTestInput = {
  driver_id: number;
  test_type: DrugTestType;
  vendor: string;
  ordered_on: string;
  collected_on: string;
  result: DrugTestResult;
  status: DrugTestStatus;
  notes: string;
};

export type DrugTestFilters = {
  status?: string;
  type?: string;
  driver?: string;
};

const TYPE_VALUES = new Set<string>(DRUG_TEST_TYPES.map((item) => item.value));
const RESULT_VALUES = new Set<string>(DRUG_TEST_RESULTS.map((item) => item.value));
const STATUS_VALUES = new Set<string>(DRUG_TEST_STATUSES.map((item) => item.value));

export function isDrugTestType(value: string): value is DrugTestType {
  return TYPE_VALUES.has(value);
}

export function isDrugTestResult(value: string): value is DrugTestResult {
  return RESULT_VALUES.has(value);
}

export function isDrugTestStatus(value: string): value is DrugTestStatus {
  return STATUS_VALUES.has(value);
}

export function parseDrugTestType(value: unknown): DrugTestType {
  const raw = String(value ?? "").trim();
  if (isDrugTestType(raw)) return raw;
  throw new Error("Choose a test type.");
}

export function parseDrugTestResult(value: unknown): DrugTestResult {
  const raw = String(value ?? "").trim();
  if (isDrugTestResult(raw)) return raw;
  throw new Error("Choose a result.");
}

export function parseDrugTestStatus(value: unknown): DrugTestStatus {
  const raw = String(value ?? "").trim();
  if (isDrugTestStatus(raw)) return raw;
  throw new Error("Choose a status.");
}

/** failed if positive/refused (or status failed); clear when negative complete. */
export function deriveDrugTestStatus(result: DrugTestResult, status: DrugTestStatus): DrugTestStatus {
  if (result === "cancelled" || status === "cancelled") return "cancelled";
  if (result === "positive" || result === "refused" || status === "failed") return "failed";
  if (result === "negative") return "clear";
  if (status === "ordered" || status === "pending" || status === "clear") return status;
  return "pending";
}

export function labelForDrugTestType(value: string): string {
  return DRUG_TEST_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function labelForDrugTestResult(value: string): string {
  return DRUG_TEST_RESULTS.find((item) => item.value === value)?.label ?? value;
}

export function labelForDrugTestStatus(value: string): string {
  return DRUG_TEST_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export function drugTestStatusTone(status: DrugTestStatus): "danger" | "warning" | "success" | "navy" | "slate" {
  if (status === "failed") return "danger";
  if (status === "pending" || status === "ordered") return "navy";
  if (status === "clear") return "success";
  return "slate";
}

export function formatDriverListName(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
}

export function formatDrugTestDate(value: string): string {
  return value ? formatDate(`${value}T12:00:00`) : "—";
}

export function isFailedDrugTest(test: Pick<DrugTest, "status" | "result">): boolean {
  return deriveDrugTestStatus(test.result, test.status) === "failed";
}

export function isPendingDrugTest(test: Pick<DrugTest, "status" | "result">): boolean {
  const status = deriveDrugTestStatus(test.result, test.status);
  return status === "pending" || status === "ordered";
}

export function matchesDrugTestFilters(test: DrugTest, filters: DrugTestFilters = {}): boolean {
  if (filters.status && filters.status !== "all" && test.status !== filters.status) return false;
  if (filters.type && filters.type !== "all" && test.test_type !== filters.type) return false;
  const q = String(filters.driver ?? "").trim().toLowerCase();
  if (q && !test.driver_name.toLowerCase().includes(q) && !formatDriverListName(test.driver_name).toLowerCase().includes(q)) {
    return false;
  }
  return true;
}

export function failedDrugTestIssue(test: Pick<DrugTest, "test_type" | "ordered_on" | "collected_on">): string {
  const when = formatDrugTestDate(test.collected_on || test.ordered_on);
  return `${labelForDrugTestType(test.test_type)} · ${when}`;
}
