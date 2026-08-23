import { ComplianceList } from "@/components/compliance-badge";
import type { ComplianceAlert } from "@/lib/compliance";
import { formatDate } from "@/lib/format";

function formatDay(value: string): string {
  return value ? formatDate(`${value}T12:00:00`) : "—";
}

export function UnitComplianceCard({
  title,
  issued,
  expires,
  alerts,
  emptyLabel,
}: {
  title: string;
  issued: string;
  expires: string;
  alerts: ComplianceAlert[];
  emptyLabel: string;
}) {
  return (
    <section className="card mb-4 p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-slate-500">Registration issued</dt>
          <dd className="font-semibold">{formatDay(issued)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Registration expires</dt>
          <dd className="font-semibold">{formatDay(expires)}</dd>
        </div>
      </dl>
      {alerts.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <ComplianceList alerts={alerts} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </section>
  );
}
