#!/usr/bin/env bash
# Offline tests for deploy/lightsail (no root, no network, no server).
#   bash deploy/lightsail/test/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
pass=0 fail=0
ok()  { pass=$((pass+1)); printf 'ok   %s\n' "$1"; }
bad() { fail=$((fail+1)); printf 'FAIL %s\n' "$1"; }
expect_refuse() { local name="$1"; shift; if "$HERE/bin/msetms-deploy" "$@" >/dev/null 2>&1; then bad "$name"; else ok "$name"; fi; }
SHA=baaeee20$(printf 'a%.0s' {1..32})

expect_refuse "deploy refuses with no args" --check-args
expect_refuse "deploy refuses without --approved-by-jc" --check-args --sha "$SHA"
expect_refuse "deploy refuses short sha" --check-args --sha baaeee20 --approved-by-jc "CoS 2026-10-07 09:31"
expect_refuse "deploy refuses uppercase sha" --check-args --sha "${SHA^^}" --approved-by-jc "CoS 2026-10-07 09:31"
expect_refuse "deploy refuses blank approval" --check-args --sha "$SHA" --approved-by-jc "   "
expect_refuse "deploy refuses unknown flag" --check-args --sha "$SHA" --approved-by-jc "CoS 2026-10-07 09:31" --force
if "$HERE/bin/msetms-deploy" --check-args --sha "$SHA" --approved-by-jc "CoS msg 2026-10-07 09:31" >/dev/null; then ok "deploy accepts sha + approval"; else bad "deploy accepts sha + approval"; fi

# shellcheck source=../bin/lib.sh
. "$HERE/bin/lib.sh"
check()     { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi; }
check_not() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$name"; else ok "$name"; fi; }
check     "counts equal"          counts_not_lower 272/10/7 272/10/7
check     "counts grew"           counts_not_lower 272/10/7 273/10/7
check_not "counts drop detected"  counts_not_lower 272/10/7 271/10/7
check_not "counts shape mismatch" counts_not_lower 272/10/7 272/10

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
# shellcheck disable=SC2016  # literal $ on purpose
printf '# c\nA=1\nB="two words"\nC=\x27x$y\x27\n\nnot a line\nD=\n' > "$tmp/e.env"
env_ok() {
  load_env_file "$tmp/e.env"
  # shellcheck disable=SC2016
  [[ "$A" == 1 && "$B" == "two words" && "$C" == 'x$y' && -z "$D" ]]
}
check "load_env_file parses" env_ok

# Templates must carry names only (no values) - guards against committing a secret.
names_only() { ! grep -vE '^\s*(#|$)' "$HERE"/templates/*.env.template | grep -vE '=$' | grep -vE ':NIGHTLY_KEEP_DAYS=35$' | grep -q .; }
check "env templates are names-only" names_only
check "litestream creds via env" grep -qE '(access-key-id|secret-access-key): \$\{' "$HERE/templates/litestream.yml.template"
check "unit pins TMS_SKIP_SEED=1" grep -q 'TMS_SKIP_SEED=1' "$HERE/systemd/msetms.service"
check "unit pins TZ" grep -q 'TZ=America/New_York' "$HERE/systemd/msetms.service"
bootstrap_no_msetms_enable() { ! grep -E 'systemctl[[:space:]]+enable( --now)?[[:space:]]+.*msetms' "$HERE/bootstrap.sh"; }
check "bootstrap does not enable msetms units" bootstrap_no_msetms_enable
check "msetms.service waits for current" grep -q 'ConditionPathExists=/srv/msetms/current' "$HERE/systemd/msetms.service"
check "litestream unit waits for config" grep -q 'ConditionPathExists=/etc/msetms/litestream.yml' "$HERE/systemd/msetms-litestream.service"
check "backup-nightly waits for backup.env" grep -q 'ConditionPathExists=/etc/msetms/backup.env' "$HERE/systemd/msetms-backup-nightly.service"
check "restore-test waits for backup.env" grep -q 'ConditionPathExists=/etc/msetms/backup.env' "$HERE/systemd/msetms-restore-test.service"
check "heartbeat waits for backup.env" grep -q 'ConditionPathExists=/etc/msetms/backup.env' "$HERE/systemd/msetms-heartbeat.service"
for unit in msetms-litestream.service msetms-backup-nightly.service msetms-restore-test.service msetms-heartbeat.service; do
  check "$unit pre-checks backup values" grep -q 'ExecStartPre=+/usr/local/sbin/msetms-backup-check' "$HERE/systemd/$unit"
done

write_filled_env() {
  local dest="$1"
  cat > "$dest" <<'EOF'
# COMMENT_ONLY_TOKEN must never be printed
R2_ACCOUNT_ID=acct_real_7f3a
R2_BUCKET=tms-backups-real
R2_ACCESS_KEY_ID=akid_real_7f3a
R2_SECRET_ACCESS_KEY=super-secret-value-XYZ
AGE_RECIPIENT=age1realpublickeyxxxxxxxx
UPLOADS_CRYPT_PASSWORD=crypt-pass-real-7f3a
HC_LITESTREAM_URL=https://hc.example/litestream-real
HC_BACKUP_URL=
HC_RESTORE_URL=
HC_HEARTBEAT_URL=
NIGHTLY_KEEP_DAYS=35
EOF
}

templates_fail_values() {
  local out="$tmp/tpl.out"
  if backups_configured "$HERE/templates/backup.env.template" "$HERE/templates/litestream.yml.template" >"$out" 2>&1; then
    return 1
  fi
  grep -q 'R2_ACCOUNT_ID' "$out" || return 1
  grep -q 'R2_SECRET_ACCESS_KEY' "$out" || return 1
  grep -q 'AGE_RECIPIENT' "$out" || return 1
  grep -q 'UPLOADS_CRYPT_PASSWORD' "$out" || return 1
  grep -q 'HC_LITESTREAM_URL' "$out" || return 1
  grep -q 'HC_BACKUP_URL' "$out" && return 1
  grep -q 'NIGHTLY_KEEP_DAYS' "$out" && return 1
  return 0
}
check "template backup.env fails the value check" templates_fail_values

filled_backup_ok() {
  write_filled_env "$tmp/filled.env"
  backups_configured "$tmp/filled.env" "$HERE/templates/litestream.yml.template"
}
check "filled backup.env passes" filled_backup_ok

partial_lists_names_only() {
  cat > "$tmp/partial.env" <<'EOF'
# COMMENT_ONLY_TOKEN must never be printed
R2_ACCOUNT_ID=
R2_BUCKET=""
R2_ACCESS_KEY_ID='xxx'
R2_SECRET_ACCESS_KEY=super-secret-value-XYZ
AGE_RECIPIENT=CHANGEME
UPLOADS_CRYPT_PASSWORD="<put-a-pass-here>"
HC_LITESTREAM_URL=REPLACE_WITH_URL
HC_BACKUP_URL=
NIGHTLY_KEEP_DAYS=35
EOF
  local out="$tmp/partial.out" token
  if backups_configured "$tmp/partial.env" "$HERE/templates/litestream.yml.template" >"$out" 2>&1; then
    return 1
  fi
  grep -q 'R2_ACCOUNT_ID' "$out" || return 1
  grep -q 'R2_BUCKET' "$out" || return 1
  grep -q 'R2_ACCESS_KEY_ID' "$out" || return 1
  grep -q 'AGE_RECIPIENT' "$out" || return 1
  grep -q 'UPLOADS_CRYPT_PASSWORD' "$out" || return 1
  grep -q 'HC_LITESTREAM_URL' "$out" || return 1
  grep -q 'R2_SECRET_ACCESS_KEY' "$out" && return 1
  grep -q 'super-secret-value-XYZ' "$out" && return 1
  grep -q 'COMMENT_ONLY_TOKEN' "$out" && return 1
  grep -q 'put-a-pass-here' "$out" && return 1
  grep -q 'REPLACE_WITH_URL' "$out" && return 1
  grep -q 'acct_real' "$out" && return 1
  while read -r token; do
    [[ -n "$token" ]] || continue
    [[ "$token" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || return 1
  done < <(tr ' \n' '\n' < "$out")
  return 0
}
check "partial fixture lists missing names only" partial_lists_names_only

install_fake_systemctl() {
  mkdir -p "$tmp/bin"
  cat > "$tmp/bin/systemctl" <<EOF
#!/bin/sh
printf '%s\\n' "\$*" >> "$tmp/systemctl.log"
exit 0
EOF
  chmod 755 "$tmp/bin/systemctl"
  : > "$tmp/systemctl.log"
}

deploy_templates_skip_backups() {
  install_fake_systemctl
  local out="$tmp/deploy-tpl.out"
  hash -r
  if ! PATH="$tmp/bin:$PATH" \
      BACKUP_ENV="$HERE/templates/backup.env.template" \
      LITESTREAM_CONFIG="$HERE/templates/litestream.yml.template" \
      enable_backup_units >"$out" 2>&1; then
    return 1
  fi
  grep -q 'backups not enabled yet, missing keys:' "$out" || return 1
  grep -q 'R2_SECRET_ACCESS_KEY' "$out" || return 1
  grep -q 'msetms-litestream' "$tmp/systemctl.log" && return 1
  grep -q 'msetms-backup-nightly' "$tmp/systemctl.log" && return 1
  grep -q 'msetms-restore-test' "$tmp/systemctl.log" && return 1
  grep -q 'msetms-heartbeat' "$tmp/systemctl.log" && return 1
  grep -q 'enable_backup_units' "$HERE/bin/msetms-deploy" || return 1
  # shellcheck disable=SC2016  # literal $ on purpose
  grep -F -q '[[ -s "$LITESTREAM_CONFIG"' "$HERE/bin/msetms-deploy" && return 1
  return 0
}
check "deploy with templates does not enable backups" deploy_templates_skip_backups

deploy_filled_enables_backups() {
  write_filled_env "$tmp/filled.env"
  install_fake_systemctl
  local out="$tmp/deploy-filled.out"
  hash -r
  PATH="$tmp/bin:$PATH" \
    BACKUP_ENV="$tmp/filled.env" \
    LITESTREAM_CONFIG="$HERE/templates/litestream.yml.template" \
    enable_backup_units >"$out" 2>&1 || return 1
  grep -q 'enable msetms-litestream.service msetms-backup-nightly.timer msetms-restore-test.timer msetms-heartbeat.timer' "$tmp/systemctl.log" || return 1
  grep -q 'super-secret-value-XYZ' "$out" && return 1
  grep -q 'crypt-pass-real-7f3a' "$out" && return 1
  return 0
}
check "filled backup.env enables backup units" deploy_filled_enables_backups

check_script_names_only() {
  local out="$tmp/check.out" rc
  set +e
  BACKUP_ENV="$tmp/partial.env" LITESTREAM_CONFIG="$HERE/templates/litestream.yml.template" \
    "$HERE/bin/msetms-backup-check" >"$out" 2>"$tmp/check.err"
  rc=$?
  set -e
  [[ $rc -eq 78 ]] || return 1
  grep -q 'super-secret-value-XYZ' "$out" && return 1
  grep -q 'super-secret-value-XYZ' "$tmp/check.err" && return 1
  grep -q 'R2_BUCKET' "$out" || return 1
  return 0
}
check "backup-check prints names only" check_script_names_only

if command -v shellcheck >/dev/null; then
  if shellcheck -x -P "$HERE/bin" "$HERE"/bootstrap.sh "$HERE"/install-cloudflared.sh "$HERE"/bin/* "$HERE"/test/run.sh; then ok "shellcheck clean"; else bad "shellcheck clean"; fi
else echo "skip shellcheck (not installed)"; fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
