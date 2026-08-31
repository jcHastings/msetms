export const SETTINGS_SECTIONS = [
  {
    title: "Company Settings",
    items: [
      {
        href: "/settings/company",
        label: "Company contact",
        hint: "Name, phone, email, address, and logo",
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
        label: "Automated Alerting",
        hint: "Rules on driver and unit expiry dates",
      },
      {
        href: "/settings/workflow",
        label: "Automated Workflow",
        hint: "If-this-then-that: assign blocks, arrive/depart, late stops",
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
        hint: "Driver confirmation, invoice, customer confirmation, BOL",
      },
    ],
  },
  {
    title: "Load Management",
    items: [
      {
        href: "/settings/loads",
        label: "Load numbers and sample data",
        hint: "Prefix and next number",
      },
    ],
  },
  {
    title: "Users",
    items: [
      {
        href: "/users",
        label: "Users",
        hint: "Administrators, Standard dispatchers, and Accounting",
      },
      {
        href: "/settings/security",
        label: "2-step verification",
        hint: "Email sign-in code after password, when the user has an email",
      },
      {
        href: "/settings/sign-in",
        label: "Sign-in log",
        hint: "Successful and failed sign-ins, with time and IP",
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        href: "/settings/quickbooks",
        label: "QuickBooks Online",
        hint: "Connect QuickBooks",
      },
      {
        href: "/settings/integrations",
        label: "Samsara, Orbcomm, QuickBooks, tracking",
        hint: "Samsara, Orbcomm, and QuickBooks",
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
  { value: "admin", label: "Administrator" },
  { value: "accounting", label: "Accounting" },
  { value: "dispatcher", label: "Standard" },
  { value: "manager", label: "Administrator" },
  { value: "read_only", label: "Read-only" },
] as const;

/** Roles JC picks on Users. Legacy manager/read_only stay valid on existing rows. */
export const ASSIGNABLE_DISPATCHER_ROLES = [
  { value: "admin", label: "Administrator" },
  { value: "dispatcher", label: "Standard" },
  { value: "accounting", label: "Accounting" },
] as const;

export const DISPATCHER_ROLE_HINTS: Record<string, string> = {
  admin: "Everything: users, settings, 2-step reset, accounting, dispatch, fleet, and reports.",
  manager: "Everything: users, settings, 2-step reset, accounting, dispatch, fleet, and reports.",
  dispatcher:
    "Dispatch board: loads, locations, fleet, fuel, check-calls, and documents. No accounting, settings, or CSV admin exports.",
  accounting:
    "Financial dashboard, load financials, invoices/QBO, driver pay, locations, and load create/update/cancel. Not Settings or user admin.",
  read_only: "View only. Kept for existing accounts.",
};

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
  role: string;
  email: string;
  phone: string;
  active: number;
  permission_group: string;
  totp_enrolled: number;
  has_password: number;
  must_change_password: number;
};

export type PublicDispatcher = {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  active: number;
  permission_group: string;
  totp_enrolled: boolean;
  has_password: boolean;
  must_change_password: boolean;
};

export function toPublicDispatcher(
  user: Pick<
    DispatcherUser,
    | "id"
    | "name"
    | "role"
    | "email"
    | "phone"
    | "active"
    | "permission_group"
    | "totp_enrolled"
    | "has_password"
    | "must_change_password"
  >,
): PublicDispatcher {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    phone: user.phone ?? "",
    active: user.active,
    permission_group: user.permission_group,
    totp_enrolled: Boolean(user.totp_enrolled),
    has_password: Boolean(user.has_password),
    must_change_password: Boolean(user.must_change_password),
  };
}

export function roleLabel(role: string): string {
  if (role === "admin" || role === "manager") return "Administrator";
  if (role === "dispatcher") return "Standard";
  if (role === "accounting") return "Accounting";
  return DISPATCHER_ROLES.find((item) => item.value === role)?.label ?? role;
}

export function formRoleValue(role?: string): string {
  if (!role) return "dispatcher";
  if (role === "manager") return "admin";
  return role;
}

export function selectableDispatcherRoles(currentRole?: string): Array<{ value: string; label: string }> {
  const roles: Array<{ value: string; label: string }> = [...ASSIGNABLE_DISPATCHER_ROLES];
  if (currentRole === "read_only") {
    roles.push({ value: "read_only", label: "Read-only" });
  }
  return roles;
}

export function defaultPermissionGroupForRole(role: string): string {
  if (role === "admin" || role === "manager") return "all";
  if (role === "accounting") return "billing";
  return "dispatch";
}

export function permissionGroupLabel(value: string): string {
  return PERMISSION_GROUPS.find((item) => item.value === value)?.label ?? value;
}

export function isAdminRole(role: string): boolean {
  return role === "admin" || role === "manager";
}

export function isAccountingRole(role: string): boolean {
  return role === "accounting";
}

export function isStandardRole(role: string): boolean {
  return role === "dispatcher";
}

export function accessRole(role: string): "admin" | "accounting" | "standard" | "read_only" {
  if (isAdminRole(role)) return "admin";
  if (isAccountingRole(role)) return "accounting";
  if (role === "read_only") return "read_only";
  return "standard";
}

export function canWriteDesk(role: string): boolean {
  const access = accessRole(role);
  return access === "admin" || access === "accounting" || access === "standard";
}

export function canEditSettings(role: string): boolean {
  return isAdminRole(role);
}

export function canManageUsers(role: string): boolean {
  return isAdminRole(role);
}

export function canDeleteDispatcherUser(input: {
  targetId: number;
  targetRole: string;
  targetActive: boolean | number;
  actorId?: number | null;
  otherActiveAdmins: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.actorId != null && input.actorId === input.targetId) {
    return { ok: false, reason: "You cannot delete your own login." };
  }
  if (input.targetActive && isAdminRole(input.targetRole) && input.otherActiveAdmins < 1) {
    return { ok: false, reason: "Keep at least one active Administrator." };
  }
  return { ok: true };
}

export function canAccessAccounting(role: string): boolean {
  return isAdminRole(role) || isAccountingRole(role);
}

export function canConnectQuickbooks(role: string): boolean {
  return isAdminRole(role);
}

export function canEditLoads(role: string): boolean {
  return canWriteDesk(role);
}

export function canViewLoadFinancials(role: string): boolean {
  return canEditLoads(role);
}

export function canAssignLoads(role: string): boolean {
  return isAdminRole(role) || isStandardRole(role);
}

export function canEditLocations(role: string): boolean {
  return canWriteDesk(role);
}

export function canImportLocations(role: string): boolean {
  return isAdminRole(role);
}

export function canDeleteLocations(role: string): boolean {
  return isAdminRole(role) || isStandardRole(role);
}

export function canEditFleet(role: string): boolean {
  return isAdminRole(role) || isStandardRole(role);
}

/** Administrator and Standard can delete fleet. Accounting cannot. */
export function canDeleteFleet(role: string): boolean {
  return canEditFleet(role);
}

export function canUploadFuel(role: string): boolean {
  return isAdminRole(role) || isStandardRole(role);
}

export function canViewIfta(role: string): boolean {
  return canAccessAccounting(role);
}

export function canViewAudit(role: string): boolean {
  return canAccessAccounting(role);
}

export function canExportCsv(role: string): boolean {
  return isAdminRole(role);
}

export function canViewReports(role: string): boolean {
  return isAdminRole(role);
}

export function canDeleteDocuments(role: string): boolean {
  return isAdminRole(role);
}

export function canSendSms(role: string): boolean {
  return isAdminRole(role) || isStandardRole(role);
}

export function canEmailInvoice(role: string): boolean {
  return canEditLoads(role);
}

export function canLogCheckCall(role: string): boolean {
  return isAdminRole(role) || isStandardRole(role);
}

export function canSeeNavHref(role: string, href: string): boolean {
  if (href === "/driver/login") return true;
  if (href === "/" || href === "/board" || href === "/search") return true;
  if (href === "/loads/new" || href === "/loads/templates" || href === "/loads/import-sheet") {
    return canEditLoads(role);
  }
  if (href === "/locations") return canEditLocations(role) || accessRole(role) === "read_only";
  if (href === "/audit") return canViewAudit(role);
  if (href === "/settings/sign-in") return canManageUsers(role);
  if (href === "/fleet" || href.startsWith("/fleet/") || href === "/compliance" || href === "/safety") {
    return canEditFleet(role);
  }
  if (href === "/fuel") return canUploadFuel(role);
  if (href === "/ifta") return canUploadFuel(role) || canViewIfta(role);
  if (href === "/customers") return canWriteDesk(role) || accessRole(role) === "read_only";
  if (href === "/accounting" || href.startsWith("/accounting/")) return canAccessAccounting(role);
  if (href === "/users") return canManageUsers(role);
  if (href === "/claims") return canWriteDesk(role);
  if (href === "/reports" || href.startsWith("/reports/")) return canViewReports(role);
  if (href === "/settings" || href.startsWith("/settings/")) return canEditSettings(role) || href === "/settings/security";
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
