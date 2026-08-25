import { FleetMapView } from "@/components/fleet-map-view";
import { buildSamsaraFleetMap } from "@/lib/fleet-map";
import { mapsBrowserKey } from "@/lib/load-map";

export const dynamic = "force-dynamic";

export default async function SamsaraFleetMapPage() {
  const [model, apiKey] = await Promise.all([buildSamsaraFleetMap(), Promise.resolve(mapsBrowserKey())]);
  return <FleetMapView model={model} apiKey={apiKey} />;
}
