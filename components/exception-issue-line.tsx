import { exceptionAction } from "@/lib/dispatcher-actions";
import {
  attentionLabel,
  labelForExceptionKind,
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

export function ExceptionIssueLine({ item, compact = false }: { item: InboxException; compact?: boolean }) {
  const state = exceptionStateFor(item);
  return (
    <li
      className={compact ? "border-t border-slate-100 pt-2 first:border-t-0 first:pt-0" : "border-t border-slate-100 pt-3 first:border-t-0 first:pt-0"}
      data-attention-issue={item.kind}
    >
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
      <div className={compact ? "mt-0.5 text-xs font-medium text-slate-800" : "mt-1 text-sm text-slate-700"}>
        {item.title}
      </div>
      <div className={compact ? "mt-0.5 text-[11px] leading-snug text-slate-600" : "mt-0.5 text-xs text-slate-600"}>
        {item.detail}
      </div>
      <form action={exceptionAction} className={compact ? "mt-1.5 flex flex-wrap items-center gap-1.5" : "mt-2 flex flex-wrap items-center gap-2"}>
        <input type="hidden" name="exception_key" value={item.id} />
        <input
          name="reason"
          placeholder="Note"
          className={
            compact
              ? "min-w-0 flex-1 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
              : "w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
          }
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
    </li>
  );
}
