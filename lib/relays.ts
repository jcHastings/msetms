export type LoadRelay = {
  id: number;
  load_id: number;
  sequence: number;
  pickup: string;
  delivery: string;
  from_driver_id: number | null;
  driver_id: number | null;
  truck_id: number | null;
  trailer_id: number | null;
  oo_percent: number | null;
  oo_pay: number | null;
  from_leg_miles: number | null;
  to_leg_miles: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type LoadRelayView = LoadRelay & {
  from_driver_name: string | null;
  from_driver_type: string | null;
  driver_name: string | null;
  driver_type: string | null;
  truck_unit: string | null;
  trailer_unit: string | null;
};

export type RelayInput = {
  pickup?: string;
  delivery: string;
  from_driver_id?: number | null;
  driver_id?: number | null;
  truck_id?: number | null;
  trailer_id?: number | null;
  oo_percent?: number | null;
  oo_pay?: number | null;
  notes?: string;
};

export function formatRelayLane(pickup: string, delivery: string): string {
  return `${pickup.trim()} → ${delivery.trim()}`;
}

export function extraRelayCount(
  primaryDriverId: number | null | undefined,
  relays: Array<{ driver_id: number | null; from_driver_id?: number | null }>,
): number {
  const ids = new Set<number>();
  for (const relay of relays) {
    if (relay.driver_id != null) ids.add(relay.driver_id);
    if (relay.from_driver_id != null) ids.add(relay.from_driver_id);
  }
  if (primaryDriverId != null) ids.delete(primaryDriverId);
  return ids.size;
}

export function formatRelayHandoff(
  fromName: string | null | undefined,
  toName: string | null | undefined,
  city: string,
): string {
  return `${fromName?.trim() || "Unassigned"} → ${toName?.trim() || "Unassigned"} at ${city.trim()}`;
}

export function boardRelayLabel(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "+1 relay" : `+${count} relays`;
}

export function nextRelayDefaults(
  load: { origin: string; destination: string },
  relays: Array<{ pickup: string; delivery: string }>,
): { pickup: string; delivery: string } {
  if (relays.length === 0) {
    return { pickup: load.origin, delivery: "" };
  }
  return {
    pickup: relays[relays.length - 1]?.delivery || load.origin,
    delivery: load.destination,
  };
}

export function formatInternalRelayLines(relays: LoadRelayView[]): string {
  if (relays.length === 0) return "";
  return relays
    .map((relay, index) => {
      const pay =
        relay.oo_pay != null
          ? ` · internal ${relay.oo_pay.toLocaleString("en-US", { style: "currency", currency: "USD" })}`
          : relay.oo_percent != null
            ? ` · internal ${relay.oo_percent}%`
            : "";
      return `${index + 1}. ${formatRelayHandoff(relay.from_driver_name, relay.driver_name, relay.delivery || relay.pickup)}${pay}`;
    })
    .join("\n");
}
