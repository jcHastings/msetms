import { getDb } from "./db";
import { getDriver } from "./queries";
import { getDispatcherUser } from "./settings";

export type LoginAuditKind = "office" | "driver";
export type LoginAuditOutcome = "success" | "failure";
export type LoginAuditStep = "password" | "email_code" | "pin";

export type LoginAuditRow = {
  id: number;
  kind: LoginAuditKind;
  outcome: LoginAuditOutcome;
  step: LoginAuditStep;
  user_id: number | null;
  user_name: string;
  ip_address: string;
  user_agent: string;
  detail: string;
  created_at: string;
};

export type LoginAuditFilters = {
  user?: string;
  outcome?: LoginAuditOutcome | "all";
  kind?: LoginAuditKind | "all";
  from?: string;
  to?: string;
  limit?: number;
};

const SECRET_DUMP = /(password|passwd|secret|token|otp|pin|credential|api[_-]?key)\s*[:=]/i;

function sanitizeAuditText(value: string, max = 160): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (SECRET_DUMP.test(text)) return "[redacted]";
  return text.slice(0, max);
}

function sanitizeIp(value: string): string {
  const raw = String(value ?? "").trim().slice(0, 80);
  if (!raw || SECRET_DUMP.test(raw)) return "";
  return raw;
}

function startOfDay(value?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function endOfDay(value?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T23:59:59.999Z`;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function loginAuditUserName(kind: LoginAuditKind, userId: number | null | undefined): string {
  if (userId == null || !Number.isFinite(userId) || userId <= 0) return "";
  if (kind === "office") return getDispatcherUser(userId)?.name ?? "";
  return getDriver(userId)?.name ?? "";
}

export function recordLoginAttempt(input: {
  kind: LoginAuditKind;
  outcome: LoginAuditOutcome;
  step: LoginAuditStep;
  userId?: number | null;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  detail?: string;
}): LoginAuditRow {
  const userId = input.userId != null && Number.isFinite(input.userId) && input.userId > 0 ? input.userId : null;
  const userName = sanitizeAuditText(input.userName || loginAuditUserName(input.kind, userId), 80);
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO login_audit (
         kind, outcome, step, user_id, user_name, ip_address, user_agent, detail, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.kind,
      input.outcome,
      input.step,
      userId,
      userName,
      sanitizeIp(input.ipAddress ?? ""),
      sanitizeAuditText(input.userAgent ?? "", 240),
      sanitizeAuditText(input.detail ?? ""),
      createdAt,
    );
  return {
    id: Number(result.lastInsertRowid),
    kind: input.kind,
    outcome: input.outcome,
    step: input.step,
    user_id: userId,
    user_name: userName,
    ip_address: sanitizeIp(input.ipAddress ?? ""),
    user_agent: sanitizeAuditText(input.userAgent ?? "", 240),
    detail: sanitizeAuditText(input.detail ?? ""),
    created_at: createdAt,
  };
}

export async function requestClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const incoming = await headers();
    const forwarded = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (forwarded) return sanitizeIp(forwarded);
    return sanitizeIp(incoming.get("x-real-ip")?.trim() || incoming.get("cf-connecting-ip")?.trim() || "");
  } catch {
    return "";
  }
}

export async function requestUserAgent(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const incoming = await headers();
    return sanitizeAuditText(incoming.get("user-agent") ?? "", 240);
  } catch {
    return "";
  }
}

export async function recordLoginAttemptFromRequest(
  input: Omit<Parameters<typeof recordLoginAttempt>[0], "ipAddress" | "userAgent">,
): Promise<LoginAuditRow> {
  return recordLoginAttempt({
    ...input,
    ipAddress: await requestClientIp(),
    userAgent: await requestUserAgent(),
  });
}

export function listLoginAudit(filters: LoginAuditFilters = {}): LoginAuditRow[] {
  const user = (filters.user ?? "").trim();
  const outcome = filters.outcome && filters.outcome !== "all" ? filters.outcome : "";
  const kind = filters.kind && filters.kind !== "all" ? filters.kind : "";
  const from = startOfDay(filters.from);
  const to = endOfDay(filters.to);
  const limit = Math.min(Math.max(filters.limit ?? 300, 1), 1000);
  return getDb()
    .prepare(
      `SELECT * FROM login_audit
       WHERE (? = '' OR user_name LIKE ?)
         AND (? = '' OR outcome = ?)
         AND (? = '' OR kind = ?)
         AND (? = '' OR created_at >= ?)
         AND (? = '' OR created_at <= ?)
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(user, `%${user}%`, outcome, outcome, kind, kind, from, from, to, to, limit) as LoginAuditRow[];
}

export function listLoginAuditNames(): string[] {
  return (
    getDb().prepare("SELECT DISTINCT user_name FROM login_audit ORDER BY user_name COLLATE NOCASE").all() as Array<{
      user_name: string;
    }>
  )
    .map((row) => row.user_name)
    .filter(Boolean);
}

export function publicLoginFailureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "Sign-in failed.";
  return sanitizeAuditText(message);
}
