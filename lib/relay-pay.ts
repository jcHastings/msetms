import { isOwnerOperator } from "./types";

export function roundPayMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** rate / total loaded miles × leg miles. Null when the miles or rate are missing. */
export function loadedLegShare(
  amount: number | null | undefined,
  totalMiles: number | null | undefined,
  legMiles: number | null | undefined,
): number | null {
  if (amount == null || totalMiles == null || legMiles == null) return null;
  if (!Number.isFinite(amount) || !Number.isFinite(totalMiles) || !Number.isFinite(legMiles)) return null;
  if (!(totalMiles > 0) || legMiles < 0) return null;
  return roundPayMoney((amount / totalMiles) * legMiles);
}

/**
 * The driver's own stored percent. A missing percent is not filled in from a company default.
 */
export function payWithStoredPercent(
  amount: number | null | undefined,
  storedPercent: number | null | undefined,
): number | null {
  if (amount == null || storedPercent == null) return null;
  if (!Number.isFinite(amount) || !Number.isFinite(storedPercent)) return null;
  return roundPayMoney(amount * (storedPercent / 100));
}

export function linehaulLegPay(input: {
  rate: number | null;
  totalMiles: number | null;
  legMiles: number | null;
  driverType: string | null | undefined;
  storedPercent: number | null;
}): { share: number | null; pay: number | null } {
  const share = loadedLegShare(input.rate, input.totalMiles, input.legMiles);
  if (!isOwnerOperator(input.driverType)) return { share, pay: null };
  return { share, pay: payWithStoredPercent(share, input.storedPercent) };
}

export function fuelSurchargeLegPay(input: {
  fscAmount: number | null;
  totalMiles: number | null;
  legMiles: number | null;
  driverType: string | null | undefined;
  storedPercent: number | null;
}): number | null {
  if (!isOwnerOperator(input.driverType)) return null;
  const share = loadedLegShare(input.fscAmount, input.totalMiles, input.legMiles);
  return payWithStoredPercent(share, input.storedPercent);
}

/** Full detention amount, and only for an owner-operator on the leg where it happened. */
export function detentionLegPay(input: {
  amount: number | null;
  driverType: string | null | undefined;
  happenedOnLeg: boolean;
}): number | null {
  if (!input.happenedOnLeg || !isOwnerOperator(input.driverType)) return null;
  if (input.amount == null || !Number.isFinite(input.amount)) return null;
  return roundPayMoney(input.amount);
}

/** Lumper stays whole. It is not divided by miles and not run through the percent. */
export function lumperPassThrough(input: { amount: number | null; assignedToDriver: boolean }): number | null {
  if (!input.assignedToDriver || input.amount == null || !Number.isFinite(input.amount)) return null;
  return roundPayMoney(input.amount);
}

export function totalLoadedMiles(
  routeMiles: number | null | undefined,
  fromMiles: number | null | undefined,
  toMiles: number | null | undefined,
): number | null {
  if (routeMiles != null && Number.isFinite(routeMiles) && routeMiles > 0) return routeMiles;
  if (fromMiles == null || toMiles == null) return null;
  if (!Number.isFinite(fromMiles) || !Number.isFinite(toMiles)) return null;
  const sum = fromMiles + toMiles;
  return sum > 0 ? Math.round(sum * 10) / 10 : null;
}

export type SettlementPayLineRef = {
  loadId: number;
  leg: string;
};

/** True when the same load is paid once as a whole load and again as a leg. */
export function settlementHasDoublePay(lines: SettlementPayLineRef[]): boolean {
  const whole = new Set(lines.filter((line) => !line.leg).map((line) => line.loadId));
  return lines.some((line) => Boolean(line.leg) && whole.has(line.loadId));
}
