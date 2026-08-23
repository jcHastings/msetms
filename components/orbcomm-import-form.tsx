"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { importOrbcommReportAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/types";

export function OrbcommImportForm() {
  const [state, formAction, pending] = useActionState(
    importOrbcommReportAction as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );

  return (
    <form action={formAction} className="mt-4 grid gap-3">
      <FormBanner result={state} />
      <div className="field">
        <label htmlFor="file">Reefer Status Report export (CSV or JSON)</label>
        <input id="file" name="file" type="file" accept=".csv,.json,text/csv,application/json" />
      </div>
      <div className="field">
        <label htmlFor="report_text">Or paste rows</label>
        <textarea
          id="report_text"
          name="report_text"
          rows={5}
          placeholder={'trailer_id,temperature_f,setpoint_f,return_air_f,supply_air_f,alarm,latitude,longitude,recorded_at\nTR-7742,34.2,34,34.1,33.8,,32.78,-96.8,2026-08-23T13:05:00Z'}
        />
      </div>
      <div className="flex justify-end">
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import report"}
        </button>
      </div>
    </form>
  );
}
