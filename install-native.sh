#!/usr/bin/env bash
# 方隅 — macOS 原生一键安装（依赖检查 + ~/Applications 启动器 + native.json）
# 用法（仓库根目录）: ./install-native.sh
# 非交互: FANGYU_INSTALL_NONINTERACTIVE=1 ./install-native.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
TAURI_ROOT="$ROOT/fangyu-worker-tauri"

if [[ -f "$ROOT/scripts/mac-env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/mac-env.sh" >/dev/null 2>&1 || true
fi
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env" >/dev/null 2>&1 || true

echo ""
echo "=== Fangyu Native install check (macOS) ==="
echo "Repo: $ROOT"
echo ""

fail=0
need() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "[X] $name not found"
    fail=1
    return 1
  fi
  return 0
}

if need node; then
  major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [[ "$major" -lt 18 ]]; then
    echo "[X] Node $(node -v) too old, need >= 18"
    fail=1
  else
    echo "[OK] Node $(node -v)"
  fi
fi
need npm && echo "[OK] npm $(npm -v)"

py=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then
    if "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      py="$c"
      echo "[OK] Python ($c) ready"
      break
    fi
  fi
done
if [[ -z "$py" ]]; then
  echo "[X] Python 3.10+ required for API"
  fail=1
fi

if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "[X] Rust not found — macOS 原生壳需要 rustup:"
  echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo "    然后重新打开终端，再跑 ./install-native.sh"
  fail=1
else
  echo "[OK] rustc $(rustc --version)"
fi

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Install aborted. Fix dependencies and re-run."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "[..] npm install ..."
  npm install
else
  echo "[OK] node_modules present"
fi

if [[ ! -d "$TAURI_ROOT/node_modules" ]]; then
  echo "[..] npm install (fangyu-worker-tauri) ..."
  (cd "$TAURI_ROOT" && npm install)
else
  echo "[OK] fangyu-worker-tauri node_modules present"
fi

if [[ -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
echo "[..] pip install -e . ..."
"$py" -m pip install -e . -q || echo "[!] pip install failed (non-fatal if already installed)"

CONFIG_DIR="${HOME}/Library/Application Support/Fangyu"
mkdir -p "$CONFIG_DIR"
CONFIG_PATH="$CONFIG_DIR/native.json"
python3 - <<PY
import json
from pathlib import Path
cfg = {
  "repo_root": r"""$ROOT""",
  "data_dir": r"""$ROOT/data""",
}
Path(r"""$CONFIG_PATH""").write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("[OK] config:", r"""$CONFIG_PATH""")
PY

APPS="${HOME}/Applications"
mkdir -p "$APPS"
LAUNCHER="$APPS/Fangyu.command"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
cd "$ROOT"
if [[ -f scripts/mac-env.sh ]]; then source scripts/mac-env.sh; fi
if [[ -f "\$HOME/.cargo/env" ]]; then source "\$HOME/.cargo/env"; fi
if [[ -d .venv ]]; then source .venv/bin/activate; fi
exec ./dev-native.sh
EOF
chmod +x "$LAUNCHER"
echo "[OK] launcher: $LAUNCHER"

# 可选：在桌面放一份同名启动器
DESKTOP="${HOME}/Desktop/Fangyu.command"
if [[ -d "${HOME}/Desktop" ]]; then
  cp "$LAUNCHER" "$DESKTOP"
  chmod +x "$DESKTOP"
  echo "[OK] desktop: $DESKTOP"
fi

echo ""
echo "=== Install done ==="
echo "Daily use:"
echo "  1. Double-click ~/Applications/Fangyu.command  (or Desktop Fangyu.command)"
echo "  2. Or: ./dev-native.sh"
echo "  3. Config: ~/Library/Application Support/Fangyu/native.json"
echo "  4. Build .app/.dmg: ./build-native.sh"
echo ""

if [[ "${FANGYU_INSTALL_NONINTERACTIVE:-}" != "1" ]]; then
  read -r -p "Start Fangyu native now? [Y/n] " ans || ans=n
  if [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]; then
    ./dev-native.sh
  fi
fi
