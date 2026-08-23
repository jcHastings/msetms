"use client";

import { useActionState } from "react";
import { refreshIftaAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import type { ActionResult, IftaReport } from "@/lib/types";

export function IftaPanel({
  loadId,
  report,
  canRefresh,
  configured,
  reason,
}: {
  loadId: number;
  report: IftaReport | null;
  canRefresh: boolean;
  configured: boolean;
  reason: string;
}) {
  const [state, formAction, pending] = useActionState(
    refreshIftaAction as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );

  return (
    <section className="card mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">IFTA mileage</h2>
          <p className="mt-1 text-sm text-slate-600">
            Jurisdiction miles for this load
            {configured ? " from Samsara IFTA reports." : " — labeled demo from origin / destination."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {report?.source === "samsara" ? "Samsara" : "Demo"}
        </span>
      </div>

      {report ? (
        <>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-slate-500">Vehicle</dt>
              <dd className="font-semibold">{report.vehicle_id || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Generated</dt>
              <dd className="font-semibold">{formatDateTime(report.generated_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="font-semibold">{report.total_miles.toLocaleString()} mi</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            Window {formatDateTime(report.window_start)} – {formatDateTime(report.window_end)}
          </p>
          {report.note ? <p className="mt-2 text-sm text-slate-600">{report.note}</p> : null}
          <table className="table-grid mt-4">
            <thead>
              <tr>
                <th>Jurisdiction</th>
                <th>Name</th>
                <th>Miles</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-slate-500">
                    No jurisdiction miles for this window.
                  </td>
                </tr>
              ) : (
                report.rows.map((row) => (
                  <tr key={row.jurisdiction}>
                    <td className="font-semibold">{row.jurisdiction}</td>
                    <td>{row.name}</td>
                    <td>{row.miles.toLocaleString()}</td>
                  </tr>
                ))
              )}
              <tr>
                <td colSpan={2} className="font-semibold">
                  Total
                </td>
                <td className="font-semibold">{report.total_miles.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          {report.attachment_id ? (
            <p className="mt-3 text-sm">
              <a className="font-medium underline" href={`/api/attachments/${report.attachment_id}`}>
                Download IFTA report
              </a>
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          {reason || "No IFTA report on this load yet."}
        </p>
      )}

      {reason && report ? <p className="mt-3 text-sm text-slate-600">{reason}</p> : null}

      <form action={formAction} className="mt-4 space-y-3">
        {state?.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            IFTA report updated.
          </p>
        ) : null}
        {state && !state.ok ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {state.error}
          </p>
        ) : null}
        <input type="hidden" name="load_id" value={loadId} />
        <button className="btn btn-secondary" type="submit" disabled={pending || !canRefresh}>
          {pending ? "Refreshing…" : "Refresh IFTA from Samsara"}
        </button>
      </form>
    </section>
  );
}
