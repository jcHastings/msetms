/** Client-safe Automated Alerting catalog. Trucking compliance dates only. */

export const ALERT_TRIGGER_GROUPS = ["Drivers", "Power Units", "Trailers"] as const;
export type AlertTriggerGroup = (typeof ALERT_TRIGGER_GROUPS)[number];

export type AlertTriggerKey =
  | "driver_license"
  | "driver_insurance"
  | "driver_medical"
  | "driver_drug_test"
  | "truck_registration"
  | "truck_dot"
  | "trailer_registration"
  | "trailer_dot";

export type AlertTrigger = {
  key: AlertTriggerKey;
  group: AlertTriggerGroup;
  label: string;
  watching: string;
  actions: string;
};

export const ALERT_TRIGGERS: readonly AlertTrigger[] = [
  {
    key: "driver_license",
    group: "Drivers",
    label: "Driver: License Expiration Dates",
    watching: "Driver license",
    actions: "Notify office users",
  },
  {
    key: "driver_insurance",
    group: "Drivers",
    label: "Driver: Insurance Expiration Dates",
    watching: "Company insurance",
    actions: "Notify office users",
  },
  {
    key: "driver_medical",
    group: "Drivers",
    label: "Driver: DOT Medical Card Expiration Dates",
    watching: "DOT medical card",
    actions: "Notify office users",
  },
  {
    key: "driver_drug_test",
    group: "Drivers",
    label: "Driver: Last Drug Test Dates",
    watching: "Last drug test / next due",
    actions: "Notify office users",
  },
  {
    key: "truck_registration",
    group: "Power Units",
    label: "Power Unit: Registration Expiration",
    watching: "Truck registration",
    actions: "Notify office users",
  },
  {
    key: "truck_dot",
    group: "Power Units",
    label: "Power Unit: DOT / Inspection Expiration",
    watching: "Truck DOT inspection",
    actions: "Notify office users",
  },
  {
    key: "trailer_registration",
    group: "Trailers",
    label: "Trailer: Registration Expiration",
    watching: "Trailer registration",
    actions: "Notify office users",
  },
  {
    key: "trailer_dot",
    group: "Trailers",
    label: "Trailer: DOT / Inspection Expiration",
    watching: "Trailer DOT inspection",
    actions: "Notify office users",
  },
] as const;

export type AlertRuleRecord = {
  id: number;
  name: string;
  trigger_key: AlertTriggerKey;
  recipient_ids: number[];
  message: string;
  created_at: string;
  updated_at: string;
};

export type OfficeNotification = {
  id: number;
  dispatcher_id: number;
  rule_id: number | null;
  title: string;
  body: string;
  href: string;
  read_at: string;
  created_at: string;
};

export function alertTriggerByKey(key: string): AlertTrigger | undefined {
  return ALERT_TRIGGERS.find((item) => item.key === key);
}

export function isAlertTriggerKey(value: string): value is AlertTriggerKey {
  return ALERT_TRIGGERS.some((item) => item.key === value);
}

export function groupedAlertTriggers(): Array<{ group: AlertTriggerGroup; items: AlertTrigger[] }> {
  return ALERT_TRIGGER_GROUPS.map((group) => ({
    group,
    items: ALERT_TRIGGERS.filter((item) => item.group === group),
  })).filter((row) => row.items.length > 0);
}

export function parseRecipientIds(raw: string | number[] | null | undefined): number[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  }
  const text = String(raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parseRecipientIds(parsed as number[]);
  } catch {
    return text
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }
}

export function alertActionsLabel(recipientNames: string[]): string {
  if (recipientNames.length === 0) return "No recipients";
  if (recipientNames.length <= 3) return `Notify ${recipientNames.join(", ")}`;
  return `Notify ${recipientNames.length} users`;
}
