import type { ComplianceAlert } from "@/lib/compliance";

export function ComplianceBadge({ alerts }: { alerts: ComplianceAlert[] }) {
  if (alerts.length === 0) return null;
  const expired = alerts.some((alert) => alert.severity === "expired");
  return (
    <span
      className={`status-pill ${expired ? "status-tone-danger" : "status-tone-warning"}`}
    >
      {expired ? "Expired" : "Expiring"}
    </span>
  );
}

export function ComplianceList({ alerts }: { alerts: ComplianceAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {alerts.map((alert) => (
        <li
          key={`${alert.subject}-${alert.kind}-${alert.expiresOn}`}
          className={alert.severity === "expired" ? "text-rose-800" : "text-amber-900"}
        >
          {alert.message}
        </li>
      ))}
    </ul>
  );
}
