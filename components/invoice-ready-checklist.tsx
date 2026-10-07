import type { InvoiceReadyChecklistModel } from "@/lib/invoice-ready";

export function InvoiceReadyChecklist({ checklist }: { checklist: InvoiceReadyChecklistModel }) {
  return (
    <section
      aria-label="Invoice ready?"
      data-invoice-ready=""
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
    >
      <h3 className="text-[12.5px] font-semibold text-slate-900">Invoice ready?</h3>
      <p className="mt-0.5 text-[12.5px] text-slate-600">Advisory only. Send stays available.</p>
      <ul className="mt-2 space-y-1.5">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            data-invoice-ready-item={item.id}
            data-invoice-ready-status={item.status}
            className="flex gap-2 text-[12.5px] leading-5"
          >
            <span
              className={
                item.status === "pass"
                  ? "w-12 shrink-0 font-semibold text-emerald-800"
                  : "w-12 shrink-0 font-semibold text-amber-950"
              }
            >
              {item.status === "pass" ? "Pass" : "Check"}
            </span>
            <span>
              <span className="font-medium text-slate-900">{item.label}</span>
              <span className="text-slate-600"> · {item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
