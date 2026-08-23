import { LoadAuditTable } from "@/components/load-audit-table";
import { PageHeader } from "@/components/page-header";
import { listAuditActors, listCompanyAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ load?: string; user?: string; from?: string; to?: string }>;
}) {
  const filters = await searchParams;
  const rows = listCompanyAudit({
    loadNumber: filters.load,
    actor: filters.user,
    from: filters.from,
    to: filters.to,
  });
  const actors = listAuditActors();

  return (
    <>
      <PageHeader
        title="Audit"
        subtitle="Append-only accountability log for load changes. Read-only. PINs and API keys are never stored."
      />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="field">
          <label htmlFor="load">Load #</label>
          <input id="load" name="load" defaultValue={filters.load ?? ""} placeholder="MSE-1045" />
        </div>
        <div className="field">
          <label htmlFor="user">User</label>
          <input id="user" name="user" defaultValue={filters.user ?? ""} placeholder="Ana G" list="audit-actors" />
          <datalist id="audit-actors">
            {actors.map((actor) => (
              <option key={actor} value={actor} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>
      <div className="card overflow-hidden">
        <LoadAuditTable rows={rows} showLoad />
      </div>
    </>
  );
}
