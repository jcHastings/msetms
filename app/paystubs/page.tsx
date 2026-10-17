import { PageHeader } from "@/components/page-header";
import { PaystubUpload } from "@/components/paystub-upload";
import { deskMetadata } from "@/lib/desk-metadata";
import { getPageAccess } from "@/lib/dispatcher-session";
import { companyDriversForPaystubPicker, listPaystubReviewQueue } from "@/lib/paystubs";
import { OWNER_OPERATOR_PAY_NOTE } from "@/lib/paystub-shared";
import { canUploadPaystubs, canViewPaystubs } from "@/lib/settings-shared";

export const metadata = deskMetadata("Paystubs");
export const dynamic = "force-dynamic";

export default async function PaystubsPage() {
  const dispatcher = await getPageAccess(canViewPaystubs);
  const canWrite = canUploadPaystubs(dispatcher.role);
  return (
    <>
      <PageHeader title="Paystubs" />
      <PaystubUpload
        canWrite={canWrite}
        drivers={companyDriversForPaystubPicker()}
        queue={listPaystubReviewQueue()}
        ownerNote={OWNER_OPERATOR_PAY_NOTE}
      />
    </>
  );
}
