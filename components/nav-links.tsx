"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canSeeNavHref } from "@/lib/settings-shared";

const SECTIONS: Array<{ title: string; items: Array<{ href: string; label: string }> }> = [
  {
    title: "Dispatch",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/board", label: "Dispatch board" },
      { href: "/search", label: "Search" },
      { href: "/loads/new", label: "New load" },
      { href: "/loads/import-sheet", label: "Import loads" },
      { href: "/loads/templates", label: "Templates" },
      { href: "/locations", label: "Locations" },
      { href: "/audit", label: "Audit" },
    ],
  },
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Fleet" },
      { href: "/fleet/drivers", label: "Drivers" },
      { href: "/fleet/trucks", label: "Trucks" },
      { href: "/fleet/trailers", label: "Trailers" },
      { href: "/fleet/samsara", label: "Samsara" },
      { href: "/fleet/orbcomm", label: "Orbcomm" },
      { href: "/fuel", label: "Fuel" },
      { href: "/ifta", label: "IFTA" },
      { href: "/compliance", label: "Compliance" },
      { href: "/safety", label: "Safety" },
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
      { href: "/users", label: "Users" },
      { href: "/claims", label: "Claims" },
      { href: "/reports", label: "Reports" },
      { href: "/reports/manage", label: "Manage reports" },
      { href: "/reports/statistics", label: "Statistics" },
      { href: "/settings", label: "Settings" },
      { href: "/driver/login", label: "Driver app" },
    ],
  },
];

export function NavLinks({ role }: { role: string }) {
  const pathname = usePathname();
  const sections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canSeeNavHref(role, item.href)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="desk-nav-section px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
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
                  className={`desk-nav-link rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active ? "desk-nav-link-active" : ""
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
