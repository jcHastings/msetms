import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { LoadAuditRow } from "@/lib/audit";

export function LoadAuditTable({
  rows,
  showLoad = false,
}: {
  rows: LoadAuditRow[];
  showLoad?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500">No audit entries yet. Changes from now on are logged.</p>;
  }
  return (
    <table className="table-grid">
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          {showLoad ? <th>Load</th> : null}
          <th>Action</th>
          <th>Field</th>
          <th>Old</th>
          <th>New</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(row.created_at)}</td>
            <td>
              <div className="font-medium">{row.actor}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">{row.actor_kind}</div>
            </td>
            {showLoad ? (
              <td>
                <Link href={`/loads/${row.load_id}`} className="font-mono text-sm hover:underline">
                  {row.load_number || row.load_id}
                </Link>
              </td>
            ) : null}
            <td className="capitalize">{row.action.replaceAll("_", " ")}</td>
            <td>{row.field || "—"}</td>
            <td className="max-w-[14rem] truncate text-slate-600" title={row.old_value}>
              {row.old_value || "—"}
            </td>
            <td className="max-w-[14rem] truncate font-medium" title={row.new_value}>
              {row.new_value || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
