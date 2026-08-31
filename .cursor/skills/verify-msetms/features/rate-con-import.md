# Rate con import

Rate con import lets a dispatcher upload a customer rate confirmation, review extracted fields, edit them, and save a load with the original file attached.

## Sub-features

- `ratecon-open` opens `/loads/import` from New load → From rate con.
- `ratecon-extract` reads a PDF (text) or image (local Tesseract) and shows the load form.
- `ratecon-review` keeps every field editable before save.
- `ratecon-save` creates the load and attaches the source file as a rate confirmation.
- `ratecon-sample` uses `public/samples/sample-rate-con.pdf` (Delta Cold Storage, Atlanta → Jacksonville).

## How to get to it (user POV)

- Choose `New load`, then `From rate con`.
- Open `/loads/import`.
- From the import page, `Type a load instead` returns to `/loads/new`.

## Driving it with control-msetms

Preconditions:

- Doctor is healthy.
- `public/samples/sample-rate-con.pdf` exists in the repo.

- **Open import.** Run `control-msetms browser open --path /loads/import` then `wait --text "Load from rate confirmation"`. The heading is `Load from rate confirmation`. The upload card heading is `Upload rate confirmation`.
- **Attach sample.** Run `control-msetms browser file --label "Rate con file" --file public/samples/sample-rate-con.pdf` then `click --role button --name "Extract fields"`. Wait for `Review the extracted fields` and the `Save load from rate con` button. OCR/PDF extract can take tens of seconds.
- **Review.** Origin/destination/customer fields are filled from the parse (Atlanta / Jacksonville / Delta Cold Storage is the labeled sample). Edit anything wrong the same way as create-load.
- **Save.** Click `Save load from rate con`. The new load page shows the lane and a rate confirmation attachment.
- **Proof.** Screenshot `rate-con-import/review.png` on the review form so extracted fields are visible. After save, sql the new load by origin/destination and list attachments for that `load_id`. Reopen the dispatcher load page and confirm the file is listed.

## Gotchas

- A partial parse is expected. Proof is "user can review and save", not "every field is perfect".
- Image OCR pulls in `tesseract.js` on first use and is slow. Prefer the sample PDF.
- Extract writes an inbox file under `data/uploads/inbox/<uuid>/`. cleanup does not delete it.
- `Type a load instead` is a different feature. Do not count a manual create as a rate-con proof.
