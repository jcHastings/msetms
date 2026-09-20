import { listBills } from "./accounting";
import { listQboItemMaps, listQboVendorMaps, type QboItemMap, type QboVendorMap } from "./accounting-desk";
import type { QboMapTab } from "./accounting-desk-shared";
import {
  getQuickbooksStatus,
  listQboCustomers,
  listQboItems,
  listQboVendors,
  type QboNamedRef,
  type QboStatus,
} from "./integrations/quickbooks";
import { listCustomers, listCustomersNeedingQbo, listDrivers } from "./queries";
import { isOwnerOperator, type Customer } from "./types";

export type QuickbooksDeskData = {
  tab: QboMapTab;
  qbo: QboStatus;
  qboCustomers: QboNamedRef[];
  qboItems: QboNamedRef[];
  qboVendors: QboNamedRef[];
  customers: Customer[];
  needsCustomer: Customer[];
  itemMaps: QboItemMap[];
  vendorMaps: QboVendorMap[];
  vendorNames: string[];
  error: string;
};

function qboUnavailableStatus(error: string): QboStatus {
  return {
    configured: false,
    oauthReady: false,
    environment: "sandbox",
    mode: "demo",
    status: "API error",
    clientIdSet: false,
    clientSecretSet: false,
    redirectUri: "",
    refreshTokenSet: false,
    realmIdSet: false,
    companyName: "",
    fetchedAt: new Date().toISOString(),
    error,
  };
}

function publicError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

async function settle<T>(task: () => Promise<T> | T, fallback: T, onError: (message: string) => void, fallbackMessage: string): Promise<T> {
  try {
    return await task();
  } catch (error) {
    onError(publicError(error, fallbackMessage));
    return fallback;
  }
}

/** Never throws. Live QBO lists load only for the active mapping tab. */
export async function loadQuickbooksDesk(tab: QboMapTab): Promise<QuickbooksDeskData> {
  const errors: string[] = [];
  const note = (message: string) => {
    if (message && !errors.includes(message)) errors.push(message);
  };

  const [qbo, qboCustomers, qboItems, qboVendors, customers, needsCustomer, itemMaps, vendorMaps, vendorNames] =
    await Promise.all([
      settle(getQuickbooksStatus, qboUnavailableStatus("QuickBooks status is unavailable."), note, "QuickBooks status is unavailable."),
      settle(
        () => (tab === "customers" ? listQboCustomers() : []),
        [],
        note,
        "QuickBooks customers could not be loaded.",
      ),
      settle(() => (tab === "items" ? listQboItems() : []), [], note, "QuickBooks items could not be loaded."),
      settle(() => (tab === "vendors" ? listQboVendors() : []), [], note, "QuickBooks vendors could not be loaded."),
      settle(listCustomers, [], note, "TMS customers could not be loaded."),
      settle(listCustomersNeedingQbo, [], note, "Customers needing QuickBooks could not be loaded."),
      settle(listQboItemMaps, [], note, "Pay-item maps could not be loaded."),
      settle(listQboVendorMaps, [], note, "Vendor maps could not be loaded."),
      settle(
        () =>
          [
            ...listDrivers()
              .filter((driver) => isOwnerOperator(driver.driver_type))
              .map((driver) => driver.name),
            ...listBills().map((bill) => bill.vendor),
          ].filter((name, index, all) => name.trim() && all.indexOf(name) === index),
        [],
        note,
        "Vendors could not be loaded.",
      ),
    ]);

  return {
    tab,
    qbo,
    qboCustomers,
    qboItems,
    qboVendors,
    customers,
    needsCustomer,
    itemMaps,
    vendorMaps,
    vendorNames,
    error: errors.join(" "),
  };
}
