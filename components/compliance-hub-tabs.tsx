import Link from "next/link";

export const COMPLIANCE_TABS = [
  { value: "overview", label: "Overview", href: "/compliance" },
  { value: "drug", label: "Drug & alcohol", href: "/compliance?tab=drug" },
  { value: "docs", label: "Docs (reuse)", href: "/compliance?tab=docs" },
  { value: "safety", label: "Safety →", href: "/safety" },
] as const;

export type ComplianceTab = (typeof COMPLIANCE_TABS)[number]["value"];

export function parseComplianceTab(value: string | null | undefined): Exclude<ComplianceTab, "safety"> {
  if (value === "drug" || value === "docs") return value;
  return "overview";
}

export function ComplianceHubTabs({ tab }: { tab: ComplianceTab }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-4 border-b border-slate-200" data-compliance-tabs="">
      {COMPLIANCE_TABS.map((item) => {
        const active = item.value === tab;
        return (
          <Link
            key={item.value}
            href={item.href}
            data-compliance-tab={item.value}
            className={`-mb-px border-b-2 pb-2 text-sm font-semibold ${
              active ? "border-sky-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
