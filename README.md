# MSE TMS

A local Transportation Management System for a small trucking company. Two interfaces:

- **Dispatcher** (desktop) — book or import a load, assign truck + trailer + driver, change the unit later, watch tractor GPS / HOS and trailer / reefer status.
- **Driver** (phone-width web app) — PIN login, see only their dispatch, update status, upload BOL/POD/photos.

Single-tenant, no dispatcher login. Data lives in SQLite and files on disk, and survives refresh.

## Quick start

Install **Node.js 22.13+ or 24** from [nodejs.org](https://nodejs.org). That is the only toolchain this app needs.

On **Windows 11**, install the Node LTS (or Current 24) installer only. Leave **Tools for Native Modules** / Python / Visual Studio Build Tools **unchecked**. Persistence uses Node’s built-in SQLite (`node:sqlite`), so `npm install` does not compile C++ and does not need Python.

```bash
npm install
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) for dispatch. Driver app: [http://localhost:3000/driver/login](http://localhost:3000/driver/login).

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
| `npm run build` | Production build (writes `.next/standalone`) |
| `npm start` | Run the standalone server and keep it listening |
| `docker compose up --build` | Build the Node 22 image and serve port 3000 |
| `npm run dev` | Webpack dev server (keep-alive wrapper) |
| `npm test` | Workflow smoke test |
| `npm run sample-rate-con` | Regenerate `public/samples/sample-rate-con.pdf` |
| `npm run sample-confirmations` | Regenerate layout-reference load confirmation PDFs |

Requires **Node.js 22.13+ or 24**. `npm start` runs `node .next/standalone/server.js` through `scripts/start-standalone.mjs`. Next 16 documents that `next start` does not work with `output: 'standalone'`.

Next 16 on Linux can print Ready and then exit 0 (webpack and Turbopack) when stdin is closed, the session sends SIGHUP, or a log pipe hits EPIPE. This repo forces webpack for `npm run dev` and loads `scripts/next-keep-alive.cjs` so the process stays up.

## Dispatcher

- **Exception inbox** on the dispatch home: *N loads fine / M need attention*, ranked CRITICAL → LOW (reefer vs setpoint, late vs window, missing POD, compliance, unassigned). Click a row to open the load. Seeded demo data keeps the list from being empty.
- Dashboard counts, dispatch board with status / pickup-date filters
- Create a load by hand, or **Load from rate confirmation**
- Assign or **change** truck and driver after a load is sent; the old driver loses it, the new driver sees it
- Special instructions, appointment notes, rate, and refs travel to the driver screen
- Documents and driver photos appear on the load
- Fleet document uploads on driver / truck / trailer (CDL, medical card, registration, DOT, insurance) stored under `data/uploads/fleet`; the load page opens the assigned unit’s files in one click
- Tractor GPS and driver HOS from **Samsara** (live when `SAMSARA_API_TOKEN` is set; otherwise labeled demo)
- Trailer location (if available) and reefer status from **ORBCOMM** (temp, setpoint, return/supply air, alarms, last report)
- Driver license (number, state, expiration) and medical card (issued / expires) on each driver record
- Assign-time compliance alerts: license/med card (30 days), truck/trailer registration (60 days), DOT inspection (30 days). Expired documents require an explicit confirm. Both registration and DOT can warn on the same assign. Seed: Denise (license inside 30 days), Tyrell (expired medical), truck 210 and trailer TR-8801 (registration inside 60 days), truck 108 (DOT inside 30 days).
- Company driver vs owner-operator: default pay % on the driver; load stores rate, OO %, and computed pay (hidden / N/A for company drivers). Fleet driver list filters by type.
- **Load confirmation PDF** from a live load (owner-operator vs company-driver template). Dispatcher and driver can download it. Company header is editable on Settings.
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

Uploads (BOL, POD, lumper, trailer/product/seal photos) are stored under `data/uploads/` and show on the dispatcher load page.

## Rate confirmation ingest

1. Open **New load → From rate con** or `/loads/import`.
2. Upload a PDF (text extract) or an image (local Tesseract OCR, no cloud key).
3. Review/edit every extracted field. A partial parse is expected.
4. Save. The original file is attached to the load as a rate confirmation.

A labeled ingest sample lives at [`public/samples/sample-rate-con.pdf`](public/samples/sample-rate-con.pdf) (Delta Cold Storage, Atlanta → Jacksonville, special instructions, 0°F reefer).

Layout references for the outbound confirmation (not used as live data):

- [`public/samples/sample-load-confirmation-oo.pdf`](public/samples/sample-load-confirmation-oo.pdf) — owner-operator style
- [`public/samples/sample-load-confirmation-company.pdf`](public/samples/sample-load-confirmation-company.pdf) — company driver style

Live confirmations are generated from the load record. Company name / dispatcher / phone / email are set on **Settings**.

The parser looks for labeled lines (`Customer:`, `Origin:`, `Pickup Window:`, `Rate:`, and so on) plus a `SPECIAL INSTRUCTIONS` block. If the customer name is new, saving creates that customer.

## Integrations (hard split)

Both integrations are required. They do not share data:

| Source | Used for | Never used for | Env (gitignored `.env` only) |
| --- | --- | --- | --- |
| **Samsara** | Tractor GPS, driver Hours of Service / remaining drive time, IFTA jurisdiction miles | Reefer temps, trailer location | `SAMSARA_API_TOKEN` |
| **ORBCOMM** | Trailer location (if the report has it), reefer temp / setpoint / return-supply air / alarms | Driver HOS | `ORBCOMM_USERNAME`, `ORBCOMM_PASSWORD`, optional `ORBCOMM_ACCOUNT_ID` / `ORBCOMM_API_BASE` |
| **QuickBooks Online** | Invoice the customer for a delivered load (customer rate) | Owner-operator settlement / bills | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REFRESH_TOKEN`, `QUICKBOOKS_REALM_ID`, optional `QUICKBOOKS_ENVIRONMENT` |

Copy `.env.example` to `.env` (or `.env.local`), fill only what you have, and restart. `.env` files are gitignored. Credentials are never committed, logged, stored in SQLite, or shown in the UI.

**Integrations** has separate cards. Connected vs demo is independent: one integration can be live while another is demo.

Map IDs on **Fleet**: truck → Samsara vehicle ID, driver → Samsara driver ID, trailer → ORBCOMM asset ID. The board and load page show Samsara tractor/HOS and ORBCOMM trailer/reefer when those IDs are mapped.

The driver app shows remaining drive time (Samsara) and reefer temp/setpoint (ORBCOMM) when available.

### Samsara — tractor GPS and driver HOS

1. Paste the token after `SAMSARA_API_TOKEN=`.
2. Restart.
3. On **Fleet**, set the Samsara vehicle ID on the truck and the Samsara driver ID on the driver.

When the token is set, the app calls `GET https://api.samsara.com/fleet/vehicles/stats?types=gps` and `GET https://api.samsara.com/fleet/hos/clocks`. The board and load page show last-known **tractor** location and remaining drive time.

In-transit and delivered loads can **Refresh IFTA from Samsara** when the assigned truck has a Samsara vehicle ID. The app uses the current IFTA APIs:

- Trip window (preferred): `POST https://api.samsara.com/ifta-detail/csv` with `startHour` / `endHour` / `vehicleIds`, then poll `GET /ifta-detail/csv/{jobId}` and sum `distance_meters` by `jurisdiction`. Token needs **Write IFTA (US)** plus **Read IFTA (US)**.
- Monthly fallback: `GET https://api.samsara.com/fleet/reports/ifta/vehicle?year=&month=&vehicleIds=` (**Read IFTA**). The UI labels this as the vehicle’s monthly jurisdiction miles, not a trip-only split.

No token: labeled **demo** by-state miles from the load’s origin and destination, plus a CSV on the load documents so the UI can be tested.

Token set and IFTA returns 401/403 or another API error: the load page shows the error. The app does **not** invent live Samsara miles.

No token, or 401/403 on GPS/HOS: labeled **demo** GPS/HOS, plus a clear error on Integrations / the board. The app does not crash.

### ORBCOMM — trailer tracking and reefer

Source of record today: [Reefer Status Report](https://platform.orbcomm.com/#/portal/remote/ReeferStatusReport).

1. Ask ORBCOMM for Transportation Platform (B2B) username/password (and account id if they give one).
2. Set `ORBCOMM_USERNAME`, `ORBCOMM_PASSWORD`, optional `ORBCOMM_ACCOUNT_ID` / `ORBCOMM_API_BASE`.
3. Restart.
4. On **Fleet → Trailers**, set the ORBCOMM asset ID.

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

This app does **not** run an in-app OAuth dance and does not ship secrets. You create a QBO app, finish OAuth in Intuit’s tools, and paste the resulting values into gitignored `.env`.

1. Create an Intuit developer account at [developer.intuit.com](https://developer.intuit.com).
2. Create an app. Enable **QuickBooks Online** with the accounting scope (`com.intuit.quickbooks.accounting`).
3. Use **Development** keys for the Intuit sandbox (a sandbox company is created with the app). Production keys are a separate step later.
4. Add the OAuth 2.0 Playground redirect URI Intuit shows for your app (typically under the app’s Keys tab).
5. Open the [OAuth 2.0 Playground](https://developer.intuit.com/app/developer/playground), select your app, authorize the sandbox company, and exchange the code for tokens.
6. Copy **Client ID**, **Client Secret**, **refresh token**, and **realm id** (company id). Access tokens expire in about an hour; the refresh token is what this app stores.
7. Copy `.env.example` to `.env` and fill only those placeholders:

```
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REFRESH_TOKEN=
QUICKBOOKS_REALM_ID=
QUICKBOOKS_ENVIRONMENT=sandbox
```

8. Restart the app. **Integrations** shows Connected vs Demo independently of Samsara/ORBCOMM.

When credentials are present, **Send to QuickBooks** on a delivered load:

- Finds or creates a QBO customer by display name
- Creates an invoice: customer, load #, PU → DEL, amount = load customer rate, date = delivery date, memo with refs / special instructions
- Marks the load with the QBO invoice id and timestamp

Owner-operator pay is **not** invoiced and is **not** a QBO bill. The invoice is always customer billing. A note is added on OO loads.

Intuit rotates refresh tokens. The latest refresh token is written to gitignored `data/qbo-refresh.json` (never committed or shown). If refresh or invoice create returns 401/403, the UI shows the error and the load is **not** marked sent.

No credentials: the same screen shows a labeled **demo** invoice preview. **Record demo invoice** stores a local `demo-…` invoice id so you can test the UI. A second send is blocked until you confirm.

To use a live QuickBooks company later: create production keys, re-authorize against that company, set `QUICKBOOKS_ENVIRONMENT=production`, and paste the new refresh token + realm id.

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
