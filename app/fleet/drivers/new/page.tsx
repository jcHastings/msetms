import Link from "next/link";
import { DriverForm } from "@/components/driver-form";
import { PageHeader } from "@/components/page-header";
import { truckOption } from "@/lib/fleet-form-shared";
import { listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function NewDriverPage() {
  return (
    <>
      <PageHeader
        title="Add driver"
        actions={
          <Link href="/fleet/drivers" className="btn btn-secondary">
            Back to drivers
          </Link>
        }
      />
      <DriverForm trucks={listTrucks().map(truckOption)} submitLabel="Create driver" />
    </>
  );
}
