import { SettingsAccess } from "@/components/settings-access";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getSignedInDispatcher();
  return <SettingsAccess role={dispatcher?.role ?? ""}>{children}</SettingsAccess>;
}
