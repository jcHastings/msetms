import { AccountingHub } from "@/components/accounting-hub";
import { PageHeader } from "@/components/page-header";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Reimbursements");
export const dynamic = "force-dynamic";

export default function ReimbursementsPage() {
  return (
    <>
      <PageHeader dense title="Reimbursements" />
      <AccountingHub tab="reimbursements" />
    </>
  );
}
