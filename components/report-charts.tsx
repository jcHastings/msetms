import { formatMoney } from "@/lib/format";

const DONUT_R = 15.5;
const DONUT_C = 2 * Math.PI * DONUT_R;

export function OnTimeDonut({
  onTimePct,
  delivered,
  late,
}: {
  onTimePct: number;
  delivered: number;
  late: number;
}) {
  const onTimeCount = Math.max(0, delivered - late);
  const pct = Math.min(100, Math.max(0, onTimePct));
  const onTimeLen = (pct / 100) * DONUT_C;
  return (
    <div className="report-ontime-chart" data-reports-ontime-chart="">
      <svg viewBox="0 0 36 36" className="report-donut" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r={DONUT_R}
          fill="none"
          stroke={late > 0 || delivered === 0 ? "var(--warning)" : "var(--success)"}
          strokeWidth="4"
        />
        <circle
          cx="18"
          cy="18"
          r={DONUT_R}
          fill="none"
          stroke="var(--success)"
          strokeWidth="4"
          strokeDasharray={`${onTimeLen} ${DONUT_C}`}
          transform="rotate(-90 18 18)"
        />
        <text x="18" y="19.2" textAnchor="middle" className="report-donut-label">
          {pct}%
        </text>
      </svg>
      <ul className="report-ontime-legend">
        <li>
          <span className="report-swatch report-swatch-success" />
          On time · {onTimeCount}
        </li>
        <li>
          <span className="report-swatch report-swatch-warning" />
          Late · {late}
        </li>
      </ul>
    </div>
  );
}

export function RevenueBars({ rows }: { rows: Array<{ customer: string; revenue: number }> }) {
  const top = rows.slice(0, 8);
  const max = Math.max(1, ...top.map((row) => row.revenue));
  if (top.length === 0) return null;
  return (
    <div className="report-revenue-chart" data-reports-revenue-chart="">
      {top.map((row) => {
        const width = Math.max(4, Math.round((row.revenue / max) * 100));
        return (
          <div key={row.customer} className="report-hbar" title={`${row.customer} · ${formatMoney(row.revenue)}`}>
            <div className="report-hbar-name">{row.customer}</div>
            <div className="report-hbar-track">
              <span className="report-hbar-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="report-hbar-value">{formatMoney(row.revenue)}</div>
          </div>
        );
      })}
    </div>
  );
}
