export const MAIL_MISSING = "Add SMTP or SendGrid in .env";
export const MAIL_FROM_DEFAULT = "info@msloads.com";
export const MAIL_FROM_NAME = "MS Express TMS";

export const LOAD_MAIL_KINDS = ["driver_load", "customer_update"] as const;
export type LoadMailKind = (typeof LOAD_MAIL_KINDS)[number];

export type MailAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
};

export type SentMailRow = {
  id: number;
  load_id: number;
  kind: LoadMailKind;
  to_email: string;
  subject: string;
  created_at: string;
};

export function isLoadMailKind(value: string): value is LoadMailKind {
  return (LOAD_MAIL_KINDS as readonly string[]).includes(value);
}

export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function isUsableEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
