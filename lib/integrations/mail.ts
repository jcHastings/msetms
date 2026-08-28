import nodemailer from "nodemailer";
import {
  getSendgridApiKey,
  getSmtpFrom,
  getSmtpHost,
  getSmtpPass,
  getSmtpPort,
  getSmtpUser,
  isMailConfigured,
  isSendgridConfigured,
  isSmtpConfigured,
} from "../env";
import { MAIL_FROM_NAME, MAIL_MISSING, type OutgoingMail } from "../mail-shared";

const FETCH_TIMEOUT_MS = 20_000;

export function mailConfigured(): boolean {
  return isMailConfigured();
}

export function mailTransport(): "smtp" | "sendgrid" | "none" {
  if (isSmtpConfigured()) return "smtp";
  if (isSendgridConfigured()) return "sendgrid";
  return "none";
}

export function mailFromAddress(): string {
  return getSmtpFrom();
}

export async function sendMail(
  input: OutgoingMail,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const transport = mailTransport();
  if (transport === "none") throw new Error(MAIL_MISSING);
  const to = input.to.trim();
  if (!to) throw new Error("Add a recipient email.");
  const subject = input.subject.trim();
  const text = input.text.trim();
  if (!subject || !text) throw new Error("Email is empty.");
  const from = mailFromAddress();
  if (transport === "smtp") {
    await sendSmtpMail({ from, to, subject, text, attachments: input.attachments ?? [] });
    return;
  }
  await sendSendgridMail({ from, to, subject, text, attachments: input.attachments ?? [] }, fetchImpl);
}

async function sendSendgridMail(
  input: {
    from: string;
    to: string;
    subject: string;
    text: string;
    attachments: NonNullable<OutgoingMail["attachments"]>;
  },
  fetchImpl: typeof fetch,
): Promise<void> {
  const key = getSendgridApiKey();
  if (!key) throw new Error(MAIL_MISSING);
  const response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: input.from, name: MAIL_FROM_NAME },
      subject: input.subject,
      content: [{ type: "text/plain", value: input.text }],
      attachments: input.attachments.map((file) => ({
        content: file.content.toString("base64"),
        filename: file.filename,
        type: file.contentType,
        disposition: "attachment",
      })),
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.ok || response.status === 202) return;
  let detail = `SendGrid returned ${response.status}.`;
  try {
    const payload = (await response.json()) as { errors?: Array<{ message?: string }> };
    const message = payload.errors?.map((row) => row.message).filter(Boolean).join(" ");
    if (message) detail = redactSecrets(message, key);
  } catch {
    // Keep the status line when the body is not JSON.
  }
  throw new Error(detail);
}

async function sendSmtpMail(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments: NonNullable<OutgoingMail["attachments"]>;
}): Promise<void> {
  const host = getSmtpHost();
  if (!host) throw new Error(MAIL_MISSING);
  const port = getSmtpPort();
  const user = getSmtpUser();
  const pass = getSmtpPass();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  try {
    await transporter.sendMail({
      from: `${MAIL_FROM_NAME} <${input.from}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
      })),
    });
  } catch (error) {
    throw new Error(redactSecrets(error instanceof Error ? error.message : "Mail send failed.", user ?? "", pass ?? ""));
  } finally {
    transporter.close();
  }
}

function redactSecrets(text: string, ...secrets: string[]): string {
  let next = text;
  for (const secret of secrets) {
    if (secret) next = next.split(secret).join("[redacted]");
  }
  return next;
}
