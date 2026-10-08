import Link from "next/link";
import { redirect } from "next/navigation";
import { ReimbursementForm } from "@/components/reimbursement-form";
import { getSignedInDriver } from "@/lib/driver-session";
import { listLoadsForDriver } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewDriverReimbursementPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const loads = listLoadsForDriver(driver.id)
    .filter((load) => load.status !== "cancelled")
    .map((load) => ({
      id: load.id,
      label: `${load.load_number} · ${load.origin} → ${load.destination}`,
    }));

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href="/driver/reimbursements" className="text-sm font-medium text-slate-300">
        ← My reimbursements
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">Submit reimbursement</h1>
      <p className="mt-1 text-sm text-slate-400">Receipt photo, amount, and category. Load and note are optional.</p>
      <ReimbursementForm loads={loads} />
    </div>
  );
}
