import Link from "next/link";
import { notFound } from "next/navigation";
import { LocationForm } from "@/components/location-form";
import { PageHeader } from "@/components/page-header";
import { updateLocationAction } from "@/lib/actions";
import { getLocation } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const location = getLocation(Number.parseInt((await params).id, 10));
  if (!location) notFound();
  const boundAction = updateLocationAction.bind(null, location.id);

  return (
    <>
      <PageHeader
        title={location.name}
        actions={
          <Link href="/locations" className="btn btn-secondary">
            Back to locations
          </Link>
        }
      />
      <LocationForm location={location} action={boundAction} submitLabel="Save location" />
    </>
  );
}
