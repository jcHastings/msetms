import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deskMetadata } from "@/lib/desk-metadata";
import { LocationForm } from "@/components/location-form";
import { PageHeader } from "@/components/page-header";
import { SamsaraAddressSync } from "@/components/samsara-address-sync";
import { deleteLocationFormAction, updateLocationAction } from "@/lib/actions";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getGoogleMapsBrowserKey } from "@/lib/env";
import { ARCHIVED_MERGE_LEAD, isArchivedLocation } from "@/lib/locations";
import { getLocation } from "@/lib/queries";
import { canDeleteLocations } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const location = getLocation(Number.parseInt((await params).id, 10));
  return deskMetadata(location?.name || "Location");
}

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");

  const location = getLocation(Number.parseInt((await params).id, 10));
  if (!location) notFound();
  const keeperId = Number(location.merged_into);
  const keeper =
    isArchivedLocation(location) && Number.isFinite(keeperId) && keeperId > 0 ? getLocation(keeperId) : null;
  const boundAction = updateLocationAction.bind(null, location.id);
  const canDelete = canDeleteLocations(dispatcher.role);

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
      {isArchivedLocation(location) ? (
        <p
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-archived-location-note=""
        >
          {keeper ? (
            <>
              {ARCHIVED_MERGE_LEAD}{" "}
              <Link href={`/locations/${keeper.id}`} className="font-semibold underline">
                {keeper.name}
              </Link>
            </>
          ) : (
            "Archived"
          )}
        </p>
      ) : null}
      <LocationForm
        location={location}
        action={boundAction}
        submitLabel="Save location"
        mapsApiKey={getGoogleMapsBrowserKey() ?? ""}
      />
      <SamsaraAddressSync
        locationId={location.id}
        addressId={location.samsara_address_id}
        error={location.samsara_address_error}
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
