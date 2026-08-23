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

Existing work only:

- Dispatcher web desk and phone-width driver web app
- **Exception inbox** on dispatch home (N fine / M need attention, ranked CRITICAL–LOW)
- Loads: create, edit, board filters, assign / reassign truck + trailer + driver
- Rate-con ingest (PDF / local OCR) with review before save
- Load confirmation PDFs (owner-operator vs company-driver templates)
- Compliance: CDL, medical card, truck/trailer registration, DOT inspection; assign-time alerts
- Company driver vs owner-operator (rate, %, pay on the load; confirmation money only for OO)
- QuickBooks Online **stub** — demo invoice locally; live invoice only when env credentials work
- Samsara **stub** — demo GPS/HOS; live when `SAMSARA_API_TOKEN` is set
- ORBCOMM **stub** — demo / imported reefer; live when ORBCOMM env creds work
- IFTA **attach** — jurisdiction table + CSV on the load; demo from origin/destination without a token; Samsara IFTA APIs when the token works

Each integration is Connected vs Demo independently. Failed live APIs show an error. No invented “live” data. No secrets in git.

## Next

- Richer load statuses (at PU / picked up / at DEL, reason codes)
- Multi-stop loads
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
