export function computeOwnerOperatorPay(
  rate: number | null | undefined,
  percent: number | null | undefined,
): number | null {
  if (rate == null || percent == null || Number.isNaN(rate) || Number.isNaN(percent)) return null;
  return Math.round(rate * (percent / 100) * 100) / 100;
}

/** What a signed-in driver may see. Company drivers never see a customer rate. */
export function driverFacingPay(load: {
  driver_type?: string | null;
  rate?: number | null;
  oo_percent?: number | null;
  oo_pay?: number | null;
}): number | null {
  if (load.driver_type !== "owner_operator") return null;
  if (load.oo_pay != null) return load.oo_pay;
  return computeOwnerOperatorPay(load.rate, load.oo_percent);
}
