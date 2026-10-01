import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { LoadSheetImport } from "@/components/load-sheet-import";
import { PageHeader } from "@/components/page-header";
import { canEditLoads, getPageAccess, getSignedInDispatcher } from "@/lib/dispatcher-session";

export const dynamic = "force-dynamic";

export default async function ImportLoadsPage() {
  const signedInDispatcher = await getSignedInDispatcher();
  if (!signedInDispatcher) redirect("/login");

  const allowedDispatcher = await getPageAccess(canEditLoads);
  if (!allowedDispatcher) {
    return <AccessDenied message="Load import is for Administrator and Standard." />;
  }
  return (
    <>
      <PageHeader
        title="Import loads"
        actions={
          <div className="flex gap-2">
            <Link href="/loads/new" className="btn btn-secondary">
              New load
            </Link>
            <Link href="/loads/import" className="btn btn-secondary">
              From rate con
            </Link>
          </div>
        }
      />
      <LoadSheetImport />
    </>
  );
}
