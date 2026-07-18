#!/usr/bin/env bash
# 方隅 — macOS 打包 (.app / .dmg)
# 用法: ./build-native.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/scripts/mac-env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/mac-env.sh" >/dev/null 2>&1 || true
fi
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env" >/dev/null 2>&1 || true

if ! command -v cargo >/dev/null 2>&1; then
  echo "[fangyu] 需要 Rust/cargo。先跑: ./install-native.sh"
  exit 1
fi

if [[ -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if [[ ! -d node_modules ]]; then
  npm install
fi
if [[ ! -d fangyu-worker-tauri/node_modules ]]; then
  (cd fangyu-worker-tauri && npm install)
fi

echo "[fangyu] building studio + Tauri (app/dmg)..."
npm run build:native

echo ""
echo "产物目录:"
echo "  fangyu-worker-tauri/src-tauri/target/release/bundle/macos/"
echo "  fangyu-worker-tauri/src-tauri/target/release/bundle/dmg/"
ls -la fangyu-worker-tauri/src-tauri/target/release/bundle/macos 2>/dev/null || true
ls -la fangyu-worker-tauri/src-tauri/target/release/bundle/dmg 2>/dev/null || true
