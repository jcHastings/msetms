import Link from "next/link";
import { notFound } from "next/navigation";
import { FleetDocsPanel } from "@/components/fleet-docs-panel";
import { HosBadge, LocationBadge } from "@/components/fleet-badges";
import { PageHeader } from "@/components/page-header";
import { TruckForm } from "@/components/truck-form";
import { UnitComplianceCard } from "@/components/unit-compliance-card";
import { truckComplianceAlerts } from "@/lib/compliance";
import { listFleetDocuments } from "@/lib/files";
import { driverOption, truckFormValues } from "@/lib/fleet-form-shared";
import {
  getHosForTruck,
  getLocationForTruck,
  getSamsaraDriverForTruck,
  samsaraGpsEmptyState,
  samsaraHosEmptyState,
} from "@/lib/integrations/samsara";
import { getTruck, listDrivers } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function EditTruckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const truck = getTruck(Number.parseInt((await params).id, 10));
  if (!truck) notFound();
  const location = await getLocationForTruck(truck.id);
  const hos = await getHosForTruck(truck.id);
  const samsaraDriver = await getSamsaraDriverForTruck(truck.id);

  return (
    <>
      <PageHeader
        title={`Unit ${truck.unit_number}`}
        actions={
          <Link href="/fleet/trucks" className="btn btn-secondary">
            Back to trucks
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live location (Samsara)</div>
          <div className="mt-1">
            <LocationBadge
              location={location}
              empty={samsaraGpsEmptyState({
                truckAssigned: true,
                samsaraVehicleId: truck.samsara_vehicle_id,
                location,
              })}
            />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Samsara driver / HOS</div>
          <div className="mt-1 text-sm font-semibold">
            {samsaraDriver?.samsaraDriverName || truck.driver_name || "No Samsara-assigned driver"}
          </div>
          <div className="mt-1">
            <HosBadge
              hos={hos}
              empty={samsaraHosEmptyState({ assigned: Boolean(samsaraDriver || truck.assigned_driver_id), hos })}
            />
          </div>
        </div>
      </div>
      <UnitComplianceCard
        registrationIssued={truck.registration_issued}
        registrationExpires={truck.registration_expires}
        inspectedOn={truck.dot_inspected_on}
        inspectionExpires={truck.dot_expires}
        alerts={truckComplianceAlerts(truck, complianceWindows())}
      />
      <TruckForm
        truck={truckFormValues(truck)}
        drivers={listDrivers().map(driverOption)}
        submitLabel="Save truck"
      />
      <FleetDocsPanel ownerType="truck" ownerId={Number(truck.id)} documents={listFleetDocuments("truck", truck.id)} />
    </>
  );
}
