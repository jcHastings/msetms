# Dispatch board

The dispatch board is the working list of loads. A dispatcher filters by search, status, and pickup date, opens a load, assigns or changes the truck/trailer/driver, and moves status.

## Sub-features

- `board-open` opens `/board` from nav and from desk KPI / Open board links.
- `board-filter` applies Search, Status, Pickup date, Filter, and Clear.
- `board-assign` assigns a truck, trailer, and driver from the row Assign dialog.
- `board-reassign` changes the unit on an already assigned load.
- `board-status` changes load status from the row control.

## How to get to it (user POV)

- Choose `Dispatch board` in the left nav.
- Open `/board` or `/board?status=available`.
- From the desk, choose `Open board`, `Open loads`, `In transit`, or `Unassigned loads`.

## Driving it with control-msetms

Preconditions:

- Doctor is healthy on the isolated instance.
- Seed includes `MSE-1042` (available) and `MSE-1044` (assigned to Marcus Hale).

- **Open board.** Run `control-msetms browser open --path /board` then `control-msetms browser wait --text "Dispatch board"`. The heading is `Dispatch board`. Default filter is Active.
- **Filter available.** Run `control-msetms browser select --label "Status" --option "Available"` then `control-msetms browser click --role button --name "Filter"`. The table includes `MSE-1042` and does not include delivered `MSE-1047`.
- **Search.** Run `control-msetms browser fill --label "Search" --value "MSE-1045"` then `control-msetms browser click --role button --name "Filter"`. The table includes `MSE-1045`.
- **Clear.** Run `control-msetms browser click --role button --name "Clear"`. Search is empty and Active loads return.
- **Assign.** Open `/board?status=available`. Click the `Assign` button on the `MSE-1042` row. The dialog heading is `Assign MSE-1042` with labels `Driver`, `Truck`, `Trailer`. Choose a driver and truck that are not Denise/112 or another in-use pair, then `Assign unit`. The row then shows that unit. Confirm with `sql --query "SELECT status, driver_id, truck_id FROM loads WHERE load_number = 'MSE-1042'"`.
- **Expired documents.** Assigning Tyrell Brooks or truck 210 / trailer TR-8801 / truck 108 can show compliance alerts. Expired docs require the confirm checkbox before `Assign unit` enables.
- **Proof.** Snapshot and screenshot the filtered board (`dispatch-board/available.txt` and `.png`) so `Dispatch board` and `MSE-1042` are visible. After an assign, reopen the load via the `MSE-1042` link and snapshot the assigned unit.

## Gotchas

- Several `Status` labels exist (toolbar vs row). Scope `select --label Status` to the toolbar by opening `/board` with no dialog open.
- Several `Assign` buttons exist, one per row. Prefer `open --path /board?status=available` and the `MSE-1042` row, or click `--name` only when a single Assign is visible.
- Demo Samsara/ORBCOMM banners can appear at the top. They are expected without live credentials. They do not fail the board.
- Owner-operator drivers add an `Owner-operator %` field. Company drivers do not.
