/** Cookie the dispatcher session uses. Kept here so proxy.ts stays dependency-light. */
export const DISPATCHER_SESSION_COOKIE = "tms_dispatcher_id";

export const PUBLIC_PAGE_HEADER = "x-tms-public";

const REFRESH_MARKERS = new Set(["refetch", "inside-shared-layout", "metadata-only"]);
const DYNAMIC_PARAM_TYPES = new Set([
  "c",
  "ci(..)(..)",
  "ci(.)",
  "ci(..)",
  "ci(...)",
  "oc",
  "d",
  "di(..)(..)",
  "di(.)",
  "di(..)",
  "di(...)",
]);

function isSegment(value: unknown): boolean {
  if (typeof value === "string") return true;
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) return false;
  const [name, cacheKey, kind, siblings] = value;
  if (typeof name !== "string" || typeof cacheKey !== "string") return false;
  if (!DYNAMIC_PARAM_TYPES.has(kind)) return false;
  if (siblings == null) return true;
  return Array.isArray(siblings) && siblings.every((item) => typeof item === "string");
}

function isFlightRouterState(value: unknown, depth = 0): boolean {
  if (depth > 40 || !Array.isArray(value) || value.length < 2 || value.length > 5) return false;
  if (!isSegment(value[0])) return false;
  const children = value[1];
  if (!children || typeof children !== "object" || Array.isArray(children)) return false;
  for (const child of Object.values(children)) {
    if (!isFlightRouterState(child, depth + 1)) return false;
  }
  if (value.length >= 3 && value[2] != null) {
    const url = value[2];
    if (!Array.isArray(url) || url.length !== 2 || typeof url[0] !== "string" || typeof url[1] !== "string") {
      return false;
    }
  }
  if (value.length >= 4 && value[3] != null && !REFRESH_MARKERS.has(value[3])) return false;
  if (value.length >= 5 && value[4] !== undefined && typeof value[4] !== "number") return false;
  return true;
}

export function parseFlightRouterStateHeader(header: string | null | undefined): unknown | null {
  if (!header) return null;
  try {
    const state = JSON.parse(decodeURIComponent(header));
    return isFlightRouterState(state) ? state : null;
  } catch {
    return null;
  }
}

export function shouldDropFlightRouterStateHeader(header: string | null | undefined): boolean {
  return Boolean(header) && parseFlightRouterStateHeader(header) === null;
}

export function stripInvalidFlightRouterState(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const raw = headers["next-router-state-tree"];
  if (Array.isArray(raw)) {
    delete headers["next-router-state-tree"];
    return true;
  }
  if (shouldDropFlightRouterStateHeader(raw)) {
    delete headers["next-router-state-tree"];
    return true;
  }
  return false;
}

export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/driver");
}
