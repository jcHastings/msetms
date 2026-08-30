import { BrandMark } from "@/components/brand-mark";
import { DispatcherChangePasswordForm } from "@/components/dispatcher-change-password-form";
import { DispatcherOwnEmailForm } from "@/components/dispatcher-own-email-form";
import { maskPhone } from "@/lib/dispatcher-password";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ForcedChangePasswordPage() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) redirect("/login");
  if (!dispatcher.must_change_password) redirect("/");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
        <h1 className="mt-4 text-3xl font-semibold">Set your password</h1>
        <p className="mt-2 text-sm text-slate-600">
          You must choose a new password before the desk is available.
          {!dispatcher.email?.trim()
            ? " Add an email when you can — sign-in codes start after it is on this user."
            : ""}
        </p>
      </div>
      <DispatcherChangePasswordForm
        hasPhone={Boolean(dispatcher.phone?.trim())}
        maskedPhone={dispatcher.phone?.trim() ? maskPhone(dispatcher.phone) : "their phone"}
        forced
      />
      <div className="mt-4">
        <DispatcherOwnEmailForm email={dispatcher.email} phone={dispatcher.phone} />
      </div>
    </div>
  );
}
