# Taste Skill UI audit - MS Express TMS

**Date:** 2026-09-19  
**CoS constraint (locked):** Taste Skill docs lean landing/portfolio. This audit is **shop-floor dashboard only**: density, hierarchy, mobile (~390px). No SaaS marketing makeover. No consumer landing aesthetics. No glassmorphism heroes. No purple gradients. No airy whitespace.  
**Stack tip:** `eceef6bb576dd0ac84cf993411e09bf35ec0628d` (PR 70 Taste Skill squash into `cursor/samsara-still-docs-4c31`)  
**Mode:** Redesign-preserve. Findings only. No redesign merge. No Office Update.  
**Captures:** Local app on that tip, unless a file is labeled `ref-live-*` (public office at https://msetms.mandsloads.com, may still be on `997a199`).

## PRESERVE

Lead with what must not change. These are the product.

1. **Shop-floor density** on the desktop board: load# in Geist Mono, sticky Load + Status, Pickup / Delivery / Unit / Reefer / Rate in one scan row.
2. **Ops language:** Load #, trailer, appointment, temp / reefer, POD, lumper, cover, dispatch. Plain status: Assigned. Loaded. On time for appt. POD in.
3. **Soft/direct copy** already on login and empty states ("Sign in with email and password.", "None yet.", "Nothing assigned to you right now."). Keep that register. No corporate speak. No brokerage hype.
4. **Brand tokens:** sidebar `#07325a`, accent `#137cdd`, logo crimson `#e11d2e`, 2-4px radii on the office desk. Navy stays navy.
5. **Phone board card stack** that stopped sticky Load/Status/MOVE overlap (PR 59 / tip). Do not bring sticky overlay back at ~390px.
6. **Driver dispatch card** (once a load is assigned): load#, lane, customer, pickup/delivery, progress, setpoint + live temp. That card is the shop-floor pattern. Home should show that work, not hide it.
7. **Large driver tap targets** (`min-h-14` check-in). Glove-box, not icon-only.
8. **Label above input** on office and driver forms. No placeholder-as-label.
9. **Geist + Geist Mono.** Mono for load# and temps.
10. **Semantic status pills** for real load / HOS / reefer state (`HIGH TEMP`, Assigned, In transit).
11. **IA and slugs:** `/board`, `/driver`, `/fleet/trucks/[id]`, `/login`, `/driver/login`. Do not rename nav labels.
12. **Empty-cell "—"** on the board (HOS, GPS, blank money). Shop-floor convention. Do not swap it to satisfy a landing-page punctuation rule.

## Design read (locked)

Reading this as: **redesign-preserve audit** of a **shop-floor trucking TMS** for **dispatchers and drivers**, **soft/direct ops voice**, **high density / low motion / low variance**. Cockpit. Not a portfolio. Not a SaaS marketing site.

| Dial | Existing | Keep |
|---|---|---|
| Variance | ~3 (symmetric desk, sticky columns) | 3 |
| Motion | ~2 (hover / active only) | 2 |
| Density | ~8 (packed board, 12.5px load fields, mono load#) | 8 |

Taste Skill Section 13: dashboards and data tables are out of scope for landing aesthetics. This file applies **audit-first + anti-slop** only where they help scan speed, hierarchy, and ~390px. It does not recommend a design-system restyle, a landing pass, or more whitespace.

**Primary paths:** `/board` (Active Loads) → load overlay Actions → `/driver` + `/driver/dispatch` → `/fleet/trucks/[id]` docs → `/login` and `/driver/login`.

| Token | Value | Where |
|---|---|---|
| Sidebar / navy | `#07325a` / `#0a4173` | Office chrome, office login, load tabs |
| Accent | `#137cdd` | Primary buttons, active tab |
| Text | `#252525` / muted `#5b6b7c` | Desk body |
| Office radius | 2-4px | Desk controls |
| Driver canvas | `bg-slate-950` + 1rem tiles | Split from desk (P0-3 / P0-4) |

---

## P0

Ranked by shop-floor harm: can the dispatcher or driver see load# / appt / temp / unit and act on them, especially at ~390px.

### P0-1. Dispatch board at ~390px hides Reefer, HOS, Delivery, Unit, Rate

| | |
|---|---|
| **Screen** | `/board` Active Loads, ~390px |
| **Issue** | Phone stack keeps Load + Status + Pickup + MOVE/Actions. CSS hides Delivery, Unit, Tractor, Trailer, HOS, Reefer, Rate. Desktop shows `HIGH TEMP` on MSE-1045; the phone card cannot. Actions + Change unit + Edit dominate each card. |
| **Rule** | Mobile collapse must keep the job (temp, appt, unit). Density first. Do not restore the sticky overlay that already failed at 390. |
| **Fix** | Keep the no-overlap card stack. Add a second ops row: Delivery window + Reefer (set / live / HIGH TEMP) + HOS. Fold Assign/Edit into the existing Actions sheet. |
| **Proof** | `docs/taste-ui-audit/screenshots/p0-board-390.png` vs `p0-board-desktop.png`. |

```1349:1356:app/globals.css
  .table-grid-board tbody .board-delivery-cell,
  .table-grid-board tbody .board-unit-cell,
  .table-grid-board tbody .board-place-cell,
  .table-grid-board tbody .board-hos-cell,
  .table-grid-board tbody .board-reefer-cell,
  .table-grid-board tbody .board-rate-cell {
    display: none;
  }
```

### P0-2. Load Actions: too many equal-weight controls, wrap at 390

| | |
|---|---|
| **Screen** | Load overlay / `/loads/[id]`, desktop drawer and 390 full-bleed |
| **Issue** | Text dispatch, Email customer update, Email invoice, Load Log, Dispatch and Tracking, Load Documents, Admin / Financials, Backhaul Finder, Copy / Cancel / Archive all sit as the same navy chip. Email invoice is in the strip and in two menus. At 390, load tabs wrap to three lines (`Carrier and Driver Info`). Chat + share link sit above Basics. |
| **Rule** | Hierarchy: one scan for the next action. Duplicate controls slow the desk. Chrome must fit ~390 without wrapping the tab row. |
| **Fix** | Two or three primaries (Text driver, Docs, Log). One overflow More. Short tab labels on phone, same pattern as board tabs (`Active` / `Planning`). Do not add pills. |
| **Proof** | `p0-load-actions-desktop.png`, `p0-load-actions-390.png`. |

```308:311:components/load-workspace.tsx
      <div className="load-actions mb-2 px-2 py-1.5">
        <div className="load-actions-label mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]">Load Actions</div>
        <div className="flex flex-wrap items-center gap-1">
```

### P0-3. Driver home hides the assigned load

| | |
|---|---|
| **Screen** | `/driver` (home), desktop and 390 |
| **Issue** | Featured "Dispatch" tile plus a 2-col tile pad. With Unit 112 and MSE-1045 assigned, home still hides load#, appt, and temp. Driver must tap Dispatch to see the work. Amber tracking "MY DISPATCH" label is decoration, not ops. |
| **Rule** | Hierarchy: current load is the home. Density: do not make the driver hunt for temp / appt. Soft/direct: sentence-case "My dispatch" is enough. |
| **Fix** | Lead with the current load sheet already proven on `/driver/dispatch` (load#, appt, setpoint / live temp, one check-in). Tiles stay a compact second row. Do not restyle as a consumer app. |
| **Proof** | `p0-driver-home-390.png`, `p0-driver-home-desktop.png`. PRESERVE the card on `p0-driver-dispatch-390.png`. |

```26:28:app/driver/page.tsx
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
            My dispatch
          </div>
```

### P0-4. Driver login lockup fails contrast; office and driver chrome do not match

| | |
|---|---|
| **Screen** | `/login` vs `/driver/login`, desktop and 390 |
| **Issue** | Office: navy canvas, white logo chip, readable wordmark. Driver: `BrandMark` default light variant (navy wordmark + light logo) on `bg-slate-950`. Wordmark drops out at 390. Two login chrome systems for one fleet. |
| **Rule** | Contrast on the sign-in the driver actually uses. Same MS Express lockup. Not a landing theme exercise. |
| **Fix** | `BrandMark variant="dark"` on driver login (same chip as office). Keep "Sign in" vs "Open my dispatch". Keep navy office canvas. Do not add a hero, gradient, or extra whitespace. |
| **Proof** | `p0-login-office-desktop.png`, `p0-login-office-390.png`, `p0-login-driver-desktop.png`, `p0-login-driver-390.png`. Live public (may lag tip): `ref-live-login-*.png`. |

```14:16:app/driver/login/page.tsx
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
```

### P0-5. Desktop board Actions column eats the scan row

| | |
|---|---|
| **Screen** | `/board` desktop (~1440) |
| **Issue** | `.board-end-cell` is 24% width, sticky right: MOVE select + Actions + Assign/Change unit + Edit. Load / Pickup / Reefer get squeezed. Tractor / trailer / HOS often collapse to "—". Assign is also inside Actions. |
| **Rule** | Density: the scan row is load# / appt / unit / temp, not a button stack. Duplicate Assign is wasted chrome. |
| **Fix** | MOVE stays. One overflow for Assign / Edit / Backhaul. Actions column closer to 8-10%, not 24%. Leave the table packed. Do not add card padding or air. |
| **Proof** | `p0-board-desktop.png`. |

```701:711:app/globals.css
.table-grid-board .board-end-cell {
  position: sticky;
  right: 0;
  z-index: 3;
  width: 24%;
  min-width: 0;
  padding: 0;
  background: #fff;
  box-shadow: -1px 0 0 var(--border);
  overflow: visible;
}
```

---

## P1

### P1-1. Load tab labels wrap on phone

| | |
|---|---|
| **Screen** | Load overlay ~390 |
| **Issue** | Full labels ("Carrier and Driver Info", "Customer Info") wrap to three lines on the navy tab bar. Board already solved this with `load-tab-short`. |
| **Rule** | Phone chrome stays one row. |
| **Fix** | Short labels under 48rem: Basics / Customer / Unit / Stops / Pay / Log / Docs. |
| **Proof** | `p0-load-actions-390.png`. |

### P1-2. Desk padding and card blur slow the scan

| | |
|---|---|
| **Screen** | Office shell, board card, fleet truck |
| **Issue** | `.card` uses `--glass` + `backdrop-filter: blur(16px)`. `PageHeader` is `text-2xl` + `mb-6`. `.desk-main-inner` is `px-8 py-7`. That is air on a dispatch desk. |
| **Rule** | High density: tight pad, 1px rules, solid cells. Do not add more whitespace. Blur is not a hero; it just softens the grid. |
| **Fix** | Solid surface, 1px `--border`, no blur on the board / fleet cards. Use the existing `PageHeader dense`. Main pad closer to `px-4 py-3`. |
| **Proof** | `p1-fleet-truck-docs-desktop.png`, `p0-board-desktop.png`. |

```1067:1074:app/globals.css
.card {
  background: var(--glass);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  border-radius: var(--r-sm);
  box-shadow: var(--glass-shadow);
}
```

### P1-3. Driver load repeats setpoint; disabled check-ins take full rows

| | |
|---|---|
| **Screen** | `/driver/loads/[id]`, especially 390 |
| **Issue** | Setpoint 34°F prints large and again in the grid. Disabled Delivery Check In still takes a full glove-box row. Light sheets on the dark driver canvas split the page into two reads. |
| **Rule** | Density: print temp once. Hierarchy: only the next legal check-in is the big button. |
| **Fix** | One setpoint / probe / required line. One live check-in button. Keep large tap targets. Do not add a marketing card treatment. |
| **Proof** | `p1-driver-load-390.png`, `p1-driver-load-desktop.png`. |

### P1-4. Fleet truck docs do not show expiry on the doc row

| | |
|---|---|
| **Screen** | `/fleet/trucks/[id]` Documents |
| **Issue** | Type / File / Upload + "None yet." Registration / DOT dates sit in a separate card as "—". The doc list does not show kind + expires + missing. |
| **Rule** | Hierarchy: compliance date belongs next to the file. Soft/direct empty state. |
| **Fix** | One block: kind, expires, missing. Empty: "No registration PDF on this unit." Keep Upload. |
| **Proof** | `p1-fleet-truck-docs-desktop.png`, `p1-fleet-truck-docs-390.png`. |

```15:51:components/fleet-docs-panel.tsx
    <section className="card mt-6 p-6">
      <h2 className="text-sm font-semibold">Documents</h2>
      ...
      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">None yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
```

### P1-5. Board 768-1280 still forces a 68rem table

| | |
|---|---|
| **Screen** | `/board` between ~48rem and ~80rem |
| **Issue** | Below 80rem the grid is `min-width: 68rem` plus sticky Actions. Phone stack only kicks in under 48rem. Mid widths scroll sideways again. |
| **Rule** | Declare the collapse. Do not leave a half-broken wide table on a tablet. |
| **Fix** | Use the phone ops-row stack (P0-1) up through that band, or a 2-line packed row. No 68rem scrollport. |

---

## P2

Shop-floor nits. Not a landing punch list.

### P2-1. "Show password" sits inside the login field

Office login overlays the toggle (`padding-right: 7.5rem`). Cramped at 390. Keep the control; give the typed password a clear end-cap.

### P2-2. Two chip systems on the desk

Board uses `.load-list-tabs`. Other hubs use `.filter-pill` / `.hub-tab` / `.acct-hub-tabs`. Reuse one compact navy-active chip. Do not invent a third.

### P2-3. Workbench exception cards

`/` is a 2-3 column inbox of load cards. Keep it. Only tighten chrome if P1-2 lands. Do not restyle as tiles or a marketing grid.

### P2-4. Copy em-dashes in sentences

Driver login "No login yet — ask dispatch", desk "All quiet — nothing needs attention.", mailto `Detention request — {load#}`. Soft/direct: use a period or hyphen. **Do not** change board empty-cell "—" (PRESERVE 12).

---

## Screenshot index

All files under `docs/taste-ui-audit/screenshots/`. Local tip SHA unless prefixed `ref-live-`.

| File | Surface | Viewport | Notes |
|---|---|---|---|
| `p0-board-desktop.png` | Dispatch / Active Loads | 1440 | Actions column + Reefer / HIGH TEMP |
| `p0-board-390.png` | Dispatch / Active Loads | 390 | Reefer / Delivery / HOS / Rate hidden |
| `p0-load-actions-desktop.png` | Load overlay Actions | 1440 | Equal-weight action chips |
| `p0-load-actions-390.png` | Load overlay Actions | 390 viewport | Tab wrap + action wrap |
| `p0-driver-home-desktop.png` | Driver home | 1440 | Tiles, no load# |
| `p0-driver-home-390.png` | Driver home | 390 | Unit 112, no temp |
| `p0-driver-dispatch-desktop.png` | Driver dispatch | 1440 | PRESERVE card |
| `p0-driver-dispatch-390.png` | Driver dispatch | 390 | load# / appt / live temp |
| `p1-driver-load-desktop.png` | Driver load | 1440 | Repeated setpoint |
| `p1-driver-load-390.png` | Driver load | 390 | Stacked check-ins |
| `p1-fleet-truck-docs-desktop.png` | Fleet unit 101 | 1440 | Docs well, dates as "—" |
| `p1-fleet-truck-docs-390.png` | Fleet unit 101 | 390 | Same stack |
| `p0-login-office-desktop.png` | Office login | 1440 | Navy canvas, readable lockup |
| `p0-login-office-390.png` | Office login | 390 | Same |
| `p0-login-driver-desktop.png` | Driver login | 1440 | Light lockup on black |
| `p0-login-driver-390.png` | Driver login | 390 | Wordmark contrast |
| `ref-live-login-*.png` | Public login | 1440 / 390 | Live site; may lag tip |

Local seed used only to reach signed-in surfaces. No production data. No invented fleet metrics. No Office Update.

---

## Out of scope (locked)

- No Taste landing / portfolio pass (heroes, bento, glass, purple, airy space, motion).
- No design-system rip-and-replace.
- No voice rewrite into brokerage or marketing English.
- No merge to `main` and no Office Update until CoS → JC picks P0s.

If JC picks, first pass is still findings-to-code on P0-1 through P0-5 only: phone ops row, Actions overflow, driver home sheet, driver login lockup, board Actions width.
