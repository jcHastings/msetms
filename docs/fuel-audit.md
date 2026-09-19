# Fuel audit thresholds

Mike scores imported `fuel_transactions` only. Soft flags. Nothing is emailed or texted to drivers.

Stacked on Fuel tip `ebbb5f3` (PR 74: week spend Fuel / Reefer / Scale / DEF / Money code). Audit scores diesel, DEF, and reefer separately. Scale and money codes stay on the week-spend cards and are not scored as fueling.

## Windows

Default: current America/New_York Monday 00:00 through next Monday 00:00 (`localWeekRange` / `fuelAuditWindowForWeek`).

Also: last 7 / 14 / 30 NY calendar days (today plus the prior N-1 days).

Fuel desk Audit strip follows the selected saved week. Mike uses the week unless the ask says last 7/14/30 days.

## Who gets the flag

Unassigned rows still count in fleet medians.

Attribution:

- `driver_id` present → TMS driver name
- else sheet / FleetOne `driver_name_raw`
- else unit (`truck_unit` or `unit_number`)
- else `Unassigned`

No invented FleetOne fields.

## Products

Scored separately: truck diesel, DEF, reefer. Scale and money codes are ignored.

## Thresholds (`FUEL_AUDIT_THRESHOLDS` in `lib/fuel-audit.ts`)

Too often (fill count), same product, at least 2 subjects in the window:

- at least **3** fills
- at least **fleet median + 2**
- at least **1.75×** fleet median fill count

Hard floor (not DEF): two fills for the same driver/name or the same unit within **4 hours**. Under 2 hours is `high`. Different names on the same unit still flag as a unit gap.

Too much (same product):

- gallons / fill ≥ **1.5×** that subject's own median fill from the prior **30 days** (needs ≥ 2 history fills), and the fill is at least **80g diesel / 8g DEF / 40g reefer**
- or gallons / fill ≥ **1.75×** fleet median fill (same floors)
- or gallons / day ≥ **1.75×** fleet median and at least **40g / 5g / 20g** per day
- or $ / fill ≥ **1.75×** fleet median when gallons are missing

Duplicate (cheap): same subject, same product, same NY day, same normalized station, gallons within **1.0** or **5%**.

`high` if the ratio is **2.5×** or the gap is under 2 hours or 3+ duplicate swipes. Cap **8** flags, high then score.

## Last-yes

Flags only. Dispatch decides. Mike must not send SMS/email from an audit.