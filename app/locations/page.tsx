import Link from "next/link";
import { LocationCsvImport } from "@/components/location-csv-import";
import { PageHeader } from "@/components/page-header";
import { formatLocationAddress, formatSchedulingSummary } from "@/lib/locations";
import { listLocations } from "@/lib/queries";
import { labelForLocationRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function LocationsPage() {
  const locations = listLocations();

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Shippers and receivers. Pick one on a load, type a one-off address, or upload the Ascend location CSV."
        actions={
          <Link href="/locations/new" className="btn btn-primary">
            New location
          </Link>
        }
      />
      <LocationCsvImport />
      <div className="card overflow-hidden">
        {locations.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">
            No locations yet.{" "}
            <Link href="/locations/new" className="font-semibold underline">
              Add a shipper or receiver
            </Link>
            .
          </p>
        ) : (
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
              {locations.map((location) => (
                <tr key={location.id}>
                  <td>
                    <div className="font-semibold">{location.name}</div>
                    {location.phone ? <div className="text-xs text-slate-500">{location.phone}</div> : null}
                  </td>
                  <td className="text-slate-600">{formatLocationAddress(location) || "—"}</td>
                  <td>{labelForLocationRole(location.role)}</td>
                  <td className="max-w-md text-slate-600">{formatSchedulingSummary(location)}</td>
                  <td className="text-right">
                    <Link href={`/locations/${location.id}`} className="btn btn-ghost">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
