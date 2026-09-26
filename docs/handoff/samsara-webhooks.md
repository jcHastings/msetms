# Samsara webhooks into Exception Inbox

Base `99b88c971430f2074a62fcb008dab19093ba37ee` (live Orbcomm, PR 92). Not stacked on Money Desk #90 or Fuel #95/#96. Draft tip only. No Office Update. No merge.

## What

Tractor Event Subscriptions hit `POST /api/integrations/samsara/webhook` and show on Exception Inbox when the route external id or Samsara vehicle id matches a load.

- `RouteStopArrival`
- `RouteStopDeparture`
- `RouteStopEtaUpdated` (`RouteStopETAUpdated` on the way in is the same event)
- `GeofenceEntry`
- `GeofenceExit`
- `DvirSubmitted`

A blank stop time is filled from the event. If tractor GPS already stamped that stop, the webhook is a confirmation only. Detention keeps the one clock it already has. ETA past the window and tractor DVIR defects are inbox flags with the Samsara event id and time. Safety lists tractor DVIR defects. Trailer and reefer events are ignored so they do not double-fire against Orbcomm.

Bad signature, missing secret, missing token, missing Webhooks scope, and an unmapped tractor soft-fail. Nothing is invented.

## Scopes

- Webhooks Read
- Webhooks Write
- Read Routes (existing)
- Read Defects (existing)

DVIR lines come from the webhook body. No extra Defects call.

## Env

Gitignored. Never logged.

- `SAMSARA_API_TOKEN` (same token as GPS)
- `SAMSARA_WEBHOOK_SECRET` (base64 secret from Samsara Settings, Webhooks)
- `SAMSARA_WEBHOOK_PUBLIC_URL` example: `https://<office-host>/api/integrations/samsara/webhook`

Leave the public URL unset until the office host is ready. This tip does not change the office tunnel.

## Out of scope

Office Update, merge, trailer Orbcomm events, a second detention clock.
