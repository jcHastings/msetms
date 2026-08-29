import type { LoadStop } from "./stops";

export type DriverStopActionKind = "arrive" | "depart";

export type DriverStopButton = {
  stopId: number;
  kind: DriverStopActionKind;
  label: string;
  stopLabel: string;
  enabled: boolean;
};

export function orderedDriverStops(stops: LoadStop[]): { pickup: LoadStop | null; delivery: LoadStop | null } {
  const pickup = stops.find((stop) => stop.kind === "pickup") ?? null;
  const delivery = stops.find((stop) => stop.kind === "delivery") ?? null;
  return { pickup, delivery };
}

export function driverStopButtons(stops: LoadStop[]): DriverStopButton[] {
  const { pickup, delivery } = orderedDriverStops(stops);
  const pickupOut = Boolean(pickup?.departed_at?.trim());
  const buttons: DriverStopButton[] = [];
  if (pickup) {
    const arrived = Boolean(pickup.arrived_at?.trim());
    const departed = Boolean(pickup.departed_at?.trim());
    buttons.push({
      stopId: pickup.id,
      kind: "arrive",
      label: "Check In",
      stopLabel: "Pickup",
      enabled: !arrived,
    });
    buttons.push({
      stopId: pickup.id,
      kind: "depart",
      label: "Check Out",
      stopLabel: "Pickup",
      enabled: arrived && !departed,
    });
  }
  if (delivery) {
    const arrived = Boolean(delivery.arrived_at?.trim());
    const departed = Boolean(delivery.departed_at?.trim());
    buttons.push({
      stopId: delivery.id,
      kind: "arrive",
      label: "Check In",
      stopLabel: "Delivery",
      enabled: pickupOut && !arrived,
    });
    buttons.push({
      stopId: delivery.id,
      kind: "depart",
      label: "Check Out",
      stopLabel: "Delivery",
      enabled: arrived && !departed,
    });
  }
  return buttons;
}

export function progressForStopEvent(kind: DriverStopActionKind, stopKind: "pickup" | "delivery"): "en_route_pickup" | "loaded" | "en_route_delivery" | "delivered" {
  if (stopKind === "pickup") return kind === "arrive" ? "en_route_pickup" : "loaded";
  return kind === "arrive" ? "en_route_delivery" : "delivered";
}
