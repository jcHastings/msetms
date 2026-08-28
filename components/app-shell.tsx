"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { MikeLauncher } from "@/components/mike-launcher";
import { NavLinks } from "@/components/nav-links";
import { dispatcherLogoutAction } from "@/lib/dispatcher-actions";
import type { MikeMessage } from "@/lib/mike-shared";
import { roleLabel, type PublicDispatcher } from "@/lib/settings-shared";

export function AppShell({
  children,
  dispatcher,
  requireTwoFactor = false,
  mikeConfigured = false,
  mikeMessages = [],
}: {
  children: React.ReactNode;
  dispatcher: PublicDispatcher;
  requireTwoFactor?: boolean;
  mikeConfigured?: boolean;
  mikeMessages?: MikeMessage[];
}) {
  const pathname = usePathname();
  const showSetupPrompt = !dispatcher.totp_enrolled && !requireTwoFactor && pathname !== "/settings/security";
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="desk-sidebar sticky top-0 flex h-screen w-[4.75rem] shrink-0 flex-col" data-desk-chrome="">
        <div className="desk-sidebar-brand border-b border-white/10 px-1 py-3">
          <Link href="/" className="block">
            <BrandMark variant="dark" size="sm" />
          </Link>
        </div>
        <NavLinks role={dispatcher.role} />
        <div className="border-t border-white/10 px-1 py-3 text-center text-[10px] text-slate-400">
          <div className="truncate font-medium text-slate-200" title={dispatcher.name}>
            {dispatcher.name.split(" ")[0]}
          </div>
          <div className="truncate">{roleLabel(dispatcher.role)}</div>
          <form action={dispatcherLogoutAction} className="mt-2">
            <button className="btn btn-ghost px-1 text-[10px] text-slate-300" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1400px] px-8 py-7">
          <div data-desk-chrome="">
          <MikeLauncher configured={mikeConfigured} initialMessages={mikeMessages} />
          </div>
          {showSetupPrompt ? (
            <div className="mb-4 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" data-desk-chrome="">
              <Link href="/settings/security" className="btn btn-secondary">
                Set up 2-step
              </Link>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
