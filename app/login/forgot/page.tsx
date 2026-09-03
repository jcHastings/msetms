import { DispatcherForgotForm } from "@/components/dispatcher-forgot-form";
import { LoginCanvas } from "@/components/login-canvas";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const signedIn = await getSignedInDispatcher();
  if (signedIn?.must_change_password) redirect("/login/change-password");
  if (signedIn) redirect("/settings/security");

  return (
    <LoginCanvas title="Forgot password" subtitle="Enter the email on your user.">
      <DispatcherForgotForm />
    </LoginCanvas>
  );
}
