# Roadmap

v1 is a local dispatch desk: customers, fleet, loads, assignment, and status. These items are intentionally not built yet.

## Next product slices

- **Users and roles** — dispatcher, driver-facing read-only, manager. Login, audit of who changed a load.
- **Documents** — rate con, BOL, POD upload, and a simple customer email/PDF send.
- **Settlements** — driver pay, accessorials, detention, and a weekly settlement worksheet.
- **Customer portal** — shipment status without giving customers the dispatch board.

## Integrations (not in v1)

- **ELD / telematics** — tractor location, HOS, breadcrumb on the board, geofenced arrive/depart. Candidates: Samsara, Motive, Geotab.
- **Accounting** — invoice from a delivered load, bill-to mapping, QuickBooks or similar export. No AR/AP in v1.
- **EDI / load boards** — 204 tender in, 214 status out, DAT/Truckstop post and book. v1 loads are keyed by hand.
- **Fuel and IFTA** — fuel card import, miles by state. Needs ELD or manual trip data first.

## Later operations

- Multi-stop loads and split / relay.
- Trailer inventory separate from power units.
- Appointment scheduling and detention timers.
- Lane history and a simple pricing helper.
- Mobile check-call for drivers.

Build the next slice only when dispatchers are using the local board every day.
