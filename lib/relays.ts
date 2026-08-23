export type LoadRelay = {
  id: number;
  load_id: number;
  sequence: number;
  pickup: string;
  delivery: string;
  driver_id: number | null;
  truck_id: number | null;
  trailer_id: number | null;
  oo_percent: number | null;
  oo_pay: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type LoadRelayView = LoadRelay & {
  driver_name: string | null;
  driver_type: string | null;
  truck_unit: string | null;
  trailer_unit: string | null;
};

export type RelayInput = {
  pickup: string;
  delivery: string;
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
  relays: Array<{ driver_id: number | null }>,
): number {
  return new Set(
    relays
      .map((relay) => relay.driver_id)
      .filter((id): id is number => id != null && id !== primaryDriverId),
  ).size;
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
      return `${index + 1}. ${relay.driver_name || "Unassigned"} · ${formatRelayLane(relay.pickup, relay.delivery)}${pay}`;
    })
    .join("\n");
}
