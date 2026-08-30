import { BrandMark } from "@/components/brand-mark";
import { DispatcherLoginForm } from "@/components/dispatcher-login-form";
import { dispatcherLoginAction } from "@/lib/dispatcher-actions";
import { getSignedInDispatcher, listDispatchers } from "@/lib/dispatcher-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DispatcherLoginPage() {
  const signedIn = await getSignedInDispatcher();
  if (signedIn) redirect("/");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
        <h1 className="mt-4 text-3xl font-semibold">Dispatcher desk</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with your password. We then email a one-time code to the address on your user record.
          First time here? Use Forgot password to set one.
        </p>
      </div>
      <DispatcherLoginForm dispatchers={listDispatchers()} action={dispatcherLoginAction} />
    </div>
  );
}
