"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadForm } from "@/components/load-form";
import { RateConPicker } from "@/components/rate-con-picker";
import { parseRateConAction, updateLoadAction } from "@/lib/actions";
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
  };
}) {
  const [state, formAction, pending] = useActionState(parseRateConAction, null);
  const parsed = state && "parsed" in state && state.ok ? state.parsed : null;
  const boundAction = updateLoadAction.bind(null, load.id);

  return (
    <section className="mt-6 space-y-4">
      <form action={formAction} className="card space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold">Apply a rate confirmation</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a PDF or image, review the fields, then save to overwrite this load and attach
            the original file.
          </p>
        </div>
        {state && !("parsed" in state && state.ok) ? <FormBanner result={state} /> : null}
        <RateConPicker inputId={`rate_con_${load.id}`} fileName={state && "fileName" in state ? state.fileName : ""} />
        <button className="btn btn-secondary" type="submit" disabled={pending}>
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
