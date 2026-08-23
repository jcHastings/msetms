import { LoadSearchPanel } from "@/components/load-search-panel";
import { PageHeader } from "@/components/page-header";
import { parseLoadSearchParams } from "@/lib/load-search";
import {
  getSavedSearchReport,
  listCustomers,
  listDrivers,
  listSavedSearchReports,
  listTrailers,
  listTrucks,
  searchLoads,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LoadSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let criteria = parseLoadSearchParams(params);
  if (criteria.reportId && params.searched == null) {
    const report = getSavedSearchReport(criteria.reportId);
    if (report) criteria = report.filters;
  }
  const results = searchLoads(criteria);

  return (
    <>
      <PageHeader
        title="Load search"
        subtitle="Search criteria for live, archived, and cancelled loads. Save a report to reuse filters and columns."
      />
      <LoadSearchPanel
        initial={criteria}
        results={results}
        reports={listSavedSearchReports()}
        customers={listCustomers()}
        drivers={listDrivers()}
        trucks={listTrucks()}
        trailers={listTrailers()}
      />
    </>
  );
}
