"use client";

import { useActionState } from "react";
import {
  confirmOrbcommTrailersImportAction,
  previewOrbcommTrailersAction,
} from "@/lib/actions";
import type { FleetImportPreviewState, OrbcommTrailerPreviewRow } from "@/lib/fleet-import-shared";

export function OrbcommTrailerImport() {
  const [preview, previewAction, previewPending] = useActionState(
    previewOrbcommTrailersAction,
    null as FleetImportPreviewState<OrbcommTrailerPreviewRow> | null,
  );
  const [imported, confirmAction, confirmPending] = useActionState(
    confirmOrbcommTrailersImportAction,
    null as FleetImportPreviewState<OrbcommTrailerPreviewRow> | null,
  );
  const rows = preview?.ok ? preview.rows ?? [] : [];

  return (
    <section className="card mb-6 space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Import from Orbcomm</h2>
        <p className="mt-1 text-sm text-slate-600">Upload a spreadsheet or fetch from Orbcomm.</p>
      </div>
      <form action={previewAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="field">
          <label htmlFor="orbcomm-fleet-file">Orbcomm CSV or JSON export</label>
          <input
            id="orbcomm-fleet-file"
            name="file"
            type="file"
            accept=".csv,.json,text/csv,application/json"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="submit" name="mode" value="file" disabled={previewPending}>
            {previewPending ? "Reading…" : "Preview file"}
          </button>
          <button className="btn btn-secondary" type="submit" name="mode" value="api" disabled={previewPending}>
            {previewPending ? "Loading…" : "Fetch from Orbcomm"}
          </button>
        </div>
      </form>
      <form action={previewAction} className="grid gap-3">
        <div className="field">
          <label htmlFor="orbcomm-fleet-text">Or paste rows</label>
          <textarea
            id="orbcomm-fleet-text"
            name="report_text"
            rows={4}
            placeholder={
              "Asset ID,Device Serial Number,Asset Type,City\nMS2201,GSSC0001,Reefer,Oklahoma City"
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-grid">
              <thead>
                <tr>
                  <th></th>
                  <th>Trailer #</th>
                  <th>Device serial</th>
                  <th>Type</th>
                  <th>VIN</th>
                  <th>Last city / lat-lng</th>
                  <th>Note</th>
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
                          aria-label={`Import ${row.unitNumber || row.name}`}
                        />
                      </td>
                      <td className="font-mono">{row.unitNumber || row.name || "—"}</td>
                      <td className="font-mono">{row.orbcommAssetId || "—"}</td>
                      <td>{row.type || "—"}</td>
                      <td className="font-mono">{row.vin || "—"}</td>
                      <td className="text-sm text-slate-700">{orbcommPreviewGps(row)}</td>
                      <td className="text-sm text-slate-600">{row.note || row.recordedAt || "—"}</td>
                      <td>{row.action === "update" ? "Update existing" : "Create"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" type="submit" disabled={confirmPending}>
            {confirmPending ? "Importing…" : "Import selected trailers"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function orbcommPreviewGps(row: OrbcommTrailerPreviewRow): string {
  const city = row.city.trim();
  if (city) return city;
  if (row.latitude != null && row.longitude != null) {
    return `${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}`;
  }
  return "—";
}
