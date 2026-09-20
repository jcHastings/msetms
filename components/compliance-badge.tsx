import type { ComplianceAlert } from "@/lib/compliance";

export function ComplianceBadge({ alerts }: { alerts: ComplianceAlert[] }) {
  if (alerts.length === 0) return null;
  const failed = alerts.some((alert) => alert.severity === "failed" || alert.kind === "drug_test");
  const expired = alerts.some((alert) => alert.severity === "expired");
  const expiring = alerts.some((alert) => alert.severity === "expiring");
  return (
    <span className="inline-flex flex-wrap gap-1">
      {failed ? <span className="status-pill status-tone-danger">Failed test</span> : null}
      {expired ? <span className="status-pill status-tone-danger">Expired</span> : null}
      {!expired && expiring ? <span className="status-pill status-tone-warning">Expiring</span> : null}
    </span>
  );
}

export function ComplianceList({ alerts }: { alerts: ComplianceAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {alerts.map((alert) => (
        <li
          key={`${alert.kind}-${alert.subject}-${alert.expiresOn}-${alert.message}`}
          className={alert.severity === "expiring" ? "text-amber-900" : "text-rose-800"}
        >
          {alert.href ? (
            <a href={alert.href} className="hover:underline">
              {alert.message}
            </a>
          ) : (
            alert.message
          )}
        </li>
      ))}
    </ul>
  );
}
