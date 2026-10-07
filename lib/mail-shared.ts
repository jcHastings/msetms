import { usableArEmail } from "./carrier-identity";

export const MAIL_MISSING = "Add SMTP or SendGrid in .env";
export const MAIL_FROM_DEFAULT = "dispatch@msloads.com";
export const MAIL_FROM_NAME = "MS Express TMS";
export const MAIL_NOREPLY = "noreply@msloads.com";

export const LOAD_MAIL_KINDS = ["driver_load", "customer_update", "customer_invoice"] as const;
export type LoadMailKind = (typeof LOAD_MAIL_KINDS)[number];

export type MailAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type OutgoingMail = {
  to: string;
  from?: string;
  subject: string;
  text: string;
  replyTo?: string;
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

/** Saved AR email only. Blank when the office has not set one. */
export function invoiceFromAddress(): string {
  // Lazy: db imports dispatcher-password, which imports this module.
  const { getDb } = require("./db") as typeof import("./db");
  const row = getDb()
    .prepare("SELECT ar_email FROM company_profile WHERE id = 1")
    .get() as { ar_email?: string } | undefined;
  return usableArEmail(row?.ar_email);
}
