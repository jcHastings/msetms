import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { dispatcherLogoutAction } from "@/lib/dispatcher-actions";
import type { Dispatcher } from "@/lib/dispatcher-session";

export function AppShell({
  children,
  dispatcher,
}: {
  children: React.ReactNode;
  dispatcher: Dispatcher;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-navy text-slate-100">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href="/" className="block">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
              MSE Transport
            </div>
            <div className="mt-1 text-xl font-semibold tracking-tight">TMS</div>
          </Link>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Local dispatch for a small fleet
          </p>
        </div>
        <NavLinks />
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-400">
          <div className="font-medium text-slate-200">{dispatcher.name}</div>
          <div className="capitalize">{dispatcher.role}</div>
          <form action={dispatcherLogoutAction} className="mt-2">
            <button className="btn btn-ghost px-0 text-slate-300" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1400px] px-8 py-7">{children}</div>
      </div>
    </div>
  );
}
