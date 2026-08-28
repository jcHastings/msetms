export type LoadStopKind = "pickup" | "delivery";

export type LoadStop = {
  id: number;
  load_id: number;
  sequence: number;
  kind: LoadStopKind;
  location_id: number | null;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  window_start: string;
  window_end: string;
  confirmation: string;
  cargo: string;
  reference: string;
  instructions: string;
  notes: string;
  arrived_at: string;
  departed_at: string;
  delivered: number;
  schedule_type: string;
};

export type StopInput = {
  kind: LoadStopKind;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  phone?: string;
  window_start?: string;
  window_end?: string;
  confirmation?: string;
  cargo?: string;
  reference?: string;
  instructions?: string;
  notes?: string;
  location_id?: number | null;
  arrived_at?: string;
  departed_at?: string;
  delivered?: number;
  schedule_type?: string;
};

export function stopDeliveredFlag(value: unknown): number {
  const flag = Number(value);
  return flag === 1 || flag === 2 ? flag : 0;
}

export function stopIsDelivered(stop: {
  delivered?: number | boolean | null;
  arrived_at?: string | null;
  departed_at?: string | null;
}): boolean {
  const flag = stopDeliveredFlag(stop.delivered);
  if (flag === 2) return false;
  if (flag === 1 || stop.delivered === true) return true;
  if (String(stop.arrived_at ?? "").trim()) return true;
  if (String(stop.departed_at ?? "").trim()) return true;
  return false;
}

export function stopTypeNumber(
  stops: Array<{ id: number; kind: string }>,
  stopId: number,
): number {
  const match = stops.find((stop) => stop.id === stopId);
  if (!match) return 0;
  let count = 0;
  for (const stop of stops) {
    if (stop.kind !== match.kind) continue;
    count += 1;
    if (stop.id === stopId) return count;
  }
  return 0;
}

export function stopTypeLabel(kind: string, typeNumber: number): string {
  const name = kind === "delivery" ? "Delivery" : "Pickup";
  return `${name} ${typeNumber > 0 ? typeNumber : 1}`;
}
