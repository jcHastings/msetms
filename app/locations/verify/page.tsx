import Link from "next/link";
import { redirect } from "next/navigation";
import { LocationVerifyScreen, type VerifyRow } from "@/components/location-verify-screen";
import { PageHeader } from "@/components/page-header";
import { deskMetadata } from "@/lib/desk-metadata";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { isGooglePlacesConfigured, getGoogleMapsBrowserKey } from "@/lib/env";
import { locationVerifyQuery } from "@/lib/location-verify";
import { listUnverifiedLocations, readVerifyCache } from "@/lib/location-verify-store";
import { canEditLocations } from "@/lib/settings-shared";

export const metadata = deskMetadata("Verify locations");
export const dynamic = "force-dynamic";

export default async function VerifyLocationsPage() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");
  if (!canEditLocations(dispatcher.role)) redirect("/locations");

  const rows: VerifyRow[] = listUnverifiedLocations().map((location) => {
    const cached = readVerifyCache(location.id, locationVerifyQuery(location));
    return {
      id: location.id,
      name: location.name,
      street: location.street,
      city: location.city,
      state: location.state,
      zip: location.zip,
      latitude: location.latitude,
      longitude: location.longitude,
      suggestion: cached?.place ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Verify locations"
        actions={
          <Link href="/locations" className="btn btn-secondary">
            Back to locations
          </Link>
        }
      />
      <p className="mb-4 text-sm text-slate-600">
        Each row stays as it is until you click Accept. Skip hides it for this visit only.
      </p>
      <LocationVerifyScreen
        rows={rows}
        placesOn={isGooglePlacesConfigured()}
        mapsApiKey={getGoogleMapsBrowserKey() ?? ""}
      />
    </>
  );
}
