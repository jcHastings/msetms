import Link from "next/link";
import { notFound } from "next/navigation";
import { FleetDocsPanel } from "@/components/fleet-docs-panel";
import { PageHeader } from "@/components/page-header";
import { TruckForm } from "@/components/truck-form";
import { UnitComplianceCard } from "@/components/unit-compliance-card";
import { updateTruckAction } from "@/lib/actions";
import { truckComplianceAlerts } from "@/lib/compliance";
import { listFleetDocuments } from "@/lib/files";
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
  const boundAction = updateTruckAction.bind(null, truck.id);

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
      <UnitComplianceCard
        registrationIssued={truck.registration_issued}
        registrationExpires={truck.registration_expires}
        inspectedOn={truck.dot_inspected_on}
        inspectionExpires={truck.dot_expires}
        alerts={truckComplianceAlerts(truck, complianceWindows())}
      />
      <TruckForm truck={truck} drivers={listDrivers()} action={boundAction} submitLabel="Save truck" />
      <FleetDocsPanel ownerType="truck" ownerId={truck.id} documents={listFleetDocuments("truck", truck.id)} />
    </>
  );
}
