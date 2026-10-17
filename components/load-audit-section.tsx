import { LoadAuditTable } from "@/components/load-audit-table";
import { listLoadAudit } from "@/lib/audit";

export function LoadAuditSection({ loadId }: { loadId: number }) {
  const rows = listLoadAudit(loadId);
  return (
    <section id="accountability" className="card mt-3 overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-1.5">
        <div>
          <h2 className="text-sm font-semibold">History</h2>
        </div>
        <a href="/audit" className="text-sm font-medium text-navy hover:underline">
          Company audit
        </a>
      </header>
      <LoadAuditTable rows={rows} />
    </section>
  );
}
