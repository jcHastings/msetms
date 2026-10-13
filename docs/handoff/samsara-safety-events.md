# Samsara safety events on the load timeline and truck card

Draft tip only. Base is live Orbcomm Mode `99b88c971430f2074a62fcb008dab19093ba37ee` (PR 92). Not stacked on Money Desk, Fuel, or Nightly Audit. No merge. No Office Update.

Draft PR: https://github.com/jcHastings/msetms/pull/98
Branch: `cursor/samsara-safety-events-6a86`

## What

Dispatchers see Samsara harsh / safety events for the assigned vehicle:

- Load timeline, for the load window (pickup through delivery; an open load runs through now)
- Truck unit card, last 7 days

Each row cites the Samsara event id and the event time. Labels such as Speeding, Braking, Acceleration, Harsh turn, distraction, and mobile are shown in shop-floor words. A label we have not mapped yet is spaced and shown. Rows without an id, a time, or this vehicle are dropped. Nothing is invented.

## API

`GET https://api.samsara.com/fleet/safety-events/stream`

- `startTime` / `endTime` for the window
- `queryByTimeField=createdAtTime` (the stream defaults to `updatedAtTime`)
- `assetIds` = `trucks.samsara_vehicle_id`
- `includeVgOnlyEvents=true` so gateway harsh brake / accel / turn are included

Same `SAMSARA_API_TOKEN` as GPS, HOS, and stills. This tip does not retrieve camera media.

## Soft-fail

Missing token, HTTP 401/403, a truck with no Samsara vehicle id, a load with no truck, or a bad window returns a short note and an empty list. It does not 500 and it does not block Save or Confirm.

Token scope: **Read Safety Events & Scores**.
