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

/** Office share of the flat billed rate after owner-operator percent. */
export function officeSharePercent(ooPercent: number | null | undefined): number | null {
  if (ooPercent == null || Number.isNaN(Number(ooPercent))) return null;
  return Math.round((100 - Number(ooPercent)) * 10) / 10;
}

/** OO Financials Gross Profit % — company leftover after driver %. Company drivers stay blank. */
export function officeSharePercentForOoLoad(input: {
  ownerOperator: boolean;
  ooPercent?: number | null;
  ooPay?: number | null;
  billedRate?: number | null;
}): number | null {
  if (!input.ownerOperator) return null;
  return officeSharePercent(
    input.ooPercent ?? impliedOwnerOperatorPercent(input.ooPay, input.billedRate),
  );
}

export function impliedOwnerOperatorPercent(
  pay: number | null | undefined,
  rate: number | null | undefined,
): number | null {
  if (pay == null || rate == null || Number.isNaN(pay) || Number.isNaN(rate) || rate === 0) return null;
  return Math.round((pay / rate) * 1000) / 10;
}

/** Driver percent is the default. After a load edit, keep that load's $ and implied %. */
export function resolveOwnerOperatorSettlement(input: {
  rate: number | null | undefined;
  percent: number | null | undefined;
  driverPercent?: number | null;
  submittedPay?: number | null;
  existingPay?: number | null;
  existingRate?: number | null;
  existingPercent?: number | null;
  existingDriverId?: number | null;
  driverId?: number | null;
}): { oo_pay: number | null; oo_percent: number | null } {
  const driverDefault = input.driverPercent ?? input.percent ?? null;
  const driverChanged = (input.existingDriverId ?? null) !== (input.driverId ?? null);
  if (driverChanged) {
    return { oo_percent: driverDefault, oo_pay: computeOwnerOperatorPay(input.rate, driverDefault) };
  }
  const loadPercent = input.percent ?? input.existingPercent ?? driverDefault;
  const defaultPay = computeOwnerOperatorPay(input.rate, loadPercent);
  const submittedPay = input.submittedPay;
  const payChanged =
    submittedPay != null && !sameMoney(submittedPay, input.existingPay ?? defaultPay);
  if (payChanged) {
    return {
      oo_pay: submittedPay,
      oo_percent: impliedOwnerOperatorPercent(submittedPay, input.rate) ?? loadPercent,
    };
  }
  const percentChanged = input.percent != null && (input.existingPercent ?? null) !== input.percent;
  const firstRate = (input.existingRate == null || input.existingRate === 0) && input.rate != null && input.rate > 0;
  const rateChanged = !sameMoney(input.existingRate, input.rate);
  if (percentChanged || firstRate || rateChanged || input.existingPay == null) {
    const percent = percentChanged ? input.percent : (input.existingPercent ?? driverDefault);
    return { oo_percent: percent ?? null, oo_pay: computeOwnerOperatorPay(input.rate, percent) };
  }
  return { oo_pay: input.existingPay, oo_percent: input.existingPercent ?? loadPercent };
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
