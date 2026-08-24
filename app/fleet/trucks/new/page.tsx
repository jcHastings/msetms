import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TruckForm } from "@/components/truck-form";
import { createTruckAction } from "@/lib/actions";
import { listDrivers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function NewTruckPage() {
  const drivers = listDrivers().map((driver) => ({ id: driver.id, name: driver.name }));
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
      <TruckForm drivers={drivers} action={createTruckAction} submitLabel="Create truck" />
    </>
  );
}
