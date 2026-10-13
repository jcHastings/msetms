import { getLoad } from "./queries";
import { listRelayLegs, type RelayLeg } from "./relay-routing";

export type RelayRevenueLeg = RelayLeg & {
  allocatedRevenue: number | null;
  share: number | null;
};

export function splitLoadRevenueByRelayMiles(loadId: number): RelayRevenueLeg[] {
  const load = getLoad(loadId);
  const legs = listRelayLegs(loadId);
  if (!load) return legs.map((leg) => ({ ...leg, allocatedRevenue: null, share: null }));
  const rate = load.rate ?? 0;
  const known = legs.filter((leg) => leg.miles != null && Number.isFinite(leg.miles) && (leg.miles ?? 0) > 0);
  const totalMiles = known.reduce((sum, leg) => sum + (leg.miles ?? 0), 0);
  if (!totalMiles || !known.length) {
    return legs.map((leg) => ({ ...leg, allocatedRevenue: null, share: null }));
  }
  return legs.map((leg) => {
    if (leg.miles == null || !Number.isFinite(leg.miles) || leg.miles <= 0) {
      return { ...leg, allocatedRevenue: null, share: null };
    }
    const share = leg.miles / totalMiles;
    return {
      ...leg,
      share,
      allocatedRevenue: Math.round(rate * share * 100) / 100,
    };
  });
}
