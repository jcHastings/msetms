import Link from "next/link";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Add drug test");
import { AccessDenied } from "@/components/access-denied";
import { DrugTestForm } from "@/components/drug-test-form";
import { PageHeader } from "@/components/page-header";
import { canEditFleet, getPageAccess } from "@/lib/dispatcher-session";
import { safeReturnTo } from "@/lib/load-page-shared";
import { listDrivers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewDrugTestPage({
  searchParams,
}: {
  searchParams: Promise<{ driver?: string; return_to?: string }>;
}) {
  const dispatcher = await getPageAccess(canEditFleet);
  if (!dispatcher) {
    return <AccessDenied message="Compliance is for Administrator and Standard." />;
  }
  const params = await searchParams;
  const driverId = Number.parseInt(params.driver ?? "", 10);
  const returnTo = safeReturnTo(params.return_to, "/compliance?tab=drug");

  return (
    <>
      <PageHeader
        title="Add test"
        actions={
          <Link href={returnTo} className="btn btn-secondary">
            Back
          </Link>
        }
      />
      <DrugTestForm
        drivers={listDrivers()}
        defaultDriverId={Number.isFinite(driverId) ? driverId : undefined}
        returnTo={returnTo}
      />
    </>
  );
}
