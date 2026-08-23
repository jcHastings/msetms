import Link from "next/link";
import { DriverForm } from "@/components/driver-form";
import { PageHeader } from "@/components/page-header";
import { createDriverAction } from "@/lib/actions";
import { listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function NewDriverPage() {
  return (
    <>
      <PageHeader
        title="Add driver"
        actions={
          <Link href="/fleet" className="btn btn-secondary">
            Back to fleet
          </Link>
        }
      />
      <DriverForm trucks={listTrucks()} action={createDriverAction} submitLabel="Create driver" />
    </>
  );
}
