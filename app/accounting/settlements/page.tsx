import { AccountingHub } from "@/components/accounting-hub";
import { PageHeader } from "@/components/page-header";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Settlements");
export const dynamic = "force-dynamic";

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader dense title="Settlements" />
      <AccountingHub tab="settlements" week={params.week ?? ""} />
    </>
  );
}
