import Link from "next/link";
import { exceptionAction } from "@/lib/dispatcher-actions";
import {
  EXCEPTION_KINDS,
  attentionLabel,
  groupInboxExceptions,
  labelForExceptionKind,
  type ExceptionInbox,
  type ExceptionSeverity,
  type InboxException,
} from "@/lib/exceptions";
import { exceptionStateFor } from "@/lib/desk";

const SEVERITY_CLASS: Record<ExceptionSeverity, string> = {
  CRITICAL: "bg-rose-100 text-rose-900",
  HIGH: "bg-orange-100 text-orange-900",
  MEDIUM: "bg-amber-100 text-amber-950",
  LOW: "bg-slate-100 text-slate-700",
};

function IssueLine({ item }: { item: InboxException }) {
  const state = exceptionStateFor(item);
  return (
    <li className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0" data-attention-issue={item.kind}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_CLASS[item.severity]}`}
        >
          {attentionLabel(item)}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {labelForExceptionKind(item.kind)}
        </span>
        {state?.status === "ack" ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Ack</span>
        ) : null}
        {item.demo ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">demo</span>
        ) : null}
      </div>
      <div className="mt-1 text-sm text-slate-700">{item.title}</div>
      <div className="mt-0.5 text-xs text-slate-600">{item.detail}</div>
      <form action={exceptionAction} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="exception_key" value={item.id} />
        <input name="reason" placeholder="Note" className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
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
    </li>
  );
}

export function ExceptionInboxCard({
  inbox,
  kind,
  q,
  variant = "inbox",
}: {
  inbox: ExceptionInbox;
  kind?: string;
  q?: string;
  variant?: "inbox" | "workbench";
}) {
  const groups = groupInboxExceptions(inbox.items);
  const workbench = variant === "workbench";
  const summary = workbench
    ? inbox.attentionCount === 0
      ? "All loads are in tolerance"
      : `${inbox.attentionCount} load${inbox.attentionCount === 1 ? "" : "s"} out of tolerance`
    : inbox.attentionCount === 0
      ? `${inbox.fineCount} load${inbox.fineCount === 1 ? "" : "s"} fine`
      : `${inbox.fineCount} load${inbox.fineCount === 1 ? "" : "s"} fine · ${inbox.attentionCount} need attention`;

  return (
    <section
      className="card mb-6 overflow-hidden"
      data-attention-inbox=""
      data-workbench={workbench ? "" : undefined}
    >
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {workbench ? "Workbench" : "Requires Attention"}
          </p>
          <h2 className="text-sm font-semibold text-slate-900">{summary}</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
        {workbench ? (
          <Link href="/board" className="btn btn-secondary" data-workbench-board="">
            All trucks
          </Link>
        ) : null}
        <form className="flex flex-wrap items-end gap-2" method="get" action={workbench ? "/" : "/desk"}>
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
        </div>
      </header>
      {groups.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          {workbench ? "All loads are in tolerance." : "All quiet — nothing needs attention."}
        </p>
      ) : (
        <ul>
          {groups.map((group) => (
            <li key={group.loadId} className="border-b border-slate-100 last:border-b-0" data-attention-load={group.loadNumber}>
              <div className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/loads/${group.loadId}`} className="font-mono text-sm font-semibold hover:underline">
                      {group.loadNumber}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {group.customerName}
                      <span className="mx-1 text-slate-300">·</span>
                      {group.origin}
                      <span className="mx-1 text-slate-400">→</span>
                      {group.destination}
                    </div>
                  </div>
                  <Link
                    href={workbench ? `/loads/${group.loadId}` : `/loads/${group.loadId}`}
                    className="text-sm font-medium text-slate-600"
                  >
                    Open
                  </Link>
                </div>
                <ul className="mt-3 space-y-3">
                  {group.items.map((item) => (
                    <IssueLine key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
