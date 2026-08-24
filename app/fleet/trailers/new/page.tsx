import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TrailerForm } from "@/components/trailer-form";
import { truckOption } from "@/lib/fleet-form-shared";
import { listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function NewTrailerPage() {
  return (
    <>
      <PageHeader
        title="Add trailer"
        actions={
          <Link href="/fleet/trailers" className="btn btn-secondary">
            Back to trailers
          </Link>
        }
      />
      <TrailerForm trucks={listTrucks().map(truckOption)} submitLabel="Create trailer" />
    </>
  );
}
