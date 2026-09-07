/**
 * Office / dispatcher password rules. Safe to import from client components.
 * Driver PIN login is a different path and is not governed by this file.
 */
export const DISPATCHER_PASSWORD_SYMBOLS = "$&@!?#%^*+";

export const DISPATCHER_PASSWORD_MIN_LENGTH = 8;

export const DISPATCHER_PASSWORD_HINT =
  "Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and one of $ & @ ! ? # % ^ * +.";

export type DispatcherPasswordIssue =
  | "too_short"
  | "missing_upper"
  | "missing_lower"
  | "missing_digit"
  | "missing_symbol";

export function dispatcherPasswordIssues(password: string): DispatcherPasswordIssue[] {
  const issues: DispatcherPasswordIssue[] = [];
  if (password.length < DISPATCHER_PASSWORD_MIN_LENGTH) issues.push("too_short");
  if (!/[A-Z]/.test(password)) issues.push("missing_upper");
  if (!/[a-z]/.test(password)) issues.push("missing_lower");
  if (!/[0-9]/.test(password)) issues.push("missing_digit");
  const symbolRe = new RegExp(`[${DISPATCHER_PASSWORD_SYMBOLS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]`);
  if (!symbolRe.test(password)) issues.push("missing_symbol");
  return issues;
}

export function isQualifyingDispatcherPassword(password: string): boolean {
  return dispatcherPasswordIssues(password).length === 0;
}

export function dispatcherPasswordError(password: string): string | null {
  if (!password) return "Enter a password.";
  return isQualifyingDispatcherPassword(password) ? null : DISPATCHER_PASSWORD_HINT;
}
