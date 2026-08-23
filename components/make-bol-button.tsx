"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import { makeBolAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { labelForUploader, type Attachment } from "@/lib/types";

export function MakeBolPanel({
  loadId,
  attachments,
}: {
  loadId: number;
  attachments: Attachment[];
}) {
  const [state, formAction, pending] = useActionState(makeBolAction.bind(null, loadId), null);
  const bols = attachments.filter((file) => file.kind === "bol");

  return (
    <section className="card mb-4 p-5">
      <h2 className="text-sm font-semibold">Bill of lading</h2>
      <p className="mt-1 text-sm text-slate-500">
        Optional. Builds a BOL from this load (shipper, consignee, commodity, equipment, reefer) and
        saves it here as type BOL. Nothing is created until you click the button.
      </p>
      <FormBanner result={state} />
      <form action={formAction} className="mt-3">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Making BOL…" : "Make BOL"}
        </button>
      </form>
      {bols.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No BOL on this load yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {bols.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <a href={`/api/attachments/${file.id}`} className="font-medium hover:underline">
                  {file.original_name}
                </a>
                <div className="text-xs text-slate-500">
                  BOL · {labelForUploader(file.uploaded_by)} · {formatDateTime(file.created_at)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn btn-secondary" href={`/api/attachments/${file.id}`}>
                  Print / view
                </a>
                <a className="btn btn-ghost" href={`/api/attachments/${file.id}?download=1`}>
                  Download
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
