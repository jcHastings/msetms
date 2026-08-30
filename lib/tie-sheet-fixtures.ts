/**
 * Test-only markdown/text of the four 8.24 trucks.
 * Layout reference for unit tests. Do not import from dispatcher UI.
 *
 * Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
 */

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

export const TIE_SHEET_FIXTURES = [
  { id: "0824-14M", text: TIE_SHEET_FIXTURE_0824_14M },
  { id: "0824-19E", text: TIE_SHEET_FIXTURE_0824_19E },
  { id: "0824-5W", text: TIE_SHEET_FIXTURE_0824_5W },
  { id: "0824-9E", text: TIE_SHEET_FIXTURE_0824_9E },
] as const;
