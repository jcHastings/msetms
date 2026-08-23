import { BrandMark } from "@/components/brand-mark";
import { driverLoginAction } from "@/lib/driver-actions";
import { getSignedInDriver } from "@/lib/driver-session";
import { listDrivers } from "@/lib/queries";
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
          Sign in with your name and PIN. Local v1 — no password reset.
        </p>
      </div>
      <DriverLoginForm drivers={listDrivers()} action={driverLoginAction} />
      <div className="mt-6 rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
        <div className="font-semibold text-slate-800">Demo PINs</div>
        <p className="mt-1">Denise Ortega · 1125 (in-transit reefer)</p>
        <p>Marcus Hale · 1024</p>
        <p>James Whitaker · 1186</p>
        <p>Cole Brennan · 2051</p>
      </div>
    </div>
  );
}
