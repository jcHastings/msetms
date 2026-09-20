# Weekly fuel closeout

Mike and Fuel file a per-driver plus fleet closeout when the America/New_York Monday-Sunday fuel week is in view. Soft flags. Draft for JC / CoS only. Nothing is emailed or texted to drivers.

Stacked on Fuel audit tip `241c78d` (PR 75).

## Windows

Default Mike ask ("weekly fuel closeout" / "end-of-week") uses the last **closed** NY week (the Monday before the current Monday).

Fuel desk closeout follows the selected saved week. The current week is labeled in progress.

Prior-week MPG is the previous NY Mon-Sun week (week-over-week, even when someone says MoM).

## Miles source: Samsara

Week miles are **Samsara odometer deltas**, not Ascend and not Samsara IFTA monthly jurisdiction miles.

What this repo already uses:

- Live fleet refresh (`/fleet/vehicles/stats`) asks for `obdOdometerMeters,gpsOdometerMeters` and persists `truck_odometer_readings` (`extractSamsaraOdometerMiles` / `saveTruckOdometer`).
- Optional week fill uses the same `/fleet/vehicles/stats/history` connector already used for GPS history, with those same odometer types.
- Delta math is `odometerDeltaMiles` (start reading at or before week start, end reading in the week). Rejects non-positive or > 20,000 mi jumps.

There is **no Samsara trip-miles API** in this repo. Do not invent one. `MilesSource` is the seam (`lib/miles-source.ts`).

Status on the report:

- `live` - token is set; readings come from Samsara odometer (OBD, else GPS meters)
- `persisted` - token missing, stored Samsara readings still used
- `unavailable` - no token and no readings; miles stay blank

Units map to the assigned TMS driver. A unit with miles and no eligible driver still appears.

## Fuel

TMS `fuel_transactions` in the week. Truck diesel gallons and $ feed MPG, fill count, and avg gallons/fill.

Line items (not in MPG): Reefer $, DEF $, Scale $, Money code $.

Unassigned $ is every row with no `driver_id` and no sheet driver name.

## MPG

`MPG = Samsara miles / truck diesel gallons`.

Zero or missing gallons: MPG is blank. Missing miles: MPG is blank.

## Flags and green lights

Flags are the Mike fuel-audit set (`docs/fuel-audit.md`): red = `high`, yellow = `watch`.

Green light when all of these hold (`FUEL_CLOSEOUT_THRESHOLDS` in `lib/fuel-closeout.ts`):

- MPG is present and ≥ fleet median MPG
- no audit flags on that driver/unit
- truck-diesel fill count is in the normal band: at least 1, ≥ 0.5× fleet median fills, ≤ 1.75× fleet median fills (same ceiling as audit "too often")

## Fleet rollup

Miles, diesel gallons, diesel $, fleet MPG, worst 3 / best 3 MPG, week spend cards (Fuel / Reefer / Scale / DEF / Money code).

## Extras

- Idle-ish: diesel ≥ 40g and ≥ fleet median gallons, and (no miles, or miles < 40% of fleet median miles, or MPG < 60% of fleet median MPG)
- DEF$ and Scale$ per driver
- Unassigned fuel $ on the week
- MPG vs prior week (fleet and per driver when both weeks compute)
- Fuel with no miles, or miles with no diesel

## Delivery

- Fuel page: Weekly fuel closeout card + Markdown / HTML export
- Mike: "weekly fuel closeout", "end-of-week fuel", "fuel closeout" (this week if asked)
- Filed row in `fuel_closeout_reports` (markdown, HTML, JSON) for CoS
- Draft to JC only. No driver SMS/email from this report.
