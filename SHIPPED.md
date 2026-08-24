# Shipped in this build

Working screens and local data — not docs-only menus. Third-party APIs stay stubbed when credentials are missing (Samsara / ORBCOMM / QuickBooks). No invented live data. No secrets.

Catalog items are marked `[v1]` in [PRODUCT_CATALOG.md](./PRODUCT_CATALOG.md).

## Sign-in

- Default company logo is the official **MS Express** mark (`public/ms-express-logo.png`) on login, the dispatcher header, and load confirmation PDFs. Product name stays **MS Express TMS**. Settings → Company can upload a replacement; remove reverts to the default.
- Dispatcher PIN login at `/login`. Demo: **Ana G / 4020** (Administrator). After PIN, enrolled users enter a 6-digit authenticator code (or a one-time recovery code).
- **Users** in the main nav — list + add dispatchers and accounting staff on the same `dispatchers` records as Settings → Users. Roles: **Administrator**, **Standard**, **Accounting**. PIN is never shown after save. Administrator resets 2-step. Nav hides and APIs 401 anything a role cannot use.
- **Settings → 2-step verification**: QR + secret, confirm, then enrolled. Recovery codes are shown once and stored hashed. Administrator can reset another user’s 2-step. “Require 2-step for all dispatchers” defaults **off** so Ana G / the office PC can still use PIN until they enroll.
- Dispatcher session lasts 12 hours from sign-in.
- Driver app unchanged: `/driver/login` with seeded driver PINs. No TOTP.

## Dispatch

- **Locations** in nav — shipper/receiver CRUD, pick on a load or type a one-off, scheduling on load + driver. Mass upload from JC’s Ascend blank location CSV (template download + UTF-8 import; duplicate name+address updates). **Download all locations** uses the same Ascend headers so a backup can be edited and re-imported.
- **Search** in nav — criteria, live/archived/cancelled, saved reports.
- Richer load statuses: available, hold, assigned, dispatched, at PU, loading, picked up, in transit, at DEL, unloading, delivered, completed, cancelled.
- Status reason, cover-by, equipment required, hazmat, commodity class, seals, pallets/cases, team, lumper, detention start/stop, appointment confirmation, unload type, cancel reason.
- Multi-stop (add / reorder / remove; at least two stops).
- **Relays** on Carrier / Asset (and markers on Basics): ordered legs with pickup/handoff, driver, optional truck/trailer, optional internal OO pay. Load-only — never a billed customer stop, never on the customer confirmation or invoice. Driver app shows “Your leg”. Board shows primary driver + “+1 relay”. Audit/log records who added or changed a relay.
- Duplicate load and save/book **templates**.
- Watch list (pin from the load).
- Document checklist + extra kinds (temp log, scale ticket, claim).
- Claim / OS&D on the load and a Claims list.

## Home desk

- Exception inbox ranked CRITICAL → LOW.
- Ack / snooze 4h / resolve with a note.
- Filter inbox by type and find (customer/lane/load).
- Shift handoff note.
- Daily recap (delivered, late, on-time %, claims).
- Watch list.
- Compliance expirations surfaced; full list on **Compliance**.

## Accounting (nav section)

- Overview, **Invoices (AR)**, **Bills (AP)**, **Driver pay**, **Commissions** (3% worksheet), **QuickBooks**.
- **Settings → QuickBooks**: Connect QuickBooks Online OAuth (`QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` / `QBO_REDIRECT_URI`, optional `QBO_SANDBOX=true`). Realm and refresh tokens stay on the server. Missing keys show setup steps, no crash.
- Live or demo invoice on a delivered load: customer rate + lumper only. Relays and OO/driver pay stay off the invoice. One invoice per load unless you confirm a resend. QBO doc # is stored on the load. Unmatched customers queue as **Needs QBO customer**.
- Local mark-paid. OO pay is not a QBO bill.

## Fleet / admin

- **Drivers**, **Trucks**, and **Trailers** in the dispatcher nav (plus the Fleet overview). Each list has a UTF-8 CSV download (own columns; driver PIN is never exported).
- **Fuel** in Fleet nav — daily fuel-card CSV or Transaction Activity Report PDF (`unpdf`). Four first-class buckets on every import and total: Truck diesel, Reefer diesel, DEF, Scale (none of these is “Other”; DEF is never dumped into truck diesel). Match by driver name (including NName last, first) or unit / prompt #. Dedup on invoice + category + qty when invoice is present. Per-driver and per-truck totals. Unmatched queue. Template + export. Driver and truck pages link here. No live card API.
- Drivers: name, mobile, email, PIN (set/reset, never shown in the list), company vs owner-operator, OO %, CDL, medical card, assigned truck, notes, active flag, document uploads.
- Trucks: unit #, year/make/model, plate, VIN, assigned driver, registration + DOT dates, Samsara vehicle id, notes, active flag, document uploads.
- Trailers: unit #, type, VIN/plate, assigned truck, registration + DOT, ORBCOMM id, default reefer setpoint, last known reading stub, notes, active flag, document uploads.
- Credit hold and payment terms on the customer.
- Compliance page uses the Settings alert windows.
- Reports: revenue by customer, on-time, audit, loads CSV.

## Settings hub (`/settings`)

Dispatcher login required. Saves to the local database. No secrets. No fake Ascend APIs.

- **Company contact** — name, phone, email, address, logo (default MS Express mark; upload replaces it on login, header, and confirmations)
- **Insurance** — provider, policy, coverage, expiry
- **Dropdown lists** — commodities, equipment types, custom load statuses
- **Currency / units** — USD or CAD, lb vs kg
- **Tax** — sales tax or GST toggle + rate (shown on AR invoices)
- **Alerts** — 30/60 day (editable) compliance windows; email checkbox is a later stub
- **Default routing notes** — prefill special instructions on a new load
- **Pay and margin** — OO default %, carrier/OO pay method, target gross margin
- **Document defaults** — header / footer / terms / font size for load & carrier confirmation, invoice, customer confirmation, BOL
- **Load numbers** — prefix and next number; show sample data toggle (hides seeded demo loads)
- **Users** — same list as the Users tab (Administrator / Standard / Accounting); 2-step on/off and Administrator reset. Nav and APIs enforce the three groups.
- **2-step verification** — authenticator enrollment for dispatchers only; optional require-all (default off)
- **Integrations** — Samsara / ORBCOMM status plus a link to **Settings → QuickBooks** (in-app Online OAuth)

- Load confirmation PDF: title page-centered on its own line (Load Confirmation for company drivers), logo left, dispatcher/load card below the title on the right so it does not share a line with the title, email on one line, hours do not overflow appointment, extra blank pages dropped.
- Rate-con upload: New Load → From rate con accepts PDF/image, extracts text in JS (`unpdf`, no native tools), fills the review form, and always keeps the file. Empty extract still opens the form with a warning. “Pick a file first” if nothing is chosen. Filename digits are never weight. Works on Windows next start.
- Google Places address search on Locations and New Load when `GOOGLE_MAPS_API_KEY` is set (server-side; no key in the browser).

Skipped Ascend-exclusive: Pro Plan billing, Business Center legal/training/tax store, AscendCarrierPortal, DAT load-board, Master Loads.

## Windows

- Start with **`npm start`** (not `next start` / `npx next start`). From the repo root: `npm install` → `npm run build` → `npm start`. That loads `.env` / `.env.local` from the project root, then runs `node .next/standalone/server.js`. Never logs secret values. `next start` prints that standalone is configured and can show `injected env (0) from .env` even when `SAMSARA_API_TOKEN` is in the real project `.env`.
- After **`npm run build`**, styles must load on standalone. `next build` does not include `public` or `.next/static` in `.next/standalone`; the build script **copies** both in (Windows: never symlink). Then `npm start` or `node .next/standalone/server.js` is styled. Missing those folders = unstyled raw HTML (default blue links). `npm start` copies them again.
- `npm start` copies `data` / `.env` / `public` / `.next/static` on win32. No `better-sqlite3` compile. No symlink (`EPERM`).
- Fleet new **and** edit pages (`/fleet/trucks/new`, `/fleet/trucks/[id]`, trailers, drivers) stay `force-dynamic`. Forms import their server actions (no `.bind` props) and only receive plain JSON values (no driver PIN). Avoids standalone “This page couldn’t load”.
- **Mike** on the dispatch board (not the driver app): side chat for ops questions from TMS data. Needs `OPENAI_API_KEY` only; always uses cheap `gpt-4o-mini`. Never invents GPS. Never logs the key or PINs.

## Not in this PR

Native iOS/Android stores, EDI VAN, live fuel cards, replacing Samsara, pixel-perfect Ascend.
