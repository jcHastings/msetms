import Link from "next/link";
import { notFound } from "next/navigation";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Drug test");
import { AccessDenied } from "@/components/access-denied";
import { DrugTestForm } from "@/components/drug-test-form";
import { PageHeader } from "@/components/page-header";
import { canEditFleet, getPageAccess } from "@/lib/dispatcher-session";
import { getDrugTest, listDrivers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditDrugTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const dispatcher = await getPageAccess(canEditFleet);
  if (!dispatcher) {
    return <AccessDenied message="Compliance is for Administrator and Standard." />;
  }
  const test = getDrugTest(Number.parseInt((await params).id, 10));
  if (!test) notFound();

  return (
    <>
      <PageHeader
        title={`${test.driver_name} · drug test`}
        actions={
          <Link href="/compliance?tab=drug" className="btn btn-secondary">
            Back to list
          </Link>
        }
      />
      <DrugTestForm test={test} drivers={listDrivers()} />
    </>
  );
}
