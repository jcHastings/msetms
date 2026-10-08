/**
 * Production QuickBooks mapping for MS Express's own company.
 * Names are resolved from the connected company. Nothing here creates a customer, vendor, account, or item.
 */

export const GROSS_TRUCKING_INCOME = "Gross Trucking Income";
export const FUEL_SURCHARGE_INCOME = "Fuel Surcharge Income";
export const LUMPER_COGS_ACCOUNT = "Lumper";
export const DEFAULT_LOAD_PAY_ACCOUNT = "Owner Operators:Owner Operators COL";

/** TMS customer 317 is MS Express. It is never a QuickBooks customer. */
export const MS_EXPRESS_CUSTOMER_ID = 317;
/** TMS customer 294 stays unmapped until the office picks a QuickBooks customer. No automatic name match. */
export const MANAGEMENT_GROUP_CUSTOMER_ID = 294;

export const MS_EXPRESS_CUSTOMER_MESSAGE =
  "MS Express (customer 317) is not a QuickBooks customer. It cannot be mapped or invoiced. Nothing was sent.";

export const MANAGEMENT_GROUP_MESSAGE =
  "M&S Management Group (customer 294) is not mapped. Pick the QuickBooks customer in Map Customers. Nothing was sent.";

export type InvoiceRule = {
  category: string;
  /** QuickBooks Item.Name. Not always the TMS pay-item label. */
  itemName: string;
  /** Account.FullyQualifiedName the item must already use. */
  accountName: string;
  kind: "income" | "cogs" | "dedicated";
};

/** Categories that must not appear on a customer invoice. */
export const NOT_BILLED_ON_INVOICE: Record<string, string> = {
  trailer_rental: "Trailer Rental",
  fuel_advance_fee: "Fuel Advance Fee",
  claim_for_damages: "Claim for Damages",
};

export const INVOICE_RULES: Record<string, InvoiceRule> = {
  flat_rate: { category: "flat_rate", itemName: "Line Haul", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  detention: { category: "detention", itemName: "Detention", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  extra_stop: { category: "extra_stop", itemName: "Picks and Drops", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  layover: { category: "layover", itemName: "Layover", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  tonu: { category: "tonu", itemName: "TONU", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  washout: { category: "washout", itemName: "Trailer Washout", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  fuel_surcharge: {
    category: "fuel_surcharge",
    itemName: "Fuel Surcharge",
    accountName: FUEL_SURCHARGE_INCOME,
    kind: "dedicated",
  },
  lumper: { category: "lumper", itemName: "Lumper", accountName: LUMPER_COGS_ACCOUNT, kind: "cogs" },
  misc: { category: "misc", itemName: "Adjustment", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
};

export type BillLineKind = "load_pay" | "fuel" | "toll" | "insurance" | "eld" | "loan";

export type BillSplitLine = {
  kind: BillLineKind;
  /** Signed. Load pay is positive. Deductions are negative. */
  amount: number;
  description?: string;
};

export function billAccountName(kind: BillLineKind, vendorName: string): string {
  switch (kind) {
    case "load_pay":
      return DEFAULT_LOAD_PAY_ACCOUNT;
    case "fuel":
      return "Owner Operators:Fuel";
    case "toll":
      return "Driver Expenses:Toll";
    case "insurance":
      return "Insurance:OCC";
    case "eld":
      return "Office and Admin Expense:Software";
    case "loan": {
      const vendor = vendorName.trim();
      if (!vendor) throw new Error("Loan repayment needs the vendor name. Nothing was sent.");
      return `Loan - ${vendor}`;
    }
    default:
      throw new Error("This bill line has no QuickBooks account. Nothing was sent.");
  }
}

export function notBilledMessage(label: string): string {
  return `${label} is not billed to the customer. Remove it from the invoice before sending. Nothing was sent.`;
}

export function itemMissingMessage(rule: InvoiceRule): string {
  if (rule.category === "fuel_surcharge") {
    return `Fuel Surcharge is not in QuickBooks. Create a Fuel Surcharge item on income account "${FUEL_SURCHARGE_INCOME}" (not ${GROSS_TRUCKING_INCOME}), then send again. Nothing was sent.`;
  }
  return `Map pay item "${rule.itemName}" to a QuickBooks item in Accounting > QuickBooks > Map Pay Items, then send again.`;
}

export function itemAccountMismatch(itemName: string, currentAccount: string, expectedAccount: string, category: string): string {
  const current = currentAccount.trim() || "(no account)";
  if (category === "lumper") {
    return `QuickBooks item "Lumper" is on "${current}". The bookkeeper must repoint the Lumper item to the Lumper COGS account ("${expectedAccount}"). Nothing was sent.`;
  }
  if (category === "fuel_surcharge") {
    return `QuickBooks item "Fuel Surcharge" is on "${current}". It must be on its own income account "${expectedAccount}", not ${GROSS_TRUCKING_INCOME}. Nothing was sent.`;
  }
  return `QuickBooks item "${itemName}" is on "${current}". It must be on "${expectedAccount}". Nothing was sent.`;
}

export type ResolvedAccount = {
  id: string;
  fullyQualifiedName: string;
  accountType: string;
  classification: string;
};

/** Empty string when the account matches the rule. Otherwise the office message. */
export function accountProblem(rule: InvoiceRule, itemName: string, account: ResolvedAccount | undefined): string {
  const current = account?.fullyQualifiedName ?? "";
  if (!account || current !== rule.accountName) {
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  const income = account.accountType === "Income" || account.classification === "Revenue";
  const cogs = account.accountType === "Cost of Goods Sold";
  if ((rule.kind === "income" || rule.kind === "dedicated") && !income) {
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  if (rule.kind === "cogs" && !cogs) {
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  if (rule.kind === "dedicated" && current === GROSS_TRUCKING_INCOME) {
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  return "";
}

/** Names the live sandbox run looks up in company 5710. It does not create them. */
export function productionNamesForSandbox5710(): { items: string[]; accounts: string[] } {
  const items = [...new Set(Object.values(INVOICE_RULES).map((rule) => rule.itemName)), "Return"];
  const accounts = [
    GROSS_TRUCKING_INCOME,
    FUEL_SURCHARGE_INCOME,
    LUMPER_COGS_ACCOUNT,
    DEFAULT_LOAD_PAY_ACCOUNT,
    "Owner Operators:Fuel",
    "Driver Expenses:Toll",
    "Insurance:OCC",
    "Office and Admin Expense:Software",
    "Loan - Lumig Transports LLC",
    "Billable Expense Income",
    "Trailer Rentals",
    "Factoring Fee",
    "Sales",
    "Service/Fee Income",
    "Uncategorized Income",
    "Carrier Expense",
    "Owner Operators",
    "Owner Operators:Advances",
    "Owner Operators:Insurance COL",
    "Drivers Paid by RC",
  ];
  return { items, accounts };
}
