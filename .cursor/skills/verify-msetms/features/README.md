# MSE TMS verification map

This directory is the maintained source for verifying user-facing MSE TMS behavior. Read the index, then open the matching feature file.

## Baseline preconditions

- `npm install` has been run in the repo root.
- Launch with `control-msetms launch` so the app is at `http://127.0.0.1:3456` with SQLite at `/tmp/msetms-verify/<run-id>/tms.db`.
- `control-msetms doctor` reports `healthy: true`, that URL, and `seed-loads` >= 1.
- Seeded loads include `MSE-1042` (available, Heartland Foods) and `MSE-1045` (in transit, Denise Ortega).
- Never drive an instance this run did not start. A user's `localhost:3000` session is off limits.

## Driving conventions

- Start every recipe from the baseline unless the file says otherwise.
- Prefer role + name and visible labels over CSS or coordinates.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Restore mutated seed rows after a write (or cleanup the disposable DB by stopping the instance). Do not remove proof artifacts.

## Proof and skip reporting

- Capture the action and the resulting state, not only the last screen.
- UI proof includes a text snapshot and a screenshot with `MSE Transport` or driver chrome visible.
- Mutation proof includes a second read (`sql` or reopen the page).
- Record the feature id and entry point on every artifact directory.
- An unreachable path is reported with the command you ran and the unmet precondition. Do not mark it verified via a different path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph. It then uses exactly four H2 sections in this order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with control-msetms`
4. `Gotchas`

Keep implementation details out. Name user paths, stable handles, required state, commands, and observable proof.

## Features

Sweep top to bottom for a broad regression. For a single change, open only the files it can affect.

- [Dispatch desk](./dashboard.md) covers KPIs, unassigned loads, and in-transit rows on `/`.
- [Dispatch board](./dispatch-board.md) covers filters, assign / change unit, and status on `/board`.
- [Create a load](./create-load.md) covers booking from `/loads/new`.
- [Driver app](./driver-app.md) covers PIN login, assigned loads, and status updates.
- [Rate con import](./rate-con-import.md) covers `/loads/import` with the sample PDF.
