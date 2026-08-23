# MSE TMS

A local Transportation Management System for a small trucking company. Two interfaces:

- **Dispatcher** (desktop) — book or import a load, assign truck + trailer + driver, change the unit later, watch tractor GPS / HOS and trailer / reefer status.
- **Driver** (phone-width web app) — PIN login, see only their dispatch, update status, upload BOL/POD/photos.

Single-tenant, no dispatcher login. Data lives in SQLite and files on disk, and survives refresh.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for dispatch. Driver app: [http://localhost:3000/driver/login](http://localhost:3000/driver/login).

The first start creates `data/tms.db` and seeds a Midwest/South fleet.

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Run the app |
| `npm test` | Workflow smoke test |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run sample-rate-con` | Regenerate `public/samples/sample-rate-con.pdf` |

Requires Node.js 20 or newer.

## Dispatcher

- Dashboard counts, dispatch board with status / pickup-date filters
- Create a load by hand, or **Load from rate confirmation**
- Assign or **change** truck and driver after a load is sent; the old driver loses it, the new driver sees it
- Special instructions, appointment notes, rate, and refs travel to the driver screen
- Documents and driver photos appear on the load
- Tractor GPS and driver HOS from **Samsara** (live when `SAMSARA_API_TOKEN` is set; otherwise labeled demo)
- Trailer location (if available) and reefer status from **ORBCOMM** (temp, setpoint, return/supply air, alarms, last report)
- Driver license (number, state, expiration) and medical card (issued / expires) on each driver record
- Assign-time compliance alerts: license/med card (30 days). Expired documents require an explicit confirm. Expiring/expired badges on the driver list and a dashboard list. Seed: Denise (license inside 30 days), Tyrell (expired medical card).
- Company driver vs owner-operator settlement on the load

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

A labeled sample lives at [`public/samples/sample-rate-con.pdf`](public/samples/sample-rate-con.pdf) (Delta Cold Storage, Atlanta → Jacksonville, special instructions, 0°F reefer).

The parser looks for labeled lines (`Customer:`, `Origin:`, `Pickup Window:`, `Rate:`, and so on) plus a `SPECIAL INSTRUCTIONS` block. If the customer name is new, saving creates that customer.

## Integrations (hard split)

Both integrations are required. They do not share data:

| Source | Used for | Never used for | Env (gitignored `.env` only) |
| --- | --- | --- | --- |
| **Samsara** | Tractor GPS, driver Hours of Service / remaining drive time | Reefer temps, trailer location | `SAMSARA_API_TOKEN` |
| **ORBCOMM** | Trailer location (if the report has it), reefer temp / setpoint / return-supply air / alarms | Driver HOS | `ORBCOMM_USERNAME`, `ORBCOMM_PASSWORD`, optional `ORBCOMM_ACCOUNT_ID` / `ORBCOMM_API_BASE` |

Copy `.env.example` to `.env` (or `.env.local`), fill only what you have, and restart. `.env` files are gitignored. Credentials are never committed, logged, stored in SQLite, or shown in the UI.

**Integrations** has two cards. Connected vs demo is independent: one token can be live while the other is demo.

Map IDs on **Fleet**: truck → Samsara vehicle ID, driver → Samsara driver ID, trailer → ORBCOMM asset ID. The board and load page show Samsara tractor/HOS and ORBCOMM trailer/reefer when those IDs are mapped.

The driver app shows remaining drive time (Samsara) and reefer temp/setpoint (ORBCOMM) when available.

### Samsara — tractor GPS and driver HOS

1. Paste the token after `SAMSARA_API_TOKEN=`.
2. Restart.
3. On **Fleet**, set the Samsara vehicle ID on the truck and the Samsara driver ID on the driver.

When the token is set, the app calls `GET https://api.samsara.com/fleet/vehicles/stats?types=gps` and `GET https://api.samsara.com/fleet/hos/clocks`. The board and load page show last-known **tractor** location and remaining drive time.

No token, or 401/403: labeled **demo** GPS/HOS, plus a clear error on Integrations / the board. The app does not crash.

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

## Data

- SQLite: `data/tms.db`
- Uploads: `data/uploads/`

Reset:

```bash
rm -rf data/tms.db data/tms.db-wal data/tms.db-shm data/uploads
```

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, `better-sqlite3`, `dotenv`, `unpdf`, optional `tesseract.js`.

See [ROADMAP.md](./ROADMAP.md) for native apps, deeper telematics, accounting, and EDI.
