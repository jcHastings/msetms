import { isOwnerOperator } from "./types";

export function computeOwnerOperatorPay(
  rate: number | null | undefined,
  percent: number | null | undefined,
): number | null {
  if (rate == null || percent == null || Number.isNaN(rate) || Number.isNaN(percent)) return null;
  return Math.round(rate * (percent / 100) * 100) / 100;
}

export function sameMoney(left: number | null | undefined, right: number | null | undefined): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.round(left * 100) === Math.round(right * 100);
}

/** True when OO pay is empty or still the auto amount from flat rate × percent. */
export function isAutoOwnerOperatorPay(
  ooPay: number | null | undefined,
  rate: number | null | undefined,
  percent: number | null | undefined,
): boolean {
  if (ooPay == null) return true;
  return sameMoney(ooPay, computeOwnerOperatorPay(rate, percent));
}

/** Recalc when the flat rate or assigned OO changes. Keep a hand-typed amount otherwise. */
export function resolveOwnerOperatorPay(input: {
  rate: number | null | undefined;
  percent: number | null | undefined;
  submittedPay?: number | null;
  existingPay?: number | null;
  existingRate?: number | null;
  existingPercent?: number | null;
  existingDriverId?: number | null;
  driverId?: number | null;
}): number | null {
  const auto = computeOwnerOperatorPay(input.rate, input.percent);
  const rateChanged = !sameMoney(input.existingRate, input.rate);
  const percentChanged = (input.existingPercent ?? null) !== (input.percent ?? null);
  const driverChanged = (input.existingDriverId ?? null) !== (input.driverId ?? null);
  if (rateChanged || driverChanged || percentChanged || input.existingPay == null) {
    return auto;
  }
  if (input.submittedPay != null) return input.submittedPay;
  return input.existingPay;
}

/** What a signed-in driver may see. Company drivers never see a customer rate. */
export function driverFacingPay(load: {
  driver_type?: string | null;
  rate?: number | null;
  oo_percent?: number | null;
  oo_pay?: number | null;
}): number | null {
  if (!isOwnerOperator(load.driver_type)) return null;
  if (load.oo_pay != null) return load.oo_pay;
  return computeOwnerOperatorPay(load.rate, load.oo_percent);
}
