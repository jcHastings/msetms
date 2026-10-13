import type { FinePrintHit } from "@/lib/rate-con-fine-print-shared";

export function RateConFinePrint({ hits }: { hits: FinePrintHit[] }) {
  if (!hits.length) {
    return (
      <div
        className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        data-rate-con-fine-print=""
        data-fine-print-empty=""
      >
        No extra money terms jumped out. Still read the RC before you book.
      </div>
    );
  }
  return (
    <div
      role="status"
      className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
      data-rate-con-fine-print=""
    >
      <p className="font-medium">RC money terms — review before you book</p>
      <p className="mt-0.5 text-xs text-amber-900">Advisory only. Does not block confirm.</p>
      <ul className="mt-2 list-none space-y-2">
        {hits.map((hit) => (
          <li key={hit.kind} data-fine-print={hit.kind}>
            <span className="font-medium">{hit.label}</span>
            <span className="mt-0.5 block font-mono text-xs text-amber-900">“{hit.snippet}”</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
