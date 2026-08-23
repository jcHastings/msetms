import Link from "next/link";
import { ComplianceBadge } from "@/components/compliance-badge";
import { PageHeader } from "@/components/page-header";
import { DriverKindBadge, DriverStatusBadge } from "@/components/status-badge";
import { driverComplianceAlerts } from "@/lib/compliance";
import { listDrivers } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function DriversPage() {
  const windows = complianceWindows();
  const drivers = listDrivers();

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle="Company drivers and owner-operators. Assign a unit from the dispatch board."
        actions={
          <Link href="/fleet/drivers/new" className="btn btn-primary">
            Add driver
          </Link>
        }
      />
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Truck</th>
              <th>CDL exp</th>
              <th>Med card exp</th>
              <th>Compliance</th>
              <th>PIN</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-sm text-slate-500">
                  No drivers yet.
                </td>
              </tr>
            ) : (
              drivers.map((driver) => (
                <tr key={driver.id} className={driver.active === 0 ? "opacity-60" : undefined}>
                  <td>
                    <Link href={`/fleet/drivers/${driver.id}`} className="font-semibold hover:underline">
                      {driver.name}
                    </Link>
                    {driver.active === 0 ? <div className="text-xs text-slate-500">Inactive</div> : null}
                  </td>
                  <td>{driver.phone || "—"}</td>
                  <td>
                    <DriverKindBadge type={driver.driver_type} />
                    {driver.driver_type === "owner_operator" && driver.pay_percent != null ? (
                      <div className="text-xs text-slate-500">{driver.pay_percent}%</div>
                    ) : null}
                  </td>
                  <td>{driver.truck_unit ? `Unit ${driver.truck_unit}` : "—"}</td>
                  <td className="whitespace-nowrap">{driver.license_expires || "—"}</td>
                  <td className="whitespace-nowrap">{driver.medical_expires || "—"}</td>
                  <td>
                    <ComplianceBadge alerts={driverComplianceAlerts(driver, windows)} />
                  </td>
                  <td>{driver.pin ? "Set" : "—"}</td>
                  <td>
                    <DriverStatusBadge status={driver.status} />
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
