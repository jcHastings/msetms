import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { LoadAuditTable } from "@/components/load-audit-table";
import { PageHeader } from "@/components/page-header";
import { listAuditActors, listCompanyAudit } from "@/lib/audit";
import { canManageUsers, canViewAudit, getPageAccess } from "@/lib/dispatcher-session";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ load?: string; user?: string; from?: string; to?: string }>;
}) {
  const dispatcher = await getPageAccess(canViewAudit);
  if (!dispatcher) {
    return <AccessDenied message="The accountability log is for Administrator and Accounting." />;
  }
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
        actions={
          canManageUsers(dispatcher.role) ? (
            <Link href="/settings/sign-in" className="btn btn-secondary">
              Sign-in log
            </Link>
          ) : null
        }
      />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="field">
          <label htmlFor="load">Load #</label>
          <input id="load" name="load" defaultValue={filters.load ?? ""} placeholder="MSE-1045" />
        </div>
        <div className="field">
          <label htmlFor="user">User</label>
          <input id="user" name="user" defaultValue={filters.user ?? ""} placeholder="MS Test" list="audit-actors" />
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
