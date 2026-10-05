import { exceptionAction } from "@/lib/dispatcher-actions";
import {
  attentionLabel,
  exceptionReasonText,
  exceptionReasonTooltip,
  labelForExceptionKind,
  type ExceptionSeverity,
  type InboxException,
} from "@/lib/exceptions";
import { exceptionStateFor } from "@/lib/desk";

const SEVERITY_CLASS: Record<ExceptionSeverity, string> = {
  CRITICAL: "status-tone-danger",
  HIGH: "status-tone-warning",
  MEDIUM: "status-tone-caution",
  LOW: "status-tone-slate",
};

const VIEW_ONLY = "View-only access";

export function ExceptionIssueLine({
  item,
  compact = false,
  readOnly = false,
}: {
  item: InboxException;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const state = exceptionStateFor(item);
  if (compact) {
    const reason = exceptionReasonText(item);
    const tooltip = exceptionReasonTooltip(item);
    return (
      <li className="min-w-0" data-attention-issue={item.kind} title={tooltip}>
        <div className="exception-badge-stack">
          <span className={`status-pill ${SEVERITY_CLASS[item.severity]}`} title={attentionLabel(item)}>
            {attentionLabel(item)}
          </span>
          <span className="exception-reason" data-attention-reason="" title={tooltip}>
            {reason}
          </span>
        </div>
      </li>
    );
  }
  return (
    <li className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0" data-attention-issue={item.kind}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`status-pill ${SEVERITY_CLASS[item.severity]}`} title={attentionLabel(item)}>
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
      <form action={exceptionAction} className="mt-2 flex flex-wrap items-center gap-2" data-exception-actions="">
        <input type="hidden" name="exception_key" value={item.id} />
        <input
          name="reason"
          placeholder="Note"
          className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
          disabled={readOnly}
          aria-disabled={readOnly || undefined}
          title={readOnly ? VIEW_ONLY : undefined}
          data-view-only={readOnly ? "" : undefined}
        />
        <button
          className="btn btn-ghost text-xs"
          name="status"
          value="ack"
          type="submit"
          disabled={readOnly}
          aria-disabled={readOnly || undefined}
          title={readOnly ? VIEW_ONLY : undefined}
          data-view-only={readOnly ? "" : undefined}
        >
          Ack
        </button>
        <button
          className="btn btn-ghost text-xs"
          name="status"
          value="snoozed"
          type="submit"
          disabled={readOnly}
          aria-disabled={readOnly || undefined}
          title={readOnly ? VIEW_ONLY : undefined}
          data-view-only={readOnly ? "" : undefined}
        >
          Snooze 4h
        </button>
        <button
          className="btn btn-ghost text-xs"
          name="status"
          value="resolved"
          type="submit"
          disabled={readOnly}
          aria-disabled={readOnly || undefined}
          title={readOnly ? VIEW_ONLY : undefined}
          data-view-only={readOnly ? "" : undefined}
        >
          Resolve
        </button>
        {readOnly ? <span className="text-xs text-slate-500">View-only</span> : null}
      </form>
    </li>
  );
}
