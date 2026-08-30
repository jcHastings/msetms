"use client";

import { useActionState, useEffect, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { changeOwnPasswordAction } from "@/lib/dispatcher-password-actions";
import { DISPATCHER_PASSWORD_HINT } from "@/lib/dispatcher-password-shared";

export function DispatcherChangePasswordForm({
  hasPhone,
  maskedPhone,
}: {
  hasPhone: boolean;
  maskedPhone: string;
}) {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, null);
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    if (state?.ok && state.needsSmsCode) setCodeSent(true);
    if (state?.ok && !state.needsSmsCode) setCodeSent(false);
  }, [state]);

  if (!hasPhone) {
    return (
      <section className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold">Change password</h2>
        <p className="text-sm text-slate-600">
          Add a phone number on this user before you can change the password. We text a code there
          before the new password is saved.
        </p>
      </section>
    );
  }

  return (
    <section className="card space-y-4 p-6">
      <h2 className="text-sm font-semibold">Change password</h2>
      <p className="text-sm text-slate-600">
        We text a verification code to {maskedPhone} on this user record. Enter that code, then the
        new password. {DISPATCHER_PASSWORD_HINT}
      </p>
      <form action={action} className="space-y-4">
        <FormBanner result={state} hideOk={Boolean(state?.ok && state.needsSmsCode)} />
        {codeSent ? (
          <>
            <p className="text-sm text-slate-600">{state?.ok ? state.message : "Enter the text code, then your new password."}</p>
            <div className="field">
              <label htmlFor="sms_code">Text code</label>
              <input
                id="sms_code"
                name="sms_code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input id="password" name="password" type="password" required autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save password"}
            </button>
            <button
              className="btn btn-ghost"
              type="submit"
              name="resend"
              value="1"
              formNoValidate
              disabled={pending}
            >
              {pending ? "Sending…" : "Resend text"}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" type="submit" name="send_code" value="1" disabled={pending}>
            {pending ? "Sending…" : "Text a verification code"}
          </button>
        )}
      </form>
    </section>
  );
}
