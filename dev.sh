#!/usr/bin/env bash
# 方隅·序 + API — macOS / Linux 开发启动
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# 可选：项目旁工具链（uv / node）
TOOLS="$(cd "$ROOT/.." && pwd)/.tools"
[[ -d "$TOOLS/node/bin" ]] && export PATH="$TOOLS/node/bin:$PATH"
[[ -d "$TOOLS/uv" ]] && export PATH="$TOOLS/uv:$PATH"
[[ -f "$HOME/.local/bin/uv" ]] && export PATH="$HOME/.local/bin:$PATH"

if [[ ! -d node_modules ]]; then
  echo "[fangyu] 首次安装前端依赖（workspaces）..."
  npm install
fi

if [[ ! -d .venv ]]; then
  echo "[fangyu] 创建 Python 虚拟环境..."
  if command -v uv >/dev/null 2>&1; then
    uv venv .venv --python 3.12
    # shellcheck disable=SC1091
    source .venv/bin/activate
    uv pip install -e ".[dev]"
  else
    python3 -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    pip install -e ".[dev]"
  fi
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

# 清理旧进程（可选）
if [[ "${1:-}" == "--clean" ]]; then
  bash "$ROOT/dev-clean.sh" || true
fi

echo "[fangyu] 启动 API → http://127.0.0.1:8000 ..."
python -m fangyu --server &
API_PID=$!

cleanup() {
  echo "[fangyu] 停止 API (pid $API_PID)..."
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1
echo "[方隅·序] 启动 Studio → http://127.0.0.1:5173 ..."
echo
echo "  API:    http://127.0.0.1:8000"
echo "  Docs:   http://127.0.0.1:8000/docs"
echo "  Studio: http://127.0.0.1:5173"
echo "  Worker: ./dev-worker.sh"
echo
npm run dev
