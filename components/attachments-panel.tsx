import { labelForAttachmentKind, type Attachment } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { ATTACHMENT_KINDS } from "@/lib/types";
import { attachFileFormAction } from "@/lib/actions";

export function AttachmentsPanel({
  loadId,
  attachments,
}: {
  loadId: number;
  attachments: Attachment[];
}) {
  return (
    <section className="card mt-6 p-6">
      <h2 className="text-sm font-semibold">Documents and photos</h2>
      <p className="mt-1 text-sm text-slate-500">
        Rate cons, BOLs, PODs, lumper receipts, and driver photos. Stored in{" "}
        <code>data/uploads</code>.
      </p>
      <form action={attachFileFormAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="load_id" value={loadId} />
        <div className="field min-w-40">
          <label htmlFor="kind">Type</label>
          <select id="kind" name="kind" defaultValue="rate_con">
            {ATTACHMENT_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field min-w-56 flex-1">
          <label htmlFor="file">File</label>
          <input id="file" name="file" type="file" required />
        </div>
        <button className="btn btn-secondary" type="submit">
          Upload
        </button>
      </form>
      {attachments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No files on this load yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <a href={`/api/attachments/${file.id}`} className="font-medium hover:underline">
                  {file.original_name}
                </a>
                <div className="text-xs text-slate-500">
                  {labelForAttachmentKind(file.kind)} · {file.uploaded_by} ·{" "}
                  {formatDateTime(file.created_at)}
                </div>
              </div>
              <a href={`/api/attachments/${file.id}`} className="btn btn-ghost">
                Open
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
