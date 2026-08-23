import Link from "next/link";
import { notFound } from "next/navigation";
import { DriverComplianceCard } from "@/components/driver-compliance-card";
import { DriverForm } from "@/components/driver-form";
import { FleetDocsPanel } from "@/components/fleet-docs-panel";
import { PageHeader } from "@/components/page-header";
import { updateDriverAction } from "@/lib/actions";
import { listFleetDocuments } from "@/lib/files";
import { getDriver, listTrucks } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function EditDriverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const driver = getDriver(Number.parseInt((await params).id, 10));
  if (!driver) notFound();
  const boundAction = updateDriverAction.bind(null, driver.id);

  return (
    <>
      <PageHeader
        title={driver.name}
        actions={
          <Link href="/fleet/drivers" className="btn btn-secondary">
            Back to drivers
          </Link>
        }
      />
      <DriverComplianceCard driver={driver} windows={complianceWindows()} />
      <DriverForm
        driver={driver}
        trucks={listTrucks()}
        action={boundAction}
        submitLabel="Save driver"
      />
      <FleetDocsPanel ownerType="driver" ownerId={driver.id} documents={listFleetDocuments("driver", driver.id)} />
    </>
  );
}
