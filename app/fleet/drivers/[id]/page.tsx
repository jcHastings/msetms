import Link from "next/link";
import { notFound } from "next/navigation";
import { DriverComplianceCard } from "@/components/driver-compliance-card";
import { DriverFuelCard } from "@/components/driver-fuel-card";
import { DriverForm } from "@/components/driver-form";
import { FleetDocsPanel } from "@/components/fleet-docs-panel";
import { PageHeader } from "@/components/page-header";
import { listFleetDocuments } from "@/lib/files";
import { driverFormValues } from "@/lib/fleet-form-shared";
import { getDriver } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function EditDriverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const driver = getDriver(Number.parseInt((await params).id, 10));
  if (!driver) notFound();
  const { pin, ...driverWithoutPin } = driver;

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
      <DriverFuelCard driverId={Number(driver.id)} />
      <DriverForm
        driver={driverFormValues({
          ...driverWithoutPin,
          has_pin: String(pin ?? "").trim() ? 1 : 0,
        })}
        filesHref="#driver-files"
        submitLabel="Save"
      />
      <div id="driver-files">
        <FleetDocsPanel
          ownerType="driver"
          ownerId={Number(driver.id)}
          documents={listFleetDocuments("driver", driver.id)}
        />
      </div>
    </>
  );
}
