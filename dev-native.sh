#!/usr/bin/env bash
# 方隅 — macOS 原生开发启动（Tauri 窗口 = 序 UI + API + Worker）
# 需已安装 Rust；Windows 请用 install-native.bat / dev-native.bat
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

TOOLS="$(cd "$ROOT/.." && pwd)/.tools"
[[ -d "$TOOLS/node/bin" ]] && export PATH="$TOOLS/node/bin:$PATH"
[[ -d "$TOOLS/uv" ]] && export PATH="$TOOLS/uv:$PATH"
if [[ -f "$ROOT/scripts/mac-env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/mac-env.sh" >/dev/null 2>&1 || true
fi
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env" >/dev/null 2>&1 || true

if [[ -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "[fangyu] 未检测到 Rust/cargo。macOS 原生壳需要："
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo "  然后: ./install-native.sh"
  echo "日常开发请用 ./dev.sh（网页序 + API），不必装 Tauri。"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi
if [[ ! -d fangyu-worker-tauri/node_modules ]]; then
  (cd fangyu-worker-tauri && npm install)
fi

export FANGYU_REPO_ROOT="${FANGYU_REPO_ROOT:-$ROOT}"
export FANGYU_DATA_DIR="${FANGYU_DATA_DIR:-$ROOT/data}"
export FANGYU_API_BASE="${FANGYU_API_BASE:-http://127.0.0.1:8000}"

CONFIG_DIR="${HOME}/Library/Application Support/Fangyu"
mkdir -p "$CONFIG_DIR"
python3 - <<PY
import json
from pathlib import Path
Path(r"""$CONFIG_DIR/native.json""").write_text(json.dumps({
  "repo_root": r"""$ROOT""",
  "data_dir": r"""$FANGYU_DATA_DIR""",
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

API_PID=""
VITE_PID=""
cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$VITE_PID" ]] && kill "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 已有网页序在跑时直接复用，避免端口冲突
if curl -sf -o /dev/null http://127.0.0.1:8000/docs; then
  echo "[fangyu] 复用已有 API :8000"
else
  echo "[fangyu] 启动 API..."
  python -m fangyu --server &
  API_PID=$!
fi

if curl -sf -o /dev/null http://127.0.0.1:5173/; then
  echo "[fangyu] 复用已有 Vite :5173"
else
  echo "[fangyu] 启动 Vite（序 UI）..."
  npm run dev &
  VITE_PID=$!
  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null http://127.0.0.1:5173/; then
      break
    fi
    sleep 0.5
  done
fi

echo "[fangyu] 启动 Tauri 原生窗口（首次会编译，可能要几分钟）..."
npm run dev:native
