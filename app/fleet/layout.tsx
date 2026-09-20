import { AccessDenied } from "@/components/access-denied";
import { canEditFleet, getPageAccess } from "@/lib/dispatcher-session";

export const dynamic = "force-dynamic";

export default async function FleetLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getPageAccess(canEditFleet);
  if (!dispatcher) {
    return <AccessDenied message="Fleet is for Administrator and Standard." />;
  }
  return children;
}
