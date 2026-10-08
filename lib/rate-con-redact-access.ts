import { driverAssignedToLoad } from "./relay-store";
import { getLoad } from "./queries";
import {
  getRateConRedaction,
  isDriverVisibleRedaction,
  type RateConRedaction,
} from "./rate-con-redact-store";

export type RedactionAccess =
  | { ok: true; row: RateConRedaction }
  | { ok: false; status: 403 | 404 };

/**
 * Office can view any stored driver copy. Drivers only get a released or
 * ready copy for a load assigned to them. Everyone else gets 404, including
 * an unreleased copy, so the original amounts stay office-only.
 */
export function decideRedactionAccess(input: {
  redactionId: number;
  office: boolean;
  driverId: number | null;
}): RedactionAccess {
  const row = getRateConRedaction(input.redactionId);
  if (!row || !row.stored_name) return { ok: false, status: 404 };
  if (input.office) return { ok: true, row };
  if (!input.driverId) return { ok: false, status: 404 };
  const load = getLoad(row.load_id);
  if (!load || !driverAssignedToLoad(load.id, input.driverId, load.driver_id)) {
    return { ok: false, status: 403 };
  }
  if (!isDriverVisibleRedaction(row.status)) return { ok: false, status: 404 };
  return { ok: true, row };
}
