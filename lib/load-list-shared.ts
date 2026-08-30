/** Client-safe load-list tabs and in-tab search. No db, env, or secrets. */

export const LOAD_LIST_TABS = [
  { value: "active", label: "Active Loads" },
  { value: "planning", label: "Planning Loads" },
  { value: "accounting", label: "Ready for Accounting" },
  { value: "misc", label: "Misc. Loads" },
  { value: "all", label: "All Loads" },
  { value: "mine", label: "My Loads" },
  { value: "master", label: "Master Loads" },
] as const;

export type LoadListTab = (typeof LOAD_LIST_TABS)[number]["value"];

export const PLANNING_LOAD_STATUSES = ["available", "hold"] as const;
export const MISC_LOAD_STATUSES = ["cancelled", "completed"] as const;

export function loadShowsOnDispatchBoard(status: string): boolean {
  return status !== "accounting";
}

export function parseLoadListTab(value: string | null | undefined): LoadListTab {
  const match = LOAD_LIST_TABS.find((tab) => tab.value === value);
  return match?.value ?? "active";
}

export type LoadListFilters = {
  status: string;
  date?: string;
  dispatcherId?: number;
  masterOnly?: boolean;
};

export function filtersForLoadListTab(
  tab: LoadListTab,
  extras: { date?: string; dispatcherId?: number | null } = {},
): LoadListFilters {
  const date = extras.date || undefined;
  if (tab === "mine") {
    const dispatcherId = extras.dispatcherId && extras.dispatcherId > 0 ? extras.dispatcherId : -1;
    return { status: "all", date, dispatcherId };
  }
  if (tab === "master") {
    return { status: "all", date, masterOnly: true };
  }
  return { status: tab, date };
}

export type LoadListSearchRow = {
  load_number: string;
  customer_name: string;
  origin: string;
  destination: string;
  reference_number?: string | null;
  po_number?: string | null;
  customer_reference?: string | null;
};

export function loadMatchesListQuery(load: LoadListSearchRow, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [
    load.load_number,
    load.customer_name,
    load.origin,
    load.destination,
    load.reference_number,
    load.po_number,
    load.customer_reference,
  ].some((value) => String(value ?? "").toLowerCase().includes(term));
}
