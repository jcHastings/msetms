import { logCheckCallFormAction } from "@/lib/dispatcher-actions";
import { listLoadTimeline, withSamsaraSafetyEvents } from "@/lib/load-timeline";
import type { SamsaraSafetyResult } from "@/lib/samsara-safety-shared";
import { formatDateTime, toInputDateTime } from "@/lib/format";

export function LoadLogSection({
  loadId,
  safety,
}: {
  loadId: number;
  safety?: SamsaraSafetyResult | null;
}) {
  const rows = withSamsaraSafetyEvents(listLoadTimeline(loadId), safety?.events ?? []);
  return (
    <div className="space-y-3">
      <section id="load-check-call" className="card p-3">
        <h2 className="text-[12.5px] font-semibold">Log check call</h2>
        <form action={logCheckCallFormAction} className="mt-2 grid gap-2 md:grid-cols-3">
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

      <section id="load-log" className="card overflow-hidden" data-load-timeline="">
        <header className="border-b border-slate-100 px-3 py-1.5">
          <h2 className="text-[12.5px] font-semibold">Load Timeline</h2>
        </header>
        {safety?.message ? (
          <p className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[12.5px] text-amber-950" data-samsara-safety-notice="">
            {safety.message}
          </p>
        ) : safety?.reason === "empty" ? (
          <p className="border-b border-slate-100 px-3 py-1.5 text-[12.5px] text-slate-500" data-samsara-safety-empty="">
            No safety events in the load window.
          </p>
        ) : null}
        {safety?.truncated ? (
          <p className="border-b border-slate-100 px-3 py-1.5 text-[12.5px] text-slate-500" data-samsara-safety-truncated="">
            Samsara has more safety events in this window.
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-[12.5px] text-slate-500">No dispatcher, status, document, or geofence events yet.</p>
        ) : (
          <ol className="divide-y divide-slate-100" data-timeline-newest-first="">
            {rows.map((row) => (
              <li key={row.id} className="px-3 py-1.5 text-[12.5px]" data-timeline-event={row.source}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold capitalize">{row.title}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(row.at)}</span>
                </div>
                <div className="mt-1 text-slate-600">
                  {row.actor}
                  {row.detail ? ` · ${row.detail}` : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
