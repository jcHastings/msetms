# deploy/lightsail — MS Express TMS on AWS Lightsail

MS Express (asset carrier) only. Nothing here touches M&S Loads (brokerage).
Target: Lightsail Linux/Unix, 4 GB / 2 vCPU / 80 GB, US East (Virginia), Ubuntu 24.04 LTS,
automatic snapshots ON. The app is reachable **only** through a Cloudflare Tunnel; no inbound
web ports are open on the instance.

| Path | What |
| --- | --- |
| `bootstrap.sh` | One-time idempotent setup: TZ America/New_York, unattended-upgrades, ufw (deny inbound except SSH), 2 GB swap, Node 24.19.0 (= office PC), Litestream 0.5.17, cloudflared, `msetms` user, dirs, unit files, templates. Checksums verified. Reloads systemd. Does not enable or start any msetms unit or timer. Starts nothing that needs secrets. |
| `install-cloudflared.sh` | Installs the tunnel connector as a service. Token read from a hidden prompt at run time → `/etc/cloudflared/token` (root 0600). Never in git. |
| `systemd/msetms.service` | App unit. Pins `TMS_SKIP_SEED=1`, `TZ`, `HOST=127.0.0.1`, `PORT=3000`, data dir `/srv/msetms/shared/data`. `ConditionPathExists=/srv/msetms/current`. |
| `systemd/msetms-litestream.service` | Continuous replication to R2 (runs as `msetms`). |
| `systemd/msetms-{backup-nightly,restore-test,heartbeat}.{service,timer}` | 02:30 nightly offsite snapshot, Sunday 04:00 restore drill, 5-min heartbeat. |
| `templates/*.template` | Root-only env files (**names only**) + Litestream config (creds via `${VARS}`). |
| `bin/msetms-deploy` | Gated deploy (`--sha <40-hex> --approved-by-jc '<CoS ref>'`). Builds `releases/<sha>`, backs up the DB, flips `current`, health-checks, auto-rolls back. |
| `bin/msetms-rollback` | Flip back to the previous release (~30 s, no build). |
| `bin/msetms-backup-nightly`, `bin/msetms-restore-test`, `bin/msetms-heartbeat`, `bin/msetms-counts`, `bin/msetms-health` | Ops helpers. |
| `migrate-from-pc.md` | Cutover runbook (office PC → Lightsail). |
| `test/run.sh` | Offline tests (arg guards, helpers, names-only templates, shellcheck). |

## Layout on the server

```
/srv/msetms/
  releases/<sha>/            # one built checkout per deploy (owned by msetms)
     data -> /srv/msetms/shared/data
     TIP_SHA, APPROVED_BY_JC
  current -> releases/<sha>  # atomic symlink flip
  shared/data/               # tms.db (+ -wal/-shm), uploads/, qbo-refresh.json, orbcomm-live.json
  backups/                   # pre-deploy DB copies (last 10), root-only
  state/                     # previous release, deploys.log, lock
/etc/msetms/                 # msetms.env + backup.env (root 0600), litestream.yml (root:msetms 0640)
/etc/cloudflared/token       # root 0600
```

## Secrets (never in git, never in chat)

* Values live in the team secret store JC picks (recommended: a 1Password vault "MS Express TMS").
* On the server they are pasted directly with `sudoedit /etc/msetms/msetms.env` / `backup.env`
  over SSH. Files are `root:root 0600`; systemd reads them before dropping to the `msetms` user.
* `msetms.env` uses the **same names** as the office PC `.env` (see `.env.example`). Copying the
  PC values is a JC/secret-store step; agents never read or print them.
* The age **private** key for nightly archives stays in the secret store only (the server has the public key).

## Deploy / rollback

```
sudo msetms-deploy --sha <full tip sha> --approved-by-jc '<CoS message ref with JC yes>'
sudo msetms-rollback            # previous release
sudo msetms-rollback --to <sha> # any release still on disk
```

The deploy refuses without both flags, refuses if `/etc/msetms/msetms.env` tries to override a pinned
variable, builds without secrets (`next.config.ts` inlines no env; `lib/env.ts` reads `process.env` at
request time), takes a consistent DB copy, checks `/login` = 200 and `/` = 307 → `/login`, and that
loads/drivers/dispatchers counts did not drop. On failure it flips back and restarts the previous
release automatically.

Units are not enabled at bootstrap. After health checks pass and `current` is flipped, the deploy
enables `msetms.service` (idempotent). It enables `msetms-litestream.service` and the three backup
timers only when `/etc/msetms/litestream.yml` and `/etc/msetms/backup.env` both exist and are
non-empty; otherwise it prints one line that backups are not enabled yet. Env values are never printed.

## Backups (three layers)

1. **Litestream → R2** continuous (`sync-interval 10s`, 7-day point-in-time). Health-gated
   heartbeat to `HC_LITESTREAM_URL`.
2. **Nightly 02:30** `msetms-backup-nightly`: consistent copy + `integrity_check` + JSON state,
   `tar | zstd | age` → `r2:<bucket>/nightly/YYYY-MM-DD.tar.zst.age` (35 days), and `uploads/` →
   rclone crypt remote (encrypted, incremental, deleted files kept 35 days). Pings `HC_BACKUP_URL`.
3. **Lightsail automatic snapshots** (daily, last 7 kept by AWS) for whole-disk recovery.

Weekly `msetms-restore-test` restores the Litestream replica to a temp file, runs `integrity_check`,
compares counts with live, and checks the newest nightly archive is < 36 h old. Pings `HC_RESTORE_URL`.

**Monthly manual restore drill** (needs the age private key from the secret store, on a laptop, not the server):
`rclone copy r2:<bucket>/nightly/<date>.tar.zst.age .` → `age -d -i key.txt <file> | zstd -d | tar -x` →
`sqlite3 tms.db 'PRAGMA integrity_check'` and compare counts.

## Monitoring

* **UptimeRobot** (free): HTTPS keyword monitor on `https://msetms.mandsloads.com/login`, 5-min
  interval, alert to JC's email/SMS. This watches the whole path (Cloudflare → tunnel → app).
* **Healthchecks.io** (free tier): four checks, each URL goes in `backup.env`:
  `HC_HEARTBEAT_URL` (period 5 min, grace 10 min), `HC_LITESTREAM_URL` (period 5 min, grace 15 min),
  `HC_BACKUP_URL` (daily, grace 2 h), `HC_RESTORE_URL` (weekly, grace 1 day).
* **AWS Budgets**: $35/month alert (JC checklist).
* Logs: `journalctl -u msetms -u msetms-litestream -u cloudflared`.

## Firewall

ufw denies all inbound except SSH (optionally `--ssh-from <CIDR>`). In the Lightsail console
**Networking** tab, delete the default HTTP (80) rule; keep SSH (22) until Cloudflare Access for
SSH works, then restrict 22 to "Lightsail browser SSH" only or remove it.

## Offline tests

```
bash deploy/lightsail/test/run.sh
```
