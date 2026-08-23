# MSE TMS

A local Transportation Management System for a small trucking company. Dispatchers can book loads, manage customers and fleet, assign a truck and driver, and move freight from available to delivered.

This is a single-tenant desktop-first web app. There is no login in v1. Data lives in a local SQLite file and survives refresh.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The first start creates `data/tms.db` and seeds a realistic Midwest/South fleet so the board is not empty.

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Run the app |
| `npm test` | Dispatcher workflow smoke test |
| `npm run build` | Production build |
| `npm start` | Serve the production build |

Requires Node.js 20 or newer.

## What you can do

1. **Dashboard** — counts of open loads, in-transit loads, available trucks, and unassigned loads.
2. **Dispatch board** — every load with status, pickup/delivery windows, and assigned unit. Filter by status, pickup date, or search text. Assign a truck and driver. Change status in place.
3. **Loads** — create and edit customer, origin, destination, pickup and delivery windows, weight, commodity, rate, notes, and status (`available`, `assigned`, `in_transit`, `delivered`, `cancelled`).
4. **Fleet** — trucks (unit #, type, capacity, status) and drivers (name, phone, license, assigned truck, status).
5. **Customers** — name, contacts, and billing notes. Pick a customer when booking a load.

Typical first-run path: create a customer → add a truck and driver → create a load → assign it on the board → set status to In Transit → Delivered.

## Data

SQLite file: `data/tms.db` (created automatically, not committed).

To start over, stop the app and delete the file:

```bash
rm -f data/tms.db data/tms.db-wal data/tms.db-shm
```

The next start reseeds sample data.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, and `better-sqlite3`.

## Out of scope for v1

No auth, ELD/GPS, accounting, or EDI. See [ROADMAP.md](./ROADMAP.md).
