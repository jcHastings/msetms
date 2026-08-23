"use client";

import { useActionState, useRef, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadForm } from "@/components/load-form";
import { extractRateConFormData, RateConPicker } from "@/components/rate-con-picker";
import { parseRateConAction, createLoadAction } from "@/lib/actions";
import type { ComplianceWindows } from "@/lib/settings-shared";
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
    placesEnabled: boolean;
    alertWindows: ComplianceWindows;
  };
}) {
  const [state, formAction, pending] = useActionState(parseRateConAction, null);
  const [localError, setLocalError] = useState("");
  const heldFile = useRef<File | null>(null);
  const parsed = state && "parsed" in state && state.ok ? state.parsed : null;
  const serverError = state && !("parsed" in state && state.ok) ? state : null;

  return (
    <div className="space-y-6">
      <form
        className="card space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const next = extractRateConFormData(heldFile.current);
          if ("error" in next) {
            setLocalError(next.error);
            return;
          }
          setLocalError("");
          formAction(next.data);
        }}
      >
        <div>
          <h2 className="text-sm font-semibold">Upload rate confirmation</h2>
          <p className="mt-1 text-sm text-slate-500">
            PDF text is extracted first. Scanned images use local OCR. Review every field before
            saving — a partial parse is normal.
          </p>
        </div>
        {localError ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {localError}
          </div>
        ) : null}
        {serverError ? <FormBanner result={serverError} /> : null}
        {state && "warning" in state && state.warning ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {state.warning}
          </div>
        ) : null}
        <RateConPicker
          fileName={state && "fileName" in state ? state.fileName : ""}
          onFile={(file) => {
            heldFile.current = file;
            if (file) setLocalError("");
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Reading…" : "Extract fields"}
        </button>
      </form>

      {parsed && state && "inboxId" in state ? (
        <div>
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Review the extracted fields, fix anything wrong, then save. The original file stays on
            the load as a rate confirmation attachment.
            {state.fileName ? <span className="mt-1 block font-mono text-xs">{state.fileName}</span> : null}
          </div>
          {state.warning ? (
            <div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {state.warning}
            </div>
          ) : null}
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
