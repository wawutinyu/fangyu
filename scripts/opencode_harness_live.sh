#!/usr/bin/env bash
# OpenCode harness live 包装（有 Key 才跑）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f scripts/mac-env.sh ]]; then
  # shellcheck disable=SC1091
  source scripts/mac-env.sh >/dev/null 2>&1 || true
fi
if [[ -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
exec python scripts/opencode_harness_live.py "$@"
