import { ComplianceList } from "@/components/compliance-badge";
import { driverComplianceAlerts } from "@/lib/compliance";
import { formatDate } from "@/lib/format";
import { DEFAULT_COMPLIANCE_WINDOWS, type ComplianceWindows } from "@/lib/settings-shared";
import { formatCdlEndorsements, type Driver } from "@/lib/types";

function formatDay(value: string): string {
  return value ? formatDate(`${value}T12:00:00`) : "—";
}

export function DriverComplianceCard({
  driver,
  windows = DEFAULT_COMPLIANCE_WINDOWS,
}: {
  driver: Driver;
  windows?: ComplianceWindows;
}) {
  const alerts = driverComplianceAlerts(driver, windows);
  const license = [driver.license_state, driver.license_number].filter(Boolean).join("-") || driver.license || "—";

  return (
    <section className="card mb-4 p-5">
      <h2 className="text-sm font-semibold">License & medical card</h2>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-slate-500">Driver license</dt>
          <dd className="font-semibold">{license}</dd>
          <dd className="text-slate-600">Expires {formatDay(driver.license_expires)}</dd>
          <dd className="mt-1 text-slate-600">Endorsements {formatCdlEndorsements(driver.cdl_endorsements)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Medical card</dt>
          <dd className="font-semibold">Issued {formatDay(driver.medical_issued)}</dd>
          <dd className="text-slate-600">Expires {formatDay(driver.medical_expires)}</dd>
        </div>
      </dl>
      {alerts.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <ComplianceList alerts={alerts} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No license or medical card dates in the {windows.driverDays}-day window.
        </p>
      )}
    </section>
  );
}
