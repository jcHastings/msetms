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
BACKUP_ENV="/etc/msetms/backup.env"
LITESTREAM_CONFIG="/etc/msetms/litestream.yml"
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
