"use client";

import { useState } from "react";
import { driverClassifyAction } from "@/lib/driver-actions";
import { DRIVER_UPLOAD_KINDS, isUnclassifiedUpload, labelForDriverUploadKind } from "@/lib/driver-docs";
import { labelForAttachmentKind } from "@/lib/types";

export function DriverDocClassify({
  files,
}: {
  files: Array<{ id: number; kind: string; original_name: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const needsType = files.filter((file) => isUnclassifiedUpload(file.kind));
  return (
    <section className="mt-5 rounded-2xl bg-slate-900 p-4 shadow-sm ring-1 ring-white/10">
      <h2 className="text-base font-semibold text-white">Files on this load</h2>
      {files.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">None yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {files.map((file) => (
            <li key={file.id} className="rounded-xl bg-slate-800 px-3 py-2">
              <a href={`/api/attachments/${file.id}`} className="text-base font-medium text-amber-300 underline">
                {file.original_name}
              </a>
              <div className="mt-1 text-sm text-slate-300">
                {isUnclassifiedUpload(file.kind)
                  ? "Needs type"
                  : labelForDriverUploadKind(file.kind) || labelForAttachmentKind(file.kind)}
              </div>
              {isUnclassifiedUpload(file.kind) ? (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  action={async (formData) => {
                    setError(null);
                    const result = await driverClassifyAction(formData);
                    if (!result.ok) setError(result.error);
                  }}
                >
                  <input type="hidden" name="attachment_id" value={file.id} />
                  <label className="sr-only" htmlFor={`classify-${file.id}`}>
                    Type
                  </label>
                  <select
                    id={`classify-${file.id}`}
                    name="kind"
                    required
                    className="min-h-11 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-2 text-sm text-white"
                    defaultValue="pod"
                  >
                    {DRIVER_UPLOAD_KINDS.map((kind) => (
                      <option key={kind.value} value={kind.value}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary min-h-11" type="submit">
                    Save type
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {needsType.length > 0 ? (
        <p className="mt-3 text-sm text-amber-200">{needsType.length} file{needsType.length === 1 ? "" : "s"} still need a type.</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
