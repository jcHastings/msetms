import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { dispatcherLogoutAction } from "@/lib/dispatch-actions";

export function AppShell({ children, username }: { children: React.ReactNode; username: string }) {
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
          <div className="font-medium text-slate-200">{username}</div>
          <form action={dispatcherLogoutAction} className="mt-2">
            <button type="submit" className="text-xs text-slate-400 underline hover:text-white">
              Log out
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
