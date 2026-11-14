#!/bin/sh
# Checks a running rack-builder container the way a browser and the Cloudflare tunnel use it.
# Usage: deploy/smoke.sh http://localhost:8080
set -eu
base="${1:?base url}"
fail() { echo "FAIL: $1" >&2; exit 1; }
headers() { curl -fsS -o /dev/null -D - "$1" | tr -d '\r' | tr 'A-Z' 'a-z'; }

page=$(curl -fsS "$base/") || fail "the start page does not load"
echo "$page" | grep -q '<div id="root">' || fail "the start page is not the app"

# A new deploy must show up on the next visit, so the page itself may never be cached...
headers "$base/" | grep -q '^cache-control: no-cache' || fail "index.html can be cached, so a deploy would not show up"

# ...while the hashed script it points at can be kept forever.
asset=$(echo "$page" | grep -o '/assets/[^"]*\.js' | head -n 1)
[ -n "$asset" ] || fail "the start page links no script"
headers "$base$asset" | grep -q '^cache-control: .*immutable' || fail "hashed assets are not cached long term"

# Device photos are plain files next to the app.
curl -fsS -o /dev/null "$base/elevations/dell-r640.front.png" || fail "device photos are not served"

# A missing file is a real 404, not the app shell, so a broken link is visible.
code=$(curl -s -o /dev/null -w '%{http_code}' "$base/assets/gone.js")
[ "$code" = 404 ] || fail "a missing asset answered $code instead of 404"

echo "ok: $base"
