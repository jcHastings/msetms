/** Client-safe dashboard/board load status colors. No db, env, or secrets. */

export type LoadStatusBand = "needs_work" | "pipeline" | "done";

const NEEDS_WORK = new Set(["available", "open", "unassigned", "hold", "needs_cover", "cover"]);
const DONE = new Set(["delivered", "completed", "accounting", "cancelled", "canceled", "tonu"]);
const WARNING = new Set(["hold", "needs_cover", "cover"]);
const DANGER = new Set(["cancelled", "canceled"]);

const BADGE: Record<string, string> = {
  available: "status-tone-slate",
  open: "status-tone-slate",
  unassigned: "status-tone-slate",
  hold: "status-tone-warning",
  needs_cover: "status-tone-warning",
  cover: "status-tone-warning",
  assigned: "status-tone-navy",
  dispatched: "status-tone-navy",
  at_pickup: "status-tone-navy",
  loading: "status-tone-navy",
  picked_up: "status-tone-navy",
  in_transit: "status-tone-navy",
  at_delivery: "status-tone-navy",
  unloading: "status-tone-navy",
  delivered: "status-tone-success",
  completed: "status-tone-success",
  accounting: "status-tone-success",
  cancelled: "status-tone-danger",
  canceled: "status-tone-danger",
  tonu: "status-tone-slate",
};

const ROW: Record<string, string> = {
  available: "shadow-[inset_3px_0_0_#5b6b7c]",
  hold: "bg-[#fff4e8] shadow-[inset_3px_0_0_#ef7200]",
  assigned: "shadow-[inset_3px_0_0_#07325a]",
  dispatched: "shadow-[inset_3px_0_0_#137cdd]",
  at_pickup: "shadow-[inset_3px_0_0_#07325a]",
  loading: "shadow-[inset_3px_0_0_#07325a]",
  picked_up: "shadow-[inset_3px_0_0_#07325a]",
  in_transit: "shadow-[inset_3px_0_0_#137cdd]",
  at_delivery: "shadow-[inset_3px_0_0_#07325a]",
  unloading: "shadow-[inset_3px_0_0_#07325a]",
  delivered: "opacity-90 shadow-[inset_3px_0_0_#458719]",
  completed: "opacity-85 shadow-[inset_3px_0_0_#458719]",
  accounting: "opacity-80 shadow-[inset_3px_0_0_#458719]",
  cancelled: "opacity-70 shadow-[inset_3px_0_0_#b60909]",
  tonu: "opacity-70 shadow-[inset_3px_0_0_#5b6b7c]",
};

export function normalizeLoadStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function loadStatusBand(status: string): LoadStatusBand {
  const key = normalizeLoadStatusKey(status);
  if (NEEDS_WORK.has(key) || key.includes("hold") || key.includes("cover")) return "needs_work";
  if (DONE.has(key) || key.includes("tonu") || key.includes("cancel")) return "done";
  return "pipeline";
}

export function loadStatusBadgeClass(status: string): string {
  const key = normalizeLoadStatusKey(status);
  if (BADGE[key]) return BADGE[key];
  const band = loadStatusBand(status);
  if (band === "needs_work") return WARNING.has(key) || key.includes("hold") || key.includes("cover") ? "status-tone-warning" : "status-tone-slate";
  if (band === "done") return DANGER.has(key) || key.includes("cancel") ? "status-tone-danger" : "status-tone-success";
  return "status-tone-navy";
}

export function loadStatusRowClass(status: string): string {
  const key = normalizeLoadStatusKey(status);
  if (ROW[key]) return ROW[key];
  const band = loadStatusBand(status);
  if (band === "needs_work") return "bg-[#fff4e8] shadow-[inset_3px_0_0_#ef7200]";
  if (band === "done") return "opacity-70 shadow-[inset_3px_0_0_#5b6b7c]";
  return "shadow-[inset_3px_0_0_#07325a]";
}

export function loadStatusTextClass(status: string): string {
  const band = loadStatusBand(status);
  if (band === "needs_work") return "text-[#ef7200]";
  if (band === "done") return "text-slate-500";
  return "text-[#07325a]";
}
