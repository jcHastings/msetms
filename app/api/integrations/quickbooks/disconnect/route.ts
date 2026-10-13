import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { OFFICE_SUPPORT } from "@/components/office-support";
import { getSignedInDispatcher, viewOnlyWriteResponse } from "@/lib/dispatcher-session";
import { browserUrl } from "@/lib/http-origin";
import { canConnectQuickbooks, canWrite } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSRF_COOKIE = "tms_qbo_disconnect_csrf";
const RETURN_PATH = "/api/integrations/quickbooks/disconnect";

/**
 * Production calls disconnectQuickbooksAction, which revokes through
 * lib/integrations/quickbooks.ts. Tests replace run() so POST can prove a
 * revoke without calling Intuit.
 */
export const quickbooksRevoke = {
  async run(): Promise<void> {
    const { disconnectQuickbooksAction } = await import("@/lib/actions");
    await disconnectQuickbooksAction();
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loginRedirect(request: Request): Response {
  const login = browserUrl("/login", request);
  login.searchParams.set("next", RETURN_PATH);
  return NextResponse.redirect(login);
}

function settingsRedirect(request: Request, params: Record<string, string>): NextResponse {
  const settings = browserUrl("/settings/quickbooks", request);
  for (const [key, value] of Object.entries(params)) settings.searchParams.set(key, value);
  return NextResponse.redirect(settings, 303);
}

function forbiddenPage(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Access denied · MS Express TMS</title>
  <style>
    body { margin: 0; background: #f4f5f7; color: #252525; font-family: ui-sans-serif, system-ui, sans-serif; }
    main { max-width: 32rem; margin: 4rem auto; background: #fff; border: 1px solid #d3d9e0; border-radius: 4px; padding: 1.5rem; }
    a { color: #0c4a6e; }
  </style>
</head>
<body>
  <main>
    <h1>You do not have access</h1>
    <p>Only an administrator can disconnect QuickBooks.</p>
    <p><a href="/settings/quickbooks">QuickBooks settings</a></p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function gate(request: Request): Promise<Response | null> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher) return loginRedirect(request);
  if (!canConnectQuickbooks(dispatcher.role)) {
    if (!canWrite(dispatcher.role)) return viewOnlyWriteResponse();
    return forbiddenPage();
  }
  return null;
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return "";
}

function tokensMatch(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function csrfAccepts(request: Request, provided: string): boolean {
  if (!tokensMatch(readCookie(request, CSRF_COOKIE), provided)) return false;
  const expectedOrigin = browserUrl("/", request).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expectedOrigin;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function confirmHtml(token: string): string {
  const safeToken = escapeHtml(token);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Disconnect QuickBooks · MS Express TMS</title>
  <style>
    body { margin: 0; background: #f4f5f7; color: #252525; font-family: ui-sans-serif, system-ui, sans-serif; }
    main { max-width: 32rem; margin: 4rem auto; background: #fff; border: 1px solid #d3d9e0; border-radius: 4px; padding: 1.5rem; }
    p { line-height: 1.5; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
    button, .cancel {
      font: inherit; font-weight: 700; border-radius: 4px; padding: 0.55rem 0.9rem; text-decoration: none;
    }
    button { background: #137cdd; color: #fff; border: 0; cursor: pointer; }
    .cancel { background: #fff; color: #252525; border: 1px solid #d3d9e0; }
    .support { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #d3d9e0; font-size: 0.875rem; }
    .support a { color: #0c4a6e; }
  </style>
</head>
<body>
  <main data-qbo-disconnect-confirm="">
    <h1>Confirm disconnect</h1>
    <p>Disconnect MS Express from QuickBooks. Nothing is revoked until you submit this form.</p>
    <form method="post" action="${RETURN_PATH}">
      <input type="hidden" name="csrf" value="${safeToken}" />
      <div class="actions">
        <button type="submit">Disconnect QuickBooks</button>
        <a class="cancel" href="/settings/quickbooks">Cancel</a>
      </div>
    </form>
    <section class="support" data-office-support="" aria-label="${OFFICE_SUPPORT.label}">
      <h2>${OFFICE_SUPPORT.label}</h2>
      <p>${OFFICE_SUPPORT.name}</p>
      <p><a href="${OFFICE_SUPPORT.phoneHref}">${OFFICE_SUPPORT.phoneDisplay}</a></p>
      <p><a href="${OFFICE_SUPPORT.emailHref}">${OFFICE_SUPPORT.email}</a></p>
    </section>
  </main>
</body>
</html>`;
}

function csrfCookie(token: string, secure: boolean): string {
  const parts = [
    `${CSRF_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Confirm only. A bare GET never revokes the QuickBooks token. */
export async function GET(request: Request): Promise<Response> {
  const denied = await gate(request);
  if (denied) return denied;
  const token = randomBytes(32).toString("hex");
  const secure = browserUrl("/", request).protocol === "https:";
  const response = new NextResponse(confirmHtml(token), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": csrfCookie(token, secure),
    },
  });
  return response;
}

/** Revoke only after a same-origin POST with the confirm-screen CSRF token. */
export async function POST(request: Request): Promise<Response> {
  const denied = await gate(request);
  if (denied) return denied;
  let provided = "";
  try {
    const form = await request.formData();
    provided = String(form.get("csrf") ?? "");
  } catch {
    provided = "";
  }
  if (!csrfAccepts(request, provided)) return forbiddenPage();
  try {
    await quickbooksRevoke.run();
  } catch {
    return settingsRedirect(request, { error: "Could not disconnect QuickBooks." });
  }
  const response = settingsRedirect(request, { disconnected: "1" });
  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: browserUrl("/", request).protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}
