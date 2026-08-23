# MSE TMS

A local Transportation Management System for a small trucking company. Two interfaces:

- **Dispatcher** (desktop) — book or import a load, assign truck + driver, change the unit later, watch status and reefer temp.
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
- Reefer setpoint + last temp on the board (live Samsara when a token is set; otherwise labeled demo)

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

## Samsara (live reefer)

The API token is read only from the process environment. It is never committed, never written to the database, never logged, and never shown in the UI.

1. Copy `.env.example` to `.env` (or `.env.local`).
2. Paste your Samsara API token after `SAMSARA_API_TOKEN=`.
3. Restart the app (`npm run dev`).

Both `.env` and `.env.local` are gitignored. `.env.example` only contains an empty `SAMSARA_API_TOKEN=`.

- **No token:** board, driver screen, and **Integrations** show seeded demo temps, labeled **demo**. Status: Demo. Token: Not set.
- **Token present:** the app calls `GET https://api.samsara.com/fleet/vehicles/stats` and `GET https://api.samsara.com/fleet/trailers/stats` for last-known reefer ambient, zone-1 setpoint, and door. Integrations shows **Connected** and Token: **Set (hidden)**.
- **401 / 403 or other API failures:** Integrations and the board show a clear error, the UI falls back to labeled demo temps, and the app does not crash.

Map IDs on **Fleet → Edit truck**:

- Samsara vehicle ID (tractor)
- Samsara trailer / asset ID (reefer)
- Default trailer number (also matched to the Samsara trailer name)

A load assigned to a mapped unit, or a load whose trailer number matches a mapped truck, shows last reported temp, setpoint if Samsara sent one, and the reading timestamp.

## Data

- SQLite: `data/tms.db`
- Uploads: `data/uploads/`

Reset:

```bash
rm -rf data/tms.db data/tms.db-wal data/tms.db-shm data/uploads
```

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, `better-sqlite3`, `dotenv`, `unpdf`, optional `tesseract.js`.

See [ROADMAP.md](./ROADMAP.md) for native apps, live ELD, accounting, and EDI.
