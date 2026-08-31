# Create a load

Create a load lets a dispatcher book freight by hand against a customer, set the lane and windows, optionally assign a unit, and land on the new load page.

## Sub-features

- `create-open` opens the blank form from nav, desk `New load`, and board `New load`.
- `create-required` blocks save when customer, origin, destination, or windows are missing.
- `create-save` persists a load and shows it on the load page and board.
- `create-assign-on-create` can set truck, trailer, and driver on the same form.
- `create-customer-missing` tells the user to add a customer when the list is empty.

## How to get to it (user POV)

- Choose `New load` in the left nav.
- Choose the `New load` button on the desk or board header.
- Open `/loads/new`.

## Driving it with control-msetms

Preconditions:

- Doctor is healthy.
- At least one customer exists (seed includes `Heartland Foods Co.`).
- No load is titled or numbered as the one you are about to create. Use origin `Verify Junction, MS` so cleanup/sql can find it.

- **Open form.** Run `control-msetms browser click --role link --name "New load"` then `control-msetms browser wait --text "New load"`. The heading is `New load`. Actions include `From rate con` and `New customer`.
- **Fill lane.** Run `control-msetms browser select --label "Customer" --option "Heartland Foods Co."`, `fill --label "Origin" --value "Verify Junction, MS"`, `fill --label "Destination" --value "Birmingham, AL"`. Set the four window labels (`Pickup window start`, `Pickup window end`, `Delivery window start`, `Delivery window end`) to valid `datetime-local` values. Fill `Commodity` with `Verification paper`.
- **Save.** Run `control-msetms browser click --role button --name "Create load"`. Wait for the load page (load number `MSE-` plus a heading that is not `New load`). A green `Saved.` banner may flash on other forms. The create action redirects.
- **Confirm persistence.** Run `control-msetms sql --query "SELECT load_number, origin, destination, commodity FROM loads WHERE origin = 'Verify Junction, MS'"`. Then `browser open --path /board?q=Verify+Junction` and Filter. The new load number appears.
- **Proof.** Screenshot the saved load page (`create-load/saved.png`) and keep the sql JSON. The page must show `Verify Junction, MS` and `Birmingham, AL`.

## Gotchas

- Window inputs are `datetime-local`. A value such as `2026-09-02T08:00` is required. Empty windows fail the native form check and never hit the server.
- Assigning an expired driver/truck/trailer disables `Create load` until the confirm checkbox is checked.
- `From rate con` leaves this page. That path is [rate-con-import.md](./rate-con-import.md).
- Do not use `queries.createLoad` as proof. The form POST is the user path.
