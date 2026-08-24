"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import type { MikeMessage } from "@/lib/mike-shared";
import type { PublicDispatcher } from "@/lib/settings-shared";

export function ShellSwitch({
  children,
  dispatcher,
  requireTwoFactor = false,
  mikeConfigured = false,
  mikeMessages = [],
}: {
  children: React.ReactNode;
  dispatcher: PublicDispatcher | null;
  requireTwoFactor?: boolean;
  mikeConfigured?: boolean;
  mikeMessages?: MikeMessage[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const publicPath = pathname.startsWith("/driver") || pathname === "/login";
  const mustEnroll = Boolean(requireTwoFactor && dispatcher && !dispatcher.totp_enrolled);
  const onSecurity = pathname === "/settings/security";

  useEffect(() => {
    if (!publicPath && !dispatcher) {
      router.replace("/login");
    } else if (mustEnroll && !onSecurity && !publicPath) {
      router.replace("/settings/security");
    }
  }, [publicPath, dispatcher, router, mustEnroll, onSecurity]);

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
  if (mustEnroll && !onSecurity) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Redirecting to 2-step setup…
      </div>
    );
  }
  return (
    <AppShell
      dispatcher={dispatcher}
      requireTwoFactor={requireTwoFactor}
      mikeConfigured={mikeConfigured}
      mikeMessages={mikeMessages}
    >
      {children}
    </AppShell>
  );
}
