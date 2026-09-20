import { SettingsAccess } from "@/components/settings-access";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Settings");
import { getSignedInDispatcher } from "@/lib/dispatcher-session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getSignedInDispatcher();
  return <SettingsAccess role={dispatcher?.role ?? ""}>{children}</SettingsAccess>;
}
