import { LoadSearch } from "@/components/load-search";
import { PageHeader } from "@/components/page-header";
import { listCustomers, listDrivers, listSavedReports, listTrailers, listTrucks, searchLoads } from "@/lib/queries";
import { defaultSearchCriteria } from "@/lib/search";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  const initial = defaultSearchCriteria();
  return (
    <>
      <PageHeader
        title="Search"
        subtitle="Search criteria for live, archived, and cancelled loads. Save a named report to reopen the same filters and columns."
      />
      <LoadSearch
        customers={listCustomers()}
        drivers={listDrivers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
        reports={listSavedReports()}
        initialResults={searchLoads(initial)}
      />
    </>
  );
}
