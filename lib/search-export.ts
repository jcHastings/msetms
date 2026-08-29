import { formatDateTime } from "./format";
import type { SearchColumnKey } from "./search";
import { labelForLoadStatus, type LoadView } from "./types";

export const SEARCH_EXPORT_HEADERS = [
  "Load #",
  "Customer",
  "Status",
  "Pickup",
  "Pickup window",
  "Delivery",
  "Delivery window",
  "Driver",
  "Truck",
  "Trailer",
  "Rate",
  "Refs",
  "Notes",
] as const;

const COLUMN_TO_EXPORT: Partial<Record<SearchColumnKey, ReadonlyArray<(typeof SEARCH_EXPORT_HEADERS)[number]>>> = {
  load_id: ["Load #"],
  customer: ["Customer"],
  status: ["Status"],
  pickups: ["Pickup", "Pickup window"],
  deliveries: ["Delivery", "Delivery window"],
  driver: ["Driver"],
  truck: ["Truck"],
  trailer: ["Trailer"],
  refs: ["Refs"],
  notes: ["Notes"],
};

export function searchExportHeaders(columns?: SearchColumnKey[]): string[] {
  if (!columns?.length) return [...SEARCH_EXPORT_HEADERS];
  const wanted = new Set<string>(["Load #", "Customer", "Status", "Pickup", "Delivery", "Driver", "Truck", "Trailer", "Rate"]);
  for (const column of columns) {
    for (const header of COLUMN_TO_EXPORT[column] ?? []) wanted.add(header);
  }
  return SEARCH_EXPORT_HEADERS.filter((header) => wanted.has(header));
}

function refsFor(load: LoadView): string {
  return [load.reference_number, load.po_number].filter(Boolean).join(" · ");
}

function notesFor(load: LoadView): string {
  return load.notes || load.special_instructions || load.appointment_notes || "";
}

export function searchExportCells(load: LoadView): Record<(typeof SEARCH_EXPORT_HEADERS)[number], string | number> {
  return {
    "Load #": load.load_number,
    Customer: load.customer_name,
    Status: labelForLoadStatus(load.status),
    Pickup: load.origin,
    "Pickup window": [formatDateTime(load.pickup_start), formatDateTime(load.pickup_end)].filter((value) => value && value !== "—").join(" – "),
    Delivery: load.destination,
    "Delivery window": [formatDateTime(load.delivery_start), formatDateTime(load.delivery_end)]
      .filter((value) => value && value !== "—")
      .join(" – "),
    Driver: load.driver_name || "",
    Truck: load.truck_unit || "",
    Trailer: load.trailer_unit || load.trailer_number || "",
    Rate: load.rate ?? "",
    Refs: refsFor(load),
    Notes: notesFor(load),
  };
}

/** Spreadsheet grid for the loads currently shown on Search — not the whole database. */
export function buildSearchExportGrid(loads: LoadView[], columns?: SearchColumnKey[]): Array<Array<string | number>> {
  const headers = searchExportHeaders(columns);
  const rows = loads.map((load) => {
    const cells = searchExportCells(load);
    return headers.map((header) => cells[header as (typeof SEARCH_EXPORT_HEADERS)[number]]);
  });
  return [headers, ...rows];
}
