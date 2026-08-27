/** Bind-all hosts a browser cannot open. */
function isUnreachableListenHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "0.0.0.0" || host === "::" || host === "::0" || host === "0:0:0:0:0:0:0:0";
}

function firstHeader(request: Request, name: string): string {
  return request.headers.get(name)?.split(",")[0]?.trim() ?? "";
}

function hostPort(host: string, fallback: string): string {
  const ipv6 = host.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (ipv6) return ipv6[2] ?? fallback;
  const parts = host.split(":");
  if (parts.length === 2 && parts[1]) return parts[1];
  return fallback;
}

function hostName(host: string): string {
  const ipv6 = host.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (ipv6?.[1]) return ipv6[1];
  return host.split(":")[0] ?? host;
}

/**
 * Origin a browser can navigate to after OAuth.
 * Never returns 0.0.0.0 or [::] even when the server bound HOSTNAME=0.0.0.0
 * and request.url uses that listen address.
 */
export function browserOrigin(request: Request): string {
  const incoming = new URL(request.url);
  const forwardedHost = firstHeader(request, "x-forwarded-host");
  const hostHeader = firstHeader(request, "host");
  const proto = firstHeader(request, "x-forwarded-proto") || incoming.protocol.replace(":", "") || "http";
  const rawHost = forwardedHost || hostHeader || incoming.host;
  const hostname = hostName(rawHost) || incoming.hostname;
  const port = hostPort(rawHost, incoming.port);
  const safeHost = isUnreachableListenHost(hostname) ? "localhost" : hostname;
  const defaultPort = proto === "https" ? "443" : "80";
  const suffix = port && port !== defaultPort ? `:${port}` : "";
  return `${proto}://${safeHost}${suffix}`;
}

export function browserUrl(pathname: string, request: Request): URL {
  return new URL(pathname, browserOrigin(request));
}
