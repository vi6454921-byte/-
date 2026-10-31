#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3.8+ is required. Install Python, then run this script again.' >&2
  exit 1
fi
exec python3 tools/serve.py "$@"
