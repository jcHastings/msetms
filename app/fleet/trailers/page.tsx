import Link from "next/link";
import { DirectoryPager, DirectorySearch } from "@/components/directory-chrome";
import { deskMetadata } from "@/lib/desk-metadata";
import { filterTrailers, pageFleetRows } from "@/lib/fleet-directory";
import { ClickableRow } from "@/components/clickable-row";
import { ActiveStatusCell, ExpiryCell } from "@/components/expiry-cell";
import { TrailerLocationBadge } from "@/components/fleet-badges";
import { FleetRowActions } from "@/components/fleet-row-actions";
import { OrbcommTrailerImport } from "@/components/orbcomm-trailer-import";
import { PageHeader } from "@/components/page-header";
import { trailerComplianceAlerts } from "@/lib/compliance";
import { canDeleteFleet, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { latestReeferForTrailer } from "@/lib/integrations/orbcomm";
import { assignedFleetAssetIds, listTrailers, persistedTrailerLocation } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";
import { fleetDivisionOf, labelForTrailerType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = deskMetadata("Trailers");

function reeferStub(trailer: {
  orbcomm_asset_id: string;
  reefer_setpoint_f: number | null;
  unit_number: string;
}): string {
  const reading = latestReeferForTrailer(trailer);
  if (reading) {
    const temp = reading.temperature_f != null ? `${reading.temperature_f}°F` : "Reading";
    return `${temp} · ${reading.source}`;
  }
  if (trailer.orbcomm_asset_id) return "Mapped";
  return "—";
}

export default async function TrailersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const windows = complianceWindows();
  const directory = pageFleetRows(filterTrailers(listTrailers(), q), params.page);
  const trailers = directory.rows;
  const dispatcher = await getSignedInDispatcher();
  const canDelete = canDeleteFleet(dispatcher?.role ?? "");
  const assignedIds = assignedFleetAssetIds("trailer");

  return (
    <>
      <PageHeader
        title="Trailers"
        actions={
          <>
            <a href="/api/fleet/trailers/export" className="btn btn-secondary">
              Download CSV
            </a>
            <Link href="/fleet/trailers/new" className="btn btn-primary">
              Add trailer
            </Link>
          </>
        }
      />
      <OrbcommTrailerImport />
      <div className="card" data-fleet-trailers-directory="" data-directory-mounted={trailers.length} data-directory-total={directory.total}>
        <DirectorySearch action="/fleet/trailers" q={q} label="Search trailers" placeholder="Unit, type, truck, or Orbcomm" />
        <p className="px-4 pb-2 text-xs text-slate-500">
          Showing {trailers.length} of {directory.total} trailer{directory.total === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
          {directory.pageCount > 1 ? ` · page ${directory.page} of ${directory.pageCount}` : ""}.
        </p>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Trailer</th>
              <th>Division</th>
              <th>Type</th>
              <th>Truck</th>
              <th>Registration exp</th>
              <th>DOT inspection</th>
              <th>Reefer / Orbcomm</th>
              <th>Last GPS</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trailers.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-8 text-sm text-slate-500">
                  No trailers yet.
                </td>
              </tr>
            ) : (
              trailers.map((trailer) => {
                const alerts = trailerComplianceAlerts(trailer, windows);
                return (
                  <ClickableRow
                    key={trailer.id}
                    href={`/fleet/trailers/${trailer.id}`}
                    className={trailer.active === 0 ? "opacity-60" : undefined}
                  >
                    <td>
                      <span className="font-mono font-semibold hover:underline">{trailer.unit_number}</span>
                    </td>
                    <td>{fleetDivisionOf(trailer)}</td>
                    <td>{labelForTrailerType(trailer.type)}</td>
                    <td>{trailer.truck_unit ? `Unit ${trailer.truck_unit}` : "—"}</td>
                    <ExpiryCell
                      value={trailer.registration_expires}
                      alert={alerts.find((item) => item.kind === "registration")}
                    />
                    <ExpiryCell
                      value={trailer.dot_inspected_on || trailer.dot_expires}
                      alert={alerts.find((item) => item.kind === "dot_inspection")}
                    />
                    <td className="text-xs text-slate-600">
                      {reeferStub(trailer)}
                      {trailer.reefer_setpoint_f != null ? <div>Setpoint {trailer.reefer_setpoint_f}°F</div> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <TrailerLocationBadge location={persistedTrailerLocation(trailer)} />
                    </td>
                    <ActiveStatusCell active={trailer.active} />
                    <td>
                      <FleetRowActions
                        kind="trailer"
                        id={trailer.id}
                        href={`/fleet/trailers/${trailer.id}`}
                        active={trailer.active !== 0}
                        assigned={assignedIds.has(trailer.id)}
                        canDelete={canDelete}
                        label={`trailer ${trailer.unit_number}`}
                      />
                    </td>
                  </ClickableRow>
                );
              })
            )}
          </tbody>
        </table>
        <DirectoryPager path="/fleet/trailers" q={q} page={directory.page} pageCount={directory.pageCount} />
      </div>
    </>
  );
}
