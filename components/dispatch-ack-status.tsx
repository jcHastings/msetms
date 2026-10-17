import type { DispatchAckView } from "@/lib/dispatch-ack";

export function DispatchAckStatus({
  ack,
  compact = false,
}: {
  ack: DispatchAckView;
  compact?: boolean;
}) {
  if (ack.state === "none") return null;
  if (ack.state === "acknowledged") {
    return (
      <span
        className={
          compact
            ? "mt-1 block text-[10px] font-semibold leading-tight text-slate-600"
            : "text-sm font-medium text-slate-700"
        }
        data-dispatch-ack="acknowledged"
      >
        Acknowledged {ack.clock}
      </span>
    );
  }
  return (
    <span
      className={
        compact
          ? "mt-1 block text-[10px] font-semibold leading-tight text-amber-900"
          : "rounded-md bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-950 ring-1 ring-amber-200"
      }
      data-dispatch-ack="waiting"
    >
      {ack.flagged ? "Waiting for Got it · desk flag" : "Waiting for Got it"}
    </span>
  );
}
