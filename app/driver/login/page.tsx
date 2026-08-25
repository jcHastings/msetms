import { BrandMark } from "@/components/brand-mark";
import { driverLoginAction } from "@/lib/driver-actions";
import { getSignedInDriver } from "@/lib/driver-session";
import { listDriversForLogin } from "@/lib/queries";
import { redirect } from "next/navigation";
import { DriverLoginForm } from "@/components/driver-login-form";

export const dynamic = "force-dynamic";

export default async function DriverLoginPage() {
  const signedIn = await getSignedInDriver();
  if (signedIn) redirect("/driver");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
        <h1 className="mt-4 text-3xl font-semibold">Driver dispatch</h1>
        <p className="mt-2 text-base text-slate-600">
          Sign in with your name and the PIN dispatch set on your driver record. No PIN yet — ask dispatch to set
          one on the Drivers page.
        </p>
      </div>
      <DriverLoginForm
        drivers={listDriversForLogin().map((driver) => ({ id: driver.id, name: driver.name }))}
        action={driverLoginAction}
      />
    </div>
  );
}
