# Office fuel import HTTP

Same parsers as `/fuel` (`importFuelCsvAction`): CSV, xlsx, PDF. After a successful import, pending driver receipts auto-match (date / amount / gallons / merchant / card last4).

`POST /api/fuel/import`

Multipart field: `file` or `csv`.

Auth (either):

- Office dispatcher session cookie (`tms_dispatcher_id`) with Administrator or Standard (`canUploadFuel`)
- `Authorization: Bearer $TMS_FUEL_IMPORT_TOKEN` when that env is set (staging bot)

Response: `{ ok, created, skipped, unmatched, errors }` or `{ ok: false, error }`.

```bash
curl -sS -X POST http://localhost:3000/api/fuel/import \
  -H "Authorization: Bearer $TMS_FUEL_IMPORT_TOKEN" \
  -F file=@daily.csv
```
