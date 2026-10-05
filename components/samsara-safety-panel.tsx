import { formatDateTime } from "@/lib/format";
import { TRUCK_SAFETY_WINDOW_LABEL, type SamsaraSafetyResult } from "@/lib/samsara-safety-shared";

/** Dense safety list for the truck unit card. Same rows the load timeline cites. */
export function SamsaraSafetyPanel({ result }: { result: SamsaraSafetyResult }) {
  return (
    <section className="card mb-4 overflow-hidden" data-samsara-safety="truck">
      <header className="border-b border-slate-100 px-3 py-1.5">
        <h2 className="text-[12.5px] font-semibold">Safety events</h2>
        <p className="text-xs text-slate-500">{TRUCK_SAFETY_WINDOW_LABEL}</p>
      </header>
      {result.message ? (
        <p className="px-3 py-2 text-[12.5px] text-amber-950" data-samsara-safety-notice="">
          {result.message}
        </p>
      ) : result.events.length === 0 ? (
        <p className="px-3 py-2 text-[12.5px] text-slate-500" data-samsara-safety-empty="">
          No safety events in the last 7 days.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {result.events.map((event) => (
            <li key={event.id} className="px-3 py-1.5 text-[12.5px]" data-samsara-event-id={event.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{event.title}</span>
                <time className="text-xs text-slate-500" dateTime={event.at}>
                  {formatDateTime(event.at)}
                </time>
              </div>
              <div className="mt-0.5 font-mono text-xs text-slate-600">Samsara {event.detail}</div>
            </li>
          ))}
        </ol>
      )}
      {result.truncated ? (
        <p className="border-t border-slate-100 px-3 py-1.5 text-[12.5px] text-slate-500" data-samsara-safety-truncated="">
          Samsara has more safety events in this window.
        </p>
      ) : null}
    </section>
  );
}
