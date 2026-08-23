export const SETTINGS_SECTIONS = [
  {
    title: "Company Settings",
    items: [
      {
        href: "/settings/company",
        label: "Company contact",
        hint: "Name, phone, email, address, and logo for confirmations",
      },
      {
        href: "/settings/insurance",
        label: "Insurance coverage",
        hint: "Policy number and expiry",
      },
      {
        href: "/settings/lists",
        label: "Dropdown lists",
        hint: "Commodities, equipment types, and custom load statuses",
      },
      {
        href: "/settings/units",
        label: "Currency and units",
        hint: "USD and lb vs kg",
      },
      {
        href: "/settings/tax",
        label: "Tax",
        hint: "Sales tax or GST toggle and rate",
      },
      {
        href: "/settings/alerts",
        label: "Alerts",
        hint: "30/60 day compliance windows. Emails later.",
      },
      {
        href: "/settings/routing",
        label: "Default routing notes",
        hint: "Prefill special instructions on a new load",
      },
      {
        href: "/settings/pay",
        label: "Pay and margin",
        hint: "OO default %, carrier pay defaults, target gross margin",
      },
    ],
  },
  {
    title: "Report & Document Settings",
    items: [
      {
        href: "/settings/documents",
        label: "Document defaults",
        hint: "Header, footer, terms, and font size — not a full designer",
      },
    ],
  },
  {
    title: "Load Management",
    items: [
      {
        href: "/settings/loads",
        label: "Load numbers and sample data",
        hint: "Prefix, next number, and show sample loads",
      },
    ],
  },
  {
    title: "Users",
    items: [
      {
        href: "/settings/users",
        label: "Dispatchers and roles",
        hint: "Admin, dispatcher, read-only. Light permission groups.",
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        href: "/settings/integrations",
        label: "Samsara, ORBCOMM, QuickBooks, tracking",
        hint: "Connect status only. Credentials stay in .env.",
      },
    ],
  },
] as const;

export const DROPDOWN_KINDS = [
  { value: "commodity", label: "Commodities" },
  { value: "equipment", label: "Equipment types" },
  { value: "load_status", label: "Custom load statuses" },
] as const;

export type DropdownKind = (typeof DROPDOWN_KINDS)[number]["value"];

export const DOCUMENT_TYPES = [
  { value: "load_confirmation", label: "Load confirmation" },
  { value: "carrier_confirmation", label: "Carrier confirmation" },
  { value: "invoice", label: "Invoice" },
  { value: "customer_confirmation", label: "Customer confirmation" },
  { value: "bol", label: "BOL" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

export const DISPATCHER_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "read_only", label: "Read-only" },
] as const;

export const PERMISSION_GROUPS = [
  { value: "all", label: "All" },
  { value: "dispatch", label: "Dispatch" },
  { value: "billing", label: "Billing" },
  { value: "safety", label: "Safety" },
] as const;

export const CURRENCIES = ["USD", "CAD"] as const;
export const WEIGHT_UNITS = [
  { value: "lb", label: "Pounds (lb)" },
  { value: "kg", label: "Kilograms (kg)" },
] as const;
export const TAX_KINDS = [
  { value: "sales_tax", label: "Sales tax" },
  { value: "gst", label: "GST" },
] as const;
export const PAY_METHODS = [
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH" },
  { value: "other", label: "Other" },
] as const;

export type DispatcherUser = {
  id: number;
  name: string;
  pin: string;
  role: string;
  email: string;
  active: number;
  permission_group: string;
};

export function roleLabel(role: string): string {
  return DISPATCHER_ROLES.find((item) => item.value === role)?.label ?? role;
}

export function permissionGroupLabel(value: string): string {
  return PERMISSION_GROUPS.find((item) => item.value === value)?.label ?? value;
}

export function isAdminRole(role: string): boolean {
  return role === "admin" || role === "manager";
}

export function canEditSettings(role: string): boolean {
  return role !== "read_only";
}

export function canManageUsers(role: string): boolean {
  return isAdminRole(role);
}

export type ComplianceWindows = {
  driverDays: number;
  registrationDays: number;
  dotDays: number;
};

export const DEFAULT_COMPLIANCE_WINDOWS: ComplianceWindows = {
  driverDays: 30,
  registrationDays: 60,
  dotDays: 30,
};
