#!/usr/bin/env bash
# Shared settings for the MS Express TMS Lightsail scripts. Sourced, not run.
# MS Express (asset carrier) only. Never prints secret values.
# shellcheck disable=SC2034  # variables are used by the scripts that source this file
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/msetms}"
RELEASES="$APP_ROOT/releases"
CURRENT="$APP_ROOT/current"
SHARED_DATA="$APP_ROOT/shared/data"
BACKUPS="$APP_ROOT/backups"
STATE="$APP_ROOT/state"
DB="$SHARED_DATA/tms.db"
APP_USER="msetms"
APP_ENV="/etc/msetms/msetms.env"
BACKUP_ENV="${BACKUP_ENV:-/etc/msetms/backup.env}"
LITESTREAM_CONFIG="${LITESTREAM_CONFIG:-/etc/msetms/litestream.yml}"
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:3000}"
REPO="${REPO:-jcHastings/msetms}"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
need_root() { [[ $EUID -eq 0 ]] || die "run as root (sudo)"; }

# Load KEY=VALUE lines from an env file into the environment without echoing
# anything. Ignores comments/blank lines; strips one pair of surrounding quotes.
load_env_file() {
  local file="$1" line key value
  [[ -r "$file" ]] || die "cannot read $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
    export "$key=$value"
  done < "$file"
}

# 0 when VALUE is empty or an obvious template placeholder.
# Never prints the value.
value_is_missing() {
  local v="$1"
  if [[ "$v" =~ ^\"(.*)\"$ || "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  [[ -z "$v" ]] && return 0
  local upper="${v^^}"
  [[ "$upper" == *CHANGEME* || "$upper" == *REPLACE* ]] && return 0
  [[ "$v" == *'<'* && "$v" == *'>'* ]] && return 0
  [[ "$upper" == "XXX" ]] && return 0
  return 1
}

# Last KEY= assignment in an env file. 0 when that value is present and real.
# Never prints the value.
key_is_set() {
  local file="$1" key="$2" line value="" found=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    line="${line#"${line%%[![:space:]]*}"}"
    [[ "$line" == export[[:space:]]* ]] && line="${line#export }" && line="${line#"${line%%[![:space:]]*}"}"
    [[ "$line" =~ ^${key}=(.*)$ ]] || continue
    value="${BASH_REMATCH[1]}"
    found=1
  done < "$file"
  [[ $found -eq 1 ]] || return 1
  value_is_missing "$value" && return 1
  return 0
}

# 0 only when every KEY is KEY=<non-empty, non-placeholder>.
# On failure prints the missing KEY NAMES only (one space-separated line). Never prints values.
env_has_values() {
  local file="$1"; shift
  local -a missing=()
  local key
  [[ $# -gt 0 ]] || return 0
  if [[ ! -r "$file" ]]; then
    printf '%s\n' "$*"
    return 1
  fi
  for key in "$@"; do
    key_is_set "$file" "$key" || missing+=("$key")
  done
  if ((${#missing[@]})); then
    printf '%s\n' "${missing[*]}"
    return 1
  fi
  return 0
}

# ${VAR} names in a litestream config, skipping comments. Names only.
yml_env_refs() {
  local yml="$1" line rest name
  [[ -r "$yml" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    rest="$line"
    while [[ "$rest" =~ \$\{([A-Za-z_][A-Za-z0-9_]*)\} ]]; do
      name="${BASH_REMATCH[1]}"
      printf '%s\n' "$name"
      rest="${rest#*"${BASH_REMATCH[0]}"}"
    done
  done < "$yml"
}

# 0 when backup.env can actually run Litestream and the nightly snapshot.
# Required: the nightly script's `:?` keys (R2 account/bucket/access key/secret,
# AGE_RECIPIENT, UPLOADS_CRYPT_PASSWORD) plus every ${VAR} litestream.yml
# expands (today that adds HC_LITESTREAM_URL). Checking the yml refs, not "file
# is non-empty", is what rejects the bootstrap templates: they are non-empty but
# every secret is blank, and Litestream would otherwise start with empty creds.
# Optional, and not checked: HC_BACKUP_URL, HC_RESTORE_URL, HC_HEARTBEAT_URL
# (the scripts use ${HC_*:-} and hc_ping no-ops) and NIGHTLY_KEEP_DAYS (default 35).
# On failure prints missing KEY NAMES only.
backups_configured() {
  local envf="${1:-$BACKUP_ENV}" yml="${2:-$LITESTREAM_CONFIG}"
  local -a keys=(
    R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
    AGE_RECIPIENT UPLOADS_CRYPT_PASSWORD
  )
  local name seen k
  if [[ ! -r "$yml" ]]; then
    keys+=(litestream.yml)
  else
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      seen=0
      for k in "${keys[@]}"; do
        [[ "$k" == "$name" ]] && seen=1 && break
      done
      [[ $seen -eq 0 ]] && keys+=("$name")
    done < <(yml_env_refs "$yml")
  fi
  env_has_values "$envf" "${keys[@]}"
}

# Enable Litestream and the backup timers only when backups_configured passes.
# Prints one line on failure. Never prints values. Does not fail the deploy.
enable_backup_units() {
  local missing
  if missing="$(backups_configured "$BACKUP_ENV" "$LITESTREAM_CONFIG")"; then
    systemctl enable msetms-litestream.service msetms-backup-nightly.timer msetms-restore-test.timer msetms-heartbeat.timer
    if [[ -n "${DEPLOY_LOG:-}" ]]; then
      log "enabled msetms-litestream.service and the backup timers" | tee -a "$DEPLOY_LOG"
    else
      log "enabled msetms-litestream.service and the backup timers"
    fi
    return 0
  fi
  missing="${missing//$'\n'/ }"
  if [[ -n "${DEPLOY_LOG:-}" ]]; then
    log "backups not enabled yet, missing keys: ${missing}" | tee -a "$DEPLOY_LOG"
  else
    log "backups not enabled yet, missing keys: ${missing}"
  fi
  return 0
}

# Row counts used as the go/no-go baseline (loads/drivers/dispatchers).
db_counts() {
  local db="${1:-$DB}"
  sqlite3 -batch -noheader "file:$db?mode=ro" \
    "SELECT (SELECT COUNT(*) FROM loads)||'/'||(SELECT COUNT(*) FROM drivers)||'/'||(SELECT COUNT(*) FROM dispatchers);"
}

# 0 when every count in $2 (a/b/c) is >= the matching count in $1.
# (Live users may add rows during a deploy; a drop means data went missing.)
counts_not_lower() {
  local -a a b; local i
  IFS=/ read -ra a <<< "$1"; IFS=/ read -ra b <<< "$2"
  [[ ${#a[@]} -eq ${#b[@]} ]] || return 1
  for i in "${!a[@]}"; do (( b[i] >= a[i] )) || { log "counts dropped: $1 -> $2"; return 1; }; done
}

# Consistent online copy (safe while the app and Litestream run).
db_backup_to() {
  local dest="$1"
  sqlite3 -batch "$DB" ".timeout 10000" ".backup '$dest'"
  [[ "$(sqlite3 -batch -noheader "$dest" 'PRAGMA integrity_check;')" == "ok" ]] || die "integrity_check failed on $dest"
}

# Healthchecks.io-style ping. URL may be empty (then it is a no-op).
hc_ping() {
  local url="${1:-}" suffix="${2:-}"
  [[ -n "$url" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${url}${suffix}" || log "warn: healthcheck ping failed"
}

# 0 when /login answers 200 and / answers 307 -> /login.
health_ok() {
  local code loc
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$LOCAL_URL/login" || true)"
  [[ "$code" == "200" ]] || { log "health: /login -> $code"; return 1; }
  read -r code loc < <(curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}' "$LOCAL_URL/" || true)
  [[ "$code" == "307" && "$loc" == *"/login"* ]] || { log "health: / -> $code $loc"; return 1; }
  return 0
}

wait_healthy() {
  local secs="${1:-90}" i
  for ((i = 0; i < secs; i += 3)); do
    if health_ok 2>/dev/null; then log "health: OK (/login 200, / 307 -> /login)"; return 0; fi
    sleep 3
  done
  health_ok || true
  return 1
}

flip_current() {
  local target="$1"
  [[ -d "$target" ]] || die "release dir missing: $target"
  ln -sfn "$target" "$CURRENT.next"
  mv -Tf "$CURRENT.next" "$CURRENT"
}
