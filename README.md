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
- Reefer setpoint + last temp on the board (demo data unless Samsara is configured)

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

## Samsara (reefer)

No live call is made unless `SAMSARA_API_TOKEN` is set in the environment. The token is never committed.

- **No token:** board, driver screen, and **Integrations** show seeded demo temps, labeled **demo**.
- **Token present:** the app calls `GET https://api.samsara.com/fleet/vehicles/stats` for reefer ambient, setpoint, door, and alarm. Failures are shown as errors, not replaced with fake live data.

Optional truck fields: Samsara vehicle ID and default trailer number.

## Data

- SQLite: `data/tms.db`
- Uploads: `data/uploads/`

Reset:

```bash
rm -rf data/tms.db data/tms.db-wal data/tms.db-shm data/uploads
```

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, `better-sqlite3`, `unpdf`, optional `tesseract.js`.

See [ROADMAP.md](./ROADMAP.md) for native apps, live ELD, accounting, and EDI.
