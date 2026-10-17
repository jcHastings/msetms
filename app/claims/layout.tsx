import { AccessDenied } from "@/components/access-denied";
import { canViewClaims, getPageAccess } from "@/lib/dispatcher-session";

export default async function ClaimsLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getPageAccess(canViewClaims);
  if (!dispatcher) {
    return <AccessDenied message="Claims are for dispatch and accounting." />;
  }
  return children;
}
