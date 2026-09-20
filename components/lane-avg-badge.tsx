import { formatMoney } from "@/lib/format";
import {
  formatLanePerMile,
  laneAvgHeadline,
  laneAvgShouldShow,
  type LaneAvgCompare,
} from "@/lib/lane-average-shared";

const TONE: Record<LaneAvgCompare["band"], string> = {
  below: "status-tone-danger",
  above: "status-tone-success",
  at: "status-tone-navy",
  none: "status-tone-slate",
};

export function LaneAvgBadge({
  compare,
  compact = false,
}: {
  compare: LaneAvgCompare | null | undefined;
  compact?: boolean;
}) {
  if (!laneAvgShouldShow(compare)) return null;
  const headline = laneAvgHeadline(compare);
  if (!headline || headline === "not enough lane history") return null;
  const avg = compare.avgRate != null ? formatMoney(compare.avgRate) : "";
  const perMile = formatLanePerMile(compare.perMile ?? compare.avgPerMile);
  const samples =
    compare.sampleSize > 0 ? `${compare.sampleSize} load${compare.sampleSize === 1 ? "" : "s"}` : "";
  const detail = ["200-mi radius", avg ? `${avg} avg` : "", perMile, samples].filter(Boolean).join(" · ");
  if (compact) {
    const short =
      compare.band === "below" ? "Below" : compare.band === "above" ? "Above" : compare.band === "at" ? "At" : "";
    if (!short) return null;
    return (
      <div className="mt-0.5 leading-tight" data-lane-avg="" data-lane-avg-band={compare.band} data-lane-avg-compact="">
        <span className={`status-pill ${TONE[compare.band]}`}>{short} avg</span>
        {detail ? <span className="mt-0.5 block text-[10px] text-slate-500">{detail}</span> : null}
      </div>
    );
  }
  return (
    <div
      className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800"
      data-lane-avg=""
      data-lane-avg-band={compare.band}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`status-pill ${TONE[compare.band]}`}>{headline}</span>
        {compare.label ? <span className="text-xs text-slate-500">{compare.label}</span> : null}
      </div>
      {detail ? <p className="mt-1 text-xs text-slate-600">{detail}</p> : null}
    </div>
  );
}
