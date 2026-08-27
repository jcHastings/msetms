"use client";

import { useActionState } from "react";
import { confirmLoadsImportAction, previewLoadsImportAction } from "@/lib/actions";
import type { LoadImportPreviewState } from "@/lib/load-import-shared";

export function LoadSheetImport() {
  const [preview, previewAction, previewPending] = useActionState(
    previewLoadsImportAction,
    null as LoadImportPreviewState | null,
  );
  const [imported, confirmAction, confirmPending] = useActionState(
    confirmLoadsImportAction,
    null as LoadImportPreviewState | null,
  );
  const rows = preview?.ok ? preview.rows ?? [] : [];

  return (
    <section className="card mb-6 space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Import loads</h2>
      </div>
      <form action={previewAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="field">
          <label htmlFor="load-sheet-file">Load spreadsheet</label>
          <input
            id="load-sheet-file"
            name="file"
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={previewPending}>
          {previewPending ? "Reading…" : "Preview"}
        </button>
      </form>
      <form action={previewAction} className="grid gap-3">
        <div className="field">
          <label htmlFor="load-sheet-text">Or paste rows</label>
          <textarea
            id="load-sheet-text"
            name="report_text"
            rows={4}
            placeholder={
              "Load #, Tie Sheet, WSF PO, LAREDO, SALT, Transfer, DAW, Avenel, Status, Ship Date, Del Date, Customer, Shipper, Shipper City, Shipper St., Consignee, Consignee City, Consignee St., Truck, Trailer, Equipment Type"
            }
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
          <p className="text-sm text-slate-700">
            <strong>{rows.length}</strong> load{rows.length === 1 ? "" : "s"} will import in this one
            step. First numbers:{" "}
            {(preview?.sampleNumbers ?? rows.slice(0, 8).map((row) => row.load_number)).join(", ")}
            {rows.length > 8 ? "…" : ""}
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Customer</th>
                  <th>Lane</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((row) => (
                  <tr key={row.selectKey}>
                    <td className="font-semibold">{row.load_number}</td>
                    <td>{row.customer_name || "—"}</td>
                    <td>
                      {row.origin || "—"} → {row.destination || "—"}
                    </td>
                    <td>{row.status}</td>
                    <td>{row.action === "update" ? "Update existing" : "Create"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 12 ? (
            <p className="text-xs text-slate-500">
              Table shows the first 12 of {rows.length}. Import still creates or updates every listed
              load.
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={confirmPending}>
            {confirmPending ? "Importing…" : "Import"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
