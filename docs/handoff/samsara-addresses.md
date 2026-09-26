# TMS Locations → Samsara Addresses

TMS Locations stay the record. Samsara Addresses are a copy for stable docks (Costco DCs, Westside, NCS, and the rest of the book). Orbcomm still owns trailer and reefer. This tip does not call Orbcomm.

## What

- `POST /addresses` when Samsara has no `externalIds.msetms` for the location id
- `GET /addresses/msetms:{locationId}` then `PATCH /addresses/{id}` when that external id is already there
- `locations.samsara_address_id` stores the Samsara address id for routing
- Office: sync on location save, plus **Sync to Samsara** on the location page
- A miss does not roll back the location. No pin and no street means nothing is sent. Coordinates are copied from the location row only.

Circle size sent with an existing pin: 250 meters. That is not a measured dock outline.

## Auth

Env var: `SAMSARA_API_TOKEN` (same token as GPS / HOS). Never hardcoded.

Token scopes (Samsara → Addresses). These may not be on the token yet:

- **Read Addresses**
- **Write Addresses**

Missing token, HTTP 401, or HTTP 403 is a setup note on the location. Save still lands.

## Out of scope

Routing still has to prefer `addressId` when `samsara_address_id` is set. CSV import does not push. Geofence fill of a blank pin does not push until the next save or Sync. No Office Update. No merge.
