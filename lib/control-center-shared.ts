/** Client-safe Control Center types and filters. No env, db, or API keys. */

export type ControlCenterKind = "load" | "trailer" | "truck";

export type ControlCenterItem = {
  id: string;
  kind: ControlCenterKind;
  refId: number;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  state: string;
  equipment: string;
  origin: string;
  destination: string;
  temperatureF: number | null;
  setpointF: number | null;
  address: string;
  lat: number | null;
  lng: number | null;
  href: string;
  pinColor?: string;
  pinShape?: "circle" | "arrow";
  headingDeg?: number | null;
};

export type ControlCenterFilters = {
  state: string;
  equipment: string;
  status: string;
};

export const EMPTY_CONTROL_FILTERS: ControlCenterFilters = {
  state: "",
  equipment: "",
  status: "",
};

export function parsePlaceState(value: string): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const pair = text.match(/\b([A-Za-z]{2})\b(?:,?\s+\d{5})?$/);
  if (pair) return pair[1].toUpperCase();
  const mid = text.match(/,\s*([A-Za-z]{2})\b/);
  return mid ? mid[1].toUpperCase() : "";
}

export function controlEquipmentKey(value: string): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (/reefer|refrigerat/.test(text)) return "reefer";
  if (/dry|van/.test(text)) return "dry_van";
  if (/flat/.test(text)) return "flatbed";
  return text.replace(/[\s'-]+/g, "_");
}

export function controlStatusKey(item: Pick<ControlCenterItem, "kind" | "status">): string {
  if (item.kind === "load") return String(item.status ?? "").trim().toLowerCase();
  return item.status === "on_load" ? "on_load" : "idle";
}

export function filterControlCenterItems(
  items: ControlCenterItem[],
  filters: ControlCenterFilters,
): ControlCenterItem[] {
  const state = filters.state.trim().toUpperCase();
  const equipment = controlEquipmentKey(filters.equipment);
  const status = filters.status.trim().toLowerCase();
  return items.filter((item) => {
    if (state && item.state !== state) return false;
    if (equipment && controlEquipmentKey(item.equipment) !== equipment) return false;
    if (status && controlStatusKey(item) !== status) return false;
    return true;
  });
}

export function controlCenterPoints(items: ControlCenterItem[]): Array<{
  id: string;
  kind: "pickup" | "truck" | "trailer";
  label: string;
  lat: number;
  lng: number;
  detail: string;
  pinColor?: string;
  pinShape?: "circle" | "arrow";
  headingDeg?: number | null;
}> {
  return items
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({
      id: item.id,
      kind: item.kind === "truck" ? "truck" : item.kind === "trailer" ? "trailer" : "pickup",
      label: item.title,
      lat: item.lat as number,
      lng: item.lng as number,
      detail: item.subtitle,
      pinColor: item.pinColor ?? (item.kind === "load" ? "#0b1f3a" : undefined),
      pinShape: item.pinShape,
      headingDeg: item.headingDeg,
    }));
}

export function controlCenterFilterOptions(items: ControlCenterItem[]): {
  states: string[];
  equipment: Array<{ value: string; label: string }>;
  statuses: Array<{ value: string; label: string }>;
} {
  const states = [...new Set(items.map((item) => item.state).filter(Boolean))].sort();
  const equipmentKeys = [...new Set(items.map((item) => controlEquipmentKey(item.equipment)).filter(Boolean))].sort();
  const equipment = equipmentKeys.map((value) => ({
    value,
    label: value === "reefer" ? "Reefer" : value === "dry_van" ? "Dry van" : value.replace(/_/g, " "),
  }));
  const loadStatuses = [...new Set(items.filter((item) => item.kind === "load").map((item) => item.status).filter(Boolean))];
  const resourceStatuses = [...new Set(items.filter((item) => item.kind !== "load").map((item) => controlStatusKey(item)))];
  const statuses = [
    ...loadStatuses.map((value) => ({ value, label: value.replace(/_/g, " ") })),
    ...resourceStatuses.map((value) => ({ value, label: value === "on_load" ? "On a load" : "Idle" })),
  ];
  return { states, equipment, statuses };
}
