import { TotpSetupPanel, TwoFactorPolicyForm } from "@/components/totp-setup-panel";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import {
  beginTotpEnrollment,
  countUnusedRecoveryCodes,
  enrollmentQr,
  isDispatcherTotpEnrolled,
} from "@/lib/dispatcher-totp";
import { canManageUsers, getSignedInDispatcher, isTwoFactorRequired } from "@/lib/dispatcher-session";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return null;
  const required = isTwoFactorRequired();
  const enrolled = isDispatcherTotpEnrolled(dispatcher.id);
  if (!enrolled && required) {
    beginTotpEnrollment(dispatcher.id);
  }
  const pending = await enrollmentQr(dispatcher.id);
  return (
    <>
      <SettingsBack />
      <PageHeader
        title="2-step verification"
        subtitle="Authenticator codes for dispatcher sign-in."
      />
      {required && !enrolled ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          2-step is required for all dispatchers. Finish setup to use the desk.
        </p>
      ) : null}
      <TotpSetupPanel
        enrolled={enrolled}
        required={required}
        pending={pending ? { secret: pending.secret, qrDataUrl: pending.qrDataUrl } : null}
        recoveryRemaining={countUnusedRecoveryCodes(dispatcher.id)}
      />
      <TwoFactorPolicyForm required={required} canEdit={canManageUsers(dispatcher.role)} />
    </>
  );
}
