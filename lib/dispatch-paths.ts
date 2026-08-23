export const DISPATCHER_COOKIE = "tms_dispatcher";
export const DRIVER_COOKIE = "tms_driver_id";

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/api/login" || pathname === "/api/logout") return true;
  if (pathname === "/icon.svg" || pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/samples/")) return true;
  return false;
}

export function isDriverAppPath(pathname: string): boolean {
  return pathname === "/driver" || pathname.startsWith("/driver/");
}

/** Driver PIN session may read these; dispatcher session may too. */
export function isDriverSharedApi(pathname: string): boolean {
  return (
    /^\/api\/loads\/[^/]+\/confirmation$/.test(pathname) ||
    /^\/api\/attachments\/[^/]+$/.test(pathname)
  );
}

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return "/";
  return raw;
}
