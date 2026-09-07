import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TruckForm } from "@/components/truck-form";
import { driverOption } from "@/lib/fleet-form-shared";
import { listDrivers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function NewTruckPage() {
  const drivers = listDrivers().map(driverOption);
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
      <TruckForm drivers={drivers} submitLabel="Create truck" />
    </>
  );
}
