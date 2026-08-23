import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RateConImport } from "@/components/rate-con-import";
import { listCustomers, listDrivers, listLocations, listTrailers, listTrucks } from "@/lib/queries";
import { loadFormSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function ImportRateConPage() {
  return (
    <>
      <PageHeader
        title="Load from rate confirmation"
        subtitle="Upload a PDF or image. We read the text in the browser app (no Windows extra tools), then you review and save. A thin parse still attaches the file."
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
        locations={listLocations()}
        drivers={listDrivers()}
        formSettings={loadFormSettings()}
      />
    </>
  );
}
