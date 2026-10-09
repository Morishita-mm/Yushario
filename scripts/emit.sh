#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: scripts/emit.sh STATE [DETAIL]" >&2
  exit 1
fi

# Node escapes quotes, backslashes and newlines correctly for JSON.
payload=$(node -e 'console.log(JSON.stringify({ state: process.argv[1], detail: process.argv[2] }))' "$1" "${2-}")
curl --fail --silent --show-error \
  -X POST "http://localhost:${PORT:-8790}/event" \
  -H 'Content-Type: application/json' \
  --data "$payload"
