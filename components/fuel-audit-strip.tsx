import { fuelPageHref } from "@/components/fuel-transaction-lists";
import type { FuelAuditFlag, FuelAuditReport } from "@/lib/fuel-audit";
import { formatMdYDisplay, ymdInTimeZone } from "@/lib/format";
import { DISPLAY_TIME_ZONE } from "@/lib/format";
import Link from "next/link";

function kindLabel(kind: FuelAuditFlag["kind"]): string {
  if (kind === "too_often") return "Too often";
  if (kind === "too_much") return "Too much";
  return "Duplicate";
}

function txHint(flag: FuelAuditFlag): string {
  return flag.txs
    .slice(0, 3)
    .map((tx) => {
      const day = Number.isFinite(Date.parse(tx.occurred_at))
        ? formatMdYDisplay(ymdInTimeZone(new Date(tx.occurred_at), DISPLAY_TIME_ZONE))
        : "";
      const gal = tx.gallons == null ? "" : `${Math.round(tx.gallons)}g`;
      return [`#${tx.id}`, day, gal].filter(Boolean).join(" ");
    })
    .join(" · ");
}

export function FuelAuditStrip({ report }: { report: FuelAuditReport }) {
  const count = report.flags.length;
  return (
    <section className="card mb-6 overflow-hidden" data-fuel-audit="">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">Audit</h2>
        <p className="mt-1 text-xs text-slate-500">
          Soft flags · {report.window.label} · {count === 0 ? "no flags" : `${count} flag${count === 1 ? "" : "s"}`}
        </p>
      </header>
      {count === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-600">No abnormal fueling in this window.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {report.flags.slice(0, 6).map((flag) => {
            const href = flag.driverId
              ? fuelPageHref({ driverId: flag.driverId, week: report.window.startYmd })
              : null;
            return (
              <div
                key={`${flag.kind}-${flag.subjectKey}-${flag.product}-${flag.reason}-${flag.txs[0]?.id ?? "x"}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2 text-sm"
                data-fuel-audit-flag={flag.kind}
              >
                {href ? (
                  <Link href={href} className="font-semibold text-navy hover:underline">
                    {flag.driverName}
                  </Link>
                ) : (
                  <span className="font-semibold">{flag.driverName}</span>
                )}
                <span className="tabular-nums text-slate-600">{flag.unit || "—"}</span>
                <span className="text-xs font-semibold uppercase text-slate-500">{kindLabel(flag.kind)}</span>
                <span className="text-xs uppercase text-slate-500">{flag.product}</span>
                <span className="tabular-nums">{flag.metric}</span>
                <span className="text-xs text-slate-500">{flag.why}</span>
                <span className="text-xs tabular-nums text-slate-500">{txHint(flag)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
