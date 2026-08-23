import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TruckForm } from "@/components/truck-form";
import { createTruckAction } from "@/lib/actions";
import { listDrivers } from "@/lib/queries";

export default function NewTruckPage() {
  return (
    <>
      <PageHeader
        title="Add truck"
        actions={
          <Link href="/fleet/trucks" className="btn btn-secondary">
            Back to trucks
          </Link>
        }
      />
      <TruckForm drivers={listDrivers()} action={createTruckAction} submitLabel="Create truck" />
    </>
  );
}
