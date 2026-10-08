import {
  keepRateConOfficeOnlyAction,
  releaseRateConRedactionAction,
  rerunRateConRedactionAction,
} from "@/lib/rate-con-redact-actions";
import {
  labelForRedactionStatus,
  listRateConRedactions,
  type RateConRedaction,
} from "@/lib/rate-con-redact-store";
import type { Attachment } from "@/lib/types";

function statusClass(status: string): string {
  if (status === "needs_review") return "bg-amber-100 text-amber-950 ring-amber-300";
  if (status === "ready" || status === "released") return "bg-emerald-100 text-emerald-950 ring-emerald-300";
  if (status === "office_only") return "bg-slate-100 text-slate-800 ring-slate-300";
  return "bg-sky-100 text-sky-950 ring-sky-300";
}

export function RateConRedactionPanel({
  loadId,
  attachments,
  canRelease,
}: {
  loadId: number;
  attachments: Attachment[];
  canRelease: boolean;
}) {
  const rateCons = attachments.filter((file) => file.kind === "rate_con");
  if (!rateCons.length) return null;
  const copies = listRateConRedactions(loadId);
  const bySource = new Map<number, RateConRedaction>();
  for (const copy of copies) bySource.set(copy.source_attachment_id, copy);

  return (
    <section id="rate-con-driver-copy" className="card p-3" aria-labelledby="rate-con-driver-copy-title">
      <h2 id="rate-con-driver-copy-title" className="text-sm font-semibold">
        Driver rate confirmation
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        The driver sees a copy with dollar amounts removed. The original stays in the office.
      </p>
      <ul className="mt-3 space-y-3">
        {rateCons.map((file) => {
          const copy = bySource.get(file.id) ?? null;
          const status = copy?.status ?? "processing";
          return (
            <li key={file.id} className="rounded-lg border border-slate-200 p-3" data-rate-con-copy={copy?.id ?? ""}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex min-h-8 items-center rounded-full px-2 text-xs font-semibold ring-1 ${statusClass(status)}`} data-rate-con-status={status}>
                  {copy ? labelForRedactionStatus(copy.status) : "Processing"}
                </span>
                <span className="text-sm font-medium">{file.original_name}</span>
              </div>
              {copy?.reason ? <p className="mt-2 text-sm text-slate-700">{copy.reason}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {copy?.stored_name ? (
                  <a className="btn btn-secondary min-h-11" href={`/api/rate-con-redactions/${copy.id}`}>
                    View redacted copy
                  </a>
                ) : null}
                {canRelease && copy ? (
                  <>
                    <form action={releaseRateConRedactionAction}>
                      <input type="hidden" name="id" value={copy.id} />
                      <button className="btn btn-primary min-h-11" type="submit" disabled={!copy.stored_name}>
                        Release to driver
                      </button>
                    </form>
                    <form action={rerunRateConRedactionAction}>
                      <input type="hidden" name="id" value={copy.id} />
                      <button className="btn btn-secondary min-h-11" type="submit">
                        Re-run
                      </button>
                    </form>
                    <form action={keepRateConOfficeOnlyAction}>
                      <input type="hidden" name="id" value={copy.id} />
                      <button className="btn btn-secondary min-h-11" type="submit" disabled={!copy.stored_name}>
                        Keep office-only
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
