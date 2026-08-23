import type { ComplianceAlert } from "@/lib/compliance";

export function ComplianceBadge({ alerts }: { alerts: ComplianceAlert[] }) {
  if (alerts.length === 0) return null;
  const expired = alerts.some((alert) => alert.severity === "expired");
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        expired ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"
      }`}
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
