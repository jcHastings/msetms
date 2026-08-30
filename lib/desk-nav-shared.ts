/** Client-safe sidebar active-state rules. No db, env, or secrets. */

const EXACT_NAV_HREFS = new Set(["/", "/accounting", "/fleet", "/reports"]);

export function isDeskNavActive(href: string, pathname: string): boolean {
  if (EXACT_NAV_HREFS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function deskNavSectionForPath(
  pathname: string,
  sections: Array<{ title: string; items: Array<{ href: string }> }>,
): string | null {
  for (const section of sections) {
    if (section.items.some((item) => isDeskNavActive(item.href, pathname))) return section.title;
  }
  return null;
}

/** Accordion only. Never a set of open parents — JC’s “all open” clip is the anti-pattern. */
export const DESK_NAV_ACCORDION = "single" as const;

/** Opening one parent closes the others. Clicking the open parent collapses all. */
export function nextDeskNavOpenSection(currentOpen: string | null, clicked: string): string | null {
  if (!clicked) return currentOpen;
  return currentOpen === clicked ? null : clicked;
}
