"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { NavLinks } from "@/components/nav-links";
import { dispatcherLogoutAction } from "@/lib/dispatcher-actions";
import { roleLabel, type PublicDispatcher } from "@/lib/settings-shared";

export function AppShell({
  children,
  dispatcher,
  requireTwoFactor = false,
}: {
  children: React.ReactNode;
  dispatcher: PublicDispatcher;
  requireTwoFactor?: boolean;
}) {
  const pathname = usePathname();
  const showSetupPrompt = !dispatcher.totp_enrolled && !requireTwoFactor && pathname !== "/settings/security";
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-navy text-slate-100">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href="/" className="block">
            <BrandMark variant="dark" size="sm" />
          </Link>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Local dispatch for a small fleet
          </p>
        </div>
        <NavLinks role={dispatcher.role} />
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-400">
          <div className="font-medium text-slate-200">{dispatcher.name}</div>
          <div>{roleLabel(dispatcher.role)}</div>
          <form action={dispatcherLogoutAction} className="mt-2">
            <button className="btn btn-ghost px-0 text-slate-300" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1400px] px-8 py-7">
          {showSetupPrompt ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p>
                Set up 2-step verification for your dispatcher login. You can skip until an admin requires it.
              </p>
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
