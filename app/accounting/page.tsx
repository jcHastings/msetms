import { PageHeader } from "@/components/page-header";
import { ArapReport } from "@/components/arap-report";
import { listApReportRows, listArReportRows } from "@/lib/accounting-aging";

export const dynamic = "force-dynamic";

export default async function AccountingHomePage() {
  return (
    <>
      <PageHeader dense title="AR/AP Report" />
      <ArapReport arRows={listArReportRows()} apRows={listApReportRows()} />
    </>
  );
}
