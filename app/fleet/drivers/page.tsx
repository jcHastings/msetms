import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { DriverImport } from "@/components/driver-import";
import { ActiveStatusCell, ExpiryCell } from "@/components/expiry-cell";
import { FleetRowActions } from "@/components/fleet-row-actions";
import { PageHeader } from "@/components/page-header";
import { DriverKindBadge } from "@/components/status-badge";
import { driverComplianceAlerts } from "@/lib/compliance";
import { canDeleteFleet, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getSamsaraFleet, truckUnitForDriver } from "@/lib/integrations/samsara";
import { assignedFleetAssetIds, listDrivers, listTrucks } from "@/lib/queries";
import { fleetDivisionOf, formatCdlEndorsements, isOwnerOperator } from "@/lib/types";
import { complianceWindows } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const windows = complianceWindows();
  const drivers = listDrivers();
  const trucks = listTrucks();
  const fleet = await getSamsaraFleet();
  const dispatcher = await getSignedInDispatcher();
  const canDelete = canDeleteFleet(dispatcher?.role ?? "");
  const assignedIds = assignedFleetAssetIds("driver");

  return (
    <>
      <PageHeader
        title="Drivers"
        actions={
          <>
            <Link href="/fuel" className="btn btn-secondary">
              Fuel
            </Link>
            <a href="/api/fleet/drivers/export" className="btn btn-secondary">
              Download CSV
            </a>
            <Link href="/fleet/drivers/new" className="btn btn-primary">
              Add driver
            </Link>
          </>
        }
      />
      <DriverImport />
      <div className="card">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Division</th>
              <th>Phone</th>
              <th>Driver type</th>
              <th>CDL</th>
              <th>Truck</th>
              <th>CDL exp</th>
              <th>Med card exp</th>
              <th>PIN</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-8 text-sm text-slate-500">
                  No drivers yet.
                </td>
              </tr>
            ) : (
              drivers.map((driver) => {
                const alerts = driverComplianceAlerts(driver, windows);
                const truckUnit = truckUnitForDriver(driver, trucks, fleet);
                return (
                  <ClickableRow
                    key={driver.id}
                    href={`/fleet/drivers/${driver.id}`}
                    className={driver.active === 0 ? "opacity-60" : undefined}
                  >
                    <td>
                      <span className="font-semibold hover:underline">{driver.name}</span>
                    </td>
                    <td>{fleetDivisionOf(driver)}</td>
                    <td>{driver.phone || "—"}</td>
                    <td>
                      <DriverKindBadge type={driver.driver_type} />
                      {isOwnerOperator(driver.driver_type) && driver.company_name ? (
                        <div className="text-xs text-slate-500">{driver.company_name}</div>
                      ) : null}
                      {isOwnerOperator(driver.driver_type) && driver.pay_percent != null ? (
                        <div className="text-xs text-slate-500">{driver.pay_percent}% settlement</div>
                      ) : null}
                    </td>
                    <td>{formatCdlEndorsements(driver.cdl_endorsements)}</td>
                    <td>{truckUnit ? `Unit ${truckUnit}` : "—"}</td>
                    <ExpiryCell value={driver.license_expires} alert={alerts.find((item) => item.kind === "license")} />
                    <ExpiryCell value={driver.medical_expires} alert={alerts.find((item) => item.kind === "medical")} />
                    <td>{driver.pin ? "Set" : "—"}</td>
                    <ActiveStatusCell active={driver.active} />
                    <td>
                      <FleetRowActions
                        kind="driver"
                        id={driver.id}
                        href={`/fleet/drivers/${driver.id}`}
                        active={driver.active !== 0}
                        assigned={assignedIds.has(driver.id)}
                        canDelete={canDelete}
                        label={driver.name}
                      />
                    </td>
                  </ClickableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
