"use client";

import { useActionState } from "react";
import { confirmDriversImportAction, previewDriversImportAction } from "@/lib/actions";
import type { DriverImportPreviewState } from "@/lib/driver-import-shared";
import { labelForDriverKind } from "@/lib/types";

export function DriverImport() {
  const [preview, previewAction, previewPending] = useActionState(
    previewDriversImportAction,
    null as DriverImportPreviewState | null,
  );
  const [imported, confirmAction, confirmPending] = useActionState(
    confirmDriversImportAction,
    null as DriverImportPreviewState | null,
  );
  const rows = preview?.ok ? preview.rows ?? [] : [];

  return (
    <section className="card mb-6 space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Import drivers</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload an Ascend driver Excel/CSV (.xlsx or .csv), preview, then import. Matches existing
          drivers by exact name. Imports Driver 1 fields only — not pay, team-2, passport, FAST, or
          hazmat columns.
        </p>
      </div>
      <form action={previewAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="field">
          <label htmlFor="driver-roster-file">Ascend driver Excel or CSV</label>
          <input
            id="driver-roster-file"
            name="file"
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={previewPending}>
          {previewPending ? "Reading…" : "Preview file"}
        </button>
      </form>
      <form action={previewAction} className="grid gap-3">
        <div className="field">
          <label htmlFor="driver-roster-text">Or paste rows</label>
          <textarea
            id="driver-roster-text"
            name="report_text"
            rows={4}
            placeholder={"Status,Team,Name,Telephone,City,Province,Country\nActive,single,Christopher Howell,555-0100,Hastings,NE,USA"}
          />
        </div>
        <div>
          <button className="btn btn-secondary" type="submit" disabled={previewPending}>
            {previewPending ? "Reading…" : "Preview pasted rows"}
          </button>
        </div>
      </form>
      {preview && !preview.ok && preview.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {preview.error}
        </div>
      ) : null}
      {imported?.ok && imported.message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {imported.message}
        </div>
      ) : null}
      {imported && !imported.ok && imported.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {imported.error}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <form action={confirmAction} className="space-y-3">
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-grid">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Telephone</th>
                  <th>Type</th>
                  <th>City</th>
                  <th>State</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.selectKey}>
                    <td>
                      <input
                        type="checkbox"
                        name="selected"
                        value={row.selectKey}
                        defaultChecked
                        aria-label={`Import ${row.name}`}
                      />
                    </td>
                    <td className="font-semibold">{row.name}</td>
                    <td>{row.phone || "—"}</td>
                    <td>{labelForDriverKind(row.driver_type)}</td>
                    <td>{row.city || "—"}</td>
                    <td>{row.state || "—"}</td>
                    <td>{row.action === "update" ? "Update existing" : "Create"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" type="submit" disabled={confirmPending}>
            {confirmPending ? "Importing…" : "Import selected drivers"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
