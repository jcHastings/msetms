# Taste Skill UI audit - MS Express TMS

**Date:** 2026-09-19  
**CoS constraint (locked):** Taste Skill docs lean landing/portfolio. This audit is **shop-floor dashboard only**: density, hierarchy, mobile (~390px). No SaaS marketing makeover. No consumer landing aesthetics. No glassmorphism heroes. No purple gradients. No airy whitespace.  
**Stack tip:** `eceef6bb576dd0ac84cf993411e09bf35ec0628d` (PR 70 Taste Skill squash into `cursor/samsara-still-docs-4c31`)  
**Mode:** Redesign-preserve. Findings only. No redesign merge. No Office Update.  
**Live office:** https://msetms.mandsloads.com (may still be on `997a199`; cookie-less public login only).

`uploads/NOTES.md` was not in this workspace at fold time. Login shots below are cookie-less public captures at **1280** and **390**.

## PRESERVE

Lead with what must not change. These are the product.

1. **Shop-floor density** on the desktop board: load# in Geist Mono, sticky Load + Status, Pickup / Delivery / Unit / Reefer / Rate in one scan row.
2. **Ops language:** Load #, trailer, appointment, temp / reefer, POD, lumper, cover, dispatch. Plain status: Assigned. Loaded. On time for appt. POD in.
3. **Soft/direct copy** already on login and empty states ("Sign in with email and password.", "None yet.", "Nothing assigned to you right now."). Keep that register. No corporate speak. No brokerage hype.
4. **Brand tokens:** sidebar `#07325a`, accent `#137cdd`, logo crimson `#e11d2e`, 2-4px radii on the office desk. Navy stays navy.
5. **Phone board card stack** that stopped sticky Load/Status/MOVE overlap (PR 59 / tip). Do not bring sticky overlay back at ~390px.
6. **Driver dispatch card** (once a load is assigned): load#, lane, customer, pickup/delivery, progress, setpoint + live temp. Home should show that work, not hide it.
7. **Large driver tap targets** (`min-h-14` check-in). Glove-box, not icon-only.
8. **Label above input** on office and driver forms. No placeholder-as-label.
9. **Geist + Geist Mono.** Mono for load# and temps.
10. **Semantic status pills** for real load / HOS / reefer state (`HIGH TEMP`, Assigned, In transit).
11. **IA and slugs:** `/board`, `/driver`, `/fleet/trucks/[id]`, `/login`, `/driver/login`. Do not rename nav labels.
12. **Empty-cell "—"** on the board (HOS, GPS, blank money). Shop-floor convention. Do not swap it for a landing-page punctuation rule.
13. **Office login navy canvas** + white logo chip + "Sign in". Keep. Do not turn `/login` into a marketing page.

## Design read (locked)

Reading this as: **redesign-preserve audit** of a **shop-floor trucking TMS** for **dispatchers and drivers**, **soft/direct ops voice**, **high density / low motion / low variance**. Cockpit. Not a portfolio. Not a SaaS marketing site.

| Dial | Existing | Keep |
|---|---|---|
| Variance | ~3 | 3 |
| Motion | ~2 | 2 |
| Density | ~8 | 8 |

Taste Skill Section 13: dashboards and data tables are out of scope for landing aesthetics. Apply audit-first only for scan speed, hierarchy, and ~390px.

## Screenshot gaps (cookie-less)

Live public session could not reach signed-in desk or driver home. **Do not treat any local-seed PNG as live proof.**

| Surface | Live cookie-less | Proof used |
|---|---|---|
| `/login` 1280 + 390 | Captured | Shots below |
| `/driver/login` 1280 + 390 | Captured | Shots below |
| Dispatch / Active Loads `/board` | **Gap** | Code citations |
| Load detail / Actions overlay | **Gap** | Code citations |
| Driver home / dispatch / load | **Gap** | Code citations |
| Fleet trucks / docs | **Gap** | Code citations |

---

## Login surfaces (live, cookie-less)

Shots: `docs/taste-ui-audit/screenshots/live-login-*.png`.

| File | URL | Viewport |
|---|---|---|
| `live-login-dispatcher-1280.png` | `/login` | 1280 |
| `live-login-dispatcher-390.png` | `/login` | 390 |
| `live-login-driver-1280.png` | `/driver/login` | 1280 |
| `live-login-driver-390.png` | `/driver/login` | 390 |

### P0-L1. Driver lockup title is slate-800 on slate-950

| | |
|---|---|
| **Screen** | `/driver/login` 1280 and 390 |
| **Issue** | `BrandMark` defaults to `variant="light"`: wordmark `text-slate-800` on driver canvas `bg-slate-950`. "MS Express TMS" drops out. H1 "Driver dispatch" is white and fine. Office `/login` uses `LoginCanvas` + `variant="dark"` and stays readable. |
| **Rule** | Contrast on the sign-in the driver actually uses. Same MS Express lockup. Not a theme restyle. |
| **Fix** | Pass `variant="dark"` on driver login (white chip + white wordmark, same as office). Keep "Open my dispatch". Do not add a hero or gradient. |
| **Proof** | `live-login-driver-1280.png`, `live-login-driver-390.png` vs `live-login-dispatcher-1280.png`. |

```9:12:components/brand-mark.tsx
  const nameClass = dark
    ? "text-sm font-semibold tracking-tight text-white"
    : "text-sm font-semibold tracking-tight text-slate-800";
```

```14:16:app/driver/login/page.tsx
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
```

```1:3:app/driver/layout.tsx
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <div className="driver-app min-h-screen bg-slate-950 text-slate-100">{children}</div>;
}
```

### P0-L2. Password / Show layout is two different controls

| | |
|---|---|
| **Screen** | `/login` vs `/driver/login`, 1280 and 390 |
| **Issue** | Same `PasswordField`. Office `.login-canvas` overlays "Show password" **inside** the input (`position: absolute`, `padding-right: 7.5rem`). Driver uses the default 2-column grid: 1280 shows a side button; 390 stacks a full-width "Show password" under the field (`.password-field:not(:is(.login-canvas *))` becomes 1 col). Typed password and the toggle do not share one desk pattern. |
| **Rule** | Hierarchy and density: one password row, one toggle, same on office and driver, including 390. |
| **Fix** | One layout for both: input + end-cap toggle that does not cover typed characters. At 390, keep one row or a short toggle ("Show") so the field does not grow a second fat button. |
| **Proof** | Dispatcher overlay: `live-login-dispatcher-1280.png`, `live-login-dispatcher-390.png`. Driver side/stack: `live-login-driver-1280.png`, `live-login-driver-390.png`. |

```2929:2951:app/globals.css
.login-canvas .password-field {
  position: relative;
  display: block;
}
.login-canvas .password-field input {
  width: 100%;
  padding-right: 7.5rem;
}
.login-canvas .password-field-toggle {
  position: absolute;
  top: 50%;
  right: 0.45rem;
  ...
}
```

```1152:1159:app/globals.css
  .password-field:not(:is(.login-canvas *)) {
    grid-template-columns: 1fr;
  }

  .password-field-toggle:not(:is(.login-canvas *)) {
    width: 100%;
    min-height: 2.75rem;
  }
```

### P0-L3. Dispatcher alt-signin line wraps at 390

| | |
|---|---|
| **Screen** | `/login` 390 |
| **Issue** | "No email on your user? Sign in with your name" wraps to two lines under Sign in. At 1280 it stays one line. Soft/direct copy is fine; the wrap is the hole. |
| **Rule** | Phone chrome stays scannable. Do not wrap the secondary action into a paragraph. |
| **Fix** | Shorter label at 390: "Sign in with name". Keep the email/name toggle. Do not enlarge the card. |
| **Proof** | `live-login-dispatcher-390.png` (wrap) vs `live-login-dispatcher-1280.png` (one line). |

```88:94:components/dispatcher-login-form.tsx
            <button
              className="login-name-toggle"
              type="button"
              data-login-name-toggle=""
              onClick={() => setUseName((open) => !open)}
            >
              {useName ? "Sign in with email" : "No email on your user? Sign in with your name"}
```

---

## Authenticated surfaces (screenshot gap)

Cookie-less live did **not** capture Dispatch / Active Loads, load detail / Actions, driver home, or fleet docs. Findings below are **code + Taste (density / hierarchy / 390)**. Local-seed PNGs under `docs/taste-ui-audit/screenshots/` that are not `live-login-*` are **not** live public proof.

### P0-1. Dispatch board at ~390px hides Reefer, HOS, Delivery, Unit, Rate

| | |
|---|---|
| **Screen** | `/board` Active Loads, ~390px |
| **Issue** | Phone stack keeps Load + Status + Pickup + MOVE/Actions. CSS hides Delivery, Unit, Tractor, Trailer, HOS, Reefer, Rate. Actions + Change unit + Edit dominate each card. Desktop still has Reefer / HIGH TEMP in the table. |
| **Rule** | Mobile collapse must keep the job (temp, appt, unit). Do not restore the sticky overlay that already failed at 390. |
| **Fix** | Keep the no-overlap card stack. Add a second ops row: Delivery window + Reefer (set / live / HIGH TEMP) + HOS. Fold Assign/Edit into the existing Actions sheet. |
| **Proof** | **Screenshot gap (live auth not captured).** Code: |

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

Board columns that stay in the desktop row (same file / `app/board/page.tsx`): Load, Status, Pickup, Delivery, Unit, Tractor, Trailer, HOS, Reefer, Rate, MOVE/Actions.

### P0-2. Load Actions: too many equal-weight controls, wrap at 390

| | |
|---|---|
| **Screen** | Load overlay / `/loads/[id]` |
| **Issue** | Text dispatch, Email customer update, Email invoice, Load Log, Dispatch and Tracking, Load Documents, Admin / Financials, Backhaul Finder, Copy / Cancel / Archive all sit as the same navy chip. Email invoice is in the strip and in two menus. Load tab labels (`Carrier and Driver Info`) have no `load-tab-short` (board tabs already do). |
| **Rule** | Hierarchy: one scan for the next action. Phone chrome stays one tab row. |
| **Fix** | Two or three primaries (Text driver, Docs, Log). One overflow More. Short tab labels under 48rem: Basics / Customer / Unit / Stops / Pay / Log / Docs. |
| **Proof** | **Screenshot gap (live auth not captured).** Code: |

```308:311:components/load-workspace.tsx
      <div className="load-actions mb-2 px-2 py-1.5">
        <div className="load-actions-label mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]">Load Actions</div>
        <div className="flex flex-wrap items-center gap-1">
```

```3:15:lib/load-tabs.ts
export const LOAD_TABS = [
  { value: "basics", label: "Load Basics" },
  { value: "customer", label: "Customer Info" },
  { value: "assets", label: "Carrier and Driver Info" },
  { value: "stops", label: "Edit Stops" },
  { value: "financials", label: "Financials" },
] as const;
```

### P0-3. Driver home hides the assigned load

| | |
|---|---|
| **Screen** | `/driver` (home) |
| **Issue** | Featured "Dispatch" tile plus a 2-col tile pad. Home does not print load#, appt, or temp. Those fields already exist on `/driver/dispatch`. Amber tracking "MY DISPATCH" is decoration. |
| **Rule** | Hierarchy: current load is the home. Density: do not make the driver hunt for temp / appt. |
| **Fix** | Lead with the dispatch card pattern (load#, appt, setpoint / live temp, one check-in). Tiles stay a compact second row. Do not restyle as a consumer app. |
| **Proof** | **Screenshot gap (live auth not captured).** Code: |

```26:61:app/driver/page.tsx
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
            My dispatch
          </div>
          ...
        const items = [
          { href: "/driver/dispatch", label: "Dispatch", featured: true },
          { href: current ? `${loadHref}#upload` : "/driver/dispatch", label: "Upload", disabled: !current },
          ...
        ];
        return <DriverDestinations items={items} />;
```

Contrast (PRESERVE this card when a load is assigned): `app/driver/dispatch/page.tsx` already prints load#, lane, pickup/delivery, progress, and reefer live temp.

### P0-4. Desktop board Actions column eats the scan row

| | |
|---|---|
| **Screen** | `/board` desktop |
| **Issue** | `.board-end-cell` is 24% width, sticky right: MOVE + Actions + Assign/Change unit + Edit. Assign is also inside Actions. Load / Pickup / Reefer lose width. |
| **Rule** | Density: the scan row is load# / appt / unit / temp, not a button stack. |
| **Fix** | MOVE stays. One overflow for Assign / Edit / Backhaul. Actions closer to 8-10%, not 24%. Do not add card padding or air. |
| **Proof** | **Screenshot gap (live auth not captured).** Code: |

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

## P1 (code only; screenshot gap)

### P1-1. Desk padding and card blur slow the scan

`.card` uses `--glass` + `backdrop-filter: blur(16px)`. `PageHeader` is `text-2xl` + `mb-6`. `.desk-main-inner` is `px-8 py-7`. High density: solid surface, 1px `--border`, existing `PageHeader dense`, main pad closer to `px-4 py-3`. Not a glass hero. Do not add whitespace.

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

### P1-2. Driver load repeats setpoint; disabled check-ins take full rows

`app/driver/loads/[id]/page.tsx` prints setpoint as a large number and again in the grid. `DriverLoadActions` renders every stop button at `min-h-14` even when disabled. Print temp once. Only the next legal check-in is the big button. Keep large tap targets.

### P1-3. Fleet truck docs do not show expiry on the doc row

`components/fleet-docs-panel.tsx`: Type / File / Upload + "None yet." Dates live on `UnitComplianceCard` as "—". One block: kind, expires, missing. Empty: "No registration PDF on this unit."

### P1-4. Board 768-1280 still forces a 68rem table

`app/globals.css` below 80rem: `.table-grid-board` `min-width: 68rem`. Phone stack only under 48rem. Use the P0-1 ops-row stack through that band. No 68rem scrollport.

---

## P2 (code only)

- Two chip systems: `.load-list-tabs` vs `.filter-pill` / `.hub-tab`. Reuse one compact navy-active chip.
- Workbench `/` 2-3 column inbox: keep. Tighten only if P1-1 lands. Do not restyle as a marketing grid.
- Sentence em-dashes ("No login yet — ask dispatch") can be a period. **Do not** change board empty-cell "—" (PRESERVE 12).

---

## Screenshot index

Official cookie-less set (this fold):

| File | Surface | Viewport |
|---|---|---|
| `live-login-dispatcher-1280.png` | `/login` | 1280 |
| `live-login-dispatcher-390.png` | `/login` | 390 |
| `live-login-driver-1280.png` | `/driver/login` | 1280 |
| `live-login-driver-390.png` | `/driver/login` | 390 |

Other PNGs in this folder (local seed or older 1440 refs) are **not** live cookie-less proof. Authenticated Dispatch / load detail / driver home / fleet: **gap**.

No production load data. No invented fleet metrics. No Office Update.

---

## Out of scope (locked)

- No Taste landing / portfolio pass.
- No design-system rip-and-replace.
- No voice rewrite into brokerage or marketing English.
- No merge to `main` and no Office Update until CoS → JC picks.

If JC picks from **captured** login: P0-L1 lockup contrast, P0-L2 one password row, P0-L3 short alt-signin at 390. Authenticated P0-1 through P0-4 stay code-backed until a signed-in capture exists.
