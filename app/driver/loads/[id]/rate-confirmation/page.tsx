import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RateConPageZoom } from "@/components/rate-con-page-zoom";
import { getSignedInDriver } from "@/lib/driver-session";
import { getLoad } from "@/lib/queries";
import { listDriverRateConRedactions } from "@/lib/rate-con-redact-store";
import { driverAssignedToLoad } from "@/lib/relay-store";
import { getCompanySettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DriverRateConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const load = getLoad(Number.parseInt((await params).id, 10));
  if (!load || !driverAssignedToLoad(load.id, driver.id, load.driver_id)) notFound();
  const copies = listDriverRateConRedactions(load.id);
  if (!copies.length) notFound();
  const company = getCompanySettings().company_name || "MS Express";
  const pages = copies.flatMap((copy) =>
    Array.from({ length: Math.max(copy.page_count, 1) }, (_, index) => ({
      src: `/api/rate-con-redactions/${copy.id}/pages/${index + 1}`,
      label: `Rate confirmation page ${index + 1}`,
    })),
  );

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-950 px-4 pb-16 pt-4 text-white">
      <Link href={`/driver/loads/${load.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-slate-200">
        ← {load.load_number}
      </Link>
      <p className="mt-4 text-sm font-medium text-slate-300">{company}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rate confirmation</h1>
      <p className="mt-2 text-base leading-relaxed text-slate-300">
        Pickup, delivery, and instructions are on this copy. Pay amounts are not shown.
      </p>
      <div className="mt-4">
        <RateConPageZoom pages={pages} />
      </div>
    </div>
  );
}
