"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: Array<{ title: string; items: Array<{ href: string; label: string }> }> = [
  {
    title: "Dispatch",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/board", label: "Dispatch board" },
      { href: "/search", label: "Search" },
      { href: "/loads/new", label: "New load" },
      { href: "/loads/templates", label: "Templates" },
      { href: "/locations", label: "Locations" },
    ],
  },
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Fleet" },
      { href: "/fleet/drivers", label: "Drivers" },
      { href: "/fleet/trucks", label: "Trucks" },
      { href: "/fleet/trailers", label: "Trailers" },
      { href: "/compliance", label: "Compliance" },
    ],
  },
  {
    title: "Customers",
    items: [{ href: "/customers", label: "Customers" }],
  },
  {
    title: "Accounting",
    items: [
      { href: "/accounting", label: "Overview" },
      { href: "/accounting/invoices", label: "Invoices (AR)" },
      { href: "/accounting/bills", label: "Bills (AP)" },
      { href: "/accounting/pay", label: "Driver pay" },
      { href: "/accounting/commissions", label: "Commissions" },
      { href: "/accounting/quickbooks", label: "QuickBooks" },
    ],
  },
  {
    title: "More",
    items: [
      { href: "/claims", label: "Claims" },
      { href: "/reports", label: "Reports" },
      { href: "/settings", label: "Settings" },
      { href: "/driver/login", label: "Driver app" },
    ],
  },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {section.title}
          </div>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active =
                item.href === "/" || item.href === "/accounting" || item.href === "/fleet"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
