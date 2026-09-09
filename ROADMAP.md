# Roadmap

Product source of truth: [PRODUCT_CATALOG.md](./PRODUCT_CATALOG.md) (300 core capabilities + extension modules).

**Design:** exception-ranked command center, not babysitting a map.  
**Architecture:** TMS sits **above** Samsara / Motive, ORBCOMM / Carrier Lynx, Thermo King, fuel cards, and QuickBooks. Normalize those feeds. Do not replace them.

Confirmed split:

- **Samsara** — truck GPS + HOS (+ IFTA miles)
- **ORBCOMM** — trailer tracking + reefer monitoring
- **Later** — Carrier Lynx / Thermo King as extra reefer telematics if needed; Motive optional

Do not implement the full catalog in this PR. Ship the current v1 slice only.

## Now (this PR / v1)

Working screens in [SHIPPED.md](./SHIPPED.md). Catalog marks in [PRODUCT_CATALOG.md](./PRODUCT_CATALOG.md).

- Dispatcher PIN login + phone-width driver web app
- **Exception inbox** on dispatch home (ack / snooze / resolve, filters, handoff, watch, recap)
- Loads: create, edit, richer statuses, multi-stop, clone, templates, board filters, assign / reassign
- **Locations** and **Search** in the dispatcher nav
- **Accounting** nav: AR, AP, driver pay, commissions, QuickBooks stub
- **Settings hub**: company, insurance, lists, units, tax, alerts, routing, pay/margin, documents, load numbers, users, integrations
- Rate-con ingest, load confirmation PDFs, compliance page, claims, reports CSV
- QBO / Samsara / ORBCOMM / IFTA stubs (live only when env credentials work)

Each integration is Connected vs Demo independently. Failed live APIs show an error. No invented “live” data. No secrets in git.

## Next

- **IFTA live** as the default path when the token and scopes are present (trip-window detail, not only demo)
- **QBO live** as the default path when refresh token + realm are present (customer invoice only; still not OO bills)

## Later

- Native iOS / Android driver apps (push, offline photo queue, camera-first POD)
- Customer portal (status and documents; not the dispatch board)
- Fuel cards (gallons by jurisdiction paired with IFTA miles)
- EDI (204 in, 214 out) and load boards
- Digital dispatcher AI (suggest cover; human confirms)
- Carrier Lynx / Thermo King reefer feeds; Motive if needed
- Deeper accounting (payments, accessorial invoices, settlements)

Build the next slice when dispatchers and drivers are using this local pair every day.
