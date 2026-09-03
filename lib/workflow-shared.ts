import { LOAD_STATUSES } from "./types";
import { LOAD_TRUCK_STATUSES } from "./load-page-shared";

export type WorkflowLateKind = "pickup" | "delivery" | "either";
export type WorkflowLateMode = "same_day" | "specified";
export type WorkflowDurationUnit = "minutes" | "hours";
export type WorkflowDocumentTrigger = "invoice_sent" | "docs_requested";

export type WorkflowSettings = {
  autoAssignDispatcherOnCreate: boolean;
  blockAssignExpiredDriver: boolean;
  blockAssignExpiredTruck: boolean;
  blockAssignExpiredTrailer: boolean;
  arrivePickupLoadStatus: string;
  arrivePickupTruckStatus: string;
  departPickupLoadStatus: string;
  departPickupTruckStatus: string;
  arriveDeliveryLoadStatus: string;
  arriveDeliveryTruckStatus: string;
  driverAssignLoadStatus: string;
  driverAssignTruckStatus: string;
  lateStopKind: WorkflowLateKind;
  lateStopMode: WorkflowLateMode;
  lateStopMinutes: number;
  lateStopUnit: WorkflowDurationUnit;
  lateStopLoadStatus: string;
  lateStopOnlyStatuses: string[];
  invoiceSentLoadStatus: string;
  invoiceSentTruckStatus: string;
  docsRequestedLoadStatus: string;
  docsRequestedTruckStatus: string;
  noActivityMinutes: number;
  noActivityUnit: WorkflowDurationUnit;
  noActivityLoadStatus: string;
  noActivityOnlyStatuses: string[];
};

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  autoAssignDispatcherOnCreate: true,
  blockAssignExpiredDriver: false,
  blockAssignExpiredTruck: false,
  blockAssignExpiredTrailer: false,
  arrivePickupLoadStatus: "at_pickup",
  arrivePickupTruckStatus: "",
  departPickupLoadStatus: "in_transit",
  departPickupTruckStatus: "",
  arriveDeliveryLoadStatus: "at_delivery",
  arriveDeliveryTruckStatus: "",
  driverAssignLoadStatus: "",
  driverAssignTruckStatus: "",
  lateStopKind: "either",
  lateStopMode: "specified",
  lateStopMinutes: 60,
  lateStopUnit: "minutes",
  lateStopLoadStatus: "",
  lateStopOnlyStatuses: ["dispatched", "assigned", "in_transit"],
  invoiceSentLoadStatus: "",
  invoiceSentTruckStatus: "",
  docsRequestedLoadStatus: "",
  docsRequestedTruckStatus: "",
  noActivityMinutes: 0,
  noActivityUnit: "hours",
  noActivityLoadStatus: "",
  noActivityOnlyStatuses: ["dispatched", "assigned", "in_transit", "at_pickup"],
};

export const WORKFLOW_CARDS = [
  "user_assign",
  "blocks",
  "arrive_depart",
  "driver_assign",
  "late",
  "documents",
  "no_activity",
] as const;

export type WorkflowCard = (typeof WORKFLOW_CARDS)[number];

export const WORKFLOW_LOAD_STATUSES = LOAD_STATUSES.filter((status) => status !== "cancelled");
export const WORKFLOW_TRUCK_STATUSES = LOAD_TRUCK_STATUSES.filter((item) => item.value);

function asLateKind(value: unknown): WorkflowLateKind {
  return value === "pickup" || value === "delivery" || value === "either" ? value : "either";
}

function asLateMode(value: unknown): WorkflowLateMode {
  return value === "same_day" ? "same_day" : "specified";
}

function asDurationUnit(value: unknown, fallback: WorkflowDurationUnit): WorkflowDurationUnit {
  return value === "hours" || value === "minutes" ? value : fallback;
}

function asMinutes(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function asStatuses(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.map(String) : fallback;
}

export function parseWorkflowSettings(raw: string | null | undefined): WorkflowSettings {
  const defaults = DEFAULT_WORKFLOW_SETTINGS;
  if (!raw?.trim()) return { ...defaults };
  try {
    const parsed = JSON.parse(raw) as Partial<WorkflowSettings>;
    return {
      ...defaults,
      ...parsed,
      autoAssignDispatcherOnCreate:
        parsed.autoAssignDispatcherOnCreate === undefined
          ? defaults.autoAssignDispatcherOnCreate
          : Boolean(parsed.autoAssignDispatcherOnCreate),
      blockAssignExpiredDriver: Boolean(parsed.blockAssignExpiredDriver),
      blockAssignExpiredTruck: Boolean(parsed.blockAssignExpiredTruck),
      blockAssignExpiredTrailer: Boolean(parsed.blockAssignExpiredTrailer),
      lateStopKind: asLateKind(parsed.lateStopKind),
      lateStopMode: asLateMode(parsed.lateStopMode),
      lateStopMinutes: asMinutes(parsed.lateStopMinutes, defaults.lateStopMinutes),
      lateStopUnit: asDurationUnit(parsed.lateStopUnit, defaults.lateStopUnit),
      lateStopOnlyStatuses: asStatuses(parsed.lateStopOnlyStatuses, defaults.lateStopOnlyStatuses),
      noActivityMinutes: asMinutes(parsed.noActivityMinutes, defaults.noActivityMinutes),
      noActivityUnit: asDurationUnit(parsed.noActivityUnit, defaults.noActivityUnit),
      noActivityOnlyStatuses: asStatuses(parsed.noActivityOnlyStatuses, defaults.noActivityOnlyStatuses),
    };
  } catch {
    return { ...defaults };
  }
}

export function displayDurationAmount(minutes: number, unit: WorkflowDurationUnit): number {
  if (unit === "hours") return Math.max(0, Math.round(minutes / 60));
  return Math.max(0, minutes);
}

export function minutesFromAmount(amount: number, unit: WorkflowDurationUnit): number {
  const safe = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  return unit === "hours" ? safe * 60 : safe;
}
