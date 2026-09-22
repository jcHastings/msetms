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

## Workflow

`/tolls` mirrors Fuel:

1. import (CSV/XLSX)
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

`PREPASS_API_KEY` is documented in `.env.example`.

- Missing key: API pull no-ops with a clear message.
- Manual import still works without key.
- CoS can inject `PREPASS_API_KEY` later; do not request the key in chat.

## API docs blocker

PrePass public API response shape/endpoint contract is not finalized in-repo, so Phase 1 keeps API pull as a thin no-op stub behind `PREPASS_API_KEY`. CSV/XLSX import is the production path in this phase.
