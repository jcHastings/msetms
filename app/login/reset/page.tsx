import { BrandMark } from "@/components/brand-mark";
import { DispatcherResetForm } from "@/components/dispatcher-reset-form";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const signedIn = await getSignedInDispatcher();
  if (signedIn) redirect("/settings/security");
  const token = String((await searchParams).token ?? "").trim();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
        <h1 className="mt-4 text-3xl font-semibold">Set password</h1>
      </div>
      {token ? (
        <DispatcherResetForm token={token} />
      ) : (
        <div className="card space-y-4 p-6">
          <p className="text-sm text-slate-600">That reset link is missing. Request a new one from Forgot password.</p>
          <Link href="/login/forgot" className="btn btn-primary w-full">
            Forgot password
          </Link>
        </div>
      )}
    </div>
  );
}
