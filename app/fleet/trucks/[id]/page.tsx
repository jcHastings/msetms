import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TruckForm } from "@/components/truck-form";
import { updateTruckAction } from "@/lib/actions";
import { getTruck } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditTruckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const truck = getTruck(Number.parseInt((await params).id, 10));
  if (!truck) notFound();
  const boundAction = updateTruckAction.bind(null, truck.id);

  return (
    <>
      <PageHeader
        title={`Unit ${truck.unit_number}`}
        actions={
          <Link href="/fleet" className="btn btn-secondary">
            Back to fleet
          </Link>
        }
      />
      <TruckForm truck={truck} action={boundAction} submitLabel="Save truck" />
    </>
  );
}
