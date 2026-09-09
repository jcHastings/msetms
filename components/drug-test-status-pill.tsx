import { drugTestStatusTone, labelForDrugTestStatus, type DrugTestStatus } from "@/lib/drug-tests";

const TONE: Record<ReturnType<typeof drugTestStatusTone>, string> = {
  danger: "status-tone-danger",
  warning: "status-tone-warning",
  success: "status-tone-success",
  navy: "status-tone-navy",
  slate: "status-tone-slate",
};

export function DrugTestStatusPill({ status }: { status: DrugTestStatus }) {
  return <span className={`status-pill ${TONE[drugTestStatusTone(status)]}`}>{labelForDrugTestStatus(status)}</span>;
}

export function FailedTestChip() {
  return <span className="status-pill status-tone-danger">Failed test</span>;
}
