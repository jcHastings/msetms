import { formatDate } from "./format";
import type { Driver, Trailer, Truck } from "./types";

export type ComplianceKind = "license" | "medical" | "registration" | "dot_inspection";

export type ComplianceAlert = {
  severity: "expired" | "expiring";
  kind: ComplianceKind;
  subject: string;
  label: string;
  expiresOn: string;
  days: number;
  message: string;
};

const DRIVER_WINDOW_DAYS = 30;
const REGISTRATION_WINDOW_DAYS = 60;
const DOT_WINDOW_DAYS = 30;

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

export function driverComplianceAlerts(driver: Driver): ComplianceAlert[] {
  const subject = driver.name;
  return [
    alertFor(driver.license_expires, DRIVER_WINDOW_DAYS, subject, "driver license", "license"),
    alertFor(driver.medical_expires, DRIVER_WINDOW_DAYS, subject, "medical card", "medical"),
  ].filter((item): item is ComplianceAlert => Boolean(item));
}

export function truckComplianceAlerts(truck: Truck): ComplianceAlert[] {
  const subject = `Unit ${truck.unit_number}`;
  return [
    alertFor(truck.registration_expires, REGISTRATION_WINDOW_DAYS, subject, "registration", "registration"),
    alertFor(truck.dot_expires, DOT_WINDOW_DAYS, subject, "DLT / DOT inspection", "dot_inspection"),
  ].filter((item): item is ComplianceAlert => Boolean(item));
}

export function trailerComplianceAlerts(trailer: Trailer): ComplianceAlert[] {
  const subject = `Trailer ${trailer.unit_number}`;
  return [
    alertFor(trailer.registration_expires, REGISTRATION_WINDOW_DAYS, subject, "registration", "registration"),
    alertFor(trailer.dot_expires, DOT_WINDOW_DAYS, subject, "DLT / DOT inspection", "dot_inspection"),
  ].filter((item): item is ComplianceAlert => Boolean(item));
}

export function collectAssignmentAlerts(input: {
  driver?: Driver | null;
  truck?: Truck | null;
  trailer?: Trailer | null;
}): ComplianceAlert[] {
  return [
    ...(input.driver ? driverComplianceAlerts(input.driver) : []),
    ...(input.truck ? truckComplianceAlerts(input.truck) : []),
    ...(input.trailer ? trailerComplianceAlerts(input.trailer) : []),
  ];
}

export function complianceShortLabel(alerts: ComplianceAlert[]): string {
  if (alerts.length === 0) return "";
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
