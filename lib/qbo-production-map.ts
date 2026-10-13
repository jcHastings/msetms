/**
 * Production QuickBooks mapping for MS Express's own company.
 * Names are resolved from the connected company. Nothing here creates a customer, vendor, account, or item.
 * A driver's QuickBooks class may be created when class auto-create is on.
 */

export const GROSS_TRUCKING_INCOME = "Gross Trucking Income";
export const LINE_HAUL_ITEM = "Line Haul";
export const LUMPER_COGS_ACCOUNT = "Lumper";
export const DEFAULT_LOAD_PAY_ACCOUNT = "Owner Operators:Owner Operators COL";

/** Washout stays unposted while the QuickBooks item sits on a cost account. */
export const WASHOUT_COST_ACCOUNT_MESSAGE =
  "Trailer Washout is mapped to a cost account in QuickBooks. Ask the bookkeeper to point the item to Gross Trucking Income, then resend. Nothing was sent.";

/** Trim, collapse internal whitespace, and compare without case. */
export function normalizeMatchName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function customerUnmatchedMessage(customerName: string): string {
  const name = customerName.trim().replace(/\s+/g, " ") || "this customer";
  return `No QuickBooks customer matches "${name}". Pick an existing customer in Accounting → QuickBooks → Map Customers, or create "${name}" in QuickBooks yourself, then send again. Nothing was sent.`;
}

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
  kind: "income" | "cogs";
};

/** Categories that must not appear on a customer invoice. */
export const NOT_BILLED_ON_INVOICE: Record<string, string> = {
  trailer_rental: "Trailer Rental",
  fuel_advance_fee: "Fuel Advance Fee",
  claim_for_damages: "Claim for Damages",
};

export const INVOICE_RULES: Record<string, InvoiceRule> = {
  flat_rate: { category: "flat_rate", itemName: LINE_HAUL_ITEM, accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  // Default. QBO_DETENTION_INCOME_ACCOUNT can switch this to the Detention item on an income account.
  detention: { category: "detention", itemName: LINE_HAUL_ITEM, accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  extra_stop: { category: "extra_stop", itemName: "Picks and Drops", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  layover: { category: "layover", itemName: LINE_HAUL_ITEM, accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  tonu: { category: "tonu", itemName: LINE_HAUL_ITEM, accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  washout: { category: "washout", itemName: "Trailer Washout", accountName: GROSS_TRUCKING_INCOME, kind: "income" },
  fuel_surcharge: {
    category: "fuel_surcharge",
    itemName: LINE_HAUL_ITEM,
    accountName: GROSS_TRUCKING_INCOME,
    kind: "income",
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
  return `Map pay item "${rule.itemName}" to a QuickBooks item in Accounting > QuickBooks > Map Pay Items, then send again.`;
}

/** Block any post to an account whose name contains these words. Case-insensitive. */
export function forbiddenAccountMessage(accountName: string): string {
  const name = accountName.trim();
  if (!name) return "";
  const folded = name.toLowerCase();
  if (folded.includes("uncategorized")) {
    return `QuickBooks account "${name}" cannot be used because its name contains "uncategorized". Nothing was sent.`;
  }
  if (folded.includes("miscellaneous")) {
    return `QuickBooks account "${name}" cannot be used because its name contains "miscellaneous". Nothing was sent.`;
  }
  return "";
}

export function itemAccountMismatch(itemName: string, currentAccount: string, expectedAccount: string, category: string): string {
  const current = currentAccount.trim() || "(no account)";
  if (category === "lumper") {
    return `QuickBooks item "Lumper" is on "${current}". The bookkeeper must repoint the Lumper item to the Lumper COGS account ("${expectedAccount}"). Nothing was sent.`;
  }
  if (category === "detention") {
    return `QuickBooks item "${itemName}" is on "${current}". It must be on "${expectedAccount}". Nothing was sent.`;
  }
  return `QuickBooks item "${itemName}" is on "${current}". It must be on "${expectedAccount}". Nothing was sent.`;
}

export type ResolvedAccount = {
  id: string;
  fullyQualifiedName: string;
  accountType: string;
  classification: string;
};

function isIncomeAccount(account: ResolvedAccount | undefined): boolean {
  if (!account) return false;
  return account.accountType === "Income" || account.classification === "Revenue";
}

/** Empty string when the account matches the rule. Otherwise the office message. */
export function accountProblem(rule: InvoiceRule, itemName: string, account: ResolvedAccount | undefined): string {
  const current = account?.fullyQualifiedName ?? "";
  const forbidden = forbiddenAccountMessage(current) || forbiddenAccountMessage(rule.accountName);
  if (forbidden) return forbidden;
  if (rule.category === "washout") {
    if (isIncomeAccount(account) && current === rule.accountName) return "";
    if (!isIncomeAccount(account)) return WASHOUT_COST_ACCOUNT_MESSAGE;
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  if (rule.category === "detention" && account && !isIncomeAccount(account)) {
    return `Detention cannot post to "${current}" because that account is not income. Nothing was sent.`;
  }
  if (!account || current !== rule.accountName) {
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  const cogs = account.accountType === "Cost of Goods Sold";
  if (rule.kind === "income" && !isIncomeAccount(account)) {
    if (rule.category === "detention") {
      return `Detention cannot post to "${current}" because that account is not income. Nothing was sent.`;
    }
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  if (rule.kind === "cogs" && !cogs) {
    return itemAccountMismatch(itemName, current, rule.accountName, rule.category);
  }
  return "";
}

/** Names the live sandbox run looks up in company 5710. It does not create them. */
export function productionNamesForSandbox5710(): { items: string[]; accounts: string[] } {
  const items = [...new Set(Object.values(INVOICE_RULES).map((rule) => rule.itemName)), "Return"];
  const accounts = [
    GROSS_TRUCKING_INCOME,
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
