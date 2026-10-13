/** Journal line for a swallowed integration failure. Status or code only — never a token, body, or URL. */
export function integrationErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isInteger(status) && status > 0) return `HTTP ${status}`;
  }
  if (error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`)) return "timeout";
  return "error";
}

export function integrationErrorCodeFromText(text: string): string {
  const http = text.match(/HTTP\s+(\d{3})/i);
  if (http) return `HTTP ${http[1]}`;
  const code = text.match(/\bcode\s+(\d+)\b/i);
  if (code) return `code ${code[1]}`;
  if (/timeout/i.test(text)) return "timeout";
  return "error";
}

export function logSwallowedIntegrationError(feed: string, error: unknown): void {
  const name = feed.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "integration";
  console.error(`${name}: ${integrationErrorCode(error)}`);
}
