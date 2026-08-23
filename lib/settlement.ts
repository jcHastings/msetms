export function computeOwnerOperatorPay(
  rate: number | null | undefined,
  percent: number | null | undefined,
): number | null {
  if (rate == null || percent == null || Number.isNaN(rate) || Number.isNaN(percent)) return null;
  return Math.round(rate * (percent / 100) * 100) / 100;
}
