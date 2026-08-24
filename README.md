# MS Express TMS

A local Transportation Management System for a small trucking company. Two interfaces:

- **Dispatcher** (desktop) — book or import a load, assign truck + trailer + driver, change the unit later, watch tractor GPS / HOS and trailer / reefer status.
- **Driver** (phone-width web app) — PIN login, see only their dispatch, update status, upload BOL/POD/photos.

Single-tenant. Dispatcher PIN login (demo: **Ana G / 4020** manager; **Jordan Lee / 4410** dispatcher; **Riley Parks / 5500** read-only). Optional authenticator 2-step after PIN once a user enrolls in **Settings → 2-step verification**. Driver PIN login is unchanged. Data lives in SQLite and files on disk, and survives refresh.

## Quick start

Install **Node.js 22.13+ or 24** from [nodejs.org](https://nodejs.org). That is the only toolchain this app needs.

On **Windows 11**, install the Node LTS (or Current 24) installer only. Leave **Tools for Native Modules** / Python / Visual Studio Build Tools **unchecked**. Persistence uses Node’s built-in SQLite (`node:sqlite`), so `npm install` does not compile C++ and does not need Python.

`node:sqlite` needs **Node 22.13+ or 24**. If `node -v` shows **20.x** but you already installed 24 under `C:\Program Files\nodejs`, PATH is using the old Node. `npm start` prefers the Node that launched it (`process.execPath`) and will try Program Files if PATH is too old. You do **not** need Developer Mode or Administrator: `npm start` **copies** (or `mkdir`s) `data`, copies `.env`, and **copies** `public` plus `.next/static` into `.next/standalone`. It never creates a Windows symlink or junction (`EPERM` without Developer Mode).

```bash
npm install
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) for dispatch (sign in as Ana G / 4020). Driver app: [http://localhost:3000/driver/login](http://localhost:3000/driver/login).

Do **not** use `npm install --ignore-scripts` to “skip compile.” This repo has nothing that must be compiled. Ignoring scripts can leave `next` incomplete, so `npm run build` / `npm start` fail with a missing `next` command. A normal `npm install` is required.

**Docker:**

```bash
docker compose up --build
```

Then open `http://<this-box>:3000` for dispatch and `http://<this-box>:3000/driver/login` for the driver app.

`npm start` and Docker both run the Next **standalone** server on port **3000**. SQLite and uploads persist in `./data` (Compose mounts that folder). The server binds `0.0.0.0` unless you set an explicit IP with `HOST` / `LISTEN_HOST` / `BIND_HOST`. It does **not** use the OS `HOSTNAME` (that is the machine name — on some boxes it is `cursor`, and nothing useful listens).

Override port with `PORT`. No Vercel account or secrets required.

Local edit loop on the same machine:

```bash
npm install
npm run dev
```

The first start creates `data/tms.db` and seeds a Midwest/South fleet.

| Command | What it does |
| --- | --- |
| `npm install` | Install JavaScript dependencies (no native compile) |
| `npm run build` | Production build, then **copies** `public` and `.next/static` into `.next/standalone` (no symlink) so styles load |
| `npm start` | **The start command** — load repo-root `.env` / `.env.local`, recopy web assets, then run `node .next/standalone/server.js` |
| `docker compose up --build` | Build the Node 22 image and serve port 3000 |
| `npm run dev` | Webpack dev server (keep-alive wrapper) |
| `npm test` | Workflow smoke test |
| `npm run sample-rate-con` | Regenerate `public/samples/sample-rate-con.pdf` and the Ascend-style sample |
| `npm run sample-confirmations` | Regenerate layout-reference load confirmation PDFs |

Requires **Node.js 22.13+ or 24** (`node:sqlite`). **JC should start production with `npm start`** from the repo root (the folder that has `package.json` and `.env`). That script loads `.env` and `.env.local` from that same folder (so `SAMSARA_API_TOKEN` is applied), recopies `public` and `.next/static` into `.next/standalone` (Windows: **copy**, never symlink), then runs `node .next/standalone/server.js` using `process.execPath` (not a different `node` from PATH). It never prints secret values.

**After `npm run build`, styles must load on standalone.** Next does not put `public` or `.next/static` inside `.next/standalone`. The build script copies both folders in (no symlink). Then `npm start` **or** `node .next/standalone/server.js` must show the styled UI. If those folders are missing, the page is unstyled raw HTML (default blue links). Prefer `npm start` — it copies the assets again and loads `.env`.

Windows standalone does not need `next start`. Mike and Samsara reread `OPENAI_API_KEY` / `SAMSARA_API_TOKEN` at request time from `process.cwd()/.env`, the project-root `.env`, and `.next/standalone/.env` (trimmed, never logged). `sk-` keys count as set. Copying `.env` next to `server.js` is enough when you run that file directly.

Do **not** run `next start` or `npx next start`. This app uses `output: "standalone"`. Next 16 will print that standalone is configured and dotenv 17 can report `injected env (0) from .env` even when the real project `.env` exists — because `next start` does not load env from the repo root the way the standalone server needs. `npm run start:next` is redirected to the same `npm start` wrapper.

Next 16 on Linux can print Ready and then exit 0 (webpack and Turbopack) when stdin is closed, the session sends SIGHUP, or a log pipe hits EPIPE. This repo forces webpack for `npm run dev` and loads `scripts/next-keep-alive.cjs` so the process stays up.

## Dispatcher

- **Exception inbox** on the dispatch home: *N loads fine / M need attention*, ranked CRITICAL → LOW (reefer vs setpoint, late vs window, missing POD, compliance, unassigned). Ack / snooze / resolve. Seeded demo data keeps the list from being empty.
- Dashboard counts, shift handoff, watch list, daily recap, dispatch board with status / pickup-date filters. **Mike** is a **Mike** button on every dispatcher page (header and bottom-right), not the driver app. The panel always opens. If `OPENAI_API_KEY` is set, chat works; if not, Mike says add the key to `.env` and restart. Uses cheap `gpt-4o-mini`. Answers from TMS data only and will not invent GPS. The key is never logged.
- **Locations** — shippers and receivers (address, phone, role, appointment vs FCFS, hours, scheduling notes). Pick a shipper/consignee on a load, or still type a one-off. Scheduling notes show on the load and on driver dispatch. Address search uses Google Places when `GOOGLE_MAPS_API_KEY` or `GOOGLE_PLACES_API_KEY` is in `.env` (server-side; fields stay manual if the key is missing).
- **Search** — Ascend-style search criteria: terms, origin/dest state, first-pickup date range (This week / This month), customer / driver / truck / trailer / status, plus live (default) / archived / cancelled. Results open the load. Save named reports (filters + visible columns) and reopen them from the dropdown.
- **Accounting** — AR invoices, AP bills, OO driver pay, 3% commissions worksheet, QuickBooks (stub / live when tokens set)
- **Settings** — hub for company contact/logo, insurance, dropdown lists, currency/units, tax, alert windows, routing notes, OO pay defaults, document header/footer/terms, load number prefix, sample-data toggle, dispatcher users/roles, 2-step verification, and integration status. Dispatcher login required. Saves to SQLite.
- Richer load statuses, multi-stop, clone, templates, document checklist, claims
- Create a load by hand, or **Load from rate confirmation**
- Assign or **change** truck and driver after a load is sent; the old driver loses it, the new driver sees it
- Special instructions, appointment notes, rate, and refs travel to the driver screen
- Documents and driver photos appear on the load
- **Drivers**, **Trucks**, and **Trailers** in the dispatcher nav — add/edit records, compliance badges, document uploads (CDL, medical card, registration, DOT, insurance) under `data/uploads/fleet`. Driver PINs can be reset and are never shown in the list.
- Tractor GPS and driver HOS from **Samsara** (live when `SAMSARA_API_TOKEN` is set). Shown on **Trucks** (list + detail), the dispatch board, dashboard **On the road**, and the load **Carrier / Asset** tab when that truck is assigned. Match on Samsara vehicle id, name, or unit # (including a unit typed as the vehicle id, e.g. 112). You do not need the UUID. Import fills the real Samsara vehicle id. If the API returns vehicles but not that unit, the preview lists the names that came back. Missing ID: “No Samsara ID on this truck — Import from Samsara or paste the vehicle id.” Positions are never invented. Missing token: add `SAMSARA_API_TOKEN` to `.env` and restart. The token is never logged.
- Trailer location (if available) and reefer status from **ORBCOMM** (temp, setpoint, return/supply air, alarms, last report). **Trailers → Import from ORBCOMM** uses `ORBCOMM_*` when the B2B API returns assets, or a CSV/export preview-then-import. Match by ORBCOMM asset id or trailer #. No portal scrape.
- Driver license (number, state, expiration) and medical card (issued / expires) on each driver record
- Assign-time compliance alerts: license/med card (30 days), truck/trailer registration (60 days), DOT inspection (30 days). Expired documents require an explicit confirm. Both registration and DOT can warn on the same assign. Seed: Denise (license inside 30 days), Tyrell (expired medical), truck 210 and trailer TR-8801 (registration inside 60 days), truck 108 (DOT inside 30 days).
- Company driver vs owner-operator: default pay % on the driver; load stores rate, OO %, and computed pay (hidden / N/A for company drivers). Fleet driver list filters by type.
- **Load confirmation PDF** from a live load (owner-operator vs company-driver template). Title is page-centered on its own line; logo left; dispatcher/load card on the right below the title so email stays on one line. Dispatcher and driver can download it, including a load the dispatcher just created (a leftover driver-app sign-in does not 404 the file). Company header is editable on Settings.
- **Send to QuickBooks** on a delivered load: invoice the customer for the load rate (not owner-operator pay). Without credentials, a labeled demo invoice can be recorded locally.
- **IFTA mileage** on in-transit and delivered loads: miles by US state / Canadian province, totals, vehicle id, and a downloadable CSV on the load documents. **Refresh IFTA from Samsara** pulls live reports when a token is set; otherwise a labeled demo breakdown is built from origin / destination.

## Driver app

Sign in at `/driver/login` with name + PIN. Seeded demo PINs:

| Driver | PIN | Why it's useful |
| --- | --- | --- |
| Denise Ortega | 1125 | In-transit reefer load MSE-1045 |
| Marcus Hale | 1024 | Assigned dry van |
| James Whitaker | 1186 | In transit |
| Cole Brennan | 2051 | Assigned flatbed |

Driver statuses: en route to pickup → loaded → en route to delivery → delivered. Those move the dispatcher's load to in transit / delivered.

On a load, the driver can **take a photo with the phone camera** (or pick an existing picture), preview / retake, add more pages, then **Make PDF and upload** as BOL / POD / lumper / other. The PDF is stored on the load; the dispatcher opens it under documents. Camera uses the native file input (`capture=environment`) so it works on iPhone Safari and Android Chrome over `http://localhost` or LAN; live `getUserMedia` is used when the browser allows it. No cloud OCR.

Uploads (BOL, POD, lumper, trailer/product/seal photos, camera PDFs) are stored under `data/uploads/` and show on the dispatcher load page.

## Rate confirmation ingest

1. Open **New load → From rate con** or `/loads/import`.
2. Upload a PDF (text extract) or an image (local Tesseract OCR, no cloud key).
3. Review/edit every extracted field. A partial parse is expected.
4. Save. The original file is attached to the load as a rate confirmation.

A labeled ingest sample lives at [`public/samples/sample-rate-con.pdf`](public/samples/sample-rate-con.pdf) (Delta Cold Storage, Atlanta → Jacksonville, special instructions, 0°F reefer). Ascend **LOAD CONFIRMATION** packets (Load #, Stops, Pay Items) also parse. The file stays attached even if some fields are blank. Weight never comes from the filename.

Layout references for the outbound confirmation (not used as live data):

- [`public/samples/sample-load-confirmation-oo.pdf`](public/samples/sample-load-confirmation-oo.pdf) — owner-operator style
- [`public/samples/sample-load-confirmation-company.pdf`](public/samples/sample-load-confirmation-company.pdf) — company driver style

Live confirmations are generated from the load record. Company name / dispatcher / phone / email / address / logo are set on **Settings → Company contact**.

The parser looks for labeled lines (`Customer:`, `Origin:`, `Pickup Window:`, `Rate:`, and so on) plus a `SPECIAL INSTRUCTIONS` block. If the customer name is new, saving creates that customer.

## Integrations (hard split)

Both integrations are required. They do not share data:

| Source | Used for | Never used for | Env (gitignored `.env` only) |
| --- | --- | --- | --- |
| **Samsara** | Tractor GPS, driver Hours of Service / remaining drive time, IFTA jurisdiction miles | Reefer temps, trailer location | `SAMSARA_API_TOKEN` |
| **ORBCOMM** | Trailer location (if the report has it), reefer temp / setpoint / return-supply air / alarms | Driver HOS | `ORBCOMM_USERNAME`, `ORBCOMM_PASSWORD`, optional `ORBCOMM_ACCOUNT_ID` / `ORBCOMM_API_BASE` |
| **QuickBooks Online** | Invoice the customer for a delivered load (rate + lumper) | Owner-operator settlement / bills / relays | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, optional `QBO_SANDBOX=true` |
| **Google Places** | Address autocomplete on Locations and New Load / rate-con | Scraping maps.google.com | `GOOGLE_MAPS_API_KEY` or `GOOGLE_PLACES_API_KEY` (server-side). If you must use a browser key, restrict it by HTTP referrer to localhost. |

Copy `.env.example` to `.env` (or `.env.local`), fill only what you have, and restart. `.env` files are gitignored. Credentials are never committed, logged, stored in SQLite, or shown in the UI.

**Integrations** has separate cards. Connected vs demo is independent: one integration can be live while another is demo.

Map IDs on **Fleet**: truck → Samsara vehicle ID (or import / match by unit #), driver → Samsara driver ID, trailer → ORBCOMM asset ID. Truck list, truck detail, the board, On the road, and the load Carrier/Asset tab show live Samsara tractor/HOS when matched. ORBCOMM trailer/reefer stays on the board and load page.

The driver app shows remaining drive time (Samsara) and reefer temp/setpoint (ORBCOMM) when available.

### Samsara — tractor GPS and driver HOS

1. Paste the token after `SAMSARA_API_TOKEN=`.
2. Restart.
3. On **Fleet → Trucks**, use **Import from Samsara** (preview, then confirm) or set the Samsara vehicle ID by hand. Set the Samsara driver ID on the driver.

When the token is set, the app calls `GET https://api.samsara.com/fleet/vehicles` for truck import, plus `GET https://api.samsara.com/fleet/vehicles/stats?types=gps` and `GET https://api.samsara.com/fleet/hos/clocks`. The board and load page show last-known **tractor** location and remaining drive time. The token is never logged.

In-transit and delivered loads can **Refresh IFTA from Samsara** when the assigned truck has a Samsara vehicle ID. The app uses the current IFTA APIs:

- Trip window (preferred): `POST https://api.samsara.com/ifta-detail/csv` with `startHour` / `endHour` / `vehicleIds`, then poll `GET /ifta-detail/csv/{jobId}` and sum `distance_meters` by `jurisdiction`. Token needs **Write IFTA (US)** plus **Read IFTA (US)**.
- Monthly fallback: `GET https://api.samsara.com/fleet/reports/ifta/vehicle?year=&month=&vehicleIds=` (**Read IFTA**). The UI labels this as the vehicle’s monthly jurisdiction miles, not a trip-only split.

No token: labeled **demo** by-state miles from the load’s origin and destination, plus a CSV on the load documents so the UI can be tested.

Token set and IFTA returns 401/403 or another API error: the load page shows the error. The app does **not** invent live Samsara miles.

No token: Integrations can still show a labeled demo sample. Live truck/board/load GPS is not invented. 401/403 on GPS/HOS: error on Integrations / the board, empty live positions (never demo coordinates). The app does not crash.

### ORBCOMM — trailer tracking and reefer

Source of record today: [Reefer Status Report](https://platform.orbcomm.com/#/portal/remote/ReeferStatusReport).

1. Ask ORBCOMM for Transportation Platform (B2B) username/password (and account id if they give one).
2. Set `ORBCOMM_USERNAME`, `ORBCOMM_PASSWORD`, optional `ORBCOMM_ACCOUNT_ID` / `ORBCOMM_API_BASE`.
3. Restart.
4. On **Fleet → Trailers**, use **Import from ORBCOMM** (API list when available, or CSV/export preview then import) or set the ORBCOMM asset ID by hand. Match by asset id or trailer #. Do not scrape the portal.

When credentials are present the app requests `POST https://platform.orbcomm.com/SynB2BGatewayService/api/generateToken` and, if your account exposes it, an asset-status snapshot. There is **no scrape** of the logged-in portal.

If B2B snapshot access is not enabled yet:

1. In ORBCOMM, open Reefer Status Report and export CSV or JSON.
2. On **Integrations**, import that file (or paste rows).

Expected columns: `trailer_id`, `temperature_f`, `setpoint_f`, `return_air_f`, `supply_air_f`, `alarm`, `latitude`, `longitude`, `address`, `recorded_at`.

A load whose trailer record, trailer #, or ORBCOMM asset ID matches a row shows trailer location if present, last temp, setpoint, return/supply air, alarms, and timestamp. No credentials: seeded demo trailer/reefer data, labeled **demo**. Auth/API failure: error in the UI and demo fallback.

How JC pulls the report today:

1. Sign in at [platform.orbcomm.com](https://platform.orbcomm.com/#/portal/remote/ReeferStatusReport).
2. Open **Reefer Status Report**.
3. Export CSV or JSON.
4. Import it on **Integrations**. Map each trailer’s ORBCOMM asset ID on **Fleet → Trailers**.

When ORBCOMM enables Transportation Platform B2B access, put the username/password in `.env` and restart — the app will request a token. There is no scrape of the logged-in portal.

### QuickBooks Online — invoice delivered loads

QuickBooks **Online** only (not Desktop). Secrets stay in gitignored `.env`. **Settings → QuickBooks** runs Connect OAuth and stores the realm + refresh token on the server (`data/qbo-refresh.json`), never in the browser.

1. Create an Intuit developer app at [developer.intuit.com](https://developer.intuit.com) with the accounting scope.
2. Add redirect URI `http://localhost:3000/api/integrations/quickbooks/callback` (or your `QBO_REDIRECT_URI`).
3. Copy `.env.example` to `.env` and set:

```
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=http://localhost:3000/api/integrations/quickbooks/callback
QBO_SANDBOX=true
```

4. Restart. Open **Settings → QuickBooks** and click **Connect QuickBooks**. If those keys are missing, the page shows setup steps and does not crash.
5. **Accounting → QuickBooks** lists ready/sent invoices and any **Needs QBO customer** rows.

When connected, **Send to QuickBooks** on a delivered load:

- Maps the TMS customer by DisplayName / CompanyName, or creates one. If that fails, the customer is queued as **Needs QBO customer** and the load is not marked sent.
- Creates one invoice: customer, load #, PU → DEL, line haul = customer rate, plus lumper if recorded. Date = delivery date.
- Relays and owner-operator / driver pay are **not** on the invoice.
- Idempotent: a second send is blocked until you confirm. The QBO doc number is stored on the load.

No app keys: labeled **demo** invoice you can record locally. 401/403 leaves the load unsent and asks you to re-connect in Settings.

## Data

- SQLite: `data/tms.db`
- Uploads: `data/uploads/`
- Rotated QuickBooks refresh token: `data/qbo-refresh.json` (gitignored)

Reset (macOS / Linux):

```bash
rm -rf data/tms.db data/tms.db-wal data/tms.db-shm data/uploads
```

Reset (Windows PowerShell):

```powershell
Remove-Item -Recurse -Force data\tms.db, data\tms.db-wal, data\tms.db-shm, data\uploads -ErrorAction SilentlyContinue
```

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, Node built-in SQLite (`node:sqlite`), `dotenv`, `unpdf`, optional `tesseract.js`. No `better-sqlite3` / node-gyp.

See [PRODUCT_CATALOG.md](./PRODUCT_CATALOG.md) for the full 300-feature catalog and extension modules (source of truth). See [ROADMAP.md](./ROADMAP.md) for what ships now vs next vs later. Do not implement the catalog in one pass.
