import { PageHeader } from "@/components/page-header";
import { AccountingHub } from "@/components/accounting-hub";
import { parseAccountingHubTab } from "@/lib/accounting-desk-shared";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; from?: string; to?: string; branch?: string; driver?: string }>;
}) {
  const params = await searchParams;
  const tab = parseAccountingHubTab(params.tab);
  return (
    <>
      <PageHeader
        title="Invoices / Bills"
        actions={
          <a className="btn btn-secondary" href="/api/accounting/invoices/export">
            Download invoices
          </a>
        }
      />
      <AccountingHub
        tab={tab}
        q={params.q ?? ""}
        from={params.from}
        to={params.to}
        branch={params.branch ?? ""}
        driver={params.driver ?? ""}
      />
    </>
  );
}
