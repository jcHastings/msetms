import { TotpSetupPanel, TwoFactorPolicyForm } from "@/components/totp-setup-panel";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { countUnusedRecoveryCodes, enrollmentQr, isDispatcherTotpEnrolled } from "@/lib/dispatcher-totp";
import { canManageUsers, getSignedInDispatcher, isTwoFactorRequired } from "@/lib/dispatcher-session";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return null;
  const required = isTwoFactorRequired();
  const enrolled = isDispatcherTotpEnrolled(dispatcher.id);
  const pending = await enrollmentQr(dispatcher.id);
  return (
    <>
      <SettingsBack />
      <PageHeader
        title="2-step verification"
      />
      <p className="mb-4 text-sm text-slate-600">
        When this is on, dispatcher sign-in emails a one-time code after the PIN. Add an email on the user if they
        do not have one.
      </p>
      <TwoFactorPolicyForm required={required} canEdit={canManageUsers(dispatcher.role)} />
      <TotpSetupPanel
        enrolled={enrolled}
        required={false}
        pending={pending ? { secret: pending.secret, qrDataUrl: pending.qrDataUrl } : null}
        recoveryRemaining={countUnusedRecoveryCodes(dispatcher.id)}
      />
    </>
  );
}
