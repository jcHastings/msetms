/** Client-safe load-list tabs and in-tab search. No db, env, or secrets. */

export const LOAD_LIST_TABS = [
  { value: "active", label: "Active" },
  { value: "planning", label: "Planning" },
  { value: "all", label: "All" },
] as const;

export type LoadListTab = (typeof LOAD_LIST_TABS)[number]["value"];

export const PLANNING_LOAD_STATUSES = ["available", "hold"] as const;

export function loadShowsOnDispatchBoard(status: string): boolean {
  return status !== "accounting";
}

export function parseLoadListTab(value: string | null | undefined): LoadListTab {
  if (value === "planning" || value === "all") return value;
  return "active";
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
