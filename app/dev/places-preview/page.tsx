import { notFound } from "next/navigation";
import { PlacesPreview } from "@/components/places-preview";

export const dynamic = "force-dynamic";

export default function PlacesPreviewPage() {
  if (process.env.TMS_PLACES_PREVIEW !== "1") notFound();
  return <PlacesPreview />;
}
