/** Client-safe location rules. Appointment required + Call before only. No liftgate. */

export type LocationRuleSource = {
  scheduling_type?: string | null;
  call_before?: number | boolean | null;
};

export function locationAppointmentRequired(location: LocationRuleSource | null | undefined): boolean {
  return location?.scheduling_type === "appointment";
}

export function locationCallBefore(location: LocationRuleSource | null | undefined): boolean {
  return Boolean(location?.call_before);
}

export function locationRuleLabels(location: LocationRuleSource | null | undefined): string[] {
  const labels: string[] = [];
  if (locationAppointmentRequired(location)) labels.push("Appointment required");
  if (locationCallBefore(location)) labels.push("Call before pickup/delivery");
  return labels;
}
