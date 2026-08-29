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
        <label htmlFor="file">Reefer spreadsheet</label>
        <input id="file" name="file" type="file" accept=".csv,.json,text/csv,application/json" />
      </div>
      <div className="field">
        <label htmlFor="report_text">Or paste rows</label>
        <textarea
          id="report_text"
          name="report_text"
          rows={5}
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
