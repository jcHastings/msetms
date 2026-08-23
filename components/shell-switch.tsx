"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export function ShellSwitch({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/driver")) {
    return <>{children}</>;
  }
  return <AppShell>{children}</AppShell>;
}
