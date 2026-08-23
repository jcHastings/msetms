import { ComplianceList } from "@/components/compliance-badge";
import type { ComplianceAlert } from "@/lib/compliance";
import { formatDate } from "@/lib/format";

function formatDay(value: string): string {
  return value ? formatDate(`${value}T12:00:00`) : "—";
}

export function UnitComplianceCard({
  registrationIssued,
  registrationExpires,
  inspectedOn,
  inspectionExpires,
  alerts,
}: {
  registrationIssued: string;
  registrationExpires: string;
  inspectedOn: string;
  inspectionExpires: string;
  alerts: ComplianceAlert[];
}) {
  return (
    <section className="card mb-4 p-5">
      <h2 className="text-sm font-semibold">Registration & DLT / DOT inspection</h2>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-slate-500">Registration issued</dt>
          <dd className="font-semibold">{formatDay(registrationIssued)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Registration expires (60-day warning)</dt>
          <dd className="font-semibold">{formatDay(registrationExpires)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">DLT / DOT inspection completed</dt>
          <dd className="font-semibold">{formatDay(inspectedOn)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">DLT / DOT inspection expires (30-day warning)</dt>
          <dd className="font-semibold">{formatDay(inspectionExpires)}</dd>
        </div>
      </dl>
      {alerts.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <ComplianceList alerts={alerts} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No registration (60 days) or DLT / DOT inspection (30 days) dates in the warning windows.
        </p>
      )}
    </section>
  );
}
