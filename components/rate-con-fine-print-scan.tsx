"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { RateConFinePrint } from "@/components/rate-con-fine-print";
import { scanAttachedRateConAction, type FinePrintScanState } from "@/lib/actions";
import type { Attachment } from "@/lib/types";

export function RateConFinePrintScan({
  loadId,
  attachments,
}: {
  loadId: number;
  attachments: Attachment[];
}) {
  const rcs = attachments.filter((file) => file.kind === "rate_con");
  const [picked, setPicked] = useState(String(rcs[0]?.id ?? ""));
  const [state, formAction, pending] = useActionState(scanAttachedRateConAction, null as FinePrintScanState | null);
  if (!rcs.length) return null;
  const hits = state && "hits" in state && state.ok ? state.hits : null;
  const serverError = state && !("hits" in state && state.ok) ? state : null;

  return (
    <section className="card space-y-3 p-4" data-rate-con-fine-print-scan="">
      <div>
        <h2 className="text-sm font-semibold">RC fine print</h2>
        <p className="mt-1 text-sm text-slate-500">
          Scan the attached rate con for detention, TONU, layover, tracking penalties, lumper, late fees. Review
          only — does not reject the load.
        </p>
      </div>
      {serverError ? <FormBanner result={serverError} /> : null}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="load_id" value={loadId} />
        {rcs.length > 1 ? (
          <div className="field min-w-56">
            <label htmlFor="fine_print_attachment">Rate con</label>
            <select
              id="fine_print_attachment"
              name="attachment_id"
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
            >
              {rcs.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.original_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="attachment_id" value={rcs[0].id} />
        )}
        <button className="btn btn-secondary" type="submit" disabled={pending} data-fine-print-scan="">
          {pending ? "Scanning…" : "Scan RC fine print"}
        </button>
      </form>
      {hits ? <RateConFinePrint hits={hits} /> : null}
    </section>
  );
}
