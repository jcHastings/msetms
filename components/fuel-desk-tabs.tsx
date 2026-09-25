import Link from "next/link";
import { fuelPageHref, type FuelPageQuery } from "@/components/fuel-transaction-lists";
import { FUEL_DESK_PANELS, type FuelDeskPanel } from "@/lib/fuel-desk";

const LABELS: Record<FuelDeskPanel, string> = {
  spend: "Week",
  closeout: "Closeout",
  mpg: "Drivers MPG",
  receipts: "Receipt match",
  audit: "Audit",
  tx: "Transactions",
};

export function FuelDeskTabs({
  panel,
  query,
}: {
  panel: FuelDeskPanel;
  query: Omit<FuelPageQuery, "panel" | "page">;
}) {
  return (
    <div
      role="tablist"
      aria-label="Fuel sections"
      className="mb-4 flex flex-wrap gap-x-1 border-b border-slate-200"
      data-fuel-desk-tabs=""
    >
      {FUEL_DESK_PANELS.map((value) => {
        const selected = value === panel;
        const href = fuelPageHref(
          value === "tx"
            ? { ...query, panel: "tx" }
            : { panel: value, week: query.week },
        );
        return (
          <Link
            key={value}
            href={href}
            role="tab"
            id={`fuel-tab-${value}`}
            aria-selected={selected}
            aria-controls={selected ? `fuel-panel-${value}` : undefined}
            prefetch={value === "spend" ? undefined : false}
            className={
              selected
                ? "-mb-px border-b-2 border-navy px-3 py-2 text-sm font-semibold text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            }
          >
            {LABELS[value]}
          </Link>
        );
      })}
    </div>
  );
}
