"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import type { ActionResult } from "@/lib/types";

export function SettingsForm({
  action,
  children,
  submitLabel = "Save",
  canEdit = true,
  className = "grid gap-3 md:grid-cols-2",
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel?: string;
  canEdit?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      <div className="md:col-span-2">
        <FormBanner result={state} />
        {!canEdit ? (
          <p className="mb-2 text-sm text-slate-600">Read-only — you can view these settings.</p>
        ) : null}
      </div>
      {children}
      {canEdit ? (
        <div className="md:col-span-2 flex justify-end">
          <button className="btn btn-secondary" type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}
