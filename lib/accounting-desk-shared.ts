import type { AccountingDesk } from "./types";

export const ACCOUNTING_HUB_TABS = [
  { value: "invoices", label: "Invoices" },
  { value: "bills", label: "Bills" },
  { value: "reconcile", label: "Reconcile and Archive" },
  { value: "archived", label: "Search Archived Loads" },
  { value: "pay", label: "Driver Pay Mgmt." },
  { value: "approve", label: "Approve Load Pay Items for Driver Pay" },
] as const;

export type AccountingHubTab = (typeof ACCOUNTING_HUB_TABS)[number]["value"];

export const QBO_MAP_TABS = [
  { value: "items", label: "Map Pay Items" },
  { value: "customers", label: "Map Customers" },
  { value: "vendors", label: "Map Vendors" },
  { value: "connection", label: "QuickBooks" },
] as const;

export type QboMapTab = (typeof QBO_MAP_TABS)[number]["value"];

export function hubTabClass(active: boolean): string {
  return active ? "hub-tab hub-tab-active" : "hub-tab";
}

export function parseAccountingHubTab(value: string | null | undefined): AccountingHubTab {
  const match = ACCOUNTING_HUB_TABS.find((tab) => tab.value === value);
  return match?.value ?? "invoices";
}

export function hrefForAccountingHubTab(tab: AccountingHubTab): string {
  if (tab === "pay") return "/accounting/pay";
  return `/accounting/invoices?tab=${tab}`;
}

export function parseQboMapTab(value: string | null | undefined): QboMapTab {
  const match = QBO_MAP_TABS.find((tab) => tab.value === value);
  return match?.value ?? "connection";
}

export function isAccountingDesk(value: string | null | undefined): value is AccountingDesk {
  return value === "operations" || value === "accounting" || value === "archived";
}

export function loadIsOnAccountingDesk(load: { accounting_desk?: string; status: string }): boolean {
  return load.accounting_desk === "accounting" || load.accounting_desk === "archived" || load.status === "accounting";
}

export function loadIsArchivedAccounting(load: { accounting_desk?: string }): boolean {
  return load.accounting_desk === "archived";
}
