"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  composePasswordChangeSms,
  composePasswordResetEmail,
  createPasswordResetToken,
  findActiveDispatcherByEmail,
  issuePasswordSmsOtp,
  maskPhone,
  PASSWORD_FORGOT_SENT,
  PASSWORD_SMS_NO_PHONE,
  resetPasswordWithToken,
  setDispatcherPassword,
  verifyPasswordSmsOtp,
} from "./dispatcher-password";
import { dispatcherPasswordError } from "./dispatcher-password-shared";
import { requireSignedInDispatcher } from "./dispatcher-session";
import { currentBrowserOrigin } from "./http-origin";
import { isUsableEmail, MAIL_MISSING, normalizeEmail } from "./mail-shared";
import { updateOwnDispatcherContact } from "./settings";
import type { ActionResult } from "./types";

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function forgotDispatcherPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const email = normalizeEmail(String(formData.get("email") ?? ""));
    if (!isUsableEmail(email)) {
      throw new Error(
        "Enter the email on your user record. If this user has no email, ask an Administrator to set a temporary password on Users.",
      );
    }
    const user = findActiveDispatcherByEmail(email);
    if (user) {
      const { mailConfigured, sendMail } = await import("./integrations/mail");
      if (!mailConfigured()) throw new Error(MAIL_MISSING);
      const token = createPasswordResetToken(user.id);
      const origin = await currentBrowserOrigin();
      const resetUrl = new URL(`/login/reset?token=${encodeURIComponent(token)}`, `${origin}/`).toString();
      const mail = composePasswordResetEmail({ resetUrl });
      await sendMail({ to: user.email, subject: mail.subject, text: mail.text });
    }
    return { ok: true, message: PASSWORD_FORGOT_SENT };
  } catch (error) {
    return fail(error);
  }
}

export async function resetDispatcherPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const token = String(formData.get("token") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const policy = dispatcherPasswordError(password);
    if (policy) throw new Error(policy);
    if (password !== confirm) throw new Error("Password and confirmation do not match.");
    resetPasswordWithToken(token, password);
    redirect("/login");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

async function sendPasswordChangeSms(dispatcherId: number, resend = false): Promise<ActionResult> {
  const issued = issuePasswordSmsOtp(dispatcherId, { resend });
  const { sendTwilioSms, twilioConfigured } = await import("./integrations/twilio");
  const { SMS_MISSING_KEYS } = await import("./sms-shared");
  if (!twilioConfigured()) throw new Error(SMS_MISSING_KEYS);
  await sendTwilioSms({ to: issued.phone, body: composePasswordChangeSms({ code: issued.code }) });
  return {
    ok: true,
    needsSmsCode: true,
    maskedPhone: maskPhone(issued.phone),
    message: `We texted a code to ${maskPhone(issued.phone)}.`,
  };
}

export async function changeOwnPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const dispatcher = await requireSignedInDispatcher();
    const hasPhone = Boolean(dispatcher.phone?.trim());
    const resend = String(formData.get("resend") ?? "") === "1";
    const sendCode = String(formData.get("send_code") ?? "") === "1" || resend;
    if (sendCode) {
      if (!hasPhone) throw new Error(PASSWORD_SMS_NO_PHONE);
      return await sendPasswordChangeSms(dispatcher.id, resend);
    }
    const smsCode = String(formData.get("sms_code") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const policy = dispatcherPasswordError(password);
    if (policy) throw new Error(policy);
    if (password !== confirm) throw new Error("Password and confirmation do not match.");
    if (hasPhone) {
      if (!smsCode) throw new Error("Enter the text code we sent to your phone.");
      verifyPasswordSmsOtp(dispatcher.id, smsCode);
    }
    setDispatcherPassword(dispatcher.id, password);
    revalidatePath("/", "layout");
    if (String(formData.get("continue") ?? "") === "desk") {
      redirect("/");
    }
    return { ok: true, message: "Password updated." };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return fail(error);
  }
}

export async function updateOwnContactAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const dispatcher = await requireSignedInDispatcher();
    if (!dispatcher.id) throw new Error("Sign in to update your email.");
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    if (email && !isUsableEmail(email)) throw new Error("Enter a valid email, or leave it blank.");
    updateOwnDispatcherContact(dispatcher.id, { email, phone: phone || dispatcher.phone });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: email
        ? "Email saved. The next sign-in will email a code to this address."
        : "Contact saved. Add an email so sign-in can send a code.",
    };
  } catch (error) {
    return fail(error);
  }
}
