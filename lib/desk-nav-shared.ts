/** Client-safe sidebar active-state rules. No db, env, or secrets. */

const EXACT_NAV_HREFS = new Set(["/", "/accounting", "/fleet", "/reports"]);

export function isDeskNavActive(href: string, pathname: string): boolean {
  if (EXACT_NAV_HREFS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
