"use client";

import { redirect, usePathname } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { canEditSettings, isViewerRole } from "@/lib/settings-shared";

export function SettingsAccess({ role, children }: { role: string; children: React.ReactNode }) {
  const pathname = usePathname();
  if (isViewerRole(role)) {
    if (pathname === "/settings/security") return children;
    redirect("/settings/security");
  }
  if (pathname === "/settings" || pathname === "/settings/security") {
    return children;
  }
  if (!canEditSettings(role)) {
    return <AccessDenied message="Only an Administrator can change Settings." />;
  }
  return children;
}
