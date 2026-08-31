# Driver app

The driver app is a phone-width surface. A driver signs in with name and PIN, sees only their assigned loads, updates progress, and uploads BOL/POD/photos. Dispatcher login does not exist.

## Sub-features

- `driver-login` signs in from `/driver/login` with the name select and PIN.
- `driver-login-reject` shows an error for a wrong PIN.
- `driver-list` lists that driver's open loads and hides other drivers' work.
- `driver-progress` walks En route to pickup → Loaded → En route to delivery → Delivered.
- `driver-upload` attaches a photo or PDF to the open load.
- `driver-logout` returns to the login screen.

## How to get to it (user POV)

- Choose `Driver app` in the dispatcher nav.
- Open `/driver/login` on a narrow viewport.
- After login, open a load card to `/driver/loads/<id>`.

## Driving it with control-msetms

Preconditions:

- Doctor is healthy.
- Denise Ortega still has PIN `1125` and in-transit load `MSE-1045`. Confirm with `sql --query "SELECT name, pin FROM drivers WHERE name = 'Denise Ortega'"`.

- **Open login.** Run `control-msetms browser open --path /driver/login` then `wait --text "Driver dispatch"`. The heading is `Driver dispatch`. Demo PIN copy is visible. Dispatcher sidebar is not shown.
- **Wrong PIN.** Select `Your name` = `Denise Ortega`, fill `PIN` = `0000`, click `Open my dispatch`. An error banner appears. URL stays on login.
- **Sign in.** Fill `PIN` = `1125` and click `Open my dispatch`. Wait for `My dispatch` and `Denise Ortega`. The list includes `MSE-1045` and the Nashville → Dallas lane.
- **Open load.** Click the `MSE-1045` link. The load page shows special instructions, remaining drive time (demo unless Samsara is configured), and `Update status`.
- **Progress.** Click `En route to delivery` (or the next status that is not already current). The button text gains `· current`. Dispatcher `/loads/<id>` then shows in transit / the matching driver progress.
- **Sign out.** Click `Sign out`. The login heading returns.
- **Proof.** Screenshot `driver-app/denise-mse-1045.png` on the load page so `MSE-1045` and `Update status` are visible. Snapshot the same view. Sql `SELECT load_number, status, driver_progress FROM loads WHERE load_number = 'MSE-1045'` matches the button you clicked.

## Gotchas

- A signed-in cookie redirects `/driver/login` to `/driver`. Sign out before proving login again.
- Driver chrome is not the dispatcher sidebar. If you see `Dispatch board` in the nav, you are on the wrong shell (`/driver/login` vs `/`).
- Progress buttons disable when the load is already delivered.
- Uploads write under repo `data/uploads/`, not the temp DB directory. Do not wipe that folder in cleanup.
- Viewport. This surface is built for phone width. A 1440px screenshot is still valid if the driver heading and load card are readable.
