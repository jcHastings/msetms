import { BrandMark } from "@/components/brand-mark";
import { DispatcherForgotForm } from "@/components/dispatcher-forgot-form";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const signedIn = await getSignedInDispatcher();
  if (signedIn) redirect("/settings/security");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
        <h1 className="mt-4 text-3xl font-semibold">Forgot password</h1>
      </div>
      <DispatcherForgotForm />
    </div>
  );
}
