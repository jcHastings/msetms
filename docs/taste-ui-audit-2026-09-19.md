# Taste Skill UI audit - MS Express TMS

**Date:** 2026-09-19  
**Stack tip:** `eceef6bb576dd0ac84cf993411e09bf35ec0628d` (PR 70 Taste Skill squash into `cursor/samsara-still-docs-4c31`)  
**Mode:** Redesign-preserve. Findings only. No redesign merge. No Office Update.  
**Captures:** Local app on that tip, unless a file is labeled `ref-live-*` (public office at https://msetms.mandsloads.com, still on older `997a199`).

## Design read (locked)

Reading this as: **redesign-preserve audit** of a **shop-floor trucking TMS** (dispatch board, load workbench, driver home, fleet docs, login) for **dispatchers and drivers**, with a **soft/direct ops voice**, leaning toward **high visual density / low motion / low variance** (cockpit, not marketing).

**Dials of the existing product (Section 11.B starting point, not Taste baseline 8/6/4):**

| Dial | Existing | Keep |
|---|---|---|
| `DESIGN_VARIANCE` | ~3 (symmetric desk, sticky columns, equal nav) | 3 |
| `MOTION_INTENSITY` | ~2 (hover/active only, no scroll hijack) | 2 |
| `VISUAL_DENSITY` | ~8 (packed board, 12.5px load fields, mono load#) | 8 |

Do not drop density. Do not add landing motion, bento, glass heroes, or purple gradients.

## Section 13 honesty

Taste Skill is **not** a dashboard / data-table / multi-step product skill. This audit still uses **Section 11 (audit-first)**, **Section 9 (AI tells)**, hierarchy / spacing / mobile, and **Section 2.A density patterns** (Fluent / Carbon / Primer). It does **not** recommend a consumer SaaS landing restyle.

Suggested borrow (not a rip-and-replace): Carbon or Fluent **command bar + compact data table + overflow menu**. Keep the navy desk tokens already in `app/globals.css`. One system. Do not install Fluent *and* Carbon.

## PRESERVE

Do not "modernize" these away. They are the product.

1. **Shop-floor density** on the desktop board: load# in Geist Mono, sticky Load + Status, Pickup / Delivery / Unit / Reefer / Rate in one scan row.
2. **Ops language:** Load #, trailer, appointment, temp / reefer, POD, lumper, cover, dispatch. Plain status: Assigned. Loaded. On time for appt. POD in.
3. **Soft/direct copy** already on login and empty states ("Sign in with email and password.", "None yet.", "Nothing assigned to you right now."). Keep that register. No corporate speak.
4. **Brand tokens** (Section 11.C): sidebar `#07325a`, accent `#137cdd`, logo crimson `#e11d2e`, radii 2-4px on the **office** desk. A navy brand stays navy (LILA override).
5. **Phone board card stack** that stopped sticky Load/Status/MOVE overlap (PR 59 / tip). Do not bring sticky overlay back at ~390px.
6. **Driver dispatch card** (once a load is assigned): load#, lane, customer, pickup/delivery, progress, setpoint + live temp. That card is the shop-floor pattern. Home should look more like this, not less.
7. **Large driver tap targets** (`min-h-14` check-in). Glove-box, not icon-only.
8. **Label above input** on office and driver forms. No placeholder-as-label.
9. **Geist + Geist Mono** (not Inter). Mono for load# and temps.
10. **Semantic status pills** (`status-tone-success/warning/danger`) for real load/HOS/reefer state. Not decorative dots.
11. **IA and slugs:** `/board`, `/driver`, `/fleet/trucks/[id]`, `/login`, `/driver/login`. Do not rename nav labels for taste.
12. **No consumer SaaS landing** makeover. No airy whitespace that kills scan speed.

## Brand tokens and IA (Section 11.B)

| Token | Value | Where |
|---|---|---|
| Sidebar / navy | `#07325a` / `#0a4173` | Office chrome, login canvas, load tabs |
| Accent | `#137cdd` | Primary buttons, active tab |
| Text | `#252525` / muted `#5b6b7c` | Desk body |
| Surface | `#ffffff` + `--glass` 72% | Cards (problem: see P1) |
| Type | Geist / Geist Mono via `next/font` | `app/layout.tsx` |
| Office radius | `--r-xs` 2px, `--r-sm` 3px, `--r-md` 4px | Desk |
| Driver radius | `rounded-2xl` / 1rem | Driver tiles and sheets (split: see P0-3) |
| Driver canvas | `bg-slate-950` | Separate theme from office light desk |

**Primary paths:** Dispatch board `/board` (Active Loads tab) → load overlay Actions → driver `/driver` + `/driver/dispatch` → fleet `/fleet/trucks/[id]` docs → `/login` and `/driver/login`.

---

## P0

Each row: screen, issue, Taste rule, suggested fix. Ranked by shop-floor harm.

### P0-1. Dispatch board at ~390px hides Reefer, HOS, Delivery, Unit, Rate

| | |
|---|---|
| **Screen** | `/board` Active Loads, ~390px |
| **Issue** | Phone stack keeps Load + Status + Pickup + MOVE/Actions. CSS hides Delivery, Unit, Tractor, Trailer, HOS, Reefer, Rate. Desktop shows `HIGH TEMP` on MSE-1045; the phone card cannot. Actions + Change unit + Edit dominate each card. |
| **Taste** | Section 3.E / 4.7 mobile collapse must keep the job. Section 11.C preserve ops language (temp, appt, unit). Section 13: this is product UI, so density first. |
| **Fix** | Keep the no-overlap card stack. Add a second ops row: Delivery window + Reefer (set / live / HIGH TEMP) + HOS. Fold Assign/Edit into the existing Actions sheet. Do not restore sticky columns. |
| **Proof** | Real UI: `docs/taste-ui-audit/screenshots/p0-board-390.png` (phone) vs `p0-board-desktop.png` (desktop still has Reefer / HIGH TEMP). |

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

### P0-2. Load Actions is a wrap of equal navy buttons

| | |
|---|---|
| **Screen** | Load overlay / `/loads/[id]`, desktop drawer and 390 full-bleed |
| **Issue** | "LOAD ACTIONS" tracking eyebrow, then Text dispatch / Email customer update / Email invoice / Load Log / Dispatch and Tracking / Load Documents / Admin / Financials / Backhaul Finder / Copy / Cancel / Archive, all the same navy chip. Email invoice appears in the strip and again in two menus. At 390, load tabs wrap to three lines (`Carrier and Driver Info`). Chat + share link sit above Basics. |
| **Taste** | Section 4.5 no duplicate CTA intent. Section 4.7 eyebrow restraint + CTA wrap. Section 4.4 hierarchy (cards/buttons only when they earn it). Section 2.A: Carbon/Fluent command bar. |
| **Fix** | Two or three primaries (Text driver, Docs, Log). One overflow "More". Short tab labels on phone (same pattern as board tabs). Do not add more navy pills. |
| **Proof** | `p0-load-actions-desktop.png`, `p0-load-actions-390.png`. |

```308:311:components/load-workspace.tsx
      <div className="load-actions mb-2 px-2 py-1.5">
        <div className="load-actions-label mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]">Load Actions</div>
        <div className="flex flex-wrap items-center gap-1">
```

### P0-3. Driver home is a consumer tile grid, not a dispatch sheet

| | |
|---|---|
| **Screen** | `/driver` (home), desktop and 390 |
| **Issue** | Amber `uppercase tracking-[0.18em]` "My dispatch" eyebrow. Featured rounded-2xl "Dispatch" tile plus a 2-col tile pad. With Unit 112 and MSE-1045 assigned, home still hides load#, appt, and temp. Driver must tap Dispatch to see the actual work. Radius/theme (1rem pills on slate-950) does not match the 2-4px office desk. |
| **Taste** | Section 4.7 / 9.F eyebrow tell. Section 4.2 color consistency (amber is a second accent). Section 4.4 shape lock. Section 4.11 theme lock. Section 9.C banned 3-equal / tile-pad default. |
| **Fix** | Lead with the current load sheet (load#, appt window, setpoint / live temp, one check-in). Keep tiles as a compact second row, office-small radius, accent blue not amber. Copy stays "My dispatch" in sentence case, no tracking eyebrow. |
| **Proof** | `p0-driver-home-390.png`, `p0-driver-home-desktop.png`. Contrast the shop-floor card that already exists on `p0-driver-dispatch-390.png` (PRESERVE that card). |

```26:28:app/driver/page.tsx
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
            My dispatch
          </div>
```

### P0-4. Office vs driver login are two products; driver lockup fails contrast

| | |
|---|---|
| **Screen** | `/login` vs `/driver/login`, desktop and 390 |
| **Issue** | Office: navy `.login-canvas`, white logo chip, glass card, "Dispatcher desk". Driver: `bg-slate-950`, `BrandMark` default **light** variant (navy wordmark + `/api/company/logo` on near-black), white `rounded-2xl` card, "Open my dispatch". Subtitle uses an em-dash ("No login yet — ask dispatch"). Login canvas is `min-height: 100vh`, not `100dvh`. |
| **Taste** | Section 4.5 button/form contrast. Section 4.11 theme lock. Section 3.E viewport `100dvh`. Section 9.G em-dash ban (visible copy). Section 11.C brand lockup. |
| **Fix** | One navy canvas + `BrandMark variant="dark"` on both. Same card radius as the desk (2-4px). Keep the two CTAs ("Sign in" vs "Open my dispatch"). Replace the em-dash with a period. Use `min-h-[100dvh]`. |
| **Proof** | Local: `p0-login-office-desktop.png`, `p0-login-office-390.png`, `p0-login-driver-desktop.png`, `p0-login-driver-390.png`. Live public (lags tip, same split): `ref-live-login-*.png`. |

```14:16:app/driver/login/page.tsx
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <BrandMark size="lg" />
```

### P0-5. Desktop board Actions column eats the scan row

| | |
|---|---|
| **Screen** | `/board` desktop (~1440) |
| **Issue** | `.board-end-cell` is 24% width, sticky right: status MOVE select + Actions menu + Assign/Change unit + Edit. Load / Pickup / Reefer get squeezed so tractor / trailer / HOS collapse to "—". Same Assign control also lives inside Actions. Glass wash on `.card` softens the grid. |
| **Taste** | Section 7 `VISUAL_DENSITY` 8-10: tight rows, 1px rules, no fat card chrome. Section 4.4 cards banned when density > 7. Section 5: glassmorphism is wrong for dashboards. Section 4.5 duplicate intent. |
| **Fix** | MOVE stays. One overflow for Assign / Edit / Backhaul. Target Actions column ~8-10%, not 24%. Solid `#fff` (or off-white) cells, 1px `--border`, no `backdrop-filter` on the board card. |
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
| **Taste** | Section 4.7 navigation / chrome on one line. |
| **Fix** | Short labels under 48rem: Basics / Customer / Unit / Stops / Pay / Log / Docs. |
| **Proof** | `p0-load-actions-390.png`. |

### P1-2. Glass + airy desk chrome on a cockpit

| | |
|---|---|
| **Screen** | Office shell, workbench, fleet truck, every `.card` |
| **Issue** | `--glass` + `backdrop-filter: blur(16px)` on cards, overlay, dialogs. `PageHeader` is `text-2xl` + `mb-6`. `.desk-main-inner` is `px-8 py-7`. Fine for marketing. Slow for a dispatch scan. |
| **Taste** | Section 4.4 / 5 / 7 density 8-10. Section 11.D lever 2 (spacing) only if it **tightens**, not if it adds air. |
| **Fix** | Solid surface, 1px border, drop blur. Dense header (`PageHeader dense` already exists). Main pad closer to `px-4 py-3`. |
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

### P1-3. Driver load sheet inverts theme and repeats setpoint

| | |
|---|---|
| **Screen** | `/driver/loads/[id]` |
| **Issue** | Light `rounded-2xl bg-white` / `bg-sky-50` / `bg-amber-50` sheets on `slate-950`. Setpoint 34°F prints as a hero number and again in the grid. Check-in buttons are all the same size; disabled Delivery Check In still occupies a full glove-box row. |
| **Taste** | Section 4.11 no mid-page theme flip. Section 4.9 content density. Section 4.5 full state cycle (enabled vs disabled should not look like two primaries). |
| **Fix** | One dark sheet, navy/danger for the live action only. Print setpoint once, probe / required / door beside it. |
| **Proof** | `p1-driver-load-390.png`, `p1-driver-load-desktop.png`. |

### P1-4. Fleet truck docs are a generic upload well

| | |
|---|---|
| **Screen** | `/fleet/trucks/[id]` Documents |
| **Issue** | "Documents" + Type / File / Upload + "None yet." Compliance dates live in a separate card as "—". List uses `divide-y` with Open ghost buttons. No expiry, no missing-reg/DOT cue on the doc row. |
| **Taste** | Section 4.5 empty state should say how to populate (kind + due date). Section 9.F hairline-every-row. Carbon structured list. |
| **Fix** | One compliance + docs block: kind, expires, missing. Soft/direct empty: "No registration PDF on this unit." Keep Upload. |
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

### P1-5. Visible em-dashes and tracking eyebrows outside driver home

| | |
|---|---|
| **Screen** | Driver login subtitle; workbench lane (`origin — dest`); desk empty "All quiet — nothing needs attention."; Load Documents "Detention request — {load#}" mailto; many `uppercase tracking-[0.14em]` section labels. |
| **Issue** | Section 9.G is a landing-page tell. On a TMS, empty-cell "—" is shop-floor convention (see P2-1). The **copy** em-dashes and the amber/tracking eyebrows are the slop. |
| **Taste** | Section 9.G, 4.7 eyebrow cap (max 1 per 3 sections). |
| **Fix** | Periods in sentences. Hyphen in `Detention request - MSE-1045`. Leave numeric empty "—" alone until CoS picks it. Drop tracking eyebrows on Load Actions / Requires Attention / Money. |

### P1-6. Board 768-1280 still forces a 68rem table

| | |
|---|---|
| **Screen** | `/board` tablet / small laptop |
| **Issue** | Below 80rem the grid is `min-width: 68rem` plus sticky Actions. Phone stack only kicks in under 48rem. Mid widths get a horizontal scroll again. |
| **Taste** | Section 3.E / 7 mobile override: high-variance / wide tables must declare the collapse. |
| **Fix** | Use the phone ops-row stack up to `lg`, or a 2-line packed row, instead of a 68rem scrollport. |

---

## P2

### P2-1. Empty-cell em-dash "—"

Used as the blank for HOS, GPS, money, dates (`lib/format.ts`, board `empty="—"`). Taste 9.G would ban it on a marketing page. **Do not blindly replace.** Shop-floor boards have used this glyph for years. If CoS wants a Taste-strict pass, swap to `-` or leave the cell empty. Not a redesign driver.

### P2-2. Workbench 3-up exception cards

`/` workbench is `md:grid-cols-2 xl:grid-cols-3` glass cards with a map pane. Section 9.C bans three-equal feature cards **on landings**. Here they are data. Keep the inbox; tighten chrome (P1-2). Do not turn Workbench into a bento.

### P2-3. Milestone dots with glow

`.milestone-dot` uses `box-shadow: 0 0 0 3px #dcfce7` (Section 9.A outer glow). Fine if it marks a real stop hit. Do not add more decorative dots on nav or badges.

### P2-4. Mike sparkle + "Ask Mike"

Accent sparkle on the desk. Not a dispatch P0. Do not restyle Mike as a marketing assistant.

### P2-5. "Show password" inside the login field

Office login overlays the toggle at `right: 0.45rem` with `padding-right: 7.5rem`. Works, slightly cramped at 390. Keep the control; give the input a clearer end-cap so the typed password does not run under the label.

### P2-6. Two chip systems

Board uses `.load-list-tabs`. Other hubs use `.filter-pill` / `.hub-tab` / `.acct-hub-tabs`. Pick one compact chip (navy active, 2px radius) and reuse. Do not invent a third.

---

## Screenshot index

All files under `docs/taste-ui-audit/screenshots/`. **Real local UI on the tip SHA** unless prefixed `ref-live-`.

| File | Surface | Viewport | Notes |
|---|---|---|---|
| `p0-board-desktop.png` | Dispatch / Active Loads | 1440 | Actions column + Reefer / HIGH TEMP visible |
| `p0-board-390.png` | Dispatch / Active Loads | 390 | Reefer / Delivery / HOS / Rate hidden |
| `p0-load-actions-desktop.png` | Load overlay Actions | 1440 | Equal navy action chips |
| `p0-load-actions-390.png` | Load overlay Actions | 390 viewport | Tab wrap + action wrap |
| `p0-driver-home-desktop.png` | Driver home | 1440 | Tile pad, no load# |
| `p0-driver-home-390.png` | Driver home | 390 | Amber eyebrow, Unit 112, no temp |
| `p0-driver-dispatch-desktop.png` | Driver dispatch | 1440 | PRESERVE card pattern |
| `p0-driver-dispatch-390.png` | Driver dispatch | 390 | load# / appt / live temp |
| `p1-driver-load-desktop.png` | Driver load | 1440 | Light sheets on dark |
| `p1-driver-load-390.png` | Driver load | 390 | Repeated setpoint, stacked CTAs |
| `p1-fleet-truck-docs-desktop.png` | Fleet unit 101 | 1440 | Docs well + compliance "—" |
| `p1-fleet-truck-docs-390.png` | Fleet unit 101 | 390 | Same stack, phone chrome |
| `p0-login-office-desktop.png` | Office login | 1440 | Navy canvas, dark lockup |
| `p0-login-office-390.png` | Office login | 390 | Same |
| `p0-login-driver-desktop.png` | Driver login | 1440 | Light lockup on black |
| `p0-login-driver-390.png` | Driver login | 390 | Wordmark contrast fail |
| `ref-live-login-*.png` | Public login | 1440 / 390 | Live site; may lag tip |

Local seed used only to reach signed-in surfaces. No production data. No Office Update.

---

## What not to do next

- Do not apply Taste landing levers 5-6 (hero recomposition, block replacement).
- Do not introduce glassmorphism, bento, Inter, or a second accent.
- Do not rewrite voice into brokerage or marketing English.
- Do not merge this into `main` or run Office Update until CoS → JC picks P0s.

When JC picks, implement **targeted evolution** (Section 11.E): P0-1 phone ops row, P0-2 command bar, P0-3 driver home sheet, P0-4 login lockup, P0-5 Actions width. That is the whole first pass.
