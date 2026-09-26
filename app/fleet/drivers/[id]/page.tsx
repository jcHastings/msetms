import Link from "next/link";
import { notFound } from "next/navigation";
import { DriverComplianceCard } from "@/components/driver-compliance-card";
import { DriverDrugTestsCard } from "@/components/driver-drug-tests-card";
import { DriverFuelCard } from "@/components/driver-fuel-card";
import { DriverForm } from "@/components/driver-form";
import { FleetDocsPanel } from "@/components/fleet-docs-panel";
import { PageHeader } from "@/components/page-header";
import { listFleetDocuments } from "@/lib/files";
import { driverFormValues } from "@/lib/fleet-form-shared";
import { hasDriverPassword } from "@/lib/driver-password";
import { getDriver, listDriverDrugTests } from "@/lib/queries";
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
          <>
            <Link href={`/fleet/trailers/custody?driver_id=${driver.id}`} className="btn btn-secondary">
              Trailers held
            </Link>
            <Link href="/fleet/drivers" className="btn btn-secondary">
              Back to drivers
            </Link>
          </>
        }
      />
      <DriverComplianceCard driver={driver} windows={complianceWindows()} />
      <DriverDrugTestsCard driverId={Number(driver.id)} tests={listDriverDrugTests(Number(driver.id), 5)} />
      <DriverFuelCard driverId={Number(driver.id)} />
      <DriverForm
        driver={driverFormValues({
          ...driverWithoutPin,
          has_app_login: hasDriverPassword(Number(driver.id)) ? 1 : 0,
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
