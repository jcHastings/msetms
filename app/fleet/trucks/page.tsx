import Link from "next/link";
import { DirectoryPager, DirectorySearch } from "@/components/directory-chrome";
import { deskMetadata } from "@/lib/desk-metadata";
import { filterTrucks, pageFleetRows } from "@/lib/fleet-directory";
import { ClickableRow } from "@/components/clickable-row";
import { ActiveStatusCell, ExpiryCell } from "@/components/expiry-cell";
import { FleetRowActions } from "@/components/fleet-row-actions";
import { HosBadge, LocationBadge } from "@/components/fleet-badges";
import { PageHeader } from "@/components/page-header";
import { SamsaraTruckImport } from "@/components/samsara-truck-import";
import { truckComplianceAlerts } from "@/lib/compliance";
import { canDeleteFleet, getSignedInDispatcher } from "@/lib/dispatcher-session";
import {
  getSamsaraFleet,
  driverForTruck,
  hosForAssignedTruck,
  locationForTruck,
  samsaraGpsEmptyState,
  samsaraHosEmptyState,
} from "@/lib/integrations/samsara";
import { SAMSARA_TOKEN_MISSING_MESSAGE } from "@/lib/fleet-import-shared";
import { assignedFleetAssetIds, listTrucks } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";
import { fleetDivisionOf } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = deskMetadata("Trucks");

function vehicleLabel(truck: { year: string; make: string; model: string }): string {
  return [truck.year, truck.make, truck.model].filter(Boolean).join(" ") || "—";
}

export default async function TrucksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const windows = complianceWindows();
  const directory = pageFleetRows(filterTrucks(listTrucks(), q), params.page);
  const trucks = directory.rows;
  const fleet = await getSamsaraFleet();
  const dispatcher = await getSignedInDispatcher();
  const canDelete = canDeleteFleet(dispatcher?.role ?? "");
  const assignedIds = assignedFleetAssetIds("truck");

  return (
    <>
      <PageHeader
        title="Trucks"
        actions={
          <>
            <Link href="/fuel" className="btn btn-secondary">
              Fuel
            </Link>
            <a href="/api/fleet/trucks/export" className="btn btn-secondary">
              Download CSV
            </a>
            <Link href="/fleet/trucks/new" className="btn btn-primary">
              Add truck
            </Link>
          </>
        }
      />
      <SamsaraTruckImport />
      {!fleet.tokenSet ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {SAMSARA_TOKEN_MISSING_MESSAGE}
        </p>
      ) : fleet.error ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {fleet.error}
        </p>
      ) : null}
      <div className="card" data-fleet-trucks-directory="" data-directory-mounted={trucks.length} data-directory-total={directory.total}>
        <DirectorySearch action="/fleet/trucks" q={q} label="Search trucks" placeholder="Unit, plate, make, or model" />
        <p className="px-4 pb-2 text-xs text-slate-500">
          Showing {trucks.length} of {directory.total} truck{directory.total === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
          {directory.pageCount > 1 ? ` · page ${directory.page} of ${directory.pageCount}` : ""}.
        </p>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Division</th>
              <th>Year / make / model</th>
              <th>Plate</th>
              <th>Driver</th>
              <th>GPS</th>
              <th>HOS</th>
              <th>Registration exp</th>
              <th>DOT inspection</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trucks.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-8 text-sm text-slate-500">
                  No trucks yet.
                </td>
              </tr>
            ) : (
              trucks.map((truck) => {
                const alerts = truckComplianceAlerts(truck, windows);
                const location = locationForTruck(fleet, truck.id);
                const samsaraDriver = driverForTruck(fleet, truck.id);
                const hos = hosForAssignedTruck(fleet, truck);
                return (
                  <ClickableRow
                    key={truck.id}
                    href={`/fleet/trucks/${truck.id}`}
                    className={truck.active === 0 ? "opacity-60" : undefined}
                  >
                    <td>
                      <span className="font-mono font-semibold hover:underline">{truck.unit_number}</span>
                    </td>
                    <td>{fleetDivisionOf(truck)}</td>
                    <td>{vehicleLabel(truck)}</td>
                    <td>{[truck.plate, truck.plate_state].filter(Boolean).join(" ") || "—"}</td>
                    <td>
                      {samsaraDriver?.tmsDriverId ? (
                        <Link href={`/fleet/drivers/${samsaraDriver.tmsDriverId}`} className="font-semibold underline">
                          {samsaraDriver.samsaraDriverName}
                        </Link>
                      ) : (
                        samsaraDriver?.samsaraDriverName || "—"
                      )}
                    </td>
                    <td>
                      <LocationBadge
                        location={location}
                        empty={samsaraGpsEmptyState({
                          truckAssigned: true,
                          samsaraVehicleId: truck.samsara_vehicle_id,
                          location,
                        })}
                      />
                    </td>
                    <td>
                      <HosBadge
                        hos={hos}
                        empty={samsaraHosEmptyState({
                          assigned: Boolean(samsaraDriver || truck.assigned_driver_id),
                          hos,
                        })}
                      />
                    </td>
                    <ExpiryCell
                      value={truck.registration_expires}
                      alert={alerts.find((item) => item.kind === "registration")}
                    />
                    <ExpiryCell
                      value={truck.dot_inspected_on || truck.dot_expires}
                      alert={alerts.find((item) => item.kind === "dot_inspection")}
                    />
                    <ActiveStatusCell active={truck.active} />
                    <td>
                      <FleetRowActions
                        kind="truck"
                        id={truck.id}
                        href={`/fleet/trucks/${truck.id}`}
                        active={truck.active !== 0}
                        assigned={assignedIds.has(truck.id)}
                        canDelete={canDelete}
                        label={`unit ${truck.unit_number}`}
                      />
                    </td>
                  </ClickableRow>
                );
              })
            )}
          </tbody>
        </table>
        <DirectoryPager path="/fleet/trucks" q={q} page={directory.page} pageCount={directory.pageCount} />
      </div>
    </>
  );
}
