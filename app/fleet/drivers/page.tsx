import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { ComplianceBadge } from "@/components/compliance-badge";
import { PageHeader } from "@/components/page-header";
import { DriverKindBadge } from "@/components/status-badge";
import { driverComplianceAlerts, type ComplianceAlert } from "@/lib/compliance";
import { listDrivers } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";

function ExpiryCell({ value, alert }: { value: string; alert?: ComplianceAlert }) {
  return (
    <td className="whitespace-nowrap">
      <div>{value || "—"}</div>
      {alert ? <ComplianceBadge alerts={[alert]} /> : null}
    </td>
  );
}

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
              <th>PIN</th>
              <th>Status</th>
              <th></th>
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
              drivers.map((driver) => {
                const alerts = driverComplianceAlerts(driver, windows);
                return (
                  <ClickableRow
                    key={driver.id}
                    href={`/fleet/drivers/${driver.id}`}
                    className={driver.active === 0 ? "opacity-60" : undefined}
                  >
                    <td>
                      <span className="font-semibold hover:underline">{driver.name}</span>
                    </td>
                    <td>{driver.phone || "—"}</td>
                    <td>
                      <DriverKindBadge type={driver.driver_type} />
                      {driver.driver_type === "owner_operator" && driver.pay_percent != null ? (
                        <div className="text-xs text-slate-500">{driver.pay_percent}% settlement</div>
                      ) : null}
                    </td>
                    <td>{driver.truck_unit ? `Unit ${driver.truck_unit}` : "—"}</td>
                    <ExpiryCell value={driver.license_expires} alert={alerts.find((item) => item.kind === "license")} />
                    <ExpiryCell value={driver.medical_expires} alert={alerts.find((item) => item.kind === "medical")} />
                    <td>{driver.pin ? "Set" : "—"}</td>
                    <td>
                      {driver.active === 0 ? (
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inactive</span>
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Active</span>
                      )}
                    </td>
                    <td>
                      <span className="text-sm font-medium text-navy">Edit</span>
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
