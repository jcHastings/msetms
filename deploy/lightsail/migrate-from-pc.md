# Cutover runbook: office PC (JCRyzenHM) → Lightsail

**Do not start without JC's explicit yes for the cutover window** (CoS message ref goes into
`--approved-by-jc`). MS Express only. Expected write freeze: **~15–25 min**, done after hours.

Baseline counts (loads / drivers / dispatchers) on 2026-10-07: **272 / 10 / 7**. Use the day's
numbers from the PC immediately before the freeze; the server must match exactly.

## T-1 day: dry run (no freeze, PC stays live)

1. Server bootstrapped (`sudo ./bootstrap.sh`). Bootstrap installs the unit files and reloads
   systemd; it does **not** enable or start any msetms unit or timer. `/etc/msetms/*.env` filled
   from the secret store, new tunnel **msetms-cloud** connected (`sudo msetms-install-cloudflared`)
   with a **test hostname** (e.g. `msetms-new.mandsloads.com`) behind Cloudflare Access. The live
   hostname is untouched. The first successful deploy (step 11) enables `msetms.service`, and
   enables Litestream plus the backup timers when `litestream.yml` and `backup.env` both exist
   and are non-empty.
2. Copy a **backup copy** of the PC data (not the live folder) to the server (see step 3 below for
   the mechanics), start the app on the tip SHA, and verify:
   * `/login` 200 via the test hostname; log in as QA Bot (viewer); open a load, the board, /fuel.
   * Counts match the copied backup.
   * One read-only call each to Samsara, Orbcomm, PrePass, Google Maps from the server (IP-lock check).
   * QBO status page loads (no reconnect needed: same redirect URI on the final hostname).
3. Wipe the dry-run data (`systemctl stop msetms msetms-litestream; rm -rf /srv/msetms/shared/data/*`)
   and delete the dry-run R2 prefix so the real cutover starts clean.

## Cutover night

| # | Where | Step | Check |
| --- | --- | --- | --- |
| 1 | Chat | Announce freeze to office users (JC). | — |
| 2 | PC | Record counts with the read-only helper (`node %TEMP%\cnt.js`). | note L/D/U |
| 3 | PC | **Stop the app** (node chain on :3000; same method as Office Update skill). Leave the PC tunnel running (it will just 502). | nothing on :3000 |
| 4 | PC | Back up `data\` to `msetms-data-backup-YYYY-MM-DD-pre-cloud` with robocopy `/E /COPY:DAT`. | file count + bytes match |
| 5 | PC | Checkpoint is not needed: copy `tms.db`, `tms.db-wal`, `tms.db-shm` together from the stopped app. | 3 files present |
| 6 | Box | `CopyToBox` the backup folder files (tms.db*, qbo-refresh.json, orbcomm-live.json, uploads\…) → `/workspace/cutover/data/`. Verify sha256 of each DB file vs PC (`Get-FileHash`). | hashes match |
| 7 | Box → server | `rsync -a --checksum /workspace/cutover/data/ <server>:/tmp/cutover-data/` over SSH (Access or Lightsail key). | rsync exit 0 |
| 8 | Server | `sudo systemctl stop msetms msetms-litestream`; `sudo rsync -a /tmp/cutover-data/ /srv/msetms/shared/data/`; `sudo chown -R msetms:msetms /srv/msetms/shared/data`; `sudo rm -rf /tmp/cutover-data` | — |
| 9 | Server | `sudo -u msetms sqlite3 /srv/msetms/shared/data/tms.db 'PRAGMA integrity_check; PRAGMA journal_mode;'` | `ok`, `wal` |
| 10 | Server | `sudo msetms-counts` | equals step 2 |
| 11 | Server | `sudo msetms-deploy --sha <tip> --approved-by-jc '<ref>'` (if the release is already built from the dry run, this only flips + restarts). | "deploy OK" |
| 12 | Server | `sudo systemctl start msetms-litestream`; wait 1 min; `journalctl -u msetms-litestream -n 20` | snapshot written |
| 13 | Cloudflare | **Move `msetms.mandsloads.com`** from the PC tunnel to `msetms-cloud` (Zero Trust → Networks → Tunnels → msetms-cloud → Public hostnames → add `msetms.mandsloads.com` → `http://localhost:3000`; remove it from the PC tunnel). | — |
| 14 | Anywhere | `curl -sI https://msetms.mandsloads.com/login` → 200; QA Bot login; open load, board, invoices list, /fuel; Samsara webhook test event lands. | all green |
| 15 | Server | `sudo msetms-health --public`; `sudo msetms-backup-nightly` once by hand. | OK + HC ping |
| 16 | Chat | Unfreeze (JC). Note SoT update in `tms-office-live.md`. | — |

## Rollback (any step 11–15 fails)

1. Cloudflare: point `msetms.mandsloads.com` back to the PC tunnel (it never stopped).
2. PC: start the app from the same folder (`npm start`, Office Update skill method). Data on the PC
   is exactly as it was at step 3 because nothing wrote to it since.
3. If the server took writes after step 14 and we roll back, copy the server DB back
   (`sudo msetms-backup-nightly` artefact or `sqlite3 .backup`) before restarting the PC — never run both live.

## After cutover (keep for 14 days)

* PC app stays **stopped** but intact (folder + data backup) as a cold fallback.
* PC tunnel connector can stay installed with no hostname; delete it after 14 days with JC's OK.
* Remove the Lightsail SSH 22 rule once Access-for-SSH is proven.
