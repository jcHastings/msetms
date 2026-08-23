# Roadmap

v1 is a local dispatcher desk plus a mobile-width driver web app, file attachments, rate-con ingest, and a Samsara hook that stays demo unless a token is present.

## Next product slices

- **Dispatcher login and roles** — dispatcher vs manager, audit of who changed a load or reassigned a driver.
- **Native driver apps** — iOS/Android wrappers or store apps, push notifications, offline photo queue, camera-first POD.
- **Live Samsara** — map the tokened vehicle-stats call onto tractors automatically, HOS, GPS breadcrumb, geofenced arrive/depart, reefer alarms on the board. v1 only fetches stats when `SAMSARA_API_TOKEN` is set and otherwise shows labeled demo readings.
- **Better rate-con capture** — trained templates per customer, split-page PDFs, and a human confirmation queue when confidence is low. v1 is labeled-text extract plus optional local OCR.
- **Settlements** — driver pay, accessorials, detention, weekly worksheet.
- **Customer portal** — shipment status without the dispatch board.

## Integrations still later

- **Other ELD / telematics** — Motive, Geotab.
- **Accounting** — invoice from a delivered load, QuickBooks or similar. No AR/AP in v1.
- **EDI / load boards** — 204 in, 214 out, DAT/Truckstop. v1 loads are keyed or imported from a rate con.
- **Fuel and IFTA** — fuel card import, miles by state.

## Later operations

- Multi-stop loads and split / relay.
- Trailer inventory separate from power units.
- Appointment scheduling and detention timers.
- Lane history and a simple pricing helper.
- Email/SMS of the rate con and dispatch.

Build the next slice when dispatchers and drivers are using this local pair every day.
