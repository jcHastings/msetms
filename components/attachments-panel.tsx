import { formatDateTime } from "@/lib/format";
import {
  ATTACHMENT_KINDS,
  LOAD_DOCUMENT_KINDS,
  labelForAttachmentKind,
  labelForUploader,
  type Attachment,
} from "@/lib/types";
import {
  attachFileFormAction,
  deleteAttachmentFormAction,
  replaceAttachmentFormAction,
} from "@/lib/actions";

const PRIMARY = new Set<string>(LOAD_DOCUMENT_KINDS);

export function AttachmentsPanel({
  loadId,
  attachments,
}: {
  loadId: number;
  attachments: Attachment[];
}) {
  const extraKinds = ATTACHMENT_KINDS.filter((kind) => !PRIMARY.has(kind.value));

  return (
    <section id="load-documents" className="card mt-6 p-6">
      <h2 className="text-sm font-semibold">Load documents</h2>
      <p className="mt-1 text-sm text-slate-500">
        Rate confirmation, customer invoice, carrier bill, BOL/POD, and other PDFs or images.
        Multiple files per type are kept. A file from <strong>From rate con</strong> shows as Rate
        confirmation. Stored in <code>data/uploads</code>.
      </p>
      <form action={attachFileFormAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="load_id" value={loadId} />
        <div className="field min-w-44">
          <label htmlFor="kind">Type</label>
          <select id="kind" name="kind" defaultValue="rate_con">
            {ATTACHMENT_KINDS.filter((kind) => PRIMARY.has(kind.value)).map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
            {extraKinds.length ? (
              <optgroup label="More">
                {extraKinds.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
        <div className="field min-w-56 flex-1">
          <label htmlFor="file">PDF or image</label>
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
            <li key={file.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <a href={`/api/attachments/${file.id}`} className="font-medium hover:underline">
                  {file.original_name}
                </a>
                <div className="text-xs text-slate-500">
                  {labelForAttachmentKind(file.kind)} · {labelForUploader(file.uploaded_by)} ·{" "}
                  {formatDateTime(file.created_at)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/api/attachments/${file.id}?download=1`} className="btn btn-ghost">
                  Download
                </a>
                <form action={replaceAttachmentFormAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="attachment_id" value={file.id} />
                  <input name="file" type="file" required className="max-w-44 text-xs" />
                  <button className="btn btn-ghost" type="submit">
                    Replace
                  </button>
                </form>
                <form action={deleteAttachmentFormAction}>
                  <input type="hidden" name="attachment_id" value={file.id} />
                  <button className="btn btn-ghost" type="submit">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
