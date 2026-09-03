import { DispatcherLoginForm } from "@/components/dispatcher-login-form";
import { LoginCanvas } from "@/components/login-canvas";
import { dispatcherLoginAction } from "@/lib/dispatcher-actions";
import { getSignedInDispatcher, listDispatchers } from "@/lib/dispatcher-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DispatcherLoginPage() {
  const signedIn = await getSignedInDispatcher();
  if (signedIn?.must_change_password) redirect("/login/change-password");
  if (signedIn) redirect("/");

  return (
    <LoginCanvas title="Dispatcher desk" subtitle="Sign in with email and password.">
      <DispatcherLoginForm dispatchers={listDispatchers()} action={dispatcherLoginAction} />
    </LoginCanvas>
  );
}
