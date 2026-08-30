"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DESK_NAV_ACCORDION, deskNavSectionForPath, isDeskNavActive, nextDeskNavOpenSection } from "@/lib/desk-nav-shared";
import { canSeeNavHref } from "@/lib/settings-shared";

type NavItem = { href: string; label: string; short: string; icon: string };
type NavEntry =
  | { kind: "link"; item: NavItem }
  | { kind: "section"; title: string; items: NavItem[] };

const NAV: NavEntry[] = [
  { kind: "link", item: { href: "/", label: "Dashboard", short: "Dashboard", icon: "home" } },
  { kind: "link", item: { href: "/search", label: "Search", short: "Search", icon: "search" } },
  {
    title: "Dispatch",
    kind: "section",
    items: [
      { href: "/board", label: "Dispatch board", short: "Board", icon: "board" },
      { href: "/loads/new", label: "New load", short: "+ New", icon: "new" },
      { href: "/loads/import-sheet", label: "Import loads", short: "Import", icon: "import" },
      { href: "/loads/templates", label: "Templates", short: "Templates", icon: "templates" },
      { href: "/locations", label: "Locations", short: "Places", icon: "places" },
      { href: "/audit", label: "Audit", short: "Audit", icon: "audit" },
    ],
  },
  {
    kind: "section",
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Fleet", short: "Fleet", icon: "fleet" },
      { href: "/fleet/drivers", label: "Drivers", short: "Drivers", icon: "drivers" },
      { href: "/fleet/trucks", label: "Trucks", short: "Trucks", icon: "trucks" },
      { href: "/fleet/trailers", label: "Trailers", short: "Trailers", icon: "trailers" },
      { href: "/fleet/samsara", label: "Samsara", short: "Samsara", icon: "samsara" },
      { href: "/fleet/orbcomm", label: "Orbcomm", short: "Orbcomm", icon: "orbcomm" },
      { href: "/fuel", label: "Fuel", short: "Fuel", icon: "fuel" },
      { href: "/ifta", label: "IFTA", short: "IFTA", icon: "ifta" },
      { href: "/compliance", label: "Compliance", short: "DOT", icon: "compliance" },
      { href: "/safety", label: "Safety", short: "Safety", icon: "safety" },
    ],
  },
  {
    kind: "section",
    title: "Customers",
    items: [{ href: "/customers", label: "Customers", short: "Customers", icon: "customers" }],
  },
  {
    kind: "section",
    title: "Accounting",
    items: [
      { href: "/accounting", label: "AR/AP Report", short: "AR/AP", icon: "books" },
      { href: "/accounting/invoices", label: "Invoices/Bills", short: "Invoices/Bills", icon: "ar" },
      { href: "/accounting/pay", label: "Driver Pay Mgt", short: "Driver Pay Mgt", icon: "pay" },
      { href: "/accounting/commissions", label: "Commissions", short: "Comm", icon: "comm" },
      { href: "/accounting/quickbooks", label: "QuickBooks", short: "QBO", icon: "qbo" },
    ],
  },
  {
    kind: "section",
    title: "Reports",
    items: [
      { href: "/reports", label: "Reports", short: "Reports", icon: "reports" },
      { href: "/reports/manage", label: "Manage reports", short: "Manage", icon: "manage" },
      { href: "/reports/statistics", label: "Statistics", short: "Stats", icon: "stats" },
      { href: "/claims", label: "Claims", short: "Claims", icon: "claims" },
      { href: "/driver/login", label: "Driver app", short: "Driver", icon: "driver" },
    ],
  },
  {
    kind: "section",
    title: "Settings",
    items: [
      { href: "/settings", label: "Settings", short: "Settings", icon: "settings" },
      { href: "/users", label: "Users", short: "Users", icon: "users" },
    ],
  },
];

function visibleNav(role: string): NavEntry[] {
  return NAV.map((entry) => {
    if (entry.kind === "link") return entry;
    return { ...entry, items: entry.items.filter((item) => canSeeNavHref(role, item.href)) };
  }).filter((entry) => (entry.kind === "link" ? canSeeNavHref(role, entry.item.href) : entry.items.length > 0));
}

function NavItemLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isDeskNavActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      title={item.label}
      data-nav-href={item.href}
      prefetch={item.href === "/claims" ? false : undefined}
      className={`desk-nav-link flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 ${
        active ? "desk-nav-link-active" : ""
      }`}
    >
      <NavIcon name={item.icon} />
      <span className="text-xs font-semibold leading-tight">{item.short}</span>
    </Link>
  );
}

export function NavLinks({ role }: { role: string }) {
  const pathname = usePathname();
  const entries = visibleNav(role);
  const sections = entries.filter((entry): entry is Extract<NavEntry, { kind: "section" }> => entry.kind === "section");
  const currentSection = deskNavSectionForPath(pathname, sections);
  const [openSection, setOpenSection] = useState<string | null>(currentSection);

  useEffect(() => {
    setOpenSection(currentSection);
  }, [currentSection]);

  return (
    <nav
      className="desk-nav-icons flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 py-3"
      data-nav-accordion={DESK_NAV_ACCORDION}
    >
      {entries.map((entry) => {
        if (entry.kind === "link") {
          if (!canSeeNavHref(role, entry.item.href)) return null;
          return <NavItemLink key={entry.item.href} item={entry.item} pathname={pathname} />;
        }
        const open = openSection === entry.title;
        const sectionActive = currentSection === entry.title;
        return (
          <div key={entry.title} data-nav-section={entry.title} data-nav-open={open ? "true" : "false"}>
            <button
              type="button"
              className={`desk-nav-parent desk-nav-section ${sectionActive ? "desk-nav-parent-active" : ""} ${
                open ? "desk-nav-parent-open" : ""
              }`}
              aria-expanded={open}
              onClick={() => setOpenSection((current) => nextDeskNavOpenSection(current, entry.title))}
            >
              <span>{entry.title}</span>
              <span className="desk-nav-chevron" aria-hidden>
                {open ? "▾" : "▸"}
              </span>
            </button>
            {open ? (
              <div className="desk-nav-children flex flex-col gap-0.5 pb-1">
                {entry.items.map((item) => (
                  <NavItemLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function NavIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: string) {
  switch (name) {
    case "home":
      return <path d="M4 11.5 12 5l8 6.5V20H4z" />;
    case "board":
      return <path d="M5 6h14M5 12h14M5 18h9" />;
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="5" />
          <path d="m16 16 3 3" />
        </>
      );
    case "new":
      return <path d="M12 5v14M5 12h14" />;
    case "import":
      return <path d="M12 5v10M8 11l4 4 4-4M5 19h14" />;
    case "templates":
      return <path d="M7 4h10v16H7zM10 8h4M10 12h4" />;
    case "places":
      return <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />;
    case "audit":
      return <path d="M7 4h10v16H7zM9 8h6M9 12h6M9 16h4" />;
    case "fleet":
      return <path d="M4 16h16l-1.5-6H8L4 16zm3 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />;
    case "drivers":
      return (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 19c1.2-3 3.4-4.5 7-4.5S17.8 16 19 19" />
        </>
      );
    case "trucks":
      return <path d="M3 16V8h11v8H3zm11-5h5l2 3v4h-7" />;
    case "trailers":
      return <path d="M3 16V9h14v7H3zm14-4h3v4h-3" />;
    case "samsara":
      return <path d="M12 5v14M7 9l5-4 5 4M7 15l5 4 5-4" />;
    case "orbcomm":
      return <path d="M6 12a6 6 0 0 1 12 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12.5v.5" />;
    case "fuel":
      return <path d="M7 5h7v14H7zM14 9h3v8h-3" />;
    case "ifta":
      return <path d="M5 19V5h14v14H5zm3-4h8M8 9h8" />;
    case "compliance":
      return <path d="M12 4 5 7v6c0 4 3 6.5 7 7 4-.5 7-3 7-7V7l-7-3z" />;
    case "safety":
      return <path d="M12 3 5 6v6c0 4.2 3.2 7 7 8 3.8-1 7-3.8 7-8V6l-7-3z" />;
    case "customers":
      return (
        <>
          <circle cx="9" cy="9" r="2.5" />
          <circle cx="16" cy="10" r="2" />
          <path d="M4 18c.8-2.4 2.4-3.5 5-3.5s4.2 1.1 5 3.5M14 18c.4-1.4 1.3-2.2 3-2.2s2.4.7 3 2.2" />
        </>
      );
    case "books":
      return <path d="M5 5h6v14H5zM13 5h6v14h-6" />;
    case "ar":
      return <path d="M6 18V6h12v12H6zm3-4h6" />;
    case "ap":
      return <path d="M6 6h12v12H6zM9 10h6" />;
    case "pay":
      return <path d="M4 8h16v8H4zM8 12h8" />;
    case "comm":
      return <path d="M6 18 12 6l6 12M8.5 14h7" />;
    case "qbo":
      return <path d="M8 8h8v8H8zM12 8v8" />;
    case "users":
      return (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 19c1-3 3.2-4.5 7-4.5S18 16 19 19" />
        </>
      );
    case "claims":
      return <path d="M7 4h10v16H7zM9 9h6M9 13h6" />;
    case "reports":
      return <path d="M6 18V9h3v9H6zm5 0V6h3v12h-3zm5 0v-6h3v6h-3z" />;
    case "manage":
      return <path d="M5 7h14M5 12h14M5 17h9" />;
    case "stats":
      return <path d="M5 18V9l5 3 4-6 5 8" />;
    case "settings":
      return <circle cx="12" cy="12" r="3" />;
    case "driver":
      return <path d="M4 16h16l-2-6H8L4 16zm4 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />;
    default:
      return <circle cx="12" cy="12" r="3" />;
  }
}
