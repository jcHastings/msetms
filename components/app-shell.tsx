"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { MikeLauncher } from "@/components/mike-launcher";
import { NavLinks } from "@/components/nav-links";
import { dispatcherLogoutAction } from "@/lib/dispatcher-actions";
import type { MikeMessage } from "@/lib/mike-shared";
import { roleLabel, type PublicDispatcher } from "@/lib/settings-shared";

export function AppShell({
  children,
  dispatcher,
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
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="desk-shell flex min-h-screen bg-background" data-nav-open={navOpen ? "true" : "false"}>
      <header className="desk-phone-bar" data-desk-phone-bar="">
        <button
          type="button"
          className="desk-phone-menu"
          aria-expanded={navOpen}
          aria-controls="desk-sidebar"
          onClick={() => setNavOpen((open) => !open)}
        >
          Menu
        </button>
        <Link href="/" className="desk-phone-brand min-w-0">
          <BrandMark variant="dark" size="sm" />
        </Link>
      </header>
      {navOpen ? (
        <button
          type="button"
          className="desk-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside
        id="desk-sidebar"
        className="desk-sidebar sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-x-hidden"
        data-desk-chrome=""
      >
        <div className="desk-sidebar-brand shrink-0 border-b border-white/10 px-3 py-3">
          <Link href="/" className="block w-fit max-w-full">
            <BrandMark variant="dark" size="sm" />
          </Link>
        </div>
        <NavLinks role={dispatcher.role} />
        <div className="desk-sidebar-user shrink-0 border-t border-white/10 px-3 py-3 text-xs text-slate-400">
          <div className="font-medium text-slate-200" title={dispatcher.name}>
            {dispatcher.name}
          </div>
          <div>{roleLabel(dispatcher.role)}</div>
          <form action={dispatcherLogoutAction} className="mt-2">
            <button className="btn btn-ghost w-full justify-start px-2 text-xs text-slate-300" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="desk-main min-w-0 flex-1">
        <div className="desk-main-inner mx-auto w-full max-w-[1400px] px-8 py-7">
          <div data-desk-chrome="">
          <MikeLauncher configured={mikeConfigured} initialMessages={mikeMessages} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
