# Lane avg + RC fine print (advisory)

Stacked on draft PR #65 tip `7b890c91bb8375296a241c2ea9ab7d190e2d882c`. This tip SHA is the commit on `cursor/lane-avg-fine-print-4929` after push.

AI rate-con PDF import is unchanged. These two checks are review-only. Last yes for book/confirm stays on the human.

## 1) Lane average (this fleet only)

Lane key is origin → dest **city/state** (`Hastings, NE` → `El Paso, TX`). Personal history: customer rate on non-cancelled, non-empty loads. No market APIs.

**Band:** Below / At / Above. “At” is within **$75 or 5%**. Shows flat $ avg, $/mi when `route_miles` exists, and sample size.

## 2) RC fine-print scan

Rule scan of RC text (after Read, or on-demand for an attached rate con). Hits: detention, TONU, layover, tracking penalties, appointment windows, lumper, late fees, other money penalties. Quote snippet per hit. **Does not reject or disable Confirm.**

## Demo clicks

### Lane avg after rate-con import

1. Dispatch → **New load** (or `/loads/import`).
2. Drop a rate con → **Read rate con**.
3. On the draft (before Confirm): badge **Below / At / Above your lane avg** with $ avg, $/mi if known, and load count.
4. Change **Customer rate** — badge updates. **Confirm and save load** still works.

Need history: two+ prior loads on the same city/state lane with a customer rate (not cancelled).

### Lane avg on load / board

1. Open a load → **Financials** → **Income / Budget** → Customer rate. Same badge.
2. **Dispatch board** — under the origin → dest lane: compact **Below avg / At avg / Above avg** plus $ avg and sample size.

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
