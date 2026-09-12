# Driver API v1

BFF for the native iOS Driver app. **Not office deploy.** Do not treat this as live until an office Update says so.

Base path: `/api/driver/v1`

Auth after PIN login: `Authorization: Bearer <token>`

Rules:

- No customer rate, invoices, or owner-operator pay on any DTO
- No office cookies (`tms_driver_id` is not set)
- Writes are idempotent via `client_request_id`. Uniqueness is `(driver_id, method, path, client_request_id)` claimed in a `BEGIN IMMEDIATE` transaction (no check-then-act). Same UUID on another endpoint does not replay.
- Successful PIN login revokes that driver's other bearer tokens (single session).
- All datetime strings are ISO-8601 with a timezone (`2026-09-11T15:00:00.000Z` or `…-05:00`). Empty means unset.
- No refresh-token endpoint in v1. `401` is enough for the client to clear Keychain and return to PIN login.
- Phone **web** `/driver` upload stays on `DRIVER_UPLOAD_KINDS`. This native API accepts the wider `AttachmentKind` enum (UI subsets); `rate_con` / `invoice` still rejected.

## Enums

| Name | Values |
| --- | --- |
| `DriverProgress` | `en_route_pickup` \| `loaded` \| `en_route_delivery` \| `delivered` |
| `StopCheckKind` | `arrive` \| `depart` |
| `AttachmentKind` | Full TMS enum: `rate_con`, `invoice`, `carrier_invoice`, `bol`, `pod`, `lumper`, `photo_trailer`, `photo_product`, `photo_seals`, `ifta`, `temp_log`, `scale_ticket`, `fuel_receipt`, `claim`, `unclassified`, `other`. iOS UI subsets what the driver can pick. `rate_con` / `invoice` never upload or return (customer rate). |
| `ScheduleType` | `APPT` \| `FCFS` (mapped from existing `appointment` / `fcfs` helpers) |

## Errors

Uniform body: `{ "ok": false, "error": "...", "code?": "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" }`

| Status | When |
| --- | --- |
| 401 | Missing/invalid bearer, or PIN login failed |
| 403 | Load exists but is not assigned (primary or relay) |
| 404 | Unknown load or stop |
| 409 | Stop-check order, progress not the next step, validation |
| 429 | Too many failed PIN attempts (5 / 15 minutes / driver or IP), or roster hammering (60 / 15 minutes / IP) |

## Endpoints

### `GET /auth/roster`

Unauthenticated name picker. Returns `[{ id, display_name }]` only (no PIN). Same class as the dispatcher login name list. Capped at 60 GETs / 15 minutes / IP so a PIN picker (one fetch on open) is unaffected. Login PIN attempts stay at 5 / 15 minutes.

### `POST /auth/login`

Body: `{ "driver_id": 12, "pin": "4321" }`

Success: `{ "token", "expires_at", "driver": { "id", "display_name", "first_name", "phone" } }`

A new login revokes every other token for that driver. The previous device gets `401` and should clear Keychain.

### `POST /auth/logout`

Revokes the current bearer token. `204` empty body.

There is no `/auth/refresh` in v1. When the token expires or is revoked, the API returns `401` and the client should clear Keychain.

### `GET /me`

Returns the driver object from login.

### `GET /loads?scope=active|recent`

`LoadSummary[]`. `active` is assigned and not closed. `recent` is delivered/completed.

Each summary includes `next_actions.allowed_progress` (next linear `DriverProgress` only) and `next_actions.can_check_stops` (assigned and not cancelled/delivered/completed/accounting).

Omitted forever: billed `rate`, `oo_pay` / `oo_percent`, customer invoice numbers, rate-con Load # (`reference_number` / `customer_reference`). TMS `load_number` (MSE-…) is included.

### `GET /loads/{id}`

`LoadDetail` = summary + `stops` + driver-facing `attachments`. `403` if not assigned (relays included via `driverAssignedToLoad`). Customer rate-con / invoice files are omitted.

### `POST /loads/{id}/progress`

Body: `{ "progress": "loaded", "client_request_id": "uuid" }`

Success: `{ "load": LoadSummary }`. Duplicate `client_request_id` returns the same success. Progress must be the next linear step (or the current value again).

### `POST /loads/{id}/stops/{stopId}/check`

Body: `{ "kind": "arrive" | "depart", "client_request_id": "uuid" }`

Same rules as `driverStopCheckAction`: pickup depart before delivery arrive; check-in before check-out. Violations are `409`.

### `POST /loads/{id}/attachments`

`multipart/form-data`: `kind`, `file`, `client_request_id`. Native API `kind` is the full `AttachmentKind` enum (iOS UI subsets). `rate_con` / `invoice` are rejected. Phone **web** `/driver` still gates on `isDriverUploadKind` and cannot pick `ifta` / `claim` / `other` / `unclassified`. Reuses `addAttachment` with driver upload. `pod` may trigger `maybeAutoInvoiceLoad` like the web driver app.

## Example curls

Roster and PIN login (no cookie):

```bash
curl -sS http://localhost:3000/api/driver/v1/auth/roster

curl -sS -X POST http://localhost:3000/api/driver/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"driver_id":1,"pin":"YOUR_PIN"}'
```

Authenticated reads and an idempotent progress write:

```bash
TOKEN='drv_…'

curl -sS http://localhost:3000/api/driver/v1/me \
  -H "Authorization: Bearer $TOKEN"

curl -sS 'http://localhost:3000/api/driver/v1/loads?scope=active' \
  -H "Authorization: Bearer $TOKEN"

curl -sS -X POST http://localhost:3000/api/driver/v1/loads/42/progress \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"progress":"en_route_pickup","client_request_id":"progress-1"}'
```

Stop check and POD upload:

```bash
curl -sS -X POST http://localhost:3000/api/driver/v1/loads/42/stops/7/check \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"arrive","client_request_id":"stop-arrive-1"}'

curl -sS -X POST http://localhost:3000/api/driver/v1/loads/42/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F kind=pod \
  -F client_request_id=pod-1 \
  -F file=@scripts/fixtures/driver-api/pod.png
```

Logout:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/driver/v1/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

## Local exercise

1. `npm install` and run `npm run dev` against a local SQLite DB (default `data/tms.db`).
2. Set a PIN on a driver in Fleet → Drivers (web).
3. Use the curls above. `GET /auth/roster` lists eligible names only.
4. `npm test` runs `scripts/smoke.ts` then `scripts/driver-api-v1-test.ts` (route-level, temp DB).
