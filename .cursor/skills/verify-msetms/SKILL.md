---
name: verify-msetms
description: "Drive the MSE TMS dispatcher and driver web UIs the way a user does. Use when proving a UI change, running verify-msetms, or checking the dispatch desk, board, load booking, driver PIN login, or rate-con import."
---

# Verify MSE TMS

MSE TMS is a local Next.js Transportation Management System. Dispatchers use a desktop web desk. Drivers use a phone-width web app at `/driver/login`. There is no dispatcher login. Data lives in SQLite.

This skill is for later agents. Launch the real app, drive one mapped user path, and keep the proof.

Control CLI (always JSON except `--help`):

```bash
.cursor/skills/verify-msetms/bin/control-msetms --help
```

Feature map: [features/README.md](features/README.md). Open the file for the change under test. Drive every entry point that file lists.

## Interview (this repo)

- **Surface.** Primary is the dispatcher web UI (`/`, `/board`, `/loads/new`, `/fleet`, `/customers`, `/settings`). Secondary is the driver web UI (`/driver/login`). Integrations are optional and fall back to labeled demo data when env secrets are absent.
- **Run.** `npm install` then `npm run dev`. First request creates `data/tms.db` and seeds Midwest/South fleet rows unless `TMS_DB_PATH` points elsewhere. Node 20+. No `.env` is required for demo GPS/HOS/reefer/QBO.
- **Drive.** No Playwright or Cypress in the repo. `scripts/smoke.ts` hits library functions, not the browser. Drive the UI through `control-msetms browser` (Chrome CDP). Prefer label and role names from the feature files.
- **Observe.** Screenshots and text snapshots under `.cursor/skills/verify-msetms/artifacts/`. HTTP bodies. Read-only `control-msetms sql`. Seeded load numbers such as `MSE-1042` (available) and `MSE-1045` (Denise Ortega, in transit, PIN 1125).
- **Isolate.** `launch` binds `127.0.0.1:3456` and writes SQLite to `/tmp/msetms-verify/<run-id>/tms.db`. Do not drive a user's `localhost:3000` session. File uploads still land under the repo `data/uploads/` (cwd-relative, not `TMS_DB_PATH`). cleanup does not delete that tree or any artifact.

## Launch

From the repo root, after `npm install`:

```bash
.cursor/skills/verify-msetms/bin/control-msetms launch
.cursor/skills/verify-msetms/bin/control-msetms launch --port 3456 --run-id default
```

Ready means `GET http://127.0.0.1:<port>/` returns 200 and the HTML contains `MSE Transport`. The Next log is `/tmp/msetms-verify/<run-id>/next.log`. First compile can take up to 90 seconds.

If launch reports the run-id is already up, run `doctor`. Do not start a second process on the same id. A different id plus `--port` can run beside it.

Teardown is `cleanup` (below). After a failed launch, run cleanup before retrying.

## Doctor

Run this first whenever anything looks off.

```bash
.cursor/skills/verify-msetms/bin/control-msetms doctor
```

It must report `healthy: true` with:

- `next-pid` alive and equal to the pid launch stored
- `port` answering on the recorded port
- `home` HTTP 200 whose body includes `MSE Transport` and `Dispatch desk`
- `db-file` at the recorded `TMS_DB_PATH`
- `seed-loads` count >= 1

Refuse to drive when doctor fails. cleanup, then launch, then doctor again.

## Drive

Chrome starts on the first `browser` command. It uses a private user-data dir under the same `/tmp/msetms-verify/<run-id>/` tree.

```bash
.cursor/skills/verify-msetms/bin/control-msetms browser open --path /
.cursor/skills/verify-msetms/bin/control-msetms browser wait --text "Dispatch desk"
.cursor/skills/verify-msetms/bin/control-msetms browser click --role link --name "Dispatch board"
.cursor/skills/verify-msetms/bin/control-msetms browser fill --label "Origin" --value "Jackson, MS"
.cursor/skills/verify-msetms/bin/control-msetms browser select --label "Customer" --option "Heartland Foods Co."
.cursor/skills/verify-msetms/bin/control-msetms browser file --label "Rate con file" --file public/samples/sample-rate-con.pdf
.cursor/skills/verify-msetms/bin/control-msetms browser screenshot --path proof/desk.png
.cursor/skills/verify-msetms/bin/control-msetms browser snapshot --path proof/desk.txt
.cursor/skills/verify-msetms/bin/control-msetms sql --query "SELECT load_number, status FROM loads WHERE load_number = 'MSE-1042'"
```

Relative `--path` values for screenshot and snapshot resolve under `.cursor/skills/verify-msetms/artifacts/`.

Stable handles (from source, not guesses):

| Control | Handle |
| --- | --- |
| Brand / home | link `TMS` or text `MSE Transport` |
| Nav | links `Dashboard`, `Dispatch board`, `New load`, `Fleet`, `Customers`, `Settings`, `Driver app` |
| Desk heading | `Dispatch desk` |
| Board heading | `Dispatch board` |
| Board search | label `Search`, button `Filter`, button `Clear` |
| Board status | label `Status` (`Active`, `Available`, `In Transit`, …) |
| Assign | button `Assign` / `Change unit`, dialog heading `Assign MSE-…`, labels `Driver` `Truck` `Trailer`, buttons `Assign unit` `Cancel` |
| New load | heading `New load`, labels `Customer` `Origin` `Destination` `Pickup window start` …, button `Create load` |
| Rate con | heading `Load from rate confirmation`, label `Rate con file`, button `Extract fields` |
| Driver login | heading `Driver dispatch`, labels `Your name` `PIN`, button `Open my dispatch` |
| Driver status | buttons `En route to pickup`, `Loaded`, `En route to delivery`, `Delivered` |

Demo driver PINs (seeded only when the DB is empty): Denise Ortega `1125`, Marcus Hale `1024`, James Whitaker `1186`, Cole Brennan `2051`.

Do not call `lib/queries` or server actions as a substitute for the UI path. `npm test` is a library smoke test. It does not prove the screens.

## Evidence

Write proof under `.cursor/skills/verify-msetms/artifacts/<feature-id>/`. Keep it after cleanup.

A proof is complete only when it has:

1. The user action (command JSON plus a before snapshot or screenshot when the step mutates).
2. The resulting screen (screenshot and text snapshot that show `MSE Transport` or `MSE Transport` driver chrome, plus the feature's heading).
3. The side effect when the feature writes data (`sql` row, or a second UI view after reload/`open`).

Standards:

- Exercise the real user path. No internal setters, no test-only routes.
- Seeded demo integrations are the production fallback. Do not invent live Samsara/ORBCOMM/QBO data.
- If a dry-run flag exists, observe that processes and files did not change. Do not trust the flag name.

## Cleanup

```bash
.cursor/skills/verify-msetms/bin/control-msetms cleanup --dry-run
.cursor/skills/verify-msetms/bin/control-msetms cleanup
```

cleanup signals only the Next and Chrome pids in this run's state file. It then deletes `/tmp/msetms-verify/<run-id>/` (db, logs, chrome profile, state). It never deletes `.cursor/skills/verify-msetms/artifacts/`.

`--dry-run` is required before a destructive cleanup you have not seen. The JSON `actions` list is the plan.

Do not `pkill next` or `killall chrome`.

## Helpers

`bin/control-msetms` is executable. Invoke it from the repo root as shown above. `--help` prints commands. Every other command prints one JSON object with `ok`.

State file: `/tmp/msetms-verify/<run-id>/state.json`.

After the app changes, run `/maintain-verification-skill` so this map stays honest.
