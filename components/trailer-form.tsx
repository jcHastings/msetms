"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { TRAILER_TYPES, TRUCK_STATUSES, type ActionResult, type Trailer } from "@/lib/types";

type Props = {
  trailer?: Trailer;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
};

export function TrailerForm({ trailer, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="card grid max-w-xl gap-4 p-6">
      <FormBanner result={state} />
      <div className="field">
        <label htmlFor="unit_number">Trailer number</label>
        <input id="unit_number" name="unit_number" required defaultValue={trailer?.unit_number} />
      </div>
      <div className="field">
        <label htmlFor="type">Type</label>
        <select id="type" name="type" defaultValue={trailer?.type ?? "reefer"}>
          {TRAILER_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="orbcomm_asset_id">ORBCOMM asset ID</label>
        <input
          id="orbcomm_asset_id"
          name="orbcomm_asset_id"
          defaultValue={trailer?.orbcomm_asset_id}
          placeholder="From Reefer Status Report"
        />
      </div>
      <h2 className="text-sm font-semibold">Registration</h2>
      <div className="field">
        <label htmlFor="registration_issued">Date issued</label>
        <input id="registration_issued" name="registration_issued" type="date" defaultValue={trailer?.registration_issued} />
      </div>
      <div className="field">
        <label htmlFor="registration_expires">Expiration date</label>
        <input id="registration_expires" name="registration_expires" type="date" defaultValue={trailer?.registration_expires} />
      </div>
      <div className="field">
        <label htmlFor="dot_inspected_on">DOT inspection completed</label>
        <input id="dot_inspected_on" name="dot_inspected_on" type="date" defaultValue={trailer?.dot_inspected_on} />
      </div>
      <div className="field">
        <label htmlFor="dot_expires">DOT inspection expires</label>
        <input id="dot_expires" name="dot_expires" type="date" defaultValue={trailer?.dot_expires} />
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={trailer?.status ?? "available"}>
          {TRUCK_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
