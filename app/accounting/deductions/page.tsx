import Link from "next/link";
import { DeductionSettingsPanel } from "@/components/deduction-settings-panel";
import { PageHeader } from "@/components/page-header";
import { deskMetadata } from "@/lib/desk-metadata";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { listDrivers } from "@/lib/queries";
import { canWrite } from "@/lib/settings-shared";
import { listDeductionTemplates } from "@/lib/settlement-statement";

export const metadata = deskMetadata("Deduction items");
export const dynamic = "force-dynamic";

export default async function DeductionSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const canEdit = dispatcher ? canWrite(dispatcher.role) : false;
  const drivers = listDrivers()
    .filter((driver) => driver.active)
    .map((driver) => ({ id: driver.id, name: driver.name }));
  return (
    <>
      <PageHeader dense title="Deduction items" />
      <p className="mb-3">
        <Link className="acct-link" href="/accounting/settlements">
          Back to settlements
        </Link>
      </p>
      <DeductionSettingsPanel templates={listDeductionTemplates()} drivers={drivers} canEdit={canEdit} />
    </>
  );
}
