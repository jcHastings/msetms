"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_TOP: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/board", label: "Dispatch board" },
  { href: "/loads/search", label: "Load search" },
  { href: "/loads/new", label: "New load", exact: true },
  { href: "/fleet", label: "Fleet" },
  { href: "/customers", label: "Customers" },
  { href: "/locations", label: "Locations" },
];

const ACCOUNTING: Array<{ href: string; label: string }> = [
  { href: "/accounting/ar-ap", label: "AR/AP Report" },
  { href: "/accounting/invoices", label: "Invoices/Bills" },
  { href: "/accounting/commissions", label: "Commissions Mgt" },
  { href: "/accounting/driver-pay", label: "Driver Pay Mgt" },
  { href: "/accounting/quickbooks", label: "QuickBooks" },
];

const NAV_BOTTOM: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/settings", label: "Settings" },
  { href: "/driver/login", label: "Driver app" },
];

function navActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  label,
  exact,
  nested,
}: {
  href: string;
  label: string;
  exact?: boolean;
  nested?: boolean;
}) {
  const pathname = usePathname();
  const active = navActive(pathname, href, exact);
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        nested ? "py-1.5" : ""
      } ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
    >
      {label}
    </Link>
  );
}

export function NavLinks() {
  const pathname = usePathname();
  const onAccounting = pathname === "/accounting" || pathname.startsWith("/accounting/");
  const [accountingOpen, setAccountingOpen] = useState(onAccounting);

  useEffect(() => {
    if (onAccounting) setAccountingOpen(true);
  }, [onAccounting]);

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {NAV_TOP.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}
      <div>
        <button
          type="button"
          aria-expanded={accountingOpen}
          onClick={() => setAccountingOpen((open) => !open)}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium ${
            onAccounting ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span>Accounting</span>
          <span aria-hidden className="text-[10px] text-slate-400">
            {accountingOpen ? "▾" : "▸"}
          </span>
        </button>
        {accountingOpen ? (
          <div className="mt-1 ml-2 flex flex-col gap-0.5 border-l border-white/10 pl-2">
            {ACCOUNTING.map((item) => (
              <NavItem key={item.href} {...item} nested />
            ))}
          </div>
        ) : null}
      </div>
      {NAV_BOTTOM.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}
    </nav>
  );
}
