"use client";

import { useActionState } from "react";
import { driverAcknowledgeDispatchAction } from "@/lib/driver-actions";

export function DriverGotItButton({ loadId }: { loadId: number }) {
  const [state, action, pending] = useActionState(driverAcknowledgeDispatchAction, null);

  return (
    <form action={action} className="driver-got-it-wrap">
      <input type="hidden" name="load_id" value={String(loadId)} />
      <button
        type="submit"
        className="driver-got-it"
        data-got-it=""
        aria-label="Got it. Acknowledge this dispatch."
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Saving…" : "Got it"}
      </button>
      {state && !state.ok ? (
        <p className="mt-2 text-sm font-medium text-rose-200" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function DriverAckState({
  loadId,
  acknowledgedClock,
}: {
  loadId: number;
  acknowledgedClock: string | null;
}) {
  if (acknowledgedClock) {
    return (
      <p className="driver-ack-quiet" role="status" data-dispatch-ack="acknowledged">
        Acknowledged {acknowledgedClock}
      </p>
    );
  }
  return <DriverGotItButton loadId={loadId} />;
}
