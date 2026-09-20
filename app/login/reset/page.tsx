import { DispatcherResetForm } from "@/components/dispatcher-reset-form";
import { LoginCanvas } from "@/components/login-canvas";
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
  if (signedIn?.must_change_password) redirect("/login/change-password");
  if (signedIn) redirect("/settings/security");
  const token = String((await searchParams).token ?? "").trim();

  return (
    <LoginCanvas title="Set password">
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
    </LoginCanvas>
  );
}
