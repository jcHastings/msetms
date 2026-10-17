import { customLoadStatuses, isKnownLoadStatus } from "./settings";
import { LOAD_STATUSES, isLoadStatus, labelForLoadStatus } from "./types";

export type LoadStatusChoice = { value: string; label: string };

/** Statuses the load detail page offers (built-in list plus custom office statuses). */
export function loadStatusChoices(): LoadStatusChoice[] {
  const builtin = LOAD_STATUSES.map((value) => ({ value, label: labelForLoadStatus(value) }));
  try {
    const extras = customLoadStatuses().filter(
      (item) => item.value && !builtin.some((row) => row.value === item.value) && !isLoadStatus(item.value),
    );
    return [...builtin, ...extras];
  } catch {
    return builtin;
  }
}

/**
 * Next statuses a dispatcher can move to from the load detail page.
 * That page lists every known status. The current status is not a move.
 */
export function nextLoadStatuses(current: string): LoadStatusChoice[] {
  return loadStatusChoices().filter((item) => item.value !== current && isKnownLoadStatus(item.value));
}

/** Same acceptance rule as the load detail status save. Unknown or non-offered moves are rejected. */
export function assertLoadStatusTransition(current: string, next: string): void {
  if (!isKnownLoadStatus(next)) throw new Error("Invalid status.");
  if (!nextLoadStatuses(current).some((item) => item.value === next)) {
    throw new Error("That status change is not allowed.");
  }
}
