import { PageHeader } from "@/components/page-header";
import { AccountingHub } from "@/components/accounting-hub";

export const dynamic = "force-dynamic";

export default async function DriverPayPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; branch?: string; driver?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader dense title="Driver Pay Mgmt." />
      <AccountingHub
        tab="pay"
        q={params.q ?? ""}
        from={params.from}
        to={params.to}
        branch={params.branch ?? ""}
        driver={params.driver ?? ""}
      />
    </>
  );
}
