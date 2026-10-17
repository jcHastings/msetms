import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DriverTrailerChangeForm } from "@/components/driver-trailer-change";
import { loadDriverTrailerChangeFacts } from "@/lib/driver-trailer-change-db";
import { getSignedInDriver } from "@/lib/driver-session";
import { getLoad } from "@/lib/queries";
import { driverAssignedToLoad } from "@/lib/relay-store";
import { isClosedStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverChangeTrailerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const loadId = Number.parseInt((await params).id, 10);
  const load = getLoad(loadId);
  if (!load || !driverAssignedToLoad(load.id, driver.id, load.driver_id)) notFound();
  const closed = isClosedStatus(load.status);

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-5">
      <Link
        href={`/driver/loads/${load.id}`}
        className="inline-flex min-h-11 items-center text-base font-medium text-slate-300"
      >
        ← {load.load_number}
      </Link>
      <h1 id="change-trailer-title" className="mt-3 text-2xl font-semibold text-white">
        Change trailer
      </h1>
      <p className="mt-1 text-base text-slate-300">{load.load_number}</p>
      {closed ? (
        <p className="driver-sheet mt-4 rounded-2xl bg-white p-4 text-base" role="status">
          This load is closed.
        </p>
      ) : (
        <DriverTrailerChangeForm
          loadId={load.id}
          facts={loadDriverTrailerChangeFacts({ driverId: driver.id, loadId: load.id })}
        />
      )}
    </div>
  );
}
