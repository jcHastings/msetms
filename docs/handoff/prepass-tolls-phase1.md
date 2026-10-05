# PrePass Tolls Phase 1 (Office)

Scope shipped in this branch:

- New Office route: `GET /tolls`
- New API routes:
  - `GET /api/tolls/template`
  - `GET /api/tolls/export`
  - `POST /api/tolls/import`
  - `POST /api/tolls/pull`
- Truck mapping field: `trucks.prepass_transponder_id`
- New table: `toll_transactions` (+ dedupe key and indexes)
- New source text table: `toll_import_sources`
- Live PrePass REST pull (OAuth client credentials + Toll Transaction API)

## Workflow

`/tolls` mirrors Fuel:

1. import (CSV/XLSX) or Pull PrePass API
2. rematch (transponder -> truck -> driver)
3. assign unknown rows manually
4. review fleet + per-driver + per-transaction spend
5. switch weekly/monthly rollups using week picker + period toggle

Categories persisted and rolled up:

- `toll`
- `scale_bypass`

## Mapping behavior

- Matching priority is:
  1. `transponder_id` to `trucks.prepass_transponder_id`
  2. if a truck resolves, assigned driver follows `drivers.truck_id`
- Unknown or unmapped transponders remain unassigned until manual assign.
- A fully populated transponder map is **not** a readiness gate for this tip; `prepass_transponder_id` may be empty and toll import/UI still run.

## Env

`PREPASS_CLIENT_ID` and `PREPASS_CLIENT_SECRET` are documented in `.env.example`. `PREPASS_ACCOUNT_NUMBER` is required for REST pull and is read from env (same pattern as the OAuth pair). JC locked the office account as `370972` / M & S LOADS LLC PP. `PREPASS_API_KEY` is an optional legacy fallback and does not authorize the REST pull.

- Missing OAuth pair: API pull no-ops with a clear banner. CSV/XLSX still works.
- OAuth present but `PREPASS_ACCOUNT_NUMBER` missing: API pull no-ops with a clear banner.
- OAuth + account number: Pull PrePass API requests a client-credentials token and imports posted tolls for the last 14 days for account `370972`.
- Never log client secret or access token.

## Locked REST contract

Public catalog: `https://developer.prepass.com/developer/apis`

1. Token API (`get-api-token-v1`)
   - `POST https://api.prepass.com/auth/v1/token`
   - Required headers (portal): `client_id`, `client_secret`
   - Grant type is not documented. Header-only first; if that fails, retry once with `grant_type=client_credentials` form body. No other grant types.
   - Response: `token_type`, `expires_in`, `ext_expires_in`, `access_token`
2. Toll Transaction API (`prepass-public-tolls-transactions-api-v1`)
   - `GET https://api.prepass.com/tolltransaction/v1/transactions`
   - Query: `startPostDate`, `endPostDate` (required, `yyyy-mm-dd`, max 31 days, start not older than 2 years; dates begin midnight; one day uses next day as end)
   - Query: `accountNumbers=370972` (JC: M & S LOADS LLC PP). Do not send `costCenters` with it.
   - Query: `pageNumber` (default 1), `pageSize` (default/max 10000)
   - Header: `Authorization: Bearer <access_token>`
   - Mapped fields: `deviceNumber` (transponder; `ppDeviceId` fallback), `vehicleNumber` (unit), `Number(tollCharge)` (amount), `exitPlazaName` else `entryPlazaName`, `postDateTime` then entry/exit/invoice DateTime, invoice/reference if present, `classifyTollCategory`

Default pull window is the last 14 posted days (`startPostDate = today-13`, `endPostDate = tomorrow`).

CSV/XLSX import remains the fallback path.
