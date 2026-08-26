import { PageHeader } from "@/components/page-header";
import { createBillAction, payBillAction } from "@/lib/dispatcher-actions";
import { listBills } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";
import { listLoads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function BillsPage() {
  const bills = listBills();
  const loads = listLoads({ status: "all" });
  return (
    <>
      <PageHeader
        title="Bills (AP)"
        subtitle="Vendor and lumper bills."
      />
      <form action={createBillAction} className="card mb-4 grid gap-3 p-5 md:grid-cols-4">
        <div className="field">
          <label htmlFor="vendor">Vendor</label>
          <input id="vendor" name="vendor" required placeholder="Lumper Co." />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <input id="amount" name="amount" type="number" min={0} step="0.01" required />
        </div>
        <div className="field">
          <label htmlFor="load_id">Load (optional)</label>
          <select id="load_id" name="load_id" defaultValue="">
            <option value="">None</option>
            {loads.map((load) => (
              <option key={load.id} value={load.id}>
                {load.load_number}
              </option>
            ))}
          </select>
        </div>
        <div className="field md:col-span-4">
          <label htmlFor="memo">Memo</label>
          <input id="memo" name="memo" placeholder="Lumper, trailer wash, …" />
        </div>
        <button className="btn btn-primary" type="submit">
          Add bill
        </button>
      </form>
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Memo</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id}>
                <td className="font-semibold">{bill.vendor}</td>
                <td className="text-slate-600">{bill.memo || "—"}</td>
                <td>{formatMoney(bill.amount)}</td>
                <td>{bill.status}</td>
                <td className="text-right">
                  {bill.status === "open" ? (
                    <form action={payBillAction}>
                      <input type="hidden" name="bill_id" value={bill.id} />
                      <button className="btn btn-secondary" type="submit">
                        Mark paid
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
