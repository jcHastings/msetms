"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { setRequirementReminderAction } from "@/lib/customer-contract-actions";
import type { ReminderStatus } from "@/lib/customer-contract-shared";

export function RequirementReminderActions({
  loadId,
  requirementId,
  status,
}: {
  loadId: number;
  requirementId: number;
  status: ReminderStatus;
}) {
  const [state, action, pending] = useActionState(setRequirementReminderAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="load_id" value={loadId} />
      <input type="hidden" name="requirement_id" value={requirementId} />
      {status === "done" ? (
        <button className="btn btn-secondary" type="submit" name="op" value="reopen" disabled={pending}>
          Reopen
        </button>
      ) : (
        <>
          <button className="btn btn-primary" type="submit" name="op" value="done" disabled={pending} data-reminder-done="">
            Done
          </button>
          <button className="btn btn-secondary" type="submit" name="op" value="snooze" disabled={pending} data-reminder-snooze="">
            Snooze 4 hours
          </button>
        </>
      )}
      <FormBanner result={state} />
    </form>
  );
}
