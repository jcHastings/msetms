import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SettingsAccess } from "@/components/settings-access";
import { deskMetadata } from "@/lib/desk-metadata";
import { getSignedInDispatcher, isViewerRole } from "@/lib/dispatcher-session";

export const metadata = deskMetadata("Settings");

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getSignedInDispatcher();
  const path = (await headers()).get("x-tms-pathname") ?? "";
  if (dispatcher && isViewerRole(dispatcher.role) && path.startsWith("/settings") && path !== "/settings/security") {
    redirect("/settings/security");
  }
  return <SettingsAccess role={dispatcher?.role ?? ""}>{children}</SettingsAccess>;
}
