import {
  DVIR_ADVISORY,
  openDvirDefectLine,
  type OpenDvirCard,
} from "@/lib/samsara-dvir-shared";

export function OpenDvirDefectsCard({ card }: { card: OpenDvirCard }) {
  return (
    <section className="card mb-4 px-4 py-3" data-open-dvir-defects="" data-dvir-state={card.ok ? "ready" : card.reason}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open DVIR defects</h2>
        <p className="text-xs text-slate-600">{DVIR_ADVISORY}</p>
      </div>
      {card.ok ? (
        <>
          <p className="mt-1 text-xs text-slate-500">Updated since {card.historySince.slice(0, 10)}.</p>
          {card.truncated ? (
            <p className="mt-1 text-xs text-amber-900" data-dvir-truncated="">
              Samsara has more open defects than this card loaded.
            </p>
          ) : null}
          {card.defects.length === 0 ? (
            <p className="mt-2 text-sm text-slate-700" data-dvir-empty="">
              No open defects.
            </p>
          ) : (
            <ul className="mt-2 max-h-64 overflow-auto">
              {card.defects.map((defect) => {
                const line = openDvirDefectLine(defect);
                const unsafe = defect.safetyStatus === "unsafe";
                return (
                  <li
                    key={defect.id}
                    className={`grid grid-cols-1 gap-x-3 gap-y-0.5 border-b border-slate-200 py-1.5 text-sm last:border-b-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto_auto] ${unsafe ? "bg-amber-50 px-2" : ""}`}
                    data-dvir-defect=""
                    data-samsara-defect-id={line.id}
                  >
                    <span className="font-mono text-xs font-semibold">{line.id}</span>
                    <span className="text-xs text-slate-600">{line.time}</span>
                    <span
                      className={unsafe ? "text-xs font-semibold text-amber-950" : "text-xs text-slate-700"}
                      data-dvir-safety={defect.safetyStatus || "none"}
                    >
                      {line.safety}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">{line.status}</span>
                    {line.dvirId ? (
                      <span className="text-xs text-slate-500 sm:col-span-4">DVIR {line.dvirId}</span>
                    ) : null}
                    {line.comment ? (
                      <p className="text-xs text-slate-800 sm:col-span-4">{line.comment}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-amber-900" data-dvir-soft-fail="">
          {card.message}
        </p>
      )}
    </section>
  );
}
