import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioFromNumber,
  getTwilioWhatsAppFrom,
  getWhatsAppAccessToken,
  getWhatsAppPhoneNumberId,
} from "../env";
import { formatSmsDestination } from "./twilio";
import { WHATSAPP_MISSING } from "../whatsapp-shared";

const FETCH_TIMEOUT_MS = 15_000;

export function whatsappConfigured(): boolean {
  return twilioWhatsAppConfigured() || metaWhatsAppConfigured();
}

export function twilioWhatsAppConfigured(): boolean {
  return Boolean(getTwilioAccountSid() && getTwilioAuthToken() && getTwilioWhatsAppFrom());
}

export function metaWhatsAppConfigured(): boolean {
  return Boolean(getWhatsAppAccessToken() && getWhatsAppPhoneNumberId());
}

function whatsappAddress(phone: string): string {
  const e164 = formatSmsDestination(phone);
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}

export async function sendWhatsAppMessage(
  input: { to: string; body: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error("Type a short message.");
  if (body.length > 1600) throw new Error("Message is over 1,600 characters.");
  if (twilioWhatsAppConfigured()) {
    await sendTwilioWhatsApp(input.to, body, fetchImpl);
    return;
  }
  if (metaWhatsAppConfigured()) {
    await sendMetaWhatsApp(input.to, body, fetchImpl);
    return;
  }
  throw new Error(WHATSAPP_MISSING);
}

async function sendTwilioWhatsApp(to: string, body: string, fetchImpl: typeof fetch): Promise<void> {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const fromRaw = getTwilioWhatsAppFrom() || getTwilioFromNumber();
  if (!sid || !token || !fromRaw) throw new Error(WHATSAPP_MISSING);
  const from = fromRaw.startsWith("whatsapp:") ? fromRaw : whatsappAddress(fromRaw);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: whatsappAddress(to), From: from, Body: body }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.ok) return;
  let detail = `WhatsApp returned ${response.status}.`;
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) detail = redactSecrets(String(payload.message), sid, token);
  } catch {
    // Keep the status line when the body is not JSON.
  }
  throw new Error(detail);
}

async function sendMetaWhatsApp(to: string, body: string, fetchImpl: typeof fetch): Promise<void> {
  const token = getWhatsAppAccessToken();
  const phoneId = getWhatsAppPhoneNumberId();
  if (!token || !phoneId) throw new Error(WHATSAPP_MISSING);
  const dest = formatSmsDestination(to).replace(/^\+/, "");
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: dest,
      type: "text",
      text: { body, preview_url: false },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.ok) return;
  let detail = `WhatsApp returned ${response.status}.`;
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    if (payload.error?.message) detail = redactSecrets(String(payload.error.message), "", token);
  } catch {
    // Keep the status line when the body is not JSON.
  }
  throw new Error(detail);
}

function redactSecrets(text: string, sid: string, token: string): string {
  let next = text;
  if (token) next = next.split(token).join("[redacted]");
  if (sid) next = next.split(sid).join("[redacted]");
  return next;
}
