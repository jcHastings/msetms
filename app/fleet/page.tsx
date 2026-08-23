import Link from "next/link";
import { ComplianceBadge } from "@/components/compliance-badge";
import { PageHeader } from "@/components/page-header";
import { DriverStatusBadge, TruckStatusBadge } from "@/components/status-badge";
import { driverComplianceAlerts, trailerComplianceAlerts, truckComplianceAlerts } from "@/lib/compliance";
import { formatWeight } from "@/lib/format";
import { listDrivers, listTrailers, listTrucks } from "@/lib/queries";
import { labelForDriverKind, labelForTrailerType, labelForTruckType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function FleetPage() {
  const trucks = listTrucks();
  const trailers = listTrailers();
  const drivers = listDrivers();

  return (
    <>
      <PageHeader
        title="Fleet"
        subtitle="Trucks, trailers, and drivers. Assign a unit to a load from the dispatch board."
        actions={
          <div className="flex gap-2">
            <Link href="/fleet/trucks/new" className="btn btn-secondary">
              Add truck
            </Link>
            <Link href="/fleet/trailers/new" className="btn btn-secondary">
              Add trailer
            </Link>
            <Link href="/fleet/drivers/new" className="btn btn-primary">
              Add driver
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold">Trucks</h2>
          </header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Compliance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((truck) => (
                <tr key={truck.id}>
                  <td className="font-mono font-semibold">{truck.unit_number}</td>
                  <td>{labelForTruckType(truck.type)}</td>
                  <td>{formatWeight(truck.capacity_lbs)}</td>
                  <td>
                    <ComplianceBadge alerts={truckComplianceAlerts(truck)} />
                  </td>
                  <td>
                    <TruckStatusBadge status={truck.status} />
                  </td>
                  <td className="text-right">
                    <Link href={`/fleet/trucks/${truck.id}`} className="btn btn-ghost">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-hidden">
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold">Trailers</h2>
          </header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Type</th>
                <th>ORBCOMM</th>
                <th>Compliance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trailers.map((trailer) => (
                <tr key={trailer.id}>
                  <td className="font-mono font-semibold">{trailer.unit_number}</td>
                  <td>{labelForTrailerType(trailer.type)}</td>
                  <td className="text-xs text-slate-500">{trailer.orbcomm_asset_id ? "Mapped" : "—"}</td>
                  <td>
                    <ComplianceBadge alerts={trailerComplianceAlerts(trailer)} />
                  </td>
                  <td className="text-right">
                    <Link href={`/fleet/trailers/${trailer.id}`} className="btn btn-ghost">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-hidden xl:col-span-2">
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold">Drivers</h2>
          </header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>License</th>
                <th>Compliance</th>
                <th>PIN</th>
                <th>Truck</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id}>
                  <td className="font-semibold">{driver.name}</td>
                  <td className="text-xs">{labelForDriverKind(driver.driver_type)}</td>
                  <td className="font-mono text-xs">
                    {[driver.license_state, driver.license_number].filter(Boolean).join("-") || driver.license || "—"}
                  </td>
                  <td>
                    <ComplianceBadge alerts={driverComplianceAlerts(driver)} />
                  </td>
                  <td className="font-mono">{driver.pin || "—"}</td>
                  <td>{driver.truck_unit ? `Unit ${driver.truck_unit}` : "—"}</td>
                  <td>
                    <DriverStatusBadge status={driver.status} />
                  </td>
                  <td className="text-right">
                    <Link href={`/fleet/drivers/${driver.id}`} className="btn btn-ghost">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
