"use client";

import { usePathname } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { canEditSettings } from "@/lib/settings-shared";

export function SettingsAccess({ role, children }: { role: string; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/settings" || pathname === "/settings/security") {
    return children;
  }
  if (!canEditSettings(role)) {
    return <AccessDenied message="Only an Administrator can change Settings." />;
  }
  return children;
}
