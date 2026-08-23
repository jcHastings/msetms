import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatLocationAddress } from "@/lib/locations";
import { listLocations } from "@/lib/queries";
import {
  LOCATION_ROLES,
  labelForLocationRole,
  labelForLocationScheduling,
  type LocationRole,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const role = (params.role ?? "all") as LocationRole | "all";
  const locations = listLocations({ q, role: role === "all" ? "all" : role });

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Shippers and receivers: address, phone, and how they schedule trucks."
        actions={
          <Link href="/locations/new" className="btn btn-primary">
            New location
          </Link>
        }
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3" method="get">
        <div className="field min-w-44 flex-1">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name, city, state, phone" />
        </div>
        <div className="field w-48">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue={role}>
            <option value="all">All</option>
            {LOCATION_ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
        <Link href="/locations" className="btn btn-ghost">
          Clear
        </Link>
      </form>
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Role</th>
              <th>Scheduling</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-slate-500">
                  No locations match. Add one, or clear the search.
                </td>
              </tr>
            ) : (
              locations.map((location) => (
                <tr key={location.id}>
                  <td>
                    <div className="font-semibold">{location.name}</div>
                    <div className="text-xs text-slate-500">{location.phone || "—"}</div>
                  </td>
                  <td className="text-slate-600">{formatLocationAddress(location) || "—"}</td>
                  <td>{labelForLocationRole(location.role)}</td>
                  <td>
                    <div>{labelForLocationScheduling(location.scheduling_type)}</div>
                    <div className="text-xs text-slate-500">{location.hours || location.scheduling_notes || "—"}</div>
                  </td>
                  <td className="text-right">
                    <Link href={`/locations/${location.id}`} className="btn btn-ghost">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
