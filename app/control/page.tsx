import { ControlCenterView } from "@/components/control-center-view";
import { PageHeader } from "@/components/page-header";
import { buildControlCenter } from "@/lib/control-center";
import { mapsBrowserKey } from "@/lib/load-map";

export const dynamic = "force-dynamic";

export default async function ControlCenterPage() {
  const model = await buildControlCenter();
  return (
    <>
      <PageHeader title="Control Center" />
      <ControlCenterView orders={model.orders} resources={model.resources} apiKey={mapsBrowserKey()} />
    </>
  );
}
