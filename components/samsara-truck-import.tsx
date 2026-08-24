"use client";

import { useActionState } from "react";
import {
  confirmSamsaraTrucksImportAction,
  previewSamsaraTrucksAction,
} from "@/lib/actions";
import type { FleetImportPreviewState, SamsaraTruckPreviewRow } from "@/lib/fleet-import-shared";

export function SamsaraTruckImport() {
  const [preview, previewAction, previewPending] = useActionState(
    previewSamsaraTrucksAction,
    null as FleetImportPreviewState<SamsaraTruckPreviewRow> | null,
  );
  const [imported, confirmAction, confirmPending] = useActionState(
    confirmSamsaraTrucksImportAction,
    null as FleetImportPreviewState<SamsaraTruckPreviewRow> | null,
  );
  const rows = preview?.ok ? preview.rows ?? [] : [];

  return (
    <section className="card mb-6 space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Import from Samsara</h2>
        <p className="mt-1 text-sm text-slate-600">
          Fetches fleet vehicles with <code>SAMSARA_API_TOKEN</code> from <code>.env</code>. Preview each
          pairing (TMS unit ← Samsara name / VIN / plate / city) before anything is written. Match is VIN,
          then stored Samsara vehicle id, then unit number (digits only), then license plate. No match
          creates a new truck. Confirm is required. Re-import re-pairs the same way and does not duplicate
          trucks.
        </p>
      </div>
      <form action={previewAction} className="flex flex-wrap gap-2">
        <button className="btn btn-secondary" type="submit" disabled={previewPending}>
          {previewPending ? "Loading vehicles…" : "Fetch Samsara vehicles"}
        </button>
        <button className="btn btn-secondary" type="submit" disabled={previewPending}>
          {previewPending ? "Re-pairing…" : "Re-import from Samsara"}
        </button>
      </form>
      {preview && !preview.ok && preview.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {preview.error}
        </div>
      ) : null}
      {preview?.ok && preview.warning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {preview.warning}
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
          <p className="text-sm text-slate-600">
            Review pairings, then confirm to write. Uncheck any vehicle you do not want.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-grid">
              <thead>
                <tr>
                  <th></th>
                  <th>TMS unit ← Samsara</th>
                  <th>VIN</th>
                  <th>Plate</th>
                  <th>City</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pairing =
                    row.action === "update"
                      ? `${row.tmsUnit || "TMS"} ← ${row.name || row.unitNumber}`
                      : `new ← ${row.name || row.unitNumber}`;
                  return (
                    <tr key={row.selectKey}>
                      <td>
                        <input
                          type="checkbox"
                          name="selected"
                          value={row.selectKey}
                          defaultChecked
                          aria-label={`Import ${row.name || row.unitNumber}`}
                        />
                      </td>
                      <td className="font-mono">{pairing}</td>
                      <td className="font-mono">{row.vin || "—"}</td>
                      <td className="font-mono">{row.plate || "—"}</td>
                      <td>{row.city || "—"}</td>
                      <td>{row.action === "update" ? "update" : "new"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" type="submit" disabled={confirmPending}>
            {confirmPending ? "Importing…" : "Confirm import"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
