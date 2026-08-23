import { attachFleetDocFormAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { FLEET_DOC_KINDS, labelForFleetDocKind, type FleetDocument } from "@/lib/types";

export function FleetDocsPanel({
  ownerType,
  ownerId,
  documents,
}: {
  ownerType: "driver" | "truck" | "trailer";
  ownerId: number;
  documents: FleetDocument[];
}) {
  return (
    <section className="card mt-6 p-6">
      <h2 className="text-sm font-semibold">Documents</h2>
      <p className="mt-1 text-sm text-slate-500">Stored in data/uploads/fleet. One-click view/download.</p>
      <form action={attachFleetDocFormAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="owner_type" value={ownerType} />
        <input type="hidden" name="owner_id" value={ownerId} />
        <div className="field min-w-40">
          <label htmlFor={`kind-${ownerType}-${ownerId}`}>Type</label>
          <select id={`kind-${ownerType}-${ownerId}`} name="kind" defaultValue={ownerType === "driver" ? "cdl" : "registration"}>
            {FLEET_DOC_KINDS.filter((kind) =>
              ownerType === "driver"
                ? ["cdl", "med_card", "insurance", "other"].includes(kind.value)
                : ["registration", "dot_inspection", "insurance", "other"].includes(kind.value),
            ).map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field min-w-56 flex-1">
          <label htmlFor={`file-${ownerType}-${ownerId}`}>File</label>
          <input
            id={`file-${ownerType}-${ownerId}`}
            name="file"
            type="file"
            accept="image/*,.pdf,application/pdf"
            required
          />
        </div>
        <button className="btn btn-secondary" type="submit">
          Upload
        </button>
      </form>
      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">None yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {documents.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <a href={`/api/fleet-docs/${file.id}`} className="font-medium hover:underline">
                  {file.original_name}
                </a>
                <div className="text-xs text-slate-500">
                  {labelForFleetDocKind(file.kind)} · {formatDateTime(file.created_at)}
                </div>
              </div>
              <a href={`/api/fleet-docs/${file.id}`} className="btn btn-ghost">
                Open
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
