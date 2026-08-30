import { LOAD_STATUSES } from "./types";
import { LOAD_TRUCK_STATUSES } from "./load-page-shared";

export type WorkflowLateKind = "pickup" | "delivery" | "either";

export type WorkflowSettings = {
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
  lateStopMinutes: number;
  lateStopLoadStatus: string;
  lateStopOnlyStatuses: string[];
};

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
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
  lateStopMinutes: 60,
  lateStopLoadStatus: "",
  lateStopOnlyStatuses: ["dispatched", "assigned", "in_transit"],
};

export const WORKFLOW_LOAD_STATUSES = LOAD_STATUSES.filter((status) => status !== "cancelled");
export const WORKFLOW_TRUCK_STATUSES = LOAD_TRUCK_STATUSES.filter((item) => item.value);

export function parseWorkflowSettings(raw: string | null | undefined): WorkflowSettings {
  const defaults = DEFAULT_WORKFLOW_SETTINGS;
  if (!raw?.trim()) return { ...defaults };
  try {
    const parsed = JSON.parse(raw) as Partial<WorkflowSettings>;
    const lateKind = parsed.lateStopKind;
    return {
      ...defaults,
      ...parsed,
      lateStopKind: lateKind === "pickup" || lateKind === "delivery" || lateKind === "either" ? lateKind : "either",
      lateStopMinutes: Number.isFinite(Number(parsed.lateStopMinutes)) ? Math.max(0, Number(parsed.lateStopMinutes)) : 60,
      lateStopOnlyStatuses: Array.isArray(parsed.lateStopOnlyStatuses)
        ? parsed.lateStopOnlyStatuses.map(String)
        : defaults.lateStopOnlyStatuses,
    };
  } catch {
    return { ...defaults };
  }
}
