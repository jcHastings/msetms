export type DriverLegView = {
  lane: string;
  swapPoint: string;
  swapAt: string;
  trailer: string;
  truck: string;
  role: "pickup" | "delivery";
};

export function driverSwapLegView(input: {
  driverId: number;
  origin: string;
  destination: string;
  trailerNumber: string;
  truckUnit: string;
  relay: {
    swap_id?: number | null;
    from_driver_id?: number | null;
    driver_id?: number | null;
    delivery?: string | null;
    relay_address?: string | null;
    completed_at?: string | null;
    from_trailer_unit?: string | null;
    trailer_unit?: string | null;
    from_truck_unit?: string | null;
    truck_unit?: string | null;
  } | null;
}): DriverLegView | null {
  const relay = input.relay;
  if (!relay?.swap_id) return null;
  const swapPoint = String(relay.relay_address || relay.delivery || "").trim();
  const swapAt = String(relay.completed_at || "").trim();
  const origin = input.origin.trim();
  const destination = input.destination.trim();
  if (relay.from_driver_id === input.driverId) {
    const trailer = String(relay.from_trailer_unit || input.trailerNumber || "").trim();
    const truck = String(relay.from_truck_unit || "").trim();
    return {
      role: "pickup",
      lane: [origin, swapPoint].filter(Boolean).join(" → "),
      swapPoint,
      swapAt,
      trailer,
      truck,
    };
  }
  if (relay.driver_id === input.driverId) {
    const trailer = String(relay.trailer_unit || input.trailerNumber || "").trim();
    const truck = String(relay.truck_unit || input.truckUnit || "").trim();
    return {
      role: "delivery",
      lane: [swapPoint, destination].filter(Boolean).join(" → "),
      swapPoint,
      swapAt,
      trailer,
      truck,
    };
  }
  return null;
}
