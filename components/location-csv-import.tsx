"use client";

import { useActionState } from "react";
import { importLocationsCsvAction } from "@/lib/actions";
import type { LocationCsvImportResult } from "@/lib/location-csv";

export function LocationCsvImport() {
  const [state, formAction, pending] = useActionState(
    importLocationsCsvAction,
    null as LocationCsvImportResult | null,
  );
  const errors = state?.errors ?? [];

  return (
    <section className="card mb-6 space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Mass upload</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/locations/template" className="btn btn-secondary">
          Download template
        </a>
        <a href="/api/locations/export" className="btn btn-secondary">
          Download all locations
        </a>
      </div>
      <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="field">
          <label htmlFor="location-csv">Location spreadsheet</label>
          <input id="location-csv" name="csv" type="file" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Importing…" : "Upload CSV"}
        </button>
      </form>
      {state?.ok ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Created {state.created ?? 0}, updated {state.updated ?? 0}, skipped {state.skipped ?? 0}
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
