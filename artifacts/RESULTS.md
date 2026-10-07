# Paystub upload

Branch `cursor/gusto-paystubs-c1fe`. Draft only. The Gusto API is not used. No outbound call to Gusto. No token in the repo.

JC’s decision on 2026-10-07: the Gusto API is partner-only, so payday is an upload. An office user downloads the paystub PDFs and the payroll summary from the Gusto website and uploads them here.

## What changed

Removed the OAuth connect card, the callback route, the token exchange, the employee-mapping screen, and the `GUSTO_CLIENT_ID` / `GUSTO_CLIENT_SECRET` / `GUSTO_ENV` / `GUSTO_REDIRECT_URI` readers. `.env.example` now has an empty `PAYSTUB_UPLOAD_TOKEN=` and no Gusto client secrets.

Added:

- `app/paystubs/page.tsx` and `components/paystub-upload.tsx` — office upload and review.
- `app/api/paystubs/preview/route.ts` and `app/api/paystubs/commit/route.ts` — signed-in office write. Viewers get 403.
- `app/api/paystubs/upload/route.ts` — bearer token for a script.
- `lib/paystub-shared.ts` — parser, name matcher, and the save/don’t-save decision.
- `lib/paystubs.ts` — files, database, and the upload pipeline.
- `app/driver/paystubs/page.tsx` — that driver’s stored stubs, newest first, latest net, download, and a plain “View in Gusto” link.
- `app/api/driver/paystubs/route.ts` and `app/api/driver/paystubs/[id]/pdf/route.ts` — own stubs only. Another driver’s id is 403.
- `scripts/paystub-test.ts`.

PDFs are stored under the data uploads directory (`uploads/paystubs/files`), not `public/`. Download goes through the signed-in driver route.

The old `gusto_*` tables are still created and are not read. Nothing is dropped.

## Who can do what

Upload and assign: Administrator, Standard, and Accounting. That is the office write set. Viewer and legacy read-only can open Paystubs. Every write control is disabled, and preview/commit return 403 `View-only access`.

Owner-operators are left out of matching and out of the driver dropdown. A script that sends an owner-operator `driver_id` gets `needs_review` and the file is not attached.

## Office screen

Drop many PDFs at once. Optional payroll summary (PDF or CSV) is stored with the pay run and is not parsed. Each PDF is read on the server. The review table shows the match, and the driver, pay date, period, gross, and net can be edited before Save. An unmatched row must be assigned or skipped. A low-confidence name is not pre-selected and is not saved on its own. The same file (sha256) is refused. The same driver and pay date is flagged and is not saved again until the date or driver changes.

Anything the script cannot attach lands in Needs review.

## Upload endpoint

`POST /api/paystubs/upload`

Auth: `Authorization: Bearer <token>`. The token is `PAYSTUB_UPLOAD_TOKEN`. Comparison is sha256 then `timingSafeEqual`, so a wrong length does not throw and does not short-circuit on the raw bytes. The token is not logged. Empty or unset disables the route.

| Status | When |
| --- | --- |
| 503 | Token env is unset or empty. Body: `{ "ok": false, "error": "Paystub upload is disabled." }` |
| 401 | Missing or wrong bearer. Body: `{ "ok": false, "error": "Unauthorized." }` |
| 400 | Not multipart, no PDF, more than 40 PDFs, summary is not PDF/CSV, summary over 15 MB, or `overrides` is not a JSON array. |
| 200 | The request was accepted. Each file has its own status. |
| 500 | Unexpected failure. No token in the body. |

Fields:

- `file` (repeatable). Also accepted as `files`, `pdf`, or `pdfs`. PDF only (`%PDF` header). Max 15 MB each. Max 40 files.
- `summary` optional. PDF or CSV. Max 15 MB. Stored on the pay run when at least one file is stored or queued. Not parsed.
- `overrides` optional JSON array. Objects may include `file`, `driver_id`, `pay_date`, `period_start`, `period_end`, `gross`, `net`. Matched to files by name, in order when names repeat.
- Shorthand, applied to files that have no named override: `driver_id`, `pay_date`, `period_start`, `period_end`, `gross`, `net`.

Per file, `files[]` is one of:

- `stored` — confidently matched, or an explicit company-driver override, with pay date, period start, period end, gross, and net. `paystubId` and `driverId` are set.
- `needs_review` — not attached (`driverId` null). `reason` says why (no match, low confidence, owner-operator, or missing fields). `paystubId` is the queue row.
- `duplicate` — sha256 already on file (`existingId`, no new row), or the same driver and pay date (`paystubId` is a queue row that is not attached).
- `error` — not a PDF, empty, unreadable, over 15 MB, or `driver_id` is not in the fleet. No row.

```json
{
  "ok": true,
  "runId": 12,
  "summary": { "stored": true, "name": "payroll-summary.pdf" },
  "files": [
    {
      "file": "casey-haul.pdf",
      "status": "stored",
      "paystubId": 40,
      "driverId": 3,
      "employeeName": "Casey Haul",
      "payDate": "2026-10-03",
      "periodStart": "2026-09-21",
      "periodEnd": "2026-09-27",
      "gross": "1840.00",
      "net": "1412.55",
      "matchState": "matched"
    }
  ]
}
```

```bash
curl -sS -X POST "https://office-host/api/paystubs/upload" \
  -H "Authorization: Bearer YOUR_PAYSTUB_UPLOAD_TOKEN" \
  -F "file=@/path/casey-haul.pdf;type=application/pdf" \
  -F "file=@/path/jordan-miles.pdf;type=application/pdf" \
  -F "summary=@/path/payroll-summary.pdf;type=application/pdf" \
  -F 'overrides=[{"file":"jordan-miles.pdf","driver_id":12,"pay_date":"2026-10-03","period_start":"2026-09-21","period_end":"2026-09-27","gross":"900.00","net":"700.50"}]'
```

`YOUR_PAYSTUB_UPLOAD_TOKEN` is a placeholder. Do not put a real token in the repo or in this note.

## What the parser can read

A real Gusto “download paystub” PDF was not in the repo, and this pass did not fetch one from Gusto. The parser does not assume a column layout. It looks for these labels, on the same line or the next line:

- Employee name, or `Pay stub for <name>`
- Pay date, check date, payment date
- Pay period (two dates), or period start / period end
- Gross pay, gross earnings, total gross, gross wages (the amount before YTD; a YTD-only amount is left blank)
- Net pay, net earnings, take-home pay, net wages

Dates accepted: `MM/DD/YYYY`, `YYYY-MM-DD`, and `Month D, YYYY`. Money needs a `$`, a thousands comma, or cents.

If a label is missing, that field stays blank and the office has to type it. The name matcher only auto-assigns an exact unique company-driver name. Normalization folds case, apostrophes, periods, hyphens, middle initials, suffixes (Jr/Sr/II/III/IV), and `Last, First`. A last-name-only or partial hit is low confidence: visible, not selected, not saved. Owner-operators are never auto-matched.

## Driver app

`/driver/paystubs` lists that driver’s stored stubs, newest pay date first. The latest net is at the top. Each row has Download PDF. “View in Gusto” is a normal link to `https://app.gusto.com/login` (constant `GUSTO_EMPLOYEE_LOGIN_URL`). It does not call Gusto.

A driver who requests another driver’s stub, or a queued stub that is not theirs, gets 403. An unknown id is 404.

## How it was verified

`npx tsx scripts/paystub-test.ts` passed. It covers the name matcher, label extraction (including a pdfkit fixture read back with the same PDF text extractor), token 401/503, sha256 duplicate, same driver + pay date, owner-operator exclusion, low-confidence not attached, cross-driver 403, and no Gusto API host left in `app/`, `lib/`, `components/`, or `scripts/`.

`npx tsx scripts/viewer-role-test.ts` passed (preview and commit are 403 for a viewer).

Full `npm test` and `npm run build`: see the latest note in this file after the verification pass.

## Screenshots

Taken against the uploaded live-shaped database, not committed. Office login was a temporary password on that copy only.

- `artifacts/office-paystubs-review.png` — auto-matched, needs review, and duplicate rows.
- `artifacts/office-paystubs-override.png` — driver override open.
- `artifacts/office-paystubs-viewer.png` — viewer, writes disabled.
- `artifacts/driver-paystubs.png` — latest net and Download PDF.

## Open questions for JC

1. The real Gusto PDF layout is unknown here. If the downloaded stub does not use the labels above, those fields will be blank until someone pastes one sample (made-up or redacted) we can aim the parser at.
2. Office write access is Administrator, Standard, and Accounting. Say if Accounting should be view-only, or if Standard should not upload.
3. “View in Gusto” goes to `https://app.gusto.com/login`. Replace that constant if the company uses a different employee sign-in URL.
4. Skipping a queued file deletes it, so the same PDF can be uploaded again. A file that was stored, or is still in the queue, is refused by sha256.
5. The payroll summary is stored with the pay run and is not parsed.
