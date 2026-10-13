import { AccessDenied } from "@/components/access-denied";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Accounting");
import { canViewAccounting, getPageAccess } from "@/lib/dispatcher-session";

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getPageAccess(canViewAccounting);
  if (!dispatcher) {
    return <AccessDenied message="Accounting is for Administrator and Accounting." />;
  }
  return children;
}
