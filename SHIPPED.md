# Shipped in this build

Working screens and local data — not docs-only menus. Third-party APIs stay stubbed when credentials are missing (Samsara / ORBCOMM / QuickBooks). No invented live data. No secrets.

Catalog items are marked `[v1]` in [PRODUCT_CATALOG.md](./PRODUCT_CATALOG.md).

## Sign-in

- Dispatcher PIN login at `/login`. Demo: **Ana G / 4020** (manager).
- Driver app unchanged: `/driver/login` with seeded driver PINs.

## Dispatch

- **Locations** in nav — shipper/receiver CRUD, pick on a load or type a one-off, scheduling on load + driver.
- **Search** in nav — criteria, live/archived/cancelled, saved reports.
- Richer load statuses: available, hold, assigned, dispatched, at PU, loading, picked up, in transit, at DEL, unloading, delivered, completed, cancelled.
- Status reason, cover-by, equipment required, hazmat, commodity class, seals, pallets/cases, team, lumper, detention start/stop, appointment confirmation, unload type, cancel reason.
- Multi-stop (add / reorder / remove; at least two stops).
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
- Local mark-paid. QBO still invoices the customer rate only (demo or live when env tokens work).
- OO pay is not a QBO bill.

## Fleet / admin

- Credit hold and payment terms on the customer.
- VIN / plate / year / make on the truck.
- Compliance page.
- Reports: revenue by customer, on-time, audit, loads CSV.

## Settings hub (`/settings`)

Dispatcher login required. Saves to the local database. No secrets. No fake Ascend APIs.

- **Company contact** — name, phone, email, address, logo (used on load confirmations)
- **Insurance** — provider, policy, coverage, expiry
- **Dropdown lists** — commodities, equipment types, custom load statuses
- **Currency / units** — USD or CAD, lb vs kg
- **Tax** — sales tax or GST toggle + rate (shown on AR invoices)
- **Alerts** — 30/60 day (editable) compliance windows; email checkbox is a later stub
- **Default routing notes** — prefill special instructions on a new load
- **Pay and margin** — OO default %, carrier/OO pay method, target gross margin
- **Document defaults** — header / footer / terms / font size for load & carrier confirmation, invoice, customer confirmation, BOL
- **Load numbers** — prefix and next number; show sample data toggle (hides seeded demo loads)
- **Users** — add/edit dispatcher PIN users, roles (admin / manager / dispatcher / read-only), light permission groups
- **Integrations** — existing Samsara / ORBCOMM / QuickBooks / load-tracking stubs

- Load confirmation PDF: title centered, logo left, dispatcher/load block right, email on one line, extra blank pages dropped.
- Rate-con upload: keep the chosen PDF, parse Ascend LOAD CONFIRMATION packets (load # is not weight), attach even when text is thin.
- Google Places address search on Locations and New Load when `GOOGLE_MAPS_API_KEY` is set (server-side; no key in the browser).

Skipped Ascend-exclusive: Pro Plan billing, Business Center legal/training/tax store, AscendCarrierPortal, DAT load-board, Master Loads.

## Windows

- `npm start` copies `data` / `.env` on win32. No `better-sqlite3` compile. No symlink (`EPERM`).

## Not in this PR

Native iOS/Android stores, EDI VAN, live fuel cards, replacing Samsara, pixel-perfect Ascend.
