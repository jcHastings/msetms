import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { deskMetadata } from "@/lib/desk-metadata";
import { formatDateTime } from "@/lib/format";
import { listDrivers } from "@/lib/queries";
import {
  labelForCustodyLeftWhere,
  queryDriverCustody,
  type TrailerCustodyEvent,
} from "@/lib/trailer-custody";

export const dynamic = "force-dynamic";
export const metadata = deskMetadata("Trailers held");

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

function guidance(reason: string): string {
  switch (reason) {
    case "need_driver":
      return "Pick a driver.";
    case "need_dates":
      return "Pick a from date and a to date.";
    case "bad_range":
      return "From is after to.";
    case "driver_missing":
      return "Driver not found.";
    default:
      return "Pick a driver and a date range.";
  }
}

export default async function DriverTrailerCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ driver_id?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const driverRaw = String(params.driver_id ?? "").trim();
  const driverId = /^\d+$/.test(driverRaw) ? Number.parseInt(driverRaw, 10) : null;
  const from = String(params.from ?? "").trim();
  const to = String(params.to ?? "").trim();
  const drivers = listDrivers();
  const result = queryDriverCustody({ driverId, from, to });

  return (
    <>
      <PageHeader
        title="Trailers held"
        subtitle="Trailers a driver had in a date range. TMS custody only."
        actions={
          <Link href="/fleet/trailers" className="btn btn-secondary">
            Back to trailers
          </Link>
        }
      />
      <form
        action="/fleet/trailers/custody"
        className="card mb-4 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4"
        data-driver-custody=""
      >
        <div className="field sm:col-span-2">
          <label htmlFor="custody-driver">Driver</label>
          <select id="custody-driver" name="driver_id" defaultValue={driverId ? String(driverId) : ""}>
            <option value="">Select</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="custody-from">From</label>
          <input id="custody-from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="field">
          <label htmlFor="custody-to">To</label>
          <input id="custody-to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <button className="btn btn-primary" type="submit">
            Show trailers
          </button>
        </div>
      </form>
      {!result.ok ? (
        <p className="text-sm text-slate-500" data-driver-custody-message={result.reason}>
          {guidance(result.reason)}
        </p>
      ) : result.rows.length === 0 ? (
        <p className="text-sm text-slate-500" data-driver-custody-message="none">
          No trailers recorded in that range.
        </p>
      ) : (
        <div className="card overflow-x-auto" data-driver-custody-rows={result.rows.length}>
          <table className="table-grid">
            <thead>
              <tr>
                <th>Trailer</th>
                <th>From</th>
                <th>To</th>
                <th>Truck</th>
                <th>Left</th>
                <th>Load #</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((event) => (
                <tr key={event.id} data-driver-custody-row="">
                  <td>
                    <Link href={`/fleet/trailers/${event.trailer_id}`} className="font-mono font-semibold hover:underline">
                      {show(event.trailer_unit)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{formatDateTime(event.from_at)}</td>
                  <td className="whitespace-nowrap">{event.to_at ? formatDateTime(event.to_at) : "Open"}</td>
                  <td>{show(event.truck_unit)}</td>
                  <td>{leftLabel(event)}</td>
                  <td>{show(event.load_number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
