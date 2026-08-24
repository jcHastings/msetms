import { canViewLoadFinancials } from "./settings-shared";

export const LOAD_TABS = [
  { value: "basics", label: "Load Basics" },
  { value: "customer", label: "Customer Info" },
  { value: "assets", label: "Carrier and Driver Info" },
  { value: "stops", label: "Edit Stops" },
  { value: "financials", label: "Financials" },
] as const;

export const LOAD_VIEW_TABS = [
  ...LOAD_TABS,
  { value: "log", label: "Load Log" },
  { value: "docs", label: "Load Documents" },
] as const;

export type LoadTab = (typeof LOAD_VIEW_TABS)[number]["value"];

const ALIASES: Record<string, LoadTab> = {
  basics: "basics",
  basic: "basics",
  customer: "customer",
  customers: "customer",
  assets: "assets",
  asset: "assets",
  carrier: "assets",
  tracking: "assets",
  dispatch: "assets",
  stops: "stops",
  stop: "stops",
  financials: "financials",
  financial: "financials",
  pay: "financials",
  log: "log",
  history: "log",
  audit: "log",
  docs: "docs",
  documents: "docs",
  document: "docs",
};

export function parseLoadTab(value: string | null | undefined): LoadTab {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return ALIASES[key] ?? "basics";
}

export function isFormTab(tab: LoadTab): boolean {
  return tab === "basics" || tab === "customer" || tab === "assets";
}

export function loadFormTabsForRole(role: string) {
  return LOAD_TABS.filter((tab) => tab.value !== "financials" || canViewLoadFinancials(role));
}
