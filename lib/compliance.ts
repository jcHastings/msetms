import { failedDrugTestIssue, isFailedDrugTest, type DrugTest } from "./drug-tests";
import { formatDate } from "./format";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "./settings-shared";
import type { Driver, Trailer, Truck } from "./types";

export type { ComplianceWindows };

export type ComplianceKind = "license" | "medical" | "registration" | "dot_inspection" | "drug_test";

export type ComplianceAlert = {
  severity: "expired" | "expiring" | "failed";
  kind: ComplianceKind;
  subject: string;
  label: string;
  expiresOn: string;
  days: number;
  message: string;
  driverId?: number;
  href?: string;
};

function resolvedWindows(windows?: ComplianceWindows): ComplianceWindows {
  return windows ?? DEFAULT_COMPLIANCE_WINDOWS;
}

export function daysUntil(dateStr: string, now = new Date()): number | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - start.getTime()) / 86_400_000);
}

function alertFor(
  expiresOn: string,
  windowDays: number,
  subject: string,
  label: string,
  kind: ComplianceKind,
): ComplianceAlert | null {
  const days = daysUntil(expiresOn);
  if (days == null) return null;
  if (days < 0) {
    return {
      severity: "expired",
      kind,
      subject,
      label,
      expiresOn,
      days,
      message: `${subject}: ${label} expired ${formatDate(`${expiresOn}T12:00:00`)}.`,
    };
  }
  if (days <= windowDays) {
    return {
      severity: "expiring",
      kind,
      subject,
      label,
      expiresOn,
      days,
      message: `${subject}: ${label} expires ${formatDate(`${expiresOn}T12:00:00`)} (${days} day${days === 1 ? "" : "s"}).`,
    };
  }
  return null;
}

export function driverComplianceAlerts(driver: Driver, windows?: ComplianceWindows): ComplianceAlert[] {
  const subject = driver.name;
  const { driverDays } = resolvedWindows(windows);
  return [
    alertFor(driver.license_expires, driverDays, subject, "driver license", "license"),
    alertFor(driver.medical_expires, driverDays, subject, "medical card", "medical"),
  ].filter((item): item is ComplianceAlert => Boolean(item));
}

export function truckComplianceAlerts(truck: Truck, windows?: ComplianceWindows): ComplianceAlert[] {
  const subject = `Unit ${truck.unit_number}`;
  const { registrationDays, dotDays } = resolvedWindows(windows);
  return [
    alertFor(truck.registration_expires, registrationDays, subject, "registration", "registration"),
    alertFor(truck.dot_expires, dotDays, subject, "DOT inspection", "dot_inspection"),
  ].filter((item): item is ComplianceAlert => Boolean(item));
}

export function trailerComplianceAlerts(trailer: Trailer, windows?: ComplianceWindows): ComplianceAlert[] {
  const subject = `Trailer ${trailer.unit_number}`;
  const { registrationDays, dotDays } = resolvedWindows(windows);
  return [
    alertFor(trailer.registration_expires, registrationDays, subject, "registration", "registration"),
    alertFor(trailer.dot_expires, dotDays, subject, "DOT inspection", "dot_inspection"),
  ].filter((item): item is ComplianceAlert => Boolean(item));
}

export function collectAssignmentAlerts(
  input: {
    driver?: Driver | null;
    truck?: Truck | null;
    trailer?: Trailer | null;
  },
  windows?: ComplianceWindows,
): ComplianceAlert[] {
  return [
    ...(input.driver ? driverComplianceAlerts(input.driver, windows) : []),
    ...(input.truck ? truckComplianceAlerts(input.truck, windows) : []),
    ...(input.trailer ? trailerComplianceAlerts(input.trailer, windows) : []),
  ];
}

export function complianceShortLabel(alerts: ComplianceAlert[]): string {
  if (alerts.length === 0) return "";
  if (alerts.some((alert) => alert.severity === "failed" || alert.kind === "drug_test")) return "failed test";
  return alerts.some((alert) => alert.severity === "expired") ? "expired docs" : "docs expiring";
}

export function requireAssignmentOverride(alerts: ComplianceAlert[], confirmed: boolean): void {
  const expired = alerts.filter((alert) => alert.severity === "expired");
  if (expired.length === 0) return;
  if (confirmed) return;
  throw new Error(
    `Expired documents — confirm to assign anyway. ${expired.map((alert) => alert.message).join(" ")}`,
  );
}

export function failedDrugTestAlert(test: DrugTest): ComplianceAlert {
  return {
    severity: "failed",
    kind: "drug_test",
    subject: test.driver_name,
    label: "FAILED TEST",
    expiresOn: test.collected_on || test.ordered_on,
    days: 0,
    message: `${test.driver_name}: FAILED TEST — ${failedDrugTestIssue(test)}.`,
    driverId: test.driver_id,
    href: `/compliance/tests/${test.id}`,
  };
}

export function failedDrugTestAlerts(tests: DrugTest[]): ComplianceAlert[] {
  return tests.filter(isFailedDrugTest).map(failedDrugTestAlert);
}

export function failedDrugTestAlertsByDriver(tests: DrugTest[]): Map<number, ComplianceAlert[]> {
  const map = new Map<number, ComplianceAlert[]>();
  for (const alert of failedDrugTestAlerts(tests)) {
    if (alert.driverId == null) continue;
    const current = map.get(alert.driverId) ?? [];
    current.push(alert);
    map.set(alert.driverId, current);
  }
  return map;
}
