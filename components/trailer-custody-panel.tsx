import { TrailerDropForm } from "@/components/trailer-drop-form";
import { formatDateTime } from "@/lib/format";
import {
  labelForCustodyLeftWhere,
  labelForCustodySource,
  listTrailerCustody,
  type TrailerCustodyEvent,
} from "@/lib/trailer-custody";

function show(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || "—";
}

function leftLabel(event: TrailerCustodyEvent): string {
  const where = labelForCustodyLeftWhere(event.left_where);
  const name = event.left_name?.trim() ?? "";
  if (where && name) return `${where} · ${name}`;
  if (where) return where;
  if (name) return name;
  return "—";
}

export function TrailerCustodyPanel({ trailerId }: { trailerId: number }) {
  const events = listTrailerCustody(trailerId);
  const open = events.find((event) => !event.to_at);

  return (
    <section className="card mb-4 p-5" data-trailer-custody="">
      <h2 className="text-sm font-semibold">Custody</h2>
      <p className="mt-1 text-sm text-slate-500">Who had this trailer. TMS record. GPS stays on Orbcomm.</p>
      <p className="mt-3 text-sm" data-custody-now={open ? "open" : "none"}>
        {open
          ? `Open · ${show(open.driver_name)} · ${show(open.truck_unit)} · since ${formatDateTime(open.from_at)}`
          : "No open custody."}
      </p>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500" data-trailer-custody-empty="">
          No custody recorded.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="table-grid">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Driver</th>
                <th>Truck</th>
                <th>Left</th>
                <th>Load #</th>
                <th>Note</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} data-custody-row="" data-custody-state={event.to_at ? "closed" : "open"}>
                  <td className="whitespace-nowrap">{formatDateTime(event.from_at)}</td>
                  <td className="whitespace-nowrap">{event.to_at ? formatDateTime(event.to_at) : "Open"}</td>
                  <td>{show(event.driver_name)}</td>
                  <td>{show(event.truck_unit)}</td>
                  <td>{leftLabel(event)}</td>
                  <td>{show(event.load_number)}</td>
                  <td>{show(event.note)}</td>
                  <td>{show(labelForCustodySource(event.source))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3 className="mt-5 text-sm font-semibold">Dropped at</h3>
      <p className="mt-1 text-sm text-slate-500">Closes the open custody. Does not move the GPS pin.</p>
      <TrailerDropForm trailerId={trailerId} />
    </section>
  );
}
