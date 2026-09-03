import { DispatcherChangePasswordForm } from "@/components/dispatcher-change-password-form";
import { DispatcherOwnEmailForm } from "@/components/dispatcher-own-email-form";
import { LoginCanvas } from "@/components/login-canvas";
import { maskPhone } from "@/lib/dispatcher-password";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ForcedChangePasswordPage() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");
  if (!dispatcher.must_change_password) redirect("/");

  return (
    <LoginCanvas
      title="Set your password"
      subtitle="You must choose a new password before the desk is available."
    >
      <DispatcherChangePasswordForm
        hasPhone={Boolean(dispatcher.phone?.trim())}
        maskedPhone={dispatcher.phone?.trim() ? maskPhone(dispatcher.phone) : "their phone"}
        forced
      />
      <div className="mt-4 w-full max-w-md">
        <DispatcherOwnEmailForm email={dispatcher.email} phone={dispatcher.phone} />
      </div>
    </LoginCanvas>
  );
}
