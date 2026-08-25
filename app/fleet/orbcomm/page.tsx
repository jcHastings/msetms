import { FleetMapView } from "@/components/fleet-map-view";
import { buildOrbcommFleetMap } from "@/lib/fleet-map";
import { mapsBrowserKey } from "@/lib/load-map";

export const dynamic = "force-dynamic";

export default async function OrbcommFleetMapPage() {
  const [model, apiKey] = await Promise.all([buildOrbcommFleetMap(), Promise.resolve(mapsBrowserKey())]);
  return <FleetMapView model={model} apiKey={apiKey} />;
}
