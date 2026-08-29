import { getTwilioAccountSid, getTwilioAuthToken, getTwilioWhatsAppFrom } from "../env";
import { formatSmsDestination } from "./twilio";
import { WHATSAPP_MISSING } from "../whatsapp-shared";

const FETCH_TIMEOUT_MS = 15_000;

export function twilioWhatsAppConfigured(): boolean {
  return Boolean(getTwilioAccountSid() && getTwilioAuthToken() && getTwilioWhatsAppFrom());
}

export function whatsappConfigured(): boolean {
  return twilioWhatsAppConfigured();
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
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const fromRaw = getTwilioWhatsAppFrom();
  if (!sid || !token || !fromRaw) throw new Error(WHATSAPP_MISSING);
  const from = fromRaw.startsWith("whatsapp:") ? fromRaw : whatsappAddress(fromRaw);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: whatsappAddress(input.to), From: from, Body: body }),
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

function redactSecrets(text: string, sid: string, token: string): string {
  let next = text;
  if (token) next = next.split(token).join("[redacted]");
  if (sid) next = next.split(sid).join("[redacted]");
  return next;
}
