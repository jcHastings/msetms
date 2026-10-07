import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { SettingsAccess } from "@/components/settings-access";
import { deskMetadata } from "@/lib/desk-metadata";
import { getSignedInDispatcher, isViewerRole } from "@/lib/dispatcher-session";
import { canEditSettings, canViewGusto } from "@/lib/settings-shared";

function gustoSettingsPath(path: string): boolean {
  return path === "/settings/gusto" || path.startsWith("/settings/gusto/");
}

export const metadata = deskMetadata("Settings");

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const dispatcher = await getSignedInDispatcher();
  const path = (await headers()).get("x-tms-pathname") ?? "";
  if (
    dispatcher &&
    isViewerRole(dispatcher.role) &&
    path.startsWith("/settings") &&
    path !== "/settings/security" &&
    !gustoSettingsPath(path)
  ) {
    redirect("/settings/security");
  }
  if (dispatcher && path.startsWith("/settings") && path !== "/settings/security" && !canEditSettings(dispatcher.role)) {
    if (!(isViewerRole(dispatcher.role) && gustoSettingsPath(path) && canViewGusto(dispatcher.role))) {
      forbidden();
    }
  }
  return <SettingsAccess role={dispatcher?.role ?? ""}>{children}</SettingsAccess>;
}
