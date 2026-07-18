#!/usr/bin/env bash
# 方隅·行 Worker — 本机守护（需 API 已启动）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

TOOLS="$(cd "$ROOT/.." && pwd)/.tools"
[[ -d "$TOOLS/node/bin" ]] && export PATH="$TOOLS/node/bin:$PATH"

if [[ ! -d node_modules ]]; then
  echo "[fangyu] 首次安装前端依赖..."
  npm install
fi

export FANGYU_API_URL="${FANGYU_API_URL:-http://127.0.0.1:8000}"
echo "[方隅·行] 连接序 API $FANGYU_API_URL ..."
echo "[方隅·行] 在画布点「派发至行」即可下发任务"
echo
npm run dev:worker
