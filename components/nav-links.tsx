"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/board", label: "Dispatch board" },
  { href: "/loads/search", label: "Load search" },
  { href: "/loads/new", label: "New load", exact: true },
  { href: "/fleet", label: "Fleet" },
  { href: "/customers", label: "Customers" },
  { href: "/locations", label: "Locations" },
  { href: "/settings", label: "Settings" },
  { href: "/driver/login", label: "Driver app" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
