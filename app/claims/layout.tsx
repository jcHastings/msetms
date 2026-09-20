import { AccessDenied } from "@/components/access-denied";
import { getPageAccess } from "@/lib/dispatcher-session";
import { canWriteDesk } from "@/lib/settings-shared";

export default async function ClaimsLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getPageAccess(canWriteDesk);
  if (!dispatcher) {
    return <AccessDenied message="Claims are for dispatch and accounting." />;
  }
  return children;
}
