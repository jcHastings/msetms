import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { listOutsideQboPayments } from "@/lib/integrations/qbo-payments";

const LIST_CAP = 12;

/** Quiet list of QuickBooks payments whose invoices were not created in this TMS. */
export function QboOutsidePayments() {
  const rows = listOutsideQboPayments();
  const shown = rows.slice(0, LIST_CAP);
  const extra = rows.length - shown.length;
  const countLabel =
    rows.length === 0
      ? "No outside invoices."
      : `${rows.length} outside invoice${rows.length === 1 ? "" : "s"}`;
  return (
    <section className="card mt-4 space-y-2 p-5" data-qbo-outside-payments="">
      <h2 className="text-sm font-semibold">QuickBooks payments</h2>
      <p className="text-[12.5px] text-slate-600" data-qbo-outside-count="">
        {countLabel}
      </p>
      {shown.length > 0 ? (
        <ul className="space-y-1 text-[12.5px] text-slate-700">
          {shown.map((row) => (
            <li key={`${row.qboPaymentId}:${row.qboInvoiceId}`} data-qbo-outside-row={row.qboInvoiceId}>
              Payment {row.qboPaymentId} · invoice {row.qboInvoiceId}
              {row.docNumber ? ` · ${row.docNumber}` : ""} · {formatMoney(row.amount)}
              {row.suggestedLoadId != null ? (
                <>
                  {" · suggested load "}
                  <Link href={`/loads/${row.suggestedLoadId}`} className="font-mono underline">
                    {row.suggestedLoadNumber || String(row.suggestedLoadId)}
                  </Link>
                  {" · confirm before marking paid"}
                </>
              ) : (
                " · outside invoice"
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {extra > 0 ? <p className="text-[12px] text-slate-500">and {extra} more</p> : null}
    </section>
  );
}
