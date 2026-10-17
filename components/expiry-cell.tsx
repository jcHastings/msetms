import { ComplianceBadge } from "@/components/compliance-badge";
import type { ComplianceAlert } from "@/lib/compliance";
import { formatDate } from "@/lib/format";

export function ExpiryCell({ value, alert }: { value: string; alert?: ComplianceAlert }) {
  return (
    <td className="whitespace-nowrap">
      <div>{value ? formatDate(value) : "—"}</div>
      {alert ? <ComplianceBadge alerts={[alert]} /> : null}
    </td>
  );
}

export function ActiveStatusCell({ active }: { active: number }) {
  return (
    <td>
      {active === 0 ? (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inactive</span>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Active</span>
      )}
    </td>
  );
}
