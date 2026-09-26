"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { FormBanner } from "@/components/form-banner";
import { dropTrailerCustodyAction } from "@/lib/actions";
import { CUSTODY_LEFT_WHERE } from "@/lib/trailer-custody";
import type { ActionResult } from "@/lib/types";

export function TrailerDropForm({ trailerId }: { trailerId: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await dropTrailerCustodyAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-custody-drop-form="">
      {state ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <FormBanner result={state} />
        </div>
      ) : null}
      <input type="hidden" name="trailer_id" value={trailerId} />
      <div className="field">
        <label htmlFor={`custody-where-${trailerId}`}>Where</label>
        <select id={`custody-where-${trailerId}`} name="left_where" defaultValue="" required>
          <option value="">Select</option>
          {CUSTODY_LEFT_WHERE.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`custody-place-${trailerId}`}>Place name</label>
        <input id={`custody-place-${trailerId}`} name="left_name" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`custody-load-${trailerId}`}>Load number</label>
        <input id={`custody-load-${trailerId}`} name="load_number" autoComplete="off" />
      </div>
      <div className="field sm:col-span-2 lg:col-span-4">
        <label htmlFor={`custody-note-${trailerId}`}>Note</label>
        <textarea id={`custody-note-${trailerId}`} name="note" rows={2} />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save drop"}
        </button>
      </div>
    </form>
  );
}
