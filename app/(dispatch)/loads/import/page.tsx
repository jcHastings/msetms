import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RateConImport } from "@/components/rate-con-import";
import { listCustomers, listDrivers, listLocations, listTrailers, listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function ImportRateConPage() {
  return (
    <>
      <PageHeader
        title="Load from rate confirmation"
        subtitle="Upload the customer rate con, review the extracted fields, then save and assign a driver."
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
        drivers={listDrivers()}
        locations={listLocations()}
      />
    </>
  );
}
