"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import type { Dispatcher } from "@/lib/dispatcher-session";

export function ShellSwitch({
  children,
  dispatcher,
}: {
  children: React.ReactNode;
  dispatcher: Dispatcher | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const publicPath = pathname.startsWith("/driver") || pathname === "/login";

  useEffect(() => {
    if (!publicPath && !dispatcher) {
      router.replace("/login");
    }
  }, [publicPath, dispatcher, router]);

  if (publicPath) {
    return <>{children}</>;
  }
  if (!dispatcher) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Redirecting to dispatcher login…
      </div>
    );
  }
  return <AppShell dispatcher={dispatcher}>{children}</AppShell>;
}
