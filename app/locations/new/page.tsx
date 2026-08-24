import Link from "next/link";
import { LocationForm } from "@/components/location-form";
import { PageHeader } from "@/components/page-header";
import { createLocationAction } from "@/lib/actions";
import { isGooglePlacesConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function NewLocationPage() {
  return (
    <>
      <PageHeader
        title="New location"
        subtitle="Saved shipper or receiver used when booking a load."
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
