import { LoadAuditTable } from "@/components/load-audit-table";
import { listLoadAudit } from "@/lib/audit";

export function LoadAuditSection({ loadId }: { loadId: number }) {
  const rows = listLoadAudit(loadId);
  return (
    <section id="accountability" className="card mt-6 overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">History</h2>
          <p className="text-xs text-slate-500">Newest first. Append-only — nothing here is edited or deleted.</p>
        </div>
        <a href="/audit" className="text-sm font-medium text-navy hover:underline">
          Company audit
        </a>
      </header>
      <LoadAuditTable rows={rows} />
    </section>
  );
}
