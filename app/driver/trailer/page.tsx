import { redirect } from "next/navigation";
import { pickDriverDestinationLoad } from "@/lib/driver-destinations-shared";
import { getSignedInDriver } from "@/lib/driver-session";
import { driverTrailerPageHref } from "@/lib/driver-trailer";
import { listLoadsForDriver } from "@/lib/queries";
import { isActiveLoadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Safety net: `/driver/trailer` is not a real screen. Send the driver to their assigned load map. */
export default async function DriverTrailerAliasPage() {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const active = listLoadsForDriver(driver.id).filter((load) => isActiveLoadStatus(load.status));
  const delivered = listLoadsForDriver(driver.id).filter(
    (load) => load.status === "delivered" || load.status === "completed",
  );
  const href = driverTrailerPageHref(pickDriverDestinationLoad(active, delivered));
  redirect(href ?? "/driver");
}
