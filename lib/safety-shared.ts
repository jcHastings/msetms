/** Client-safe Safety board ranking. No env, db, or secrets. */

export const SAFETY_RANKS = ["expired", "due_soon", "hos_violation", "unavailable", "ok"] as const;
export type SafetyRank = (typeof SAFETY_RANKS)[number];

export type SafetyKind = "license" | "medical" | "drug_test" | "insurance" | "hos";

export type SafetyRow = {
  id: string;
  subject: string;
  subjectKind: "driver" | "company";
  driverType: string;
  rank: SafetyRank;
  title: string;
  licenseExpires: string;
  medicalLast: string;
  medicalNext: string;
  drugLast: string;
  drugNext: string;
  hos: string;
};

export function cleanSafetyDate(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || /^0{4}-0{2}-0{2}/.test(raw)) return "";
  return raw.slice(0, 10);
}

export function formatSafetyDatePair(last: string, next: string): string {
  const left = cleanSafetyDate(last);
  const right = cleanSafetyDate(next);
  if (!left && !right) return "";
  if (left && right) return `${left} / ${right}`;
  return left || right;
}

export function daysUntilSafetyDate(value: string, now = new Date()): number | null {
  const day = cleanSafetyDate(value);
  if (!day) return null;
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - start.getTime()) / 86_400_000);
}

export function expiryRank(next: string, windowDays: number, now = new Date()): SafetyRank | "empty" {
  const days = daysUntilSafetyDate(next, now);
  if (days == null) return "empty";
  if (days < 0) return "expired";
  if (days <= windowDays) return "due_soon";
  return "ok";
}

export function worstSafetyRank(ranks: Array<SafetyRank | "empty">): SafetyRank {
  const order = SAFETY_RANKS;
  let worst: SafetyRank = "ok";
  for (const rank of ranks) {
    if (rank === "empty") continue;
    if (order.indexOf(rank) < order.indexOf(worst)) worst = rank;
  }
  return worst;
}

export function safetyRankOrder(rank: SafetyRank): number {
  return SAFETY_RANKS.indexOf(rank);
}

export function sortSafetyRows(rows: SafetyRow[]): SafetyRow[] {
  return [...rows].sort((left, right) => {
    const rank = safetyRankOrder(left.rank) - safetyRankOrder(right.rank);
    if (rank) return rank;
    return left.subject.localeCompare(right.subject);
  });
}

export function hosSafetyDetail(input: {
  tokenSet: boolean;
  samsaraDriverId: string;
  driveRemainingLabel?: string;
  dutyStatus?: string;
  driveRemainingMs?: number | null;
  timeUntilBreakMs?: number | null;
  hasClock: boolean;
}): { rank: SafetyRank; detail: string } {
  if (!input.tokenSet) return { rank: "unavailable", detail: "Samsara token not set" };
  if (!input.samsaraDriverId.trim()) return { rank: "unavailable", detail: "No Samsara id" };
  if (!input.hasClock) return { rank: "unavailable", detail: "HOS not available" };
  if (
    (input.driveRemainingMs != null && input.driveRemainingMs <= 0) ||
    (input.timeUntilBreakMs != null && input.timeUntilBreakMs <= 0)
  ) {
    return { rank: "hos_violation", detail: "HOS violation" };
  }
  const hours = input.driveRemainingLabel || "hours remaining";
  const duty = input.dutyStatus ? ` · ${input.dutyStatus}` : "";
  return { rank: "ok", detail: `${hours}${duty}` };
}

export function safetyTitle(rank: SafetyRank): string {
  if (rank === "expired") return "Expired";
  if (rank === "due_soon") return "Due soon";
  if (rank === "hos_violation") return "HOS violation";
  if (rank === "unavailable") return "HOS not available";
  return "Clear";
}
