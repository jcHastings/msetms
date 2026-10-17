import { AccessDenied } from "@/components/access-denied";
import { canManageUsers, getPageAccess } from "@/lib/dispatcher-session";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getPageAccess(canManageUsers);
  if (!dispatcher) {
    return <AccessDenied message="Only an Administrator can manage users." />;
  }
  return children;
}
