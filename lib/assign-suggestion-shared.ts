/** Plain suggestion row for the Assign dialog. Ranking lives in assign-suggestions.ts. */

export type AssignSuggestion = {
  truckId: number;
  driverId: number | null;
  trailerId: number | null;
  unit: string;
  driverName: string;
  reason: string;
  /** False when the truck cannot be chosen in the dialog (out of service, maintenance, inactive). */
  selectable: boolean;
  /** True when this row is shown below free trucks (overlap, no driver, out of service). */
  caution: boolean;
};
