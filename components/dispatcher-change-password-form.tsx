"use client";

import { useActionState, useEffect, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { changeOwnPasswordAction } from "@/lib/dispatcher-password-actions";
import { DISPATCHER_PASSWORD_HINT } from "@/lib/dispatcher-password-shared";

export function DispatcherChangePasswordForm({
  hasPhone,
  maskedPhone,
  forced = false,
}: {
  hasPhone: boolean;
  maskedPhone: string;
  forced?: boolean;
}) {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, null);
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    if (state?.ok && state.needsSmsCode) setCodeSent(true);
    if (state?.ok && !state.needsSmsCode) setCodeSent(false);
  }, [state]);

  return (
    <section className="card space-y-4 p-6">
      <h2 className="text-sm font-semibold">{forced ? "Choose a new password" : "Change password"}</h2>
      <p className="text-sm text-slate-600">
        {forced
          ? "This password was set for you. Choose a new one before using the desk."
          : null}{" "}
        {hasPhone
          ? `We text a verification code to ${maskedPhone} on this user record before the new password is saved.`
          : "No phone is on this user, so a text code is not required."}{" "}
        {DISPATCHER_PASSWORD_HINT}
      </p>
      <form action={action} className="space-y-4">
        <FormBanner result={state} hideOk={Boolean(state?.ok && state.needsSmsCode)} />
        {forced ? <input type="hidden" name="continue" value="desk" /> : null}
        {hasPhone && !codeSent ? (
          <button className="btn btn-primary" type="submit" name="send_code" value="1" disabled={pending}>
            {pending ? "Sending…" : "Text a verification code"}
          </button>
        ) : (
          <>
            {hasPhone ? (
              <>
                <p className="text-sm text-slate-600">
                  {state?.ok ? state.message : "Enter the text code, then your new password."}
                </p>
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
              </>
            ) : null}
            <div className="field">
              <label htmlFor="password">New password</label>
              <input id="password" name="password" type="password" required autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : forced ? "Save and continue" : "Save password"}
            </button>
            {hasPhone ? (
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
            ) : null}
          </>
        )}
      </form>
    </section>
  );
}
