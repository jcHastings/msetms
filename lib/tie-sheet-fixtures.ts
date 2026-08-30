/**
 * Test-only markdown/text of the example trucks, plus known-snapshot fill
 * when a picture is ambiguous. Do not import from dispatcher UI.
 *
 * Live picture crops (when present):
 *   tie-sheet-0824-14M.png — 3 orders, one drop MBL Hammond IN
 *   tie-sheet-0824-19E.png — 2 orders, one drop Westside Nonkosher Bronx NY, FCFS
 *   tie-sheet-0824-5W.png — 2 orders, one drop Zant Los Angeles CA
 *   tie-sheet-0824-9E.png — single order Bertolino Peabody MA
 *
 * Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
 */

import fs from "node:fs";
import path from "node:path";
import { normalizeTieSheetLoadId, parseTieSheetText, type TieSheetExtract } from "./tie-sheet-shared";

export const TIE_SHEET_FIXTURE_0824_14M = `0824-14M
Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
74774 | 89676G | MBL | Hammond, IN | 8/28 | 8/31 | 18,851 | Mixed | | 7:00 AM
74775 | 89784 | MBL | Hammond, IN | 8/28 | 8/31 | 17,330 | 245 | | 7:00 AM
74929 | Kosher 89786 | MBL | Hammond, IN | 8/28 | 8/31 | 352 | 6 | | 7:00 AM
XK + TOTAL | | | | | | 36,533 |
`;

export const TIE_SHEET_FIXTURE_0824_19E = `0824-19E
Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
74480 | 288167 | Westside Nonkosher | Bronx, NY | 8/29 | 8/31 | 5,319 | 107 | Saturday | FCFS 7am - 4pm
74795 | 289281 | Westside Nonkosher | Bronx, NY | 8/29 | 8/31 | 14,301 | 215 | | FCFS 7am - 4pm
XK + TOTAL | | | | | | 19,620 |
`;

export const TIE_SHEET_FIXTURE_0824_5W = `0824-5W
Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
74792 | 468110 | Zant | Los Angeles, CA | 8/28 | 8/31 | 36,244 | 570 | | 4pm appt 8/31
74794 | 468111 | Zant | Los Angeles, CA | 8/28 | 8/31 | 4,840 | 87 | Halal | 4pm appt 8/31
XK + TOTAL | | | | | | 41,084 |
`;

export const TIE_SHEET_FIXTURE_0824_9E = `0824-9E
Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
74789 | 128494 | Bertolino | Peabody, MA | 8/28 | 8/31 | 37,152 | 630 | | 8am appt 8/31
XK + TOTAL | | | | | | 37,152 |
`;

export const TIE_SHEET_FIXTURE_0824_4W = `0824-4W
Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
74865 | | Rolling Ranch | Ontario, CA | 8/28 | 8/30 | 16,379 | 250 | | FCFS 5am - 1pm
74846 | | Heartland Kosher - Western Kosher | Los Angeles, CA | 8/28 | 8/30 | 6,636 | 165 | | FCFS 7am - 4pm
7599 | Email | Western Kosher - Crossdock Deli | Los Angeles, CA | 8/28 | 8/30 | 90 | 10 | 1 pallet | FCFS 7am - 4pm
7714 | Email | Western Kosher - Deli Crossdock | Los Angeles, CA | 8/28 | 8/30 | 120 | 10 | | FCFS 7am - 4pm
7621 | Email | Western Kosher - Deli Crossdock | Los Angeles, CA | 8/28 | 8/30 | 100 | 10 | | FCFS 7am - 4pm
7622 | Email | Western Kosher - Deli Crossdock | Los Angeles, CA | 8/28 | 8/30 | 194 | 15 | | FCFS 7am - 4pm
74793 | 468128 | Zant | Los Angeles, CA | 8/28 | 8/31 | 16,110 | 313 | | 9am appt 8/31
XK + TOTAL | | | | | | 39,629 |
`;

/** Same-receiver trucks (one drop each). 0824-4W is the mixed multi-drop fixture. */
export const TIE_SHEET_FIXTURES = [
  { id: "0824-14M", text: TIE_SHEET_FIXTURE_0824_14M },
  { id: "0824-19E", text: TIE_SHEET_FIXTURE_0824_19E },
  { id: "0824-5W", text: TIE_SHEET_FIXTURE_0824_5W },
  { id: "0824-9E", text: TIE_SHEET_FIXTURE_0824_9E },
] as const;

export const TIE_SHEET_PICTURE_FILES = [
  { id: "0824-14M", file: "tie-sheet-0824-14M.png" },
  { id: "0824-19E", file: "tie-sheet-0824-19E.png" },
  { id: "0824-5W", file: "tie-sheet-0824-5W.png" },
  { id: "0824-9E", file: "tie-sheet-0824-9E.png" },
] as const;

const KNOWN_TEXTS: Record<string, string> = {
  "0824-14M": TIE_SHEET_FIXTURE_0824_14M,
  "0824-19E": TIE_SHEET_FIXTURE_0824_19E,
  "0824-5W": TIE_SHEET_FIXTURE_0824_5W,
  "0824-9E": TIE_SHEET_FIXTURE_0824_9E,
  "0824-4W": TIE_SHEET_FIXTURE_0824_4W,
};

export function knownTieSheetExtract(loadId: string): TieSheetExtract | null {
  const key = normalizeTieSheetLoadId(loadId);
  const text = KNOWN_TEXTS[key];
  if (!text) return null;
  return parseTieSheetText(text);
}

/** Live crop if the dispatcher-attached PNG is on disk. Tests only. */
export function readTieSheetPictureFixture(
  id: string,
  cwd = process.cwd(),
): { buffer: Buffer; filename: string; mimeType: string } | null {
  const row = TIE_SHEET_PICTURE_FILES.find((item) => item.id === id);
  const names = [
    row?.file,
    path.join("scripts", "fixtures", "tie-sheet", `${id}.png`),
    path.join("lib", "tie-sheet-pictures", `${id}.png`),
  ].filter((name): name is string => Boolean(name));
  for (const name of names) {
    const full = path.isAbsolute(name) ? name : path.join(cwd, name);
    if (fs.existsSync(full)) {
      return { buffer: fs.readFileSync(full), filename: path.basename(full), mimeType: "image/png" };
    }
  }
  return null;
}
