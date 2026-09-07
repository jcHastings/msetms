import Link from "next/link";
import { notFound } from "next/navigation";
import { LocationForm } from "@/components/location-form";
import { PageHeader } from "@/components/page-header";
import { deleteLocationFormAction, updateLocationAction } from "@/lib/actions";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { isGooglePlacesConfigured } from "@/lib/env";
import { getLocation } from "@/lib/queries";
import { canDeleteLocations } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const location = getLocation(Number.parseInt((await params).id, 10));
  if (!location) notFound();
  const boundAction = updateLocationAction.bind(null, location.id);
  const dispatcher = await getSignedInDispatcher();
  const canDelete = dispatcher ? canDeleteLocations(dispatcher.role) : false;

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
      <LocationForm
        location={location}
        action={boundAction}
        submitLabel="Save location"
        placesEnabled={isGooglePlacesConfigured()}
      />
      {canDelete ? (
        <form action={deleteLocationFormAction} className="mt-4">
          <input type="hidden" name="location_id" value={location.id} />
          <button className="btn btn-ghost text-rose-700" type="submit">
            Delete location
          </button>
        </form>
      ) : null}
    </>
  );
}
