#!/usr/bin/env bash
# Mac 环境一键冒烟：依赖、单元测试、画布测试；若 API 已起则跑 Happy Path 脚本。
# Usage: ./scripts/mac-smoke.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/mac-env.sh"

fail=0
step() { echo ""; echo "==> $*"; }

step "python / node"
python --version
node --version
python -c "import fangyu; print('fangyu import ok')"

step "pytest unit"
if ! pytest tests/unit/ -q --tb=line; then
  fail=1
fi

step "fangyu-canvas vitest (fast)"
if ! npm run test:fast -w fangyu-canvas; then
  fail=1
fi

step "optional: studio dual-preview + happy path if API up"
if curl -sf -m 2 "http://127.0.0.1:8000/docs" >/dev/null 2>&1 \
  || curl -sf -m 2 "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
  if [[ -f scripts/studio_preview_smoke.py ]]; then
    step "studio_preview_smoke (intent + chat path + toolbar sandbox)"
    if ! python scripts/studio_preview_smoke.py; then
      fail=1
    fi
  fi
  if [[ -f scripts/happy_path_acceptance_check.py ]]; then
    step "happy_path_acceptance_check"
    python scripts/happy_path_acceptance_check.py || fail=1
  else
    echo "(no happy_path_acceptance_check.py — skip)"
  fi
else
  echo "API not running on :8000 — skip studio/happy path"
  echo "  Start in Terminal (not Cursor agent shell): ./dev.sh  or  python -m fangyu --server"
fi

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo "[fangyu] mac-smoke OK"
  exit 0
fi
echo "[fangyu] mac-smoke FAILED"
exit 1
