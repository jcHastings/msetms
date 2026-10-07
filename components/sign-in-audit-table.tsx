import { formatDateTime } from "@/lib/format";
import type { LoginAuditRow } from "@/lib/login-audit";

function resultLabel(row: LoginAuditRow): string {
  return row.outcome === "success" ? "Signed in" : "Failed";
}

function appLabel(row: LoginAuditRow): string {
  return row.kind === "driver" ? "Driver app" : "Office";
}

export function SignInAuditTable({ rows }: { rows: LoginAuditRow[] }) {
  if (rows.length === 0) {
    return <p className="p-5 text-sm text-slate-600">No sign-in attempts in this range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-grid">
        <thead>
          <tr>
            <th>When</th>
            <th>Person</th>
            <th>Result</th>
            <th>IP</th>
            <th>App</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-sign-in-outcome={row.outcome}>
              <td>{formatDateTime(row.created_at)}</td>
              <td className="font-semibold">{row.user_name || "—"}</td>
              <td className={row.outcome === "failure" ? "font-semibold text-rose-700" : undefined}>
                {resultLabel(row)}
                {row.outcome === "failure" && row.detail ? (
                  <div className="text-xs font-normal text-slate-500">{row.detail}</div>
                ) : null}
              </td>
              <td className="tabular-nums">{row.ip_address || "—"}</td>
              <td>{appLabel(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
