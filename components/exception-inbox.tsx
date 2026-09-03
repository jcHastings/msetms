import Link from "next/link";
import {
  EXCEPTION_KINDS,
  groupInboxExceptions,
  labelForExceptionKind,
  type ExceptionInbox,
} from "@/lib/exceptions";
import { ExceptionIssueLine } from "@/components/exception-issue-line";
import { WorkbenchLoadCard } from "@/components/workbench-load-card";

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

  const filters = (
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
  );

  if (workbench) {
    return (
      <section data-attention-inbox="" data-workbench="">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workbench</p>
            <h2 className="text-sm font-semibold text-slate-900">{summary}</h2>
          </div>
          {filters}
        </header>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
            All loads are in tolerance.
          </p>
        ) : (
          <div className="grid gap-6" data-workbench-cards="">
            {groups.map((group) => (
              <WorkbenchLoadCard key={group.loadId} group={group} />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card mb-6 overflow-hidden" data-attention-inbox="">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Requires Attention</p>
          <h2 className="text-sm font-semibold text-slate-900">{summary}</h2>
        </div>
        {filters}
      </header>
      {groups.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">All quiet — nothing needs attention.</p>
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
                  <Link href={`/loads/${group.loadId}`} className="text-sm font-medium text-slate-600">
                    Open
                  </Link>
                </div>
                <ul className="mt-3 space-y-3">
                  {group.items.map((item) => (
                    <ExceptionIssueLine key={item.id} item={item} />
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
