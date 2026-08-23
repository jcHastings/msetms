"use client";

import { useActionState, useRef, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadForm } from "@/components/load-form";
import { extractRateConFormData, RateConPicker } from "@/components/rate-con-picker";
import { parseRateConAction, updateLoadAction } from "@/lib/actions";
import type { ComplianceWindows } from "@/lib/settings-shared";
import type { Customer, DriverWithTruck, Load, Location, Trailer, Truck } from "@/lib/types";

export function RateConApply({
  load,
  customers,
  trucks,
  trailers = [],
  locations = [],
  drivers,
  formSettings,
}: {
  load: Load;
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
  const boundAction = updateLoadAction.bind(null, load.id);
  const serverError = state && !("parsed" in state && state.ok) ? state : null;

  return (
    <section className="mt-6 space-y-4">
      <form
        action={formAction}
        className="card space-y-4 p-6"
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem("rate_con");
          const fromInput = input instanceof HTMLInputElement ? input.files?.[0] ?? null : null;
          const file = heldFile.current ?? fromInput;
          if (file && !heldFile.current) heldFile.current = file;
          const next = extractRateConFormData(file);
          if ("error" in next) {
            event.preventDefault();
            setLocalError(next.error);
            return;
          }
          event.preventDefault();
          setLocalError("");
          formAction(next.data);
        }}
      >
        <div>
          <h2 className="text-sm font-semibold">Apply a rate confirmation</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a PDF or image, review the fields, then save to overwrite this load and attach
            the original file.
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
          inputId={`rate_con_${load.id}`}
          fileName={state && "fileName" in state ? state.fileName : ""}
          onFile={(file) => {
            heldFile.current = file;
            if (file) setLocalError("");
          }}
        />
        <button
          className="btn btn-secondary"
          type="submit"
          disabled={pending}
          onClick={(event) => {
            if (heldFile.current) return;
            const form = event.currentTarget.form;
            const input = form?.elements.namedItem("rate_con");
            const fromInput = input instanceof HTMLInputElement ? input.files?.[0] ?? null : null;
            if (!fromInput) {
              event.preventDefault();
              setLocalError("Pick a file first.");
            }
          }}
        >
          {pending ? "Reading…" : "Extract fields"}
        </button>
      </form>
      {parsed && state && "inboxId" in state ? (
        <LoadForm
          customers={customers}
          trucks={trucks}
          trailers={trailers}
          locations={locations}
          drivers={drivers}
          load={{
            ...load,
            origin: parsed.origin || load.origin,
            destination: parsed.destination || load.destination,
            commodity: parsed.commodity || load.commodity,
            weight: parsed.weight ?? load.weight,
            rate: parsed.rate ?? load.rate,
            special_instructions: parsed.special_instructions || load.special_instructions,
            appointment_notes: parsed.appointment_notes || load.appointment_notes,
            reference_number: parsed.reference_number || load.reference_number,
            po_number: parsed.po_number || load.po_number,
            reefer_setpoint_f: parsed.reefer_setpoint_f ?? load.reefer_setpoint_f,
          }}
          inboxId={state.inboxId}
          defaults={parsed}
          {...formSettings}
          action={boundAction}
          submitLabel="Apply rate con to this load"
        />
      ) : null}
    </section>
  );
}
