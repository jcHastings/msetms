"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import {
  cancelTotpEnrollmentAction,
  confirmTotpEnrollmentAction,
  saveTwoFactorPolicyAction,
  startTotpEnrollmentAction,
} from "@/lib/settings-actions";

export function TotpSetupPanel({
  enrolled,
  required,
  pending,
  recoveryRemaining,
}: {
  enrolled: boolean;
  required: boolean;
  pending: { secret: string; qrDataUrl: string } | null;
  recoveryRemaining: number;
}) {
  const [confirmState, confirmAction, confirming] = useActionState(confirmTotpEnrollmentAction, null);
  const recoveryCodes = confirmState?.ok ? confirmState.recoveryCodes : undefined;

  if (recoveryCodes?.length) {
    return (
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold">Recovery codes — save these now</h2>
        <p className="text-sm text-slate-600">
          Each code works once. Print or store them offline. They will not be shown again.
        </p>
        <ul className="grid gap-2 font-mono text-sm md:grid-cols-2 print:grid-cols-2">
          {recoveryCodes.map((code) => (
            <li key={code} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {code}
            </li>
          ))}
        </ul>
        <button className="btn btn-secondary" type="button" onClick={() => window.print()}>
          Print recovery codes
        </button>
      </section>
    );
  }

  if (enrolled) {
    return (
      <section className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold">2-step is on</h2>
        <p className="text-sm text-slate-600">
          Sign-in asks for a 6-digit authenticator code after your PIN. Unused recovery codes:{" "}
          <span className="font-semibold">{recoveryRemaining}</span>. Ask an admin to reset 2-step if you lose
          the app.
        </p>
      </section>
    );
  }

  if (pending) {
    return (
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold">{required ? "Set up 2-step to continue" : "Finish 2-step setup"}</h2>
        <p className="text-sm text-slate-600">
          Scan this QR with an authenticator app (Google Authenticator, Authy, 1Password). Or type the secret.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pending.qrDataUrl} alt="Authenticator QR code" className="h-48 w-48 rounded-lg border border-slate-200 bg-white" />
        <p className="break-all font-mono text-xs text-slate-700">{pending.secret}</p>
        <form action={confirmAction} className="space-y-3">
          <FormBanner result={confirmState} />
          <div className="field">
            <label htmlFor="totp">Confirm 6-digit code</label>
            <input
              id="totp"
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              pattern="[0-9]{6}"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={confirming}>
            {confirming ? "Checking…" : "Turn on 2-step"}
          </button>
        </form>
        {!required ? (
          <form action={cancelTotpEnrollmentAction}>
            <button className="btn btn-secondary" type="submit">
              Cancel setup
            </button>
          </form>
        ) : null}
      </section>
    );
  }

  return (
    <section className="card space-y-3 p-6">
      <h2 className="text-sm font-semibold">Set up 2-step</h2>
      <p className="text-sm text-slate-600">
        Optional until an admin requires it for all dispatchers. Driver PIN login is not affected.
      </p>
      <form action={startTotpEnrollmentAction}>
        <button className="btn btn-primary" type="submit">
          Set up 2-step
        </button>
      </form>
    </section>
  );
}

export function TwoFactorPolicyForm({ required, canEdit }: { required: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveTwoFactorPolicyAction, null);
  return (
    <section className="card mt-6 p-6">
      <h2 className="text-sm font-semibold">Require 2-step for all dispatchers</h2>
      <p className="mt-1 text-sm text-slate-600">
        Off by default so the office PC keeps working. When on, every dispatcher must enroll before using the
        desk.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <FormBanner result={state} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="require_dispatcher_2fa" value="1" defaultChecked={required} disabled={!canEdit} />
          Require 2-step for all dispatchers
        </label>
        {canEdit ? (
          <button className="btn btn-secondary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save policy"}
          </button>
        ) : (
          <p className="text-sm text-slate-500">Only an admin or manager can change this.</p>
        )}
      </form>
    </section>
  );
}
