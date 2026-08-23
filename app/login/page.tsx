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
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
          MSE Transport
        </div>
        <h1 className="mt-2 text-3xl font-semibold">Dispatcher desk</h1>
        <p className="mt-2 text-base text-slate-600">
          Local PIN login. Driver app is separate at /driver/login.
        </p>
      </div>
      <DispatcherLoginForm dispatchers={listDispatchers()} action={dispatcherLoginAction} />
      <div className="mt-6 rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
        <div className="font-semibold text-slate-800">Demo PIN</div>
        <p className="mt-1">Ana G · 4020 (manager)</p>
        <p className="mt-1">Jordan Lee · 4410 (dispatcher)</p>
        <p className="mt-1">Riley Parks · 5500 (read-only)</p>
      </div>
    </div>
  );
}
