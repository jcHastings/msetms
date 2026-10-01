# Lane avg + RC fine print (advisory)

Stacked on draft PR #65 tip `7b890c91bb8375296a241c2ea9ab7d190e2d882c`. Tip SHA is the latest commit on `cursor/lane-avg-fine-print-4929`.

AI rate-con PDF import is unchanged. These checks are review-only. Last yes for book/confirm stays on the human. Confirm stays enabled.

## 1) Lane average (this fleet only)

**Match (JC):** a history load counts when **pickup is within 200 mi of the candidate pickup AND delivery is within 200 mi of the candidate delivery** (haversine). Exact city/state is not required.

**Assumptions**

- Prefer stored `locations.latitude` / `locations.longitude` when `shipper_location_id` / `consignee_location_id` is set.
- Else city centroid from `US_CITY_CENTERS` (`findCityCenter` in `lib/city-coords-shared.ts`).
- No geocode API. Unresolved end → that history row (or the candidate) is skipped.
- Radius: `LANE_AVG_RADIUS_MILES = 200`.
- Pool: customer rate &gt; 0, not cancelled, not `non_revenue`. The live load is excluded from its own average.

**Band:** Below / At / Above only when `sampleSize >= LANE_AVG_MIN_SAMPLES` (**3**). “At” is within **$75 or 5%**. n=1 / n=2 → no badge / “not enough lane history”. Shows flat $ avg, $/mi when miles exist, and sample size.

**Board perf:** the board does **not** call `listFleetLaneRates` on every render. It uses `laneAveragesForBoard` → cached `getResolvedFleetLaneRates` (COUNT + MAX(updated_at) stamp on qualifying loads and geocoded locations; ends pre-resolved). Empty set → no badge.

**Import draft miles:** `parsePrintedLaneMiles` reads a printed “Miles: 1,200” / “880 miles” from the RC text and passes `laneMiles` into the import draft so the $/mi badge works when miles exist. Does not invent miles from haversine.

## 2) RC fine-print scan

Rule scan of RC text (after Read, or on-demand for an attached rate con). Hits: detention, TONU, layover, tracking penalties, appointment windows, lumper, late fees, other money penalties. Quote snippet per hit.

Lumper/penalty regexes are tight: bare “driver unload/pay”, a plain dollar rate, and bare “chargebacks” do **not** fire. “Carrier pays lumper” and “Chargeback for cargo claims” still do. **Does not reject or disable Confirm.**

## Demo clicks

### 200-mi radius (nearby in, far out)

Need three+ completed/delivered loads with a customer rate:

1. **Nearby in:** Holcomb, KS → Davenport, IA (PU near Dodge City, DEL near Cedar Rapids).
2. **Exact in:** Dodge City, KS → Cedar Rapids, IA.
3. **Nearby dest in:** Dodge City, KS → Davenport, IA.
4. **Far dest out:** Holcomb, KS → Houston, TX (PU in, DEL &gt; 200 mi from Cedar Rapids) — must not move the avg.
5. **Far PU out:** Chicago, IL → Davenport, IA (DEL in, PU &gt; 200 mi from Dodge) — must not move the avg.
6. **Far both out:** Phoenix, AZ → Houston, TX — no badge on that row.
7. Open a live **Dodge City, KS → Cedar Rapids, IA** at $1,800 vs ~$2,200 avg → **Below your lane avg** · 200-mi radius · 3 loads. Confirm still works.
8. Stored-coord check: Cimarron, KS yard with lat/lng (~20 mi from Dodge) + Davenport dest counts even though Cimarron is not in the city catalog.

### Lane avg after rate-con import

1. Dispatch → **New load** (or `/loads/import`).
2. Drop a rate con that prints miles (e.g. `Miles: 1200`) → **Read rate con**.
3. On the draft (before Confirm): badge **Below / At / Above your lane avg** with $ avg, **$/mi when miles printed**, and load count (only if n≥3).
4. Change **Customer rate** — badge updates. **Confirm and save load** still works.

### Lane avg on load / board

1. Open a load → **Financials** → **Income / Budget** → Customer rate. Same badge.
2. **Dispatch board** — under the origin → dest lane: compact **Below avg / At avg / Above avg** plus $ avg and sample size. Board uses the cached fleet snapshot, not a full rescan per render.

### Fine print after import

1. Same Read rate con flow.
2. Checklist **RC money terms — review before you book** with quote snippets, or “No extra money terms jumped out.”
3. Confirm is still enabled.

### Fine print on an attached RC

1. Open a load → **Load Documents**.
2. Need a file typed **Rate confirmation**.
3. **Scan RC fine print**. Review hits. Nothing is auto-rejected.

## Out of scope

- Rebuilding the AI rate-con reader
- Market rate APIs
- Auto-reject / hard-block book
- Office Update
- Merge
