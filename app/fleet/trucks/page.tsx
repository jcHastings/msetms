import Link from "next/link";
import { ComplianceBadge } from "@/components/compliance-badge";
import { PageHeader } from "@/components/page-header";
import { TruckStatusBadge } from "@/components/status-badge";
import { truckComplianceAlerts } from "@/lib/compliance";
import { listTrucks } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";
import { labelForTruckType } from "@/lib/types";

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
        subtitle="Power units, plates, and compliance. Samsara vehicle ID is optional."
        actions={
          <Link href="/fleet/trucks/new" className="btn btn-primary">
            Add truck
          </Link>
        }
      />
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Year / make / model</th>
              <th>Plate</th>
              <th>Driver</th>
              <th>Registration</th>
              <th>DOT inspection</th>
              <th>Compliance</th>
              <th>Status</th>
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
              trucks.map((truck) => (
                <tr key={truck.id} className={truck.active === 0 ? "opacity-60" : undefined}>
                  <td>
                    <Link href={`/fleet/trucks/${truck.id}`} className="font-mono font-semibold hover:underline">
                      {truck.unit_number}
                    </Link>
                    {truck.active === 0 ? <div className="text-xs text-slate-500">Inactive</div> : null}
                  </td>
                  <td>{vehicleLabel(truck)}</td>
                  <td>{truck.plate || "—"}</td>
                  <td>{truck.driver_name || "—"}</td>
                  <td className="whitespace-nowrap">{truck.registration_expires || "—"}</td>
                  <td className="whitespace-nowrap">{truck.dot_expires || "—"}</td>
                  <td>
                    <ComplianceBadge alerts={truckComplianceAlerts(truck, windows)} />
                  </td>
                  <td>
                    <TruckStatusBadge status={truck.status} />
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
