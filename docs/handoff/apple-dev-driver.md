# Apple Dev driver login (staging only)

Default **off**. `getDb()` will not insert `demo.driver@msexpress.local` on office/production.

## Create the fixture

One-shot (does not require the env flag):

```bash
npx tsx scripts/ensure-apple-dev-driver.ts
```

Or boot/migrate with allowlist:

```bash
APPLE_DEV_DRIVER_FIXTURE=1 npm run dev
```

Credentials:

- email: `demo.driver@msexpress.local`
- password: `Demo1234!`

`TMS_SKIP_SEED` does **not** create this row.

Native Trailer map: `GET /api/driver/v1/loads/{id}/trailer` (bearer). Web Trailer tile href is `/driver/loads/{id}/trailer` (not `/driver/trailer`). Web map has Map / Satellite.

## Office password set/reset

Fleet → Drivers add/edit: **Email Address** + **Driver login password** (same complexity as dispatcher: `dispatcher-password-shared.ts`). Leave password blank on edit to keep the hash.
