import { logCheckCallFormAction } from "@/lib/dispatcher-actions";
import { listLoadLog } from "@/lib/audit";
import { formatDateTime, toInputDateTime } from "@/lib/format";
import { labelForLoadStatus } from "@/lib/types";

export function LoadLogSection({ loadId }: { loadId: number }) {
  const rows = listLoadLog(loadId);
  return (
    <div className="space-y-4">
      <section id="load-check-call" className="card p-5">
        <h2 className="text-sm font-semibold">Log check call</h2>
        <p className="mt-1 text-sm text-slate-500">Timestamp, notes, and who (the signed-in dispatcher).</p>
        <form action={logCheckCallFormAction} className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="load_id" value={loadId} />
          <div className="field">
            <label htmlFor="called_at">When</label>
            <input
              id="called_at"
              name="called_at"
              type="datetime-local"
              defaultValue={toInputDateTime(new Date().toISOString())}
            />
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="check_call_notes">Notes</label>
            <input id="check_call_notes" name="notes" required placeholder="Rolling I-80, on time" />
          </div>
          <button className="btn btn-secondary self-end" type="submit">
            Save check call
          </button>
        </form>
      </section>

      <section id="load-log" className="card overflow-hidden">
        <header className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold">Load log</h2>
          <p className="text-xs text-slate-500">Status changes, check calls, and texts, newest first.</p>
        </header>
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No status changes or check calls yet.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold capitalize">{row.action.replaceAll("_", " ")}</span>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(row.action === "check_call" && row.old_value ? row.old_value : row.created_at)}
                  </span>
                </div>
                <div className="mt-1 text-slate-600">
                  {row.actor}
                  {row.action === "check_call"
                    ? ` · ${row.new_value}`
                    : row.action === "sms"
                      ? ` · to ${row.new_value}${row.old_value ? ` · ${row.old_value}` : ""}`
                    : row.field === "status"
                      ? ` · ${labelForLoadStatus(row.old_value || "")} → ${labelForLoadStatus(row.new_value || "")}`
                      : row.new_value
                        ? ` · ${row.new_value}`
                        : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
