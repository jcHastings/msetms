import { LoadOverlay } from "@/components/load-overlay";
import { LoadSearch } from "@/components/load-search";
import { PageHeader } from "@/components/page-header";
import { overlayReturnTo, parseOpenLoadId } from "@/lib/load-page-shared";
import { listCustomers, listDrivers, listSavedReports, listTrailers, listTrucks, searchLoads } from "@/lib/queries";
import { defaultSearchCriteria } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const params = await searchParams;
  const openId = parseOpenLoadId(params.open);
  const initial = defaultSearchCriteria();
  return (
    <>
      <PageHeader
        title="Search"
        subtitle="Find live, archived, and cancelled loads."
      />
      <LoadSearch
        customers={listCustomers()}
        drivers={listDrivers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        reports={listSavedReports()}
        initialResults={searchLoads(initial)}
      />
      {openId ? <LoadOverlay loadId={openId} returnTo={overlayReturnTo("/search")} /> : null}
    </>
  );
}
