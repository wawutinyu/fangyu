#!/usr/bin/env bash
# 可选：Tauri 原生（macOS）。需已安装 Rust；Windows 请用 install-native.bat
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

TOOLS="$(cd "$ROOT/.." && pwd)/.tools"
[[ -d "$TOOLS/node/bin" ]] && export PATH="$TOOLS/node/bin:$PATH"
[[ -d "$TOOLS/uv" ]] && export PATH="$TOOLS/uv:$PATH"
if [[ -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "[fangyu] 未检测到 Rust/cargo。macOS 原生壳需要："
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo "日常开发请用 ./dev.sh（网页序 + API），不必装 Tauri。"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "[fangyu] 启动 API..."
python -m fangyu --server &
API_PID=$!
cleanup() { kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "[fangyu] 启动 Vite（序 UI）..."
npm run dev &
VITE_PID=$!
trap 'kill "$API_PID" "$VITE_PID" 2>/dev/null || true' EXIT INT TERM

sleep 2
echo "[fangyu] 启动 Tauri..."
npm run dev:native
