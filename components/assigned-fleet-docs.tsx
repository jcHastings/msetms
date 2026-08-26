import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { listFleetDocuments } from "@/lib/files";
import { labelForFleetDocKind, type FleetDocKind, type FleetDocument } from "@/lib/types";

const DRIVER_FIRST: FleetDocKind[] = ["cdl", "med_card"];
const UNIT_FIRST: FleetDocKind[] = ["registration", "dot_inspection"];

export function AssignedFleetDocs({
  driverId,
  truckId,
  trailerId,
}: {
  driverId: number | null;
  truckId: number | null;
  trailerId: number | null;
}) {
  if (!driverId && !truckId && !trailerId) return null;

  return (
    <section className="card mt-6 p-6">
      <h2 className="text-sm font-semibold">Assigned unit documents</h2>
      <p className="mt-1 text-sm text-slate-500">CDL, medical card, and registration.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-3">
        {driverId ? (
          <DocGroup
            title="Driver"
            href={`/fleet/drivers/${driverId}`}
            documents={listFleetDocuments("driver", driverId)}
            preferred={DRIVER_FIRST}
          />
        ) : null}
        {truckId ? (
          <DocGroup
            title="Truck"
            href={`/fleet/trucks/${truckId}`}
            documents={listFleetDocuments("truck", truckId)}
            preferred={UNIT_FIRST}
          />
        ) : null}
        {trailerId ? (
          <DocGroup
            title="Trailer"
            href={`/fleet/trailers/${trailerId}`}
            documents={listFleetDocuments("trailer", trailerId)}
            preferred={UNIT_FIRST}
          />
        ) : null}
      </div>
    </section>
  );
}

function DocGroup({
  title,
  href,
  documents,
  preferred,
}: {
  title: string;
  href: string;
  documents: FleetDocument[];
  preferred: FleetDocKind[];
}) {
  const ordered = [...documents].sort((a, b) => preferredIndex(a.kind, preferred) - preferredIndex(b.kind, preferred));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={href} className="text-xs text-slate-500 underline">
          Record
        </Link>
      </div>
      {ordered.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None uploaded.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {ordered.map((file) => (
            <li key={file.id} className="text-sm">
              <a href={`/api/fleet-docs/${file.id}`} className="font-medium hover:underline" target="_blank" rel="noreferrer">
                {labelForFleetDocKind(file.kind)} · {file.original_name}
              </a>
              <div className="text-xs text-slate-500">{formatDateTime(file.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function preferredIndex(kind: string, preferred: FleetDocKind[]): number {
  const index = preferred.indexOf(kind as FleetDocKind);
  return index === -1 ? preferred.length : index;
}
