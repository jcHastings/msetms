import { listReceivables } from "@/lib/accounting";
import { dispatcherCsvResponse } from "@/lib/csv-download";
import { buildTmsInvoice, renderInvoicesCsv } from "@/lib/invoice";
import { canAccessAccounting } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listReceivables().flatMap((load) => {
    try {
      return [buildTmsInvoice({ ...load, tms_invoice_number: load.tms_invoice_number || load.load_number })];
    } catch {
      return [];
    }
  });
  return dispatcherCsvResponse("invoices.csv", renderInvoicesCsv(rows), canAccessAccounting);
}
