import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { SignInAuditTable } from "@/components/sign-in-audit-table";
import { canManageUsers, getPageAccess } from "@/lib/dispatcher-session";
import { listLoginAudit, listLoginAuditNames } from "@/lib/login-audit";

export const dynamic = "force-dynamic";

export default async function SignInLogPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; result?: string; app?: string; from?: string; to?: string }>;
}) {
  const dispatcher = await getPageAccess(canManageUsers);
  if (!dispatcher) {
    return <AccessDenied message="Sign-in log is for Administrator." />;
  }
  const filters = await searchParams;
  const result = filters.result === "success" || filters.result === "failure" ? filters.result : "all";
  const app = filters.app === "office" || filters.app === "driver" ? filters.app : "all";
  const rows = listLoginAudit({
    user: filters.user,
    outcome: result,
    kind: app,
    from: filters.from,
    to: filters.to,
  });
  const names = listLoginAuditNames();

  return (
    <>
      <SettingsBack />
      <PageHeader
        title="Sign-in log"
        actions={
          <Link href="/users" className="btn btn-secondary">
            Users
          </Link>
        }
      />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4" data-sign-in-filters="">
        <div className="field">
          <label htmlFor="user">Person</label>
          <input id="user" name="user" defaultValue={filters.user ?? ""} list="sign-in-people" />
          <datalist id="sign-in-people">
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="result">Result</label>
          <select id="result" name="result" defaultValue={result}>
            <option value="all">All</option>
            <option value="success">Signed in</option>
            <option value="failure">Failed</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="app">App</label>
          <select id="app" name="app" defaultValue={app}>
            <option value="all">All</option>
            <option value="office">Office</option>
            <option value="driver">Driver app</option>
          </select>
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
      <div className="card overflow-hidden" data-sign-in-log="">
        <SignInAuditTable rows={rows} />
      </div>
    </>
  );
}
