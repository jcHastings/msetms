import Link from "next/link";
import {
  labelForExceptionKind,
  type ExceptionInbox,
  type ExceptionSeverity,
} from "@/lib/exceptions";

const SEVERITY_CLASS: Record<ExceptionSeverity, string> = {
  CRITICAL: "bg-rose-100 text-rose-900",
  HIGH: "bg-orange-100 text-orange-900",
  MEDIUM: "bg-amber-100 text-amber-950",
  LOW: "bg-slate-100 text-slate-700",
};

export function ExceptionInboxCard({ inbox }: { inbox: ExceptionInbox }) {
  const summary =
    inbox.attentionCount === 0
      ? `${inbox.fineCount} load${inbox.fineCount === 1 ? "" : "s"} fine`
      : `${inbox.fineCount} load${inbox.fineCount === 1 ? "" : "s"} fine · ${inbox.attentionCount} need attention`;

  return (
    <section className="card mb-6 overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Exception inbox
          </p>
          <h2 className="text-sm font-semibold text-slate-900">{summary}</h2>
        </div>
        <p className="text-xs text-slate-500">Ranked CRITICAL → LOW. Click a row to open the load.</p>
      </header>
      {inbox.items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">All quiet — nothing needs attention.</p>
      ) : (
        <ul>
          {inbox.items.map((item) => (
            <li key={item.id} className="border-b border-slate-100 last:border-b-0">
              <Link
                href={`/loads/${item.loadId}`}
                className="grid gap-2 px-5 py-3 transition hover:bg-slate-50 sm:grid-cols-[7.5rem_1fr_auto] sm:items-center"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_CLASS[item.severity]}`}
                  >
                    {item.severity}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {labelForExceptionKind(item.kind)}
                  </span>
                </div>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm font-semibold">{item.loadNumber}</span>
                    <span className="text-sm text-slate-700">{item.title}</span>
                    {item.demo ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        demo
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {item.customerName}
                    <span className="mx-1 text-slate-300">·</span>
                    {item.origin}
                    <span className="mx-1 text-slate-400">→</span>
                    {item.destination}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">{item.detail}</div>
                </div>
                <span className="text-sm font-medium text-slate-600">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
