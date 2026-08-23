import { AccessDenied } from "@/components/access-denied";
import { canAccessAccounting, getPageAccess } from "@/lib/dispatcher-session";

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getPageAccess(canAccessAccounting);
  if (!dispatcher) {
    return <AccessDenied message="Accounting is for Administrator and Accounting." />;
  }
  return children;
}
