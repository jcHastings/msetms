import { LoadOverlay } from "@/components/load-overlay";
import { PageOverlayHost } from "@/components/page-overlay-host";
import { LoadSearch } from "@/components/load-search";
import { PageHeader } from "@/components/page-header";
import { overlayReturnTo, parseOpenLoadId } from "@/lib/load-page-shared";
import { listCustomers, listDrivers, listSavedReports, listTrailers, listTrucks, searchLoads } from "@/lib/queries";
import { criteriaFromSearchParams } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; q?: string }>;
}) {
  const params = await searchParams;
  const openId = parseOpenLoadId(params.open);
  const initial = criteriaFromSearchParams(params);
  return (
    <PageOverlayHost returnTo={overlayReturnTo("/search")} serverOpenId={openId}>
      <PageHeader
        title="Search"
      />
      <LoadSearch
        customers={listCustomers()}
        drivers={listDrivers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        reports={listSavedReports()}
        initialCriteria={initial}
        initialResults={searchLoads(initial)}
      />
      {openId ? <LoadOverlay loadId={openId} returnTo={overlayReturnTo("/search")} /> : null}
    </PageOverlayHost>
  );
}
