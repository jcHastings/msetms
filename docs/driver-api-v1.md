# Driver API v1

BFF for the native iOS Driver app. **Not office deploy.** Do not treat this as live until an office Update says so.

Base path: `/api/driver/v1`

Auth after email+password login: `Authorization: Bearer <token>`

## Auth model

Drivers sign in with **email + password** stored on the `drivers` row (`email`, `password_hash`). Hash/verify and complexity reuse office helpers (`hashDispatcherPassword`, `passwordHashMatches`, `dispatcher-password-shared.ts`: min 8, upper, lower, digit, symbol from `$&@!?#%^*+`). Dispatch sets or resets the password on Fleet → Drivers.

This is a **breaking** change vs the 2026-09-11 frozen OpenAPI (PIN + `driver_id` + public roster). `GET /auth/roster` is disabled (404). `POST /auth/login` bodies with `driver_id`+`pin` or `name_or_email`+`pin` are rejected (`409`).

**2FA lock for v1:** office email OTP / TOTP does **not** apply to `/api/driver/v1` or `/driver/login`. Email+password only. Office dispatcher login keeps its own 2FA.

PIN may still exist on the driver record for other TMS uses. It is **not** used for web or API login.

Rules:

- No customer rate, invoices, or owner-operator pay on any DTO
- No office cookies (`tms_driver_id` is not set)
- Writes are idempotent via `client_request_id`. Uniqueness is `(driver_id, method, path, client_request_id)` claimed in a `BEGIN IMMEDIATE` transaction (no check-then-act). Same UUID on another endpoint does not replay. A pending claim (`status=0`) older than **45 seconds** is reclaimed so a crash mid-write cannot 409 forever.
- Successful login revokes that driver's other bearer tokens (single session).
- All datetime strings are ISO-8601 with a timezone (`2026-09-11T15:00:00.000Z` or `…-05:00`). Empty means unset.
- No refresh-token endpoint in v1. `401` is enough for the client to clear Keychain and return to email+password login.
- Phone **web** `/driver` upload stays on `DRIVER_UPLOAD_KINDS`. Native API upload allowlist is wider (see AttachmentKind).

## Enums

| Name | Values |
| --- | --- |
| `DriverProgress` | `en_route_pickup` \| `loaded` \| `en_route_delivery` \| `delivered` |
| `StopCheckKind` | `arrive` \| `depart` |
| `AttachmentKind` | See [AttachmentKind](#attachmentkind) below. |
| `ScheduleType` | `APPT` \| `FCFS` (mapped from existing `appointment` / `fcfs` helpers) |

## AttachmentKind

In-repo OpenAPI / allowlist for this BFF (additive vs the 2026-09-11 frozen handoff). **Not a DTO break** — `kind` is still a string enum on attachments.

| List | Values |
| --- | --- |
| Frozen handoff `2026-09-11-mse-driver-api-v1-frozen.md` (driver upload) | `fuel_receipt`, `carrier_invoice`, `scale_ticket`, `bol`, `pod`, `lumper`, `photo_trailer`, `photo_product`, `photo_seals`, `temp_log` |
| Apple Dev UI may still subset | `bol`, `pod`, `lumper`, `fuel_receipt`, `photo_trailer`, `photo_product`, `photo_seals`, `temp_log`, `scale_ticket` |
| Phone **web** `/driver` (`isDriverUploadKind`) | Same as the frozen handoff list |
| **API upload allowlist** (`DRIVER_API_UPLOAD_KINDS`) | Frozen list **plus** `ifta`, `claim`, `unclassified`, `other`, `carrier_invoice` (already frozen). **Never** `rate_con` or `invoice` (customer rate). |
| Response `kind` type (`DRIVER_API_ATTACHMENT_KINDS`) | Full TMS enum, including `rate_con` / `invoice` on the type — those files are stripped from GET and rejected on POST |

Changed vs the frozen handoff: the native API accepts `ifta`, `claim`, `unclassified`, and `other` in addition to the frozen driver-upload set. iOS should keep subsetting the picker; do not treat the 2026-09-11 frozen list as the server allowlist.

## Errors

Uniform body: `{ "ok": false, "error": "...", "code?": "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" }`

| Status | When |
| --- | --- |
| 401 | Missing/invalid bearer, or email+password login failed (same message for unknown email vs bad password) |
| 403 | Load exists but is not assigned (primary or relay) |
| 404 | Unknown load or stop, or `GET /auth/roster` |
| 409 | Stop-check order, progress not the next step, validation, or rejected PIN/`driver_id` login body |
| 429 | Too many failed login attempts (5 / 15 minutes / driver or IP) |

## Endpoints

### `GET /auth/roster`

Disabled. Unauthenticated clients get **404**. The fleet is not listed.

### Idempotency pending TTL

Writes insert a `status=0` claim, then store the JSON body. If the process dies mid-claim, that row is an orphan. After **45 seconds** (`DRIVER_API_IDEMPOTENCY_PENDING_TTL_MS`) the next request with the same key deletes the stale pending row and runs again. In-flight duplicates still wait ~600ms, then `409` if the first write is still running.

### `POST /auth/login`

Body: `{ "email": "driver@example.com", "password": "…" }`

Success: `{ "token", "expires_at", "driver": { "id", "display_name", "first_name", "phone" } }`

Unknown email and bad password both return `401` `{ "ok": false, "error": "Driver or password is not recognized.", "code": "UNAUTHORIZED" }`.

`driver_id`+`pin` and `name_or_email`+`pin` are rejected with `409`.

A new login revokes every other token for that driver. The previous device gets `401` and should clear Keychain.

Login rate-limit IP:

- Always use `CF-Connecting-IP` when present (Cloudflare Tunnel staging; no extra env).
- Use the first `X-Forwarded-For` / `X-Real-IP` **only** when `TRUSTED_PROXY=1` (or `true` / `cloudflare`). Those headers are spoofable without a trusted edge.
- If no usable IP (direct `node` / no proxy headers), the IP half of the limit is skipped; per-driver failures still count.

### `POST /auth/logout`

Revokes the current bearer token. `204` empty body.

There is no `/auth/refresh` in v1. When the token expires or is revoked, the API returns `401` and the client should clear Keychain.

### `GET /me`

Returns the driver object from login.

### `POST /assist`

Driver-only helper for load and equipment questions. Not Office deploy.

Auth accepts either:

- `Authorization: Bearer drv_...`
- Signed-in `/driver` web cookie session

Body: `{ "question": "..." }`

Response: `{ "answer": string, "unknown": boolean, "documents": AssistDocument[] }`

Rules:

- Answers are grounded only in the signed-in driver's assigned load and assigned truck/trailer docs (plus optional driver-owned docs).
- If no active load is assigned, response is `"Nothing is assigned to you right now."` with `unknown: true`.
- Missing source fields return `"Not in TMS."`
- Unrecognized questions are refused (`unknown: true`) and do not call Mike/OpenAI.

### `GET /assist/docs/{fleetDocumentId}`

Driver-only document bytes endpoint for Assist sources.

- Returns file bytes only when the `fleet_documents` row belongs to the requesting driver's assigned truck/trailer.
- Optional allowlist: the driver's own `owner_type=driver` files.
- Never use Office `/api/fleet-docs/[id]` for driver access.

### `GET /loads?scope=active|recent`

`LoadSummary[]`. `active` is assigned and not closed. `recent` is delivered/completed. `scope=delivered` is accepted as an alias of `recent`.

Each summary includes `next_actions.allowed_progress` (next linear `DriverProgress` only) and `next_actions.can_check_stops` (assigned and not cancelled/delivered/completed/accounting).

Omitted forever: billed `rate`, `oo_pay` / `oo_percent`, customer invoice numbers, rate-con Load # (`reference_number` / `customer_reference`). TMS `load_number` (MSE-…) is included.

### `GET /loads/{id}`

`LoadDetail` = summary + `stops` + driver-facing `attachments`. `403` if not assigned (relays included via `driverAssignedToLoad`). Customer rate-con / invoice files are omitted.

### `GET /loads/{id}/trailer`

Assigned trailer location for the native Trailer map. Bearer + driver-scoped (`requireAssignedLoad`).

- No assigned trailer on the load → `404`
- Trailer present but no plottable coords → `200` with `latitude` / `longitude` / `point` null
- Live Orbcomm (`source === "orbcomm"`) first; else persisted last-known (`source: "stored"`). Never invents coordinates.

```json
{
  "trailer_id": 1,
  "unit_number": "MS2201",
  "latitude": 41.12,
  "longitude": -96.0,
  "address": "…",
  "recorded_at": "2026-08-20T14:00:00.000Z",
  "source": "orbcomm",
  "heading_deg": null,
  "speed_mph": null,
  "point": { "lat": 41.12, "lng": -96.0 }
}
```

Web `/driver/loads/{id}/trailer` uses the same resolution and enables Google **Map / Satellite** (`MapTypeControl`) so the driver can switch to satellite and zoom to the pin.

### `POST /loads/{id}/progress`

Body: `{ "progress": "loaded", "client_request_id": "uuid" }`

Success: `{ "load": LoadSummary }`. Duplicate `client_request_id` returns the same success. Progress must be the next linear step (or the current value again).

### `POST /loads/{id}/stops/{stopId}/check`

Body: `{ "kind": "arrive" | "depart", "client_request_id": "uuid" }`

Same rules as `driverStopCheckAction`: pickup depart before delivery arrive; check-in before check-out. Violations are `409`.

### `POST /loads/{id}/attachments`

`multipart/form-data`: `kind`, `file`, `client_request_id`. See [AttachmentKind](#attachmentkind). Reuses `addAttachment` with driver upload. `pod` may trigger `maybeAutoInvoiceLoad` like the web driver app.

### `GET /fuel/transactions`

This driver's fuel card rows. Each row includes `receipt_id` when a photo is matched.

### `GET /fuel/transactions/{id}`

One card row. `403` if it is not this driver's.

### `POST /fuel/transactions/{id}/receipt`

`multipart/form-data`: `file`, `client_request_id`, optional `amount`, `gallons`, `merchant`, `card_last4`, `occurred_at`. Attaches the photo and marks the receipt `matched`.

### `POST /fuel/receipts`

Orphan early upload. `multipart/form-data`: `file`, `client_request_id`, optional amount / gallons / merchant / card last4 / occurred_at. Status starts as `pending_match`. Existing card rows may auto-match.

### `GET /fuel/receipts?status=pending_match|matched`

This driver's receipt photos. Omit `status` to return both.

### `POST /fuel/receipts/{id}/match`

Body: `{ "fuel_transaction_id": 12, "client_request_id": "uuid" }`. Manual override. Office fuel spreadsheet import also auto-matches pending photos (date / amount / gallons / merchant / card last4). Auto-apply when score ≥ 70 **and** amount or last4 matches. If the top two scores are within 8 points, the photo stays `pending_match`.

## Client home / Dispatch (JC IA lock)

Driver **home** (web `/driver` and native) is **tile buttons only**. Layout lock:

1. **Dispatch** — one larger full-width button on top
2. Two rows of two: **Upload | Confirmation**, then **Fuel | Trailer**

Trailer tile opens the load Trailer map at `/driver/loads/{id}/trailer` (web) or `GET /loads/{id}/trailer` (native). Web map has Map / Satellite. `/driver/trailer` redirects to that assigned-load page when a trailer is assigned.

**Active | Delivered** filters and boards live **only inside Dispatch** (web `/driver/dispatch`). They are not home tiles and must not appear on the main home screen.

`GET /loads?scope=active|recent` (`scope=delivered` aliases `recent`) is the API those Dispatch boards call. Fuel is a separate home tile (`/driver/fuel` on web).

## Example curls

Email+password login (no cookie):

```bash
curl -sS -X POST http://localhost:3000/api/driver/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"driver@example.com","password":"YOUR_PASSWORD"}'
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

## Apple Dev / staging fixture

**Opt-in only.** `getDb()` creates this row when `APPLE_DEV_DRIVER_FIXTURE=1` (or `true` / `yes`). Default is off. Office and production must not set that flag. `TMS_SKIP_SEED` does **not** create this login — it is an allowlist, not an opt-out.

One-shot (staging / Apple Dev, no env flag required):

```bash
npx tsx scripts/ensure-apple-dev-driver.ts
```

See [docs/handoff/apple-dev-driver.md](handoff/apple-dev-driver.md).

Dispatch sets any driver's email + password on Fleet → Drivers (same complexity as `dispatcher-password-shared.ts`).

When the fixture exists:

- email: `demo.driver@msexpress.local`
- password: `Demo1234!`

## Local exercise

1. `npm install` and run `npm run dev` against a local SQLite DB (default `data/tms.db`).
2. Sign in with a Fleet → Drivers email/password, or run the one-shot script above / set `APPLE_DEV_DRIVER_FIXTURE=1`.
3. Use the curls above. `GET /auth/roster` returns 404.
4. `npm test` runs `scripts/smoke.ts` then `scripts/driver-api-v1-test.ts` (route-level, temp DB).
