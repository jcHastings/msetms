"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { FormBanner } from "@/components/form-banner";
import { LoadForm } from "@/components/load-form";
import { extractRateConFormData, RateConPicker } from "@/components/rate-con-picker";
import { useRateConLocationBook } from "@/components/rate-con-location-review";
import { RateConFieldFlags, RateConNeedsReviewNote } from "@/components/rate-con-review";
import { parseRateConAction, createLoadAction } from "@/lib/actions";
import { rateConApplyContactFields, type ParsedRateCon } from "@/lib/rate-con-shared";
import type { ComplianceWindows } from "@/lib/settings-shared";
import type { Customer, DriverWithTruck, Location, Trailer, Truck } from "@/lib/types";

type LoadFormSettings = {
  commodities: string[];
  extraStatuses: Array<{ value: string; label: string }>;
  defaultOoPercent: number;
  weightUnit: "lb" | "kg";
  currency: string;
  targetMarginPercent: number;
  placesEnabled: boolean;
  alertWindows: ComplianceWindows;
};

export function RateConImport({
  customers,
  trucks,
  trailers = [],
  locations = [],
  drivers,
  formSettings,
  children,
}: {
  customers: Customer[];
  trucks: Truck[];
  trailers?: Trailer[];
  locations?: Location[];
  drivers: DriverWithTruck[];
  formSettings?: LoadFormSettings;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(parseRateConAction, null);
  const [localError, setLocalError] = useState("");
  const [chosenName, setChosenName] = useState("");
  const heldFile = useRef<File | null>(null);
  const parsed = state && "parsed" in state && state.ok ? state.parsed : null;
  const serverError = state && !("parsed" in state && state.ok) ? state : null;

  return (
    <div className="space-y-6">
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
          <h2 className="text-sm font-semibold">Drop a rate con or load email</h2>
          <p className="mt-1 text-sm text-slate-500">
            PDF, photo, or forwarded load email. AI reads any broker layout. Review, then confirm — nothing is saved until you confirm.
          </p>
        </div>
        {localError ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {localError}
          </div>
        ) : null}
        {serverError ? <FormBanner result={serverError} /> : null}
        {!parsed && state && "warning" in state && state.warning ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {state.warning}
          </div>
        ) : null}
        <RateConPicker
          fileName={chosenName || (state && "fileName" in state ? state.fileName : "")}
          onFile={(file) => {
            if (!file) return;
            heldFile.current = file;
            setChosenName(file.name);
            setLocalError("");
          }}
        />
        <button
          className="btn btn-primary"
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
          {pending ? "Reading…" : "Read rate con"}
        </button>
      </form>

      {parsed && state && "inboxId" in state ? (
        <RateConImportedLoad
          parsed={parsed}
          inboxId={state.inboxId}
          fileName={state.fileName}
          warning={state.warning}
          customers={customers}
          trucks={trucks}
          trailers={trailers}
          locations={locations}
          drivers={drivers}
          formSettings={formSettings}
        />
      ) : (
        children
      )}
    </div>
  );
}

function RateConImportedLoad({
  parsed,
  inboxId,
  fileName,
  warning,
  customers,
  trucks,
  trailers,
  locations,
  drivers,
  formSettings,
}: {
  parsed: ParsedRateCon;
  inboxId: string;
  fileName: string;
  warning?: string;
  customers: Customer[];
  trucks: Truck[];
  trailers: Trailer[];
  locations: Location[];
  drivers: DriverWithTruck[];
  formSettings?: LoadFormSettings;
}) {
  const [discarded, setDiscarded] = useState(false);
  const book = useRateConLocationBook(parsed, locations);
  if (discarded) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" data-rate-con-discarded="">
        Draft discarded. The load was not saved.
      </div>
    );
  }
  return (
    <div data-rate-con-draft="">
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {parsed.reader === "ai"
          ? "Review the AI draft, fix anything wrong, then confirm. The load is not saved until you confirm."
          : "Review the guessed fields, fix anything wrong, then confirm. The load is not saved until you confirm."}{" "}
        The original file stays on the load as a rate confirmation attachment.
        {fileName ? <span className="mt-1 block font-mono text-xs">{fileName}</span> : null}
      </div>
      {warning ? (
        <div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {warning}
        </div>
      ) : null}
      <RateConFieldFlags parsed={parsed} />
      <RateConNeedsReviewNote parsed={parsed} />
      {book.review}
      <LoadForm
        key={book.formKey}
        standalone
        screen="all"
        includeLane
        customers={customers}
        trucks={trucks}
        trailers={trailers}
        locations={book.book}
        drivers={drivers}
        inboxId={inboxId}
        defaults={{
          ...book.defaults,
          ...rateConApplyContactFields(parsed),
        }}
        {...formSettings}
        action={createLoadAction}
        submitLabel="Confirm and save load"
      />
      <div className="mt-3">
        <button className="btn btn-secondary" type="button" data-rate-con-discard="" onClick={() => setDiscarded(true)}>
          Discard draft
        </button>
      </div>
      {parsed.raw_text ? (
        <details className="mt-4 text-sm text-slate-500">
          <summary className="cursor-pointer font-medium">Extracted text</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">
            {parsed.raw_text}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
