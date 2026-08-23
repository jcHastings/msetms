import Link from "next/link";
import { exceptionAction } from "@/lib/dispatcher-actions";
import {
  EXCEPTION_KINDS,
  labelForExceptionKind,
  type ExceptionInbox,
  type ExceptionSeverity,
} from "@/lib/exceptions";
import { exceptionStateFor } from "@/lib/desk";

const SEVERITY_CLASS: Record<ExceptionSeverity, string> = {
  CRITICAL: "bg-rose-100 text-rose-900",
  HIGH: "bg-orange-100 text-orange-900",
  MEDIUM: "bg-amber-100 text-amber-950",
  LOW: "bg-slate-100 text-slate-700",
};

export function ExceptionInboxCard({
  inbox,
  kind,
  q,
}: {
  inbox: ExceptionInbox;
  kind?: string;
  q?: string;
}) {
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
        <form className="flex flex-wrap items-end gap-2" method="get" action="/">
          <div className="field">
            <label htmlFor="inbox-kind">Type</label>
            <select id="inbox-kind" name="kind" defaultValue={kind ?? ""}>
              <option value="">All types</option>
              {EXCEPTION_KINDS.map((item) => (
                <option key={item} value={item}>
                  {labelForExceptionKind(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="inbox-q">Find</label>
            <input id="inbox-q" name="q" defaultValue={q ?? ""} placeholder="Load, customer, lane" />
          </div>
          <button className="btn btn-secondary" type="submit">
            Filter
          </button>
        </form>
      </header>
      {inbox.items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">All quiet — nothing needs attention.</p>
      ) : (
        <ul>
          {inbox.items.map((item) => {
            const state = exceptionStateFor(item);
            return (
              <li key={item.id} className="border-b border-slate-100 last:border-b-0">
                <div className="grid gap-2 px-5 py-3 sm:grid-cols-[7.5rem_1fr_auto] sm:items-start">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_CLASS[item.severity]}`}
                    >
                      {item.severity}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {labelForExceptionKind(item.kind)}
                    </span>
                    {state?.status === "ack" ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Ack</span>
                    ) : null}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <Link href={`/loads/${item.loadId}`} className="font-mono text-sm font-semibold hover:underline">
                        {item.loadNumber}
                      </Link>
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
                    <form action={exceptionAction} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="exception_key" value={item.id} />
                      <input
                        name="reason"
                        placeholder="Note"
                        className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button className="btn btn-ghost text-xs" name="status" value="ack" type="submit">
                        Ack
                      </button>
                      <button className="btn btn-ghost text-xs" name="status" value="snoozed" type="submit">
                        Snooze 4h
                      </button>
                      <button className="btn btn-ghost text-xs" name="status" value="resolved" type="submit">
                        Resolve
                      </button>
                    </form>
                  </div>
                  <Link href={`/loads/${item.loadId}`} className="text-sm font-medium text-slate-600">
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
