import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TruckForm } from "@/components/truck-form";
import { createTruckAction } from "@/lib/actions";

export default function NewTruckPage() {
  return (
    <>
      <PageHeader
        title="Add truck"
        actions={
          <Link href="/fleet" className="btn btn-secondary">
            Back to fleet
          </Link>
        }
      />
      <TruckForm action={createTruckAction} submitLabel="Create truck" />
    </>
  );
}
