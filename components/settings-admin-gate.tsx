import { AccessDenied } from "@/components/access-denied";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";

export async function SettingsAdminGate({ children }: { children: React.ReactNode }) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !canEditSettings(dispatcher.role)) {
    return <AccessDenied message="Only an Administrator can change Settings." />;
  }
  return children;
}
