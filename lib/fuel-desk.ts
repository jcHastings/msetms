/** Fuel desk sections. The default panel is the cheap first paint. */

export const FUEL_DESK_PANELS = ["spend", "closeout", "mpg", "receipts", "audit", "tx"] as const;

export type FuelDeskPanel = (typeof FUEL_DESK_PANELS)[number];

/** Rows mounted in one table page. Keeps assign forms and match rows off the main thread. */
export const FUEL_TABLE_PAGE_SIZE = 25;

export function parseFuelDeskPanel(value: string | undefined): FuelDeskPanel | null {
  if (
    value === "spend" ||
    value === "closeout" ||
    value === "mpg" ||
    value === "receipts" ||
    value === "audit" ||
    value === "tx"
  ) {
    return value;
  }
  return null;
}

/**
 * `/fuel` with no panel is week spend + import.
 * Driver, truck, and per-truck links still open Transactions.
 * An explicit panel wins, including Week while a driver filter is in the URL.
 */
export function resolveFuelDeskPanel(input: {
  panel?: string;
  driverId?: number | null;
  truckId?: number | null;
  view?: string;
}): FuelDeskPanel {
  const explicit = parseFuelDeskPanel(input.panel);
  if (explicit) return explicit;
  if (input.driverId || input.truckId) return "tx";
  if (input.view === "trucks" || input.view === "drivers") return "tx";
  return "spend";
}

export type FuelDeskMounts = {
  spend: boolean;
  import: boolean;
  weekStrip: boolean;
  closeout: boolean;
  mpg: boolean;
  receipts: boolean;
  audit: boolean;
  transactions: boolean;
};

/** Only the active panel's sections mount. Heavy tables stay out of the first RSC payload. */
export function fuelDeskMounts(panel: FuelDeskPanel): FuelDeskMounts {
  const spend = panel === "spend";
  return {
    spend,
    import: spend,
    weekStrip: spend,
    closeout: panel === "closeout",
    mpg: panel === "mpg",
    receipts: panel === "receipts",
    audit: panel === "audit",
    transactions: panel === "tx",
  };
}
