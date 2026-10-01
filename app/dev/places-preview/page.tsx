import { notFound } from "next/navigation";
import { PlacesPreview } from "@/components/places-preview";
import { readRuntimeSecret } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Explicit opt-in. Read at request time so the production build does not inline an empty value. */
function previewFlag(name: string): boolean {
  return readRuntimeSecret(name) === "1";
}

/**
 * Screenshot harness. Not linked from the desk.
 * Office login is not enough: production returns 404 unless ENABLE_DEV_PREVIEWS=1
 * or the existing TMS_PLACES_PREVIEW=1 harness flag. Any other NODE_ENV can render it.
 * The client only shows mocked suggestions (empty Maps key, no save).
 */
function allowPlacesPreview(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return previewFlag("ENABLE_DEV_PREVIEWS") || previewFlag("TMS_PLACES_PREVIEW");
}

export default function PlacesPreviewPage() {
  if (!allowPlacesPreview()) notFound();
  return <PlacesPreview />;
}
