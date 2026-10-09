import { createHash, timingSafeEqual } from "node:crypto";

export function cronTokensMatch(expected: string, provided: string): boolean {
  const left = createHash("sha256").update(expected, "utf8").digest();
  const right = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function bearerToken(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match?.[1] ?? "";
}

/** 127.0.0.0/8, ::1, and localhost. IPv4-mapped IPv6 counts as loopback. */
export function isLoopbackAddress(value: string): boolean {
  const raw = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!raw) return false;
  if (raw === "localhost" || raw === "::1" || raw === "0:0:0:0:0:0:0:1") return true;
  const v4 = raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
  const parts = v4.split(".");
  if (parts.length !== 4) return false;
  if (parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => part > 255)) return false;
  return numbers[0] === 127;
}

export function hostIsLoopback(hostHeader: string | null): boolean {
  const host = (hostHeader ?? "").trim().toLowerCase();
  if (!host) return false;
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 1 && isLoopbackAddress(host.slice(1, end));
  }
  return isLoopbackAddress(host.replace(/:\d+$/, ""));
}

function forwardedAddress(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

export function requestIsLoopback(input: {
  hostHeader: string | null;
  requestHostname: string;
  forwardedFor: string | null;
  realIp: string | null;
  cfConnectingIp: string | null;
}): boolean {
  if (!hostIsLoopback(input.hostHeader)) return false;
  if (!isLoopbackAddress(input.requestHostname)) return false;
  for (const header of [input.cfConnectingIp, input.realIp, input.forwardedFor]) {
    const client = forwardedAddress(header);
    if (client && !isLoopbackAddress(client)) return false;
  }
  return true;
}

export function authorizeCronRequest(input: {
  expectedToken: string | undefined;
  authorizationHeader: string | null;
  hostHeader: string | null;
  requestHostname: string;
  forwardedFor: string | null;
  realIp: string | null;
  cfConnectingIp: string | null;
}): { ok: true } | { ok: false; status: 401 | 403 | 503; error: string } {
  if (
    !requestIsLoopback({
      hostHeader: input.hostHeader,
      requestHostname: input.requestHostname,
      forwardedFor: input.forwardedFor,
      realIp: input.realIp,
      cfConnectingIp: input.cfConnectingIp,
    })
  ) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  const expected = input.expectedToken?.trim() ?? "";
  if (!expected) return { ok: false, status: 503, error: "Feed refresh is disabled." };
  const provided = bearerToken(input.authorizationHeader);
  if (!provided || !cronTokensMatch(expected, provided)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  return { ok: true };
}

export function cronTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.TMS_CRON_TOKEN?.trim();
  return value ? value : undefined;
}
