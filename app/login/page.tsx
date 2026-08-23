import { redirect } from "next/navigation";
import { DispatcherLoginForm } from "@/components/dispatcher-login-form";
import { dispatcherCount, getSignedInDispatcher } from "@/lib/dispatch-auth";
import { safeNextPath } from "@/lib/dispatch-paths";

export const dynamic = "force-dynamic";

export default async function DispatcherLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const signedIn = await getSignedInDispatcher();
  if (signedIn) redirect("/");

  const params = await searchParams;
  const next = safeNextPath(params.next);
  const hasUsers = dispatcherCount() > 0;
  const loginFailed = params.error === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-slate-100">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">MSE Transport</div>
          <h1 className="mt-2 text-3xl font-semibold">Dispatcher sign in</h1>
          <p className="mt-2 text-base text-slate-300">
            The board holds customer rates, settlements, and documents. Sign in to open it.
          </p>
        </div>
        {hasUsers ? (
          <>
            {loginFailed ? (
              <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                Username or password is not right.
              </div>
            ) : null}
            <DispatcherLoginForm next={next} />
          </>
        ) : (
          <div className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
            <div className="font-semibold text-slate-900">Set a dispatcher password first</div>
            <p className="mt-2">
              Copy <code className="font-mono text-xs">.env.example</code> to{" "}
              <code className="font-mono text-xs">.env.local</code>, set{" "}
              <code className="font-mono text-xs">DISPATCH_PASSWORD</code> (at least 8 characters), and restart.
              That creates the <span className="font-medium">admin</span> account. Do not put the password in git.
            </p>
          </div>
        )}
        <p className="mt-6 text-center text-sm text-slate-400">
          Drivers sign in at <a className="text-gold underline" href="/driver/login">/driver/login</a> with a PIN.
        </p>
      </div>
    </div>
  );
}
