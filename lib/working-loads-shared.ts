/** Client-safe archive rule. No db, env, or secrets. */

export const DEFAULT_WORKING_WINDOW_DAYS = 45;
export const ALL_LOADS_PAGE_SIZE = 50;
export const RESULT_CACHE_MS = 60_000;

/** Empty-state copy for search and All Loads. */
export const ARCHIVED_EMPTY_HINT = "Older loads are archived. Include archived";

export function workingWindowDaysFrom(raw: string | undefined): number {
  const text = String(raw ?? "").trim();
  const days = Number(text);
  if (!text || !Number.isFinite(days) || days < 1 || days > 3650) return DEFAULT_WORKING_WINDOW_DAYS;
  return Math.floor(days);
}

export function archiveCutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function loadActivityIso(load: {
  delivery_end?: string | null;
  delivery_start?: string | null;
  pickup_end?: string | null;
  pickup_start?: string | null;
}): string {
  return (
    String(load.delivery_end ?? "").trim() ||
    String(load.delivery_start ?? "").trim() ||
    String(load.pickup_end ?? "").trim() ||
    String(load.pickup_start ?? "").trim()
  );
}

/**
 * Delivered or completed before the cutoff. Derived from dates already on the load.
 * Nothing is written and nothing is deleted.
 */
export function isArchivedLoad(
  load: {
    status: string;
    delivery_end?: string | null;
    delivery_start?: string | null;
    pickup_end?: string | null;
    pickup_start?: string | null;
  },
  cutoffIso: string,
): boolean {
  if (load.status !== "delivered" && load.status !== "completed") return false;
  const when = loadActivityIso(load);
  if (!when) return true;
  return when < cutoffIso;
}
