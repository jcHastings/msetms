/** Client-safe dashboard/board load status colors. No db, env, or secrets. */

export type LoadStatusBand = "needs_work" | "pipeline" | "done";

const NEEDS_WORK = new Set(["available", "open", "unassigned", "hold", "needs_cover", "cover"]);
const DONE = new Set(["delivered", "completed", "accounting", "cancelled", "canceled", "tonu"]);

const BADGE: Record<string, string> = {
  available: "bg-amber-100 text-amber-950 ring-amber-400",
  hold: "bg-orange-100 text-orange-950 ring-orange-400",
  assigned: "bg-sky-50 text-sky-900 ring-sky-300",
  dispatched: "bg-blue-50 text-blue-900 ring-blue-300",
  at_pickup: "bg-violet-50 text-violet-900 ring-violet-300",
  loading: "bg-violet-100 text-violet-950 ring-violet-300",
  picked_up: "bg-indigo-50 text-indigo-900 ring-indigo-300",
  in_transit: "bg-indigo-100 text-indigo-950 ring-indigo-400",
  at_delivery: "bg-cyan-50 text-cyan-950 ring-cyan-300",
  unloading: "bg-cyan-100 text-cyan-950 ring-cyan-400",
  delivered: "bg-emerald-100 text-emerald-950 ring-emerald-400",
  completed: "bg-emerald-50 text-emerald-900 ring-emerald-300",
  accounting: "bg-emerald-100 text-emerald-950 ring-emerald-400",
  cancelled: "bg-stone-200 text-stone-600 ring-stone-400",
  tonu: "bg-stone-200 text-stone-600 ring-stone-400",
};

const ROW: Record<string, string> = {
  available: "bg-amber-50/80 shadow-[inset_4px_0_0_#d97706]",
  hold: "bg-orange-50/80 shadow-[inset_4px_0_0_#ea580c]",
  assigned: "shadow-[inset_4px_0_0_#0284c7]",
  dispatched: "shadow-[inset_4px_0_0_#2563eb]",
  at_pickup: "shadow-[inset_4px_0_0_#7c3aed]",
  loading: "shadow-[inset_4px_0_0_#6d28d9]",
  picked_up: "shadow-[inset_4px_0_0_#4f46e5]",
  in_transit: "shadow-[inset_4px_0_0_#4338ca]",
  at_delivery: "shadow-[inset_4px_0_0_#0891b2]",
  unloading: "shadow-[inset_4px_0_0_#0e7490]",
  delivered: "opacity-90 shadow-[inset_4px_0_0_#059669]",
  completed: "opacity-85 shadow-[inset_4px_0_0_#047857]",
  accounting: "opacity-80 shadow-[inset_4px_0_0_#059669]",
  cancelled: "opacity-70 shadow-[inset_4px_0_0_#a8a29e]",
  tonu: "opacity-70 shadow-[inset_4px_0_0_#a8a29e]",
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
  if (band === "needs_work") return "bg-amber-100 text-amber-950 ring-amber-400";
  if (band === "done") return "bg-stone-200 text-stone-600 ring-stone-400";
  return "bg-slate-50 text-slate-800 ring-slate-300";
}

export function loadStatusRowClass(status: string): string {
  const key = normalizeLoadStatusKey(status);
  if (ROW[key]) return ROW[key];
  const band = loadStatusBand(status);
  if (band === "needs_work") return "bg-amber-50/80 shadow-[inset_4px_0_0_#d97706]";
  if (band === "done") return "opacity-70 shadow-[inset_4px_0_0_#a8a29e]";
  return "shadow-[inset_4px_0_0_#64748b]";
}

export function loadStatusTextClass(status: string): string {
  const band = loadStatusBand(status);
  if (band === "needs_work") return "text-amber-950";
  if (band === "done") return "text-slate-500";
  return "text-slate-900";
}
