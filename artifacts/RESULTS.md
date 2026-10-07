# Driver Got it

Branch `cursor/driver-got-it-ack-5b1a` off tip `baaeee20` (draft PR #117). Draft only. MS Express asset carrier. No texts, email, or WhatsApp.

## What changed

- `lib/dispatch-ack.ts` — fingerprint, Got it stamp, desk-flag rule.
- `lib/db.ts` — additive columns on `loads` (`dispatch_ack_at`, `dispatch_ack_by`, `dispatch_ack_driver_id`, `dispatch_ack_fingerprint`) and `company_profile` (`dispatch_ack_hours` default 12, `dispatch_ack_introduced_at` stamped once on first open).
- `lib/types.ts`, `lib/queries.ts` — load view fields.
- `lib/driver-actions.ts`, `components/driver-got-it.tsx`, `app/globals.css` — one-tap Got it form (56px tall, full width).
- `app/driver/page.tsx`, `app/driver/dispatch/page.tsx`, `app/driver/loads/[id]/page.tsx` — new-dispatch card and quiet acknowledged clock.
- `lib/exceptions.ts` — inbox kind `dispatch_ack` (Ack / Snooze 4h / Resolve). Label “No ack”.
- `lib/load-timeline.ts` — timeline title “Acknowledged dispatch”.
- `components/dispatch-ack-status.tsx`, `components/load-editor.tsx`, `app/board/page.tsx`, `components/workbench-load-card.tsx` — office status.
- `lib/settings.ts`, `lib/settings-actions.ts`, `app/settings/alerts/page.tsx` — hours before pickup, 1–168, default 12.
- `scripts/dispatch-ack-test.ts`, `package.json` — focused test, including the 272-load snapshot.

## How it works

A dispatch is the assigned driver, pickup start, origin text, and shipper location. Changing any of those asks for a new Got it. The old stamp and audit row stay.

The assigned driver taps **Got it**. That writes who and when, records a `dispatch_ack` audit row, and the button becomes “Acknowledged 6:45 AM” (America/New_York). One tap, no second confirm. A second tap does not add another audit row.

Office shows **Acknowledged** with the clock, or **Waiting for Got it**. Inside the window the load line adds “desk flag”. The same chip is on the board. A workbench card shows an Ack row when that card is already on the desk for another reason.

Desk raises **No driver ack** when all of these are true:

- a driver is assigned
- status is still before pickup (`hold`, `assigned`, `dispatched`, `at_pickup`, `loading`)
- the current fingerprint is not acknowledged
- pickup is still in the future
- pickup is strictly after `dispatch_ack_introduced_at` (stamped the first time this build opens the database)
- hours until pickup are at or under the setting (default 12)

Severity is HIGH at 2 hours or less, otherwise MEDIUM. The detail says desk flag only. Nothing is sent.

Picked up, in transit, delivered, completed, accounting, and cancelled loads are not flagged. Unassigned loads are not flagged. Pickups already in the past, including every historical row on the snapshot, are not flagged.

Viewers see the status and the desk item. Desk buttons render disabled. They cannot open Settings. `driverAcknowledgeDispatchAction` requires a driver session. Saving alerts still requires a settings editor.

## How it was verified

`npm test` passed. The ack script prints: `snapshot dispatch_ack flags: 0; historical flagged: 0 of 272 loads`. Viewer guard: 160 office actions and 7 API writes blocked; 8 driver actions stay on driver auth. Smoke passed.

`npm run build` passed.

Browser check on a copy of the snapshot (not committed). Two future dispatches were added for the shots only: ACK-GOT and ACK-FLAG, both assigned to a driver who had no open pre-pickup load. ACK-GOT was tapped. ACK-FLAG stayed open and is the desk item.

## Screenshots

- `driver-new-dispatch.png` — driver home, new dispatch, Got it
- `driver-load-got-it.png` — load page, Got it
- `driver-acknowledged.png` — quiet “Acknowledged” clock
- `office-load-ack.png` — load waiting, desk-flag note, no message sent
- `desk-no-ack.png` — desk item, Ack / Snooze 4h / Resolve
- `board-ack-row.png` — board chip “Waiting for Got it · desk flag”
- `setting-ack-hours.png` — hours before pickup, default 12
- `viewer-load-ack.png` — viewer sees the status, no Got it
- `viewer-desk-no-ack.png` — viewer desk buttons disabled

## Open questions for JC

- Only the primary assigned driver gets Got it. A relay driver on the same load does not.
- A load that is still `dispatched` after its pickup time shows Waiting on the board. It is not flagged. Snapshot load 1006238 is in that state.
- Changing pickup end only, or a street that does not change origin or the shipper location, does not ask for a new Got it.
- The window is 1–168 hours. Default is 12. HIGH starts at 2 hours.
- No-ack lives on the desk inbox. It is not an out-of-tolerance workbench card, so a load with only this flag does not appear on the workbench. The Ack row shows when a card is already there.
- Viewers never reach the Settings page (existing gate). They see ack status and cannot ack or save the hours.
