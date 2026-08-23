import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioFromNumber,
  isTwilioConfigured,
} from "../env";
import { SMS_MISSING_KEYS } from "../sms-shared";

const FETCH_TIMEOUT_MS = 15_000;

export function twilioConfigured(): boolean {
  return isTwilioConfigured();
}

export function formatSmsDestination(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error("Driver mobile must be a 10-digit US number or include a country code.");
}

export async function sendTwilioSms(
  input: { to: string; body: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const from = getTwilioFromNumber();
  if (!sid || !token || !from) {
    throw new Error(SMS_MISSING_KEYS);
  }
  const to = formatSmsDestination(input.to);
  const body = input.body.trim();
  if (!body) throw new Error("Type a short message.");
  if (body.length > 1600) throw new Error("Message is over 1,600 characters.");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.ok) return;

  let detail = `Twilio returned ${response.status}.`;
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) detail = redactSecrets(String(payload.message), sid, token);
  } catch {
    // Keep the status line when the body is not JSON.
  }
  throw new Error(detail);
}

function redactSecrets(text: string, sid: string, token: string): string {
  return text.split(token).join("[redacted]").split(sid).join("[redacted]");
}
