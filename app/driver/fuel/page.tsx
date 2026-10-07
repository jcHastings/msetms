import Link from "next/link";
import { redirect } from "next/navigation";
import { DriverFuelPanel } from "@/components/driver-fuel-panel";
import { getSignedInDriver } from "@/lib/driver-session";
import { listDriverFuelReceipts, receiptIdForTransaction } from "@/lib/fuel-receipts";
import { listFuelTransactions } from "@/lib/fuel-store";

export const dynamic = "force-dynamic";

export default async function DriverFuelPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const transactions = listFuelTransactions({ driverId: driver.id }).map((row) => ({
    id: row.id,
    occurred_at: row.occurred_at,
    location: row.location,
    gallons: row.gallons,
    amount: row.amount,
    card_last4: row.card_last4,
    receipt_id: receiptIdForTransaction(row.id),
  }));
  const pending = listDriverFuelReceipts(driver.id, "pending_match").map((row) => ({
    id: row.id,
    original_name: row.original_name,
    occurred_at: row.occurred_at,
    amount: row.amount,
    gallons: row.gallons,
    merchant: row.merchant || row.station,
    status: row.status,
  }));

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href="/driver" className="text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">Fuel</h1>
      <p className="mt-1 text-sm text-slate-400">Card rows and receipt photos for your unit.</p>
      <div className="mt-4">
        <DriverFuelPanel transactions={transactions} pending={pending} />
      </div>
    </div>
  );
}
