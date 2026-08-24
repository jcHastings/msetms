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
          GET fleet vehicles with the <code>SAMSARA_API_TOKEN</code> already in <code>.env</code>. Preview
          name/unit, Samsara vehicle id, and VIN. Confirm to create or update trucks matched by Samsara
          vehicle id, name, or unit # including <strong>36</strong> (you do not need the UUID). Import fills
          the real Samsara vehicle id automatically. Existing trucks are not duplicated.
        </p>
      </div>
      <form action={previewAction}>
        <button className="btn btn-secondary" type="submit" disabled={previewPending}>
          {previewPending ? "Loading vehicles…" : "Fetch Samsara vehicles"}
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-grid">
              <thead>
                <tr>
                  <th></th>
                  <th>Name / unit</th>
                  <th>Samsara vehicle id</th>
                  <th>VIN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
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
                      <td className="font-mono">{row.name || row.unitNumber || "—"}</td>
                      <td className="font-mono">{row.samsaraVehicleId || "—"}</td>
                      <td className="font-mono">{row.vin || "—"}</td>
                      <td>{row.action === "update" ? "Update existing" : "Create"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" type="submit" disabled={confirmPending}>
            {confirmPending ? "Importing…" : "Import selected trucks"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
