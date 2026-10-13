import Link from "next/link";
import { redirect } from "next/navigation";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Locations");
import { LocationCsvImport } from "@/components/location-csv-import";
import { PageHeader } from "@/components/page-header";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { formatLocationAddress, formatSchedulingSummary, isArchivedLocation } from "@/lib/locations";
import { DirectoryPager, DirectorySearch } from "@/components/directory-chrome";
import { LocationArchiveToggle } from "@/components/location-archive-toggle";
import { searchLocationsDirectory } from "@/lib/queries";
import { LocationVerifyBadge } from "@/components/location-verify-badge";
import { canEditLocations, canExportCsv, canImportLocations } from "@/lib/settings-shared";
import { labelForLocationRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; archived?: string }>;
}) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const page = Number.parseInt(String(params.page ?? "1"), 10);
  const includeArchived = params.archived === "1" || params.archived === "true";
  const archiveExtra = includeArchived ? { archived: "1" } : undefined;
  const role = dispatcher.role;
  const directory = searchLocationsDirectory({ q, page, includeArchived });
  const locations = directory.locations;
  const canImport = canImportLocations(role);
  const canExport = canExportCsv(role);
  const canVerify = canEditLocations(role);

  return (
    <>
      <PageHeader
        title="Locations"
        actions={
          <>
            {canExport ? (
              <a href="/api/locations/export" className="btn btn-secondary">
                Download all locations
              </a>
            ) : null}
            {canVerify ? (
              <Link href="/locations/verify" className="btn btn-secondary">
                Verify locations
              </Link>
            ) : null}
            {canVerify ? (
              <Link href="/locations/new" className="btn btn-primary">
                New location
              </Link>
            ) : null}
          </>
        }
      />
      {canImport ? <LocationCsvImport /> : null}
      <div className="card overflow-hidden">
        <DirectorySearch
          action="/locations"
          q={q}
          label="Find a location"
          placeholder="Name, city, street, or state"
          extra={archiveExtra}
        >
          <LocationArchiveToggle q={q} includeArchived={includeArchived} />
        </DirectorySearch>
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
                    <div className="font-semibold">
                      {location.name}
                      <LocationVerifyBadge verifiedAt={location.verified_at} />
                      {isArchivedLocation(location) ? (
                        <span className="status-pill ml-2" data-archived-badge="">
                          Archived
                        </span>
                      ) : null}
                    </div>
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
        <DirectoryPager
          path="/locations"
          q={q}
          page={directory.page}
          pageCount={directory.pageCount}
          extra={archiveExtra}
        />
      </div>
    </>
  );
}
