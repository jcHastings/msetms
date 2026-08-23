"use client";

import { useActionState } from "react";
import { importFuelCsvAction } from "@/lib/actions";
import type { FuelImportResult } from "@/lib/fuel";

export function FuelCsvImport() {
  const [state, formAction, pending] = useActionState(importFuelCsvAction, null as FuelImportResult | null);
  const errors = state?.errors ?? [];

  return (
    <section className="card mb-6 space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Daily fuel-card import</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload a CSV or a Transaction Activity Report PDF. Every line is one of four buckets: Truck
          diesel, Reefer diesel, DEF, or Scale — never lumped into Other. Lines map date, card, category,
          unit, prompt, invoice, location, qty, PPG, and total. Driver comes from the name on the row or
          the NName block. Re-uploading the same invoice + category + qty does not double-count.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/fuel/template" className="btn btn-secondary">
          Download template
        </a>
        <a href="/api/fuel/export" className="btn btn-secondary">
          Download all fuel
        </a>
      </div>
      <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="field">
          <label htmlFor="fuel-csv">Upload CSV or PDF</label>
          <input id="fuel-csv" name="csv" type="file" accept=".csv,.pdf,text/csv,application/pdf" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Importing…" : "Upload"}
        </button>
      </form>
      {state?.ok ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Created {state.created ?? 0}, skipped {state.skipped ?? 0}, unmatched {state.unmatched ?? 0}
          {errors.length ? ` · ${errors.length} row ${errors.length === 1 ? "error" : "errors"}` : "."}
        </div>
      ) : null}
      {state && !state.ok && state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </div>
      ) : null}
      {errors.length > 0 ? (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {errors.map((item) => (
            <li key={`${item.row}-${item.error}`}>
              Row {item.row}: {item.error}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
