import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { ActiveStatusCell, ExpiryCell } from "@/components/expiry-cell";
import { PageHeader } from "@/components/page-header";
import { SamsaraTruckImport } from "@/components/samsara-truck-import";
import { truckComplianceAlerts } from "@/lib/compliance";
import { listTrucks } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";

export const dynamic = "force-dynamic";

function vehicleLabel(truck: { year: string; make: string; model: string }): string {
  return [truck.year, truck.make, truck.model].filter(Boolean).join(" ") || "—";
}

export default function TrucksPage() {
  const windows = complianceWindows();
  const trucks = listTrucks();

  return (
    <>
      <PageHeader
        title="Trucks"
        subtitle="Power units, plates, and compliance. Import from Samsara or set a vehicle ID by hand."
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
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Year / make / model</th>
              <th>Plate</th>
              <th>Driver</th>
              <th>Registration exp</th>
              <th>DOT inspection</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trucks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-sm text-slate-500">
                  No trucks yet.
                </td>
              </tr>
            ) : (
              trucks.map((truck) => {
                const alerts = truckComplianceAlerts(truck, windows);
                return (
                  <ClickableRow
                    key={truck.id}
                    href={`/fleet/trucks/${truck.id}`}
                    className={truck.active === 0 ? "opacity-60" : undefined}
                  >
                    <td>
                      <span className="font-mono font-semibold hover:underline">{truck.unit_number}</span>
                    </td>
                    <td>{vehicleLabel(truck)}</td>
                    <td>{truck.plate || "—"}</td>
                    <td>{truck.driver_name || "—"}</td>
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
