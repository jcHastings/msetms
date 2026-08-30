"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import type { OfficeNotification } from "@/lib/alert-rules-shared";
import type { MikeMessage } from "@/lib/mike-shared";
import type { PublicDispatcher } from "@/lib/settings-shared";

export function ShellSwitch({
  children,
  dispatcher,
  requireTwoFactor = false,
  mikeConfigured = false,
  mikeMessages = [],
  officeNotifications = [],
}: {
  children: React.ReactNode;
  dispatcher: PublicDispatcher | null;
  requireTwoFactor?: boolean;
  mikeConfigured?: boolean;
  mikeMessages?: MikeMessage[];
  officeNotifications?: OfficeNotification[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const publicPath = pathname.startsWith("/driver") || pathname === "/login" || pathname.startsWith("/login/");

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
  return (
    <AppShell
      dispatcher={dispatcher}
      requireTwoFactor={requireTwoFactor}
      mikeConfigured={mikeConfigured}
      mikeMessages={mikeMessages}
      officeNotifications={officeNotifications}
    >
      {children}
    </AppShell>
  );
}
