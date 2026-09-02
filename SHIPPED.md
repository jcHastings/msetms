# Shipped in this build

Working screens and local data — not docs-only menus. Third-party APIs stay stubbed when credentials are missing (Samsara / ORBCOMM / QuickBooks). No invented live data. No secrets.

Catalog items are marked `[v1]` in [PRODUCT_CATALOG.md](./PRODUCT_CATALOG.md).

## Approved spec (2026-09-02)

On this PR. Packet names and phones are layout examples only — not hardcoded.

1. Tighter navy/gold desk: status pills, load details slide in from the right.
2. Overlapping map pins cluster when zoomed out.
3. Control Center (`/control`): unassigned/active loads + idle Orbcomm (Samsara trucks when GPS exists). Orders / Resources. Click pin → side panel.
4. Geo / equipment / status filter strip on that map.
5. Stopped units are a small teardrop pin on every tracking map. Moving units are a full straight arrow rotated to heading — the whole marker is the arrow, not a pin with a side blob. Orbcomm head: green running / yellow off / red shutdown / gray unknown. Samsara head: green on / dark off. Pin tip / arrow center is the exact lat/lng.
6. Customer load-status `/l/…` timeline (Booked → Pickup → In Transit → Delivered → Invoice sent, only steps that happened). JC copies. Not emailed.
7. Driver Trailer tab when a trailer is assigned; hidden when none.
8. Load chat on the dispatcher load and `/driver` for that load. Not SMS or email.
9. Auto-invoice the day POD + Delivered. Billing email (then main). Send-to / inbox if none. Not twice. Not the per-load broker email. From ar@msloads.com.
10. Customer Main email + Billing email. Invoices always billing, then main, then Send-to.
11. Per-load email from that packet’s contact block. Email customer update uses per-load, then main. Customer card not overwritten.
12. Per-load phone + ext from that packet. Load comms use per-load, then customer main phone. Customer phone not overwritten.
13. Rate-con reads the contact block on the packet in front of you (Name | Phone xEXT | Email is one layout). Ignore CARRIER CONTACT and shipper phones. Do not invent.

## Sign-in

- Default company logo is the official **MS Express** mark (`public/ms-express-logo.png`) on login, the dispatcher header, and load confirmation PDFs. Product name stays **MS Express TMS**. Settings → Company can upload a replacement; remove reverts to the default.
- Dispatcher PIN login at `/login`. Demo: **MS Test / 4020** (Administrator). After PIN, enrolled users enter a 6-digit authenticator code (or a one-time recovery code). Existing DBs rename that same 4020 Administrator row to MS Test.
- **Users** in the main nav — list + add dispatchers and accounting staff on the same `dispatchers` records as Settings → Users. Roles: **Administrator**, **Standard**, **Accounting**. PIN is never shown after save. Administrator resets 2-step. Nav hides and APIs 401 anything a role cannot use.
- **Settings → 2-step verification**: QR + secret, confirm, then enrolled. Recovery codes are shown once and stored hashed. Administrator can reset another user’s 2-step. “Require 2-step for all dispatchers” defaults **off** so MS Test / the office PC can still use PIN until they enroll.
- Dispatcher session lasts 12 hours from sign-in.
- Driver app unchanged: `/driver/login` with seeded driver PINs. No TOTP. When a load has an assigned trailer, **Trailer** is a tab. It opens a pinch-zoom map with that trailer’s last-known Orbcomm location. No trailer assigned? The tab stays hidden. Every tracking map (Driver Trailer, Orbcomm, Samsara, per-load, customer `/t/…`, load-status `/l/…`, Control Center) uses the same markers: a small teardrop pin when stopped, a high-contrast straight arrow rotated to heading when moving. Orbcomm pin/arrow heads stay green/yellow/red/gray for reefer running/off/shutdown/unknown. Samsara heads stay green when the truck is on and dark when it is off. Cluster bubbles when zoomed out are fine. Positions are never invented.

## Dispatch

- **Control Center** (`/control`) is one map of work and assets: unassigned/active loads plus idle Orbcomm trailers (and Samsara trucks when GPS is already on file). Left lists are Orders and Resources. Filter pills: state, equipment/reefer, status. Overlapping pins cluster. Click a pin or row for a side panel (origin/dest/status/temp). Navy/gold MS Express chrome — not another brand’s colors.
- Desk graphics are tighter: color status pills, cleaner tables, load details slide in from the right on a wide screen so the list stays put.
- Driver confirmation maps broker stop Notes and operational Directions, keeps Purchase Order # separate from Confirmation number, prints per-stop cases, set-appointment flags, and the full load-level pulp/temp/load-lock notes. A stored pulp line cut at “MUST CHECK IN” is restored on import, save, and reprint, then wraps onto the following lines instead of clipping. Billing “email invoices to billing@msloads.com” stays on the customer confirmation only. The customer/broker load number stays off the driver sheet. Legal boilerplate is not copied.
- Dispatch board **Trailer** city sits under the small teardrop pin so SOUTH SIOUX CITY, HOLCOMB, and HAYS read in full. The pin stays a teardrop, not a fat dot. Tractor city is unchanged.
- **Customer load-status link** (`/l/…`) is minted from the load. Vertical timeline shows only steps that happened: Booked → Pickup → In Transit → Delivered → Invoice sent. If that load has an Orbcomm trailer, a second section shows last-known temp/location. You copy and send the link — it is not emailed. Trailer temp links (`/t/…`) are unchanged.
- **Load chat** stays on that load. Dispatcher sees it on the load; the driver sees it on that load in `/driver`. Stored forever. Not SMS or email.
- **Auto-invoice the day POD hits:** when a POD is on the load and the load is Delivered, the TMS invoice PDF is created that day (customer rate + extras; lumper/OO pay off). If a billing (or main) email exists, it sends from ar@msloads.com. If not, the invoice stays ready and the inbox asks you to use Send to. Same invoice is not emailed twice. The per-load broker address is not used. Tracking links are never auto-emailed.
- **Locations** in nav — shipper/receiver CRUD, pick on a load or type a one-off, scheduling on load + driver. Mass upload from JC’s Ascend blank location CSV (template download + UTF-8 import; duplicate name+address updates). **Download all locations** uses the same Ascend headers so a backup can be edited and re-imported.
- **Search** in nav — criteria, live/archived/cancelled, saved reports.
- Richer load statuses: available, hold, assigned, dispatched, at PU, loading, picked up, in transit, at DEL, unloading, delivered, completed, cancelled.
- Status reason, cover-by, equipment required, hazmat, commodity class, seals, pallets/cases, team, lumper, detention start/stop, appointment confirmation, unload type, cancel reason.
- Multi-stop (add / reorder / remove; at least two stops).
- **Routing guide** on Edit Stops: Google Directions miles (first pickup through last delivery, stops in order) plus an **IFTA estimate** by US state. Refresh route recalculates; changing a stop also tries. Missing `GOOGLE_MAPS_API_KEY` still saves the load — enter miles manually. Does not scrape maps.google.com and does not replace Samsara IFTA on Load Log.
- Load workspace is five screens — **Load Basics**, **Customer Info**, **Carrier and Driver Info**, **Edit Stops**, **Financials**. Only the active screen is mounted. Save on a tab writes that screen’s fields and keeps the rest. Watch / template / cancel live under Load Actions. The header download uses the MSE load number and names the sheet: **Download MSE-#### driver confirmation** on every tab except Customer Info (driver/carrier PDF). Customer Info is **Download MSE-#### customer confirmation**. **Text dispatch to driver** on Load Actions texts the assigned driver’s mobile (the driver record phone) the confirmation facts: load #, shipper/receiver, times, truck, trailer, reefer °F and Continuous/Start-Stop, notes, and “your leg” when they have a relay. Confirm shows the same text before send. No driver or no phone shows a plain error on the load. Company driver pay stays off the text. Relays stay off the customer packet. Twilio keys stay in `.env` and are never logged.
- Driver confirmation prints reefer **setpoint °F** and **Mode** (Continuous default) when it is a reefer. It does not print “Setpoint —” with blank degrees. Dry van / no temp has no reefer bar.
- Financials expenses payable-to is owner-operator, lumper, or a similar typed payee — company drivers do not appear as expense payees.
- **Import loads** (New load → Import, or nav) accepts the Ascend/legacy .xlsx/.csv header row, previews the count and first load numbers, then imports. Match by Load # to update. Truck/driver optional; Assign Later stays unassigned. No imported GPS.
- **Safety** in the main nav is a ranked exception list: CDL expiry, medical last/next, drug test last/next, Settings insurance expiry if present, and Samsara HOS (hours remaining / violation / not available). Empty dates stay empty. Company drivers and owner-operators both appear. Does not replace Samsara HOS on load or fleet pages.
- Load workspace tabs sit on a navy bar with gold for the active tab (navy label). Load Actions is a gold-green strip with navy buttons and dark labels, not white-on-white. Action menus use cream panels with navy text. Dispatcher sidebar is navy with gold section labels and a gold active item.
- **Relays** on Carrier and Driver Info (`+ Add Relay`, same pattern as line items / stops). Each relay is Driver A, Driver B, and a handoff city. Company or OO on either side. Add as many as needed and remove any. Internal only — never a billed customer stop, never on the customer confirmation, QBO invoice, or SMS summary. Driver app still shows “Your leg”. Board shows primary driver + “+1 relay”. Audit/log records who added or changed a relay.
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

- **Safety** in Fleet nav — ranked CDL / medical / drug-test / insurance / Samsara HOS exceptions. Empty dates stay empty. Not a CSA/ELD/accident board.
- **Invoice** on Financials (delivered/completed): customer Income/Budget lines only — no driver/OO/lumper/relay. PDF saved on Load Documents. **Invoices (AR)** has Download invoices CSV (invoice #, load #, customer, date, description, amount, PO). QBO connect stays optional.
- **Drivers**, **Trucks**, and **Trailers** in the dispatcher nav (plus the Fleet overview). Each list has a UTF-8 CSV download (own columns; driver PIN is never exported).
- **Fuel** in Fleet nav — daily fuel-card CSV or Transaction Activity Report PDF (`unpdf`). Four first-class buckets on every import and total: Truck diesel, Reefer diesel, DEF, Scale (none of these is “Other”; DEF is never dumped into truck diesel). Match by driver name (including NName last, first) or unit / prompt #. Dedup on invoice + category + qty when invoice is present. Per-driver and per-truck totals. Unmatched queue. Template + export. Driver and truck pages link here. No live card API.
- Drivers: Add/Edit matches Ascend Driver 1 only (no Pay / Recur tabs). Required Name, Telephone, Country, State, City. Driver Type includes Single plus Company / Owner-operator. Phones, address, hire/term, License No., Exp. Date, last/next medical and drug test, Internal Notes, Active/Inactive. Cancel / Files / Save. Empty dates stay empty. List row ⋯ still has Edit / Delete / Update. **Import drivers** accepts an Ascend .xlsx/.csv (header row 1): preview then import. Maps Status, Team→Driver Type, Name, phones, email, address, Country/Province/City/Zip, DOB/DOH, license + exp, last/next medical and drug test, notes, termination. Ignores pay, Show Pay, Last Pay, Paid Driver Type, passport/FAST/hazmat, and team-2 columns. `0000-00-00` and `-` stay empty. License Number stays a string. Match by exact name (case-insensitive) to update, else create.
- Trucks: unit #, year/make/model, plate, VIN, assigned driver, registration + DOT dates, Samsara vehicle id, last GPS, notes, active flag, document uploads. Row ⋯ menu: Edit, Update, Delete, Inactive. **Import from Samsara** fetches every vehicle, previews TMS unit ← Samsara name/VIN/plate/city (new vs update), and writes only after Confirm. Any unit, name, or id is matched the same way: VIN if the unit agrees, then unit digits, then plate; stored vehicle id cannot keep a swapped pair. No list-index pairing. Re-import re-pairs without duplicating and overwrites GPS on the correctly matched row. Last GPS is stored on the truck and given to Mike. Empty: “No Samsara ID on this truck — Import from Samsara or paste the vehicle id.” Positions are never invented. Missing token: add it in `.env`. Token never logged.
- Trailers: unit #, type, VIN/plate, assigned truck, registration + DOT, ORBCOMM id, default reefer setpoint, last known reading stub, last GPS, notes, active flag, document uploads. Orbcomm trailers can mint a customer link (`/t/…`) with a required expiration date and time (America/New_York). Creating the link snapshots last-known location, temperature, and map pin so the customer page is not blank. Later Orbcomm updates add pins. After expiry the page is unavailable. You send the link — it is not emailed. **Import from Orbcomm** uses `ORBCOMM_*` when the API returns assets, or a CSV/export preview-then-import. Accepts Location Tracking Report / Reefer Status Report (skips title/date banners; header is the first row that starts with Asset ID). Asset ID is the trailer unit; Device Serial Number is the ORBCOMM device; Asset Type maps Reefer/Other. Preview shows every asset (trailer #, device serial, type, last city, note/last ping). Import matches by Asset ID (unit), not list index, and writes identity only — not snapshot GPS/city. No portal scrape.
- Credit hold and payment terms on the customer.
- Customer emails are three slots. **Main email** and **Billing email** live on the customer. Existing contact emails become Main. **Per-load email** lives on that load only (rate-con / Mike copies the broker contact when it is printed — confirm before save). Invoice emails go to Billing, then Main, then today’s Send-to (that send only). Email customer update uses per-load, then Main. Invoices never go to the broker per-load address. Tracking links are not auto-emailed. From address stays ar@msloads.com.
- **Per-load phone** and **Ext** live on that load only. Rate-con / Mike copies the broker/contact number and extension from the packet (confirm before save). Missing phone stays blank; phone without an extension stores the phone only. Driver confirmation, BOL, and other load comms use the per-load phone (with ext when present), then the customer’s main phone. The customer card is not overwritten. Invoice PDFs keep the customer main phone. Invoices still use billing email, not this phone.
- Rate-con contact extraction reads the Name | Phone (xEXT) | Email | Fax row on the driver/carrier sheet, including when that table sits above the “CONTACT INFO” title. CARRIER CONTACT, the Carrier / Attn line (the trucking company on a broker sheet), shipper/receiver phones in stop notes, and “send POD to” billing lines are ignored. The per-load contact is the broker on that rate conf (name and phone both filled), not our Attn name or office phone, and not left blank. Other brokers use their own labels. Values come from that packet and that customer only — no assumed broker, domain, or phone. If a field is missing, leave it blank. Do not invent.
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

- Start with **`npm start`** (not `next start` / `npx next start`). From the repo root: `npm install` → `npm run build` → `npm start`. That loads `.env` / `.env.local` from the project root, then runs `node .next/standalone/server.js`. Folder names with spaces or parentheses (Windows zip extract `(1)`) are fine — keep-alive is `--require` on the child argv, not unquoted `NODE_OPTIONS`. Never logs secret values. `next start` prints that standalone is configured and can show `injected env (0) from .env` even when `SAMSARA_API_TOKEN` is in the real project `.env`.
- After **`npm run build`**, styles must load on standalone. `next build` does not include `public` or `.next/static` in `.next/standalone`; the build script **copies** both in (Windows: never symlink). Then `npm start` or `node .next/standalone/server.js` is styled. Missing those folders = unstyled raw HTML (default blue links). `npm start` copies them again.
- `npm start` copies `data` / `.env` / `public` / `.next/static` on win32. No `better-sqlite3` compile. No symlink (`EPERM`).
- Fleet new **and** edit pages (`/fleet/trucks/new`, `/fleet/trucks/[id]`, trailers, drivers) stay `force-dynamic`. Forms import their server actions (no `.bind` props) and only receive plain JSON values (no driver PIN). Avoids standalone “This page couldn’t load”.
- **Mike** on every dispatcher page (header + bottom-right button), not the driver app. The panel always opens. The Mike API route and server action reload `OPENAI_API_KEY` (same for `SAMSARA_API_TOKEN`) from `process.cwd()/.env`, project-root `.env`, and `.next/standalone/.env`. Values are trimmed; `sk-` keys count as set; the key is never logged. Works with `node .next/standalone/server.js` on Windows without `next start`. If the key is missing, Mike says add it to `.env` and restart. Cheap `gpt-4o-mini`. Never invents GPS.

## Not in this PR

Native iOS/Android stores, EDI VAN, live fuel cards, replacing Samsara, pixel-perfect Ascend.
