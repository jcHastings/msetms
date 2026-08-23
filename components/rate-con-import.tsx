"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadForm } from "@/components/load-form";
import { parseRateConAction, createLoadAction } from "@/lib/actions";
import type { Customer, DriverWithTruck, Location, Trailer, Truck } from "@/lib/types";

export function RateConImport({
  customers,
  trucks,
  trailers = [],
  locations = [],
  drivers,
  formSettings,
}: {
  customers: Customer[];
  trucks: Truck[];
  trailers?: Trailer[];
  locations?: Location[];
  drivers: DriverWithTruck[];
  formSettings?: {
    commodities: string[];
    extraStatuses: Array<{ value: string; label: string }>;
    defaultOoPercent: number;
    weightUnit: "lb" | "kg";
    currency: string;
    targetMarginPercent: number;
  };
}) {
  const [state, formAction, pending] = useActionState(parseRateConAction, null);
  const parsed = state && "parsed" in state && state.ok ? state.parsed : null;

  return (
    <div className="space-y-6">
      <form action={formAction} className="card space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold">Upload rate confirmation</h2>
          <p className="mt-1 text-sm text-slate-500">
            PDF text is extracted first. Scanned images use local OCR. Review every field before
            saving — a partial parse is normal.
          </p>
        </div>
        {state && !("parsed" in state && state.ok) ? <FormBanner result={state} /> : null}
        <div className="field">
          <label htmlFor="rate_con">Rate con file</label>
          <input id="rate_con" name="rate_con" type="file" accept=".pdf,image/*" required />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Reading…" : "Extract fields"}
        </button>
      </form>

      {parsed && state && "inboxId" in state ? (
        <div>
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Review the extracted fields, fix anything wrong, then save. The original file stays on
            the load as a rate confirmation attachment.
          </div>
          <LoadForm
            customers={customers}
            trucks={trucks}
            trailers={trailers}
            locations={locations}
            drivers={drivers}
            inboxId={state.inboxId}
            defaults={parsed}
            {...formSettings}
            action={createLoadAction}
            submitLabel="Save load from rate con"
          />
          {parsed.raw_text ? (
            <details className="mt-4 text-sm text-slate-500">
              <summary className="cursor-pointer font-medium">Extracted text</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">
                {parsed.raw_text}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
