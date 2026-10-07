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

if command -v shellcheck >/dev/null; then
  if shellcheck -x -P "$HERE/bin" "$HERE"/bootstrap.sh "$HERE"/install-cloudflared.sh "$HERE"/bin/* "$HERE"/test/run.sh; then ok "shellcheck clean"; else bad "shellcheck clean"; fi
else echo "skip shellcheck (not installed)"; fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
