import Link from "next/link";
import { redirect } from "next/navigation";
import { LocationForm } from "@/components/location-form";
import { PageHeader } from "@/components/page-header";
import { createLocationAction } from "@/lib/actions";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { isGooglePlacesConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function NewLocationPage() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");
  return (
    <>
      <PageHeader
        title="New location"
        actions={
          <Link href="/locations" className="btn btn-secondary">
            Back to locations
          </Link>
        }
      />
      <LocationForm
        action={createLocationAction}
        submitLabel="Create location"
        placesEnabled={isGooglePlacesConfigured()}
      />
    </>
  );
}
