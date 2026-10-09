import { deskMetadata } from "@/lib/desk-metadata";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RateConImport } from "@/components/rate-con-import";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { listCustomers, listDrivers, listTrailers, listTrucks } from "@/lib/queries";
import { loadFormSettings } from "@/lib/settings";

export const metadata = deskMetadata("Rate con");
export const dynamic = "force-dynamic";

export default async function ImportRateConPage() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");
  return (
    <>
      <PageHeader
        title="Load from rate confirmation"
        actions={
          <Link href="/loads/new" className="btn btn-secondary">
            Type a load instead
          </Link>
        }
      />
      <RateConImport
        customers={listCustomers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        locations={[]}
        drivers={listDrivers()}
        formSettings={loadFormSettings()}
      />
    </>
  );
}
