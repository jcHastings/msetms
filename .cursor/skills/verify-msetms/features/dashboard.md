# Dispatch desk

The dispatch desk is the default dispatcher home. It shows open-work counts, loads that still need a unit, a short fleet snapshot, upcoming document expirations, and loads already in transit.

## Sub-features

- `desk-open` opens `/` from the brand mark and from the Dashboard nav link.
- `desk-kpis` shows Open loads, In transit, Available trucks, and Unassigned loads as links.
- `desk-unassigned` lists seeded available loads such as `MSE-1042` with an Open link.
- `desk-transit` lists in-transit loads such as `MSE-1045` (Denise Ortega).
- `desk-compliance` lists upcoming or expired CDL, medical, registration, and DOT windows.

## How to get to it (user POV)

- Open `http://127.0.0.1:3456/`.
- Choose `Dashboard` in the left nav.
- Choose the `TMS` brand mark in the sidebar.

## Driving it with control-msetms

Preconditions:

- `control-msetms doctor` reports `healthy: true` at `http://127.0.0.1:3456`.
- The disposable DB still has the default seed (do not point `TMS_DB_PATH` at an empty file with `TMS_SKIP_SEED=1`).

- **Open desk.** Run `control-msetms browser open --path /` then `control-msetms browser wait --text "Dispatch desk"`. The heading is `Dispatch desk`. Sidebar text includes `MSE Transport`.
- **Nav entry.** Run `control-msetms browser click --role link --name "Dispatch board"` then `control-msetms browser click --role link --name "Dashboard"`. The heading returns to `Dispatch desk`.
- **KPI cards.** The page text includes `Open loads`, `In transit`, `Available trucks`, and `Unassigned loads`. Each card is a link (`/board`, `/board?status=in_transit`, `/fleet`, `/board?status=available`).
- **Unassigned list.** Snapshot text includes `Needs a unit` and `MSE-1042`.
- **In transit list.** Snapshot text includes `In transit` and `MSE-1045`.
- **Proof.** Run `control-msetms browser snapshot --path dashboard/desk.txt` and `control-msetms browser screenshot --path dashboard/desk.png`. Both show `Dispatch desk`, `MSE Transport`, `MSE-1042`, and `MSE-1045`. Confirm the seed with `control-msetms sql --query "SELECT load_number, status FROM loads WHERE load_number IN ('MSE-1042','MSE-1045') ORDER BY load_number"`.

## Gotchas

- First compile after launch can serve a loading shell. Wait for `Dispatch desk`, not only HTTP 200.
- KPI numbers depend on seed plus any loads you created earlier in the run. Assert presence of the seeded load numbers, not a hardcoded count, unless you just launched a fresh DB.
- `npm test` seeding a temp DB does not prove this page.
