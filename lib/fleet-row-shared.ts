/** Client-safe fleet list row copy. No db, env, settings, or places. */

export type FleetRowKind = "truck" | "driver" | "trailer";

export const FLEET_ASSIGNED_DELETE_MESSAGE: Record<FleetRowKind, string> = {
  truck: "Unassign this truck from the load first, or mark it Inactive.",
  driver: "Unassign this driver from the load first, or mark it Inactive.",
  trailer: "Unassign this trailer from the load first, or mark it Inactive.",
};

export const FLEET_ASSIGNED_DELETE_HINT = "Assigned to a load. Unassign first, or mark Inactive.";

export function fleetRowNoun(kind: FleetRowKind): string {
  return kind;
}
