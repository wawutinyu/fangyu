#!/usr/bin/env bash
# 方隅·行 — macOS / Linux 一键安装（检查依赖 + 生成可双击启动器）
# 用法（仓库根目录）: ./install-worker.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/scripts/mac-env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/mac-env.sh" >/dev/null 2>&1 || true
fi

echo ""
echo "=== Fangyu Worker install check ==="
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
  echo "[!] Python 3.10+ not found — Worker can start, but run_flow needs Studio API"
fi

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Install aborted. Fix dependencies and re-run."
  echo "  macOS tip: source scripts/mac-env.sh  # if using Projects/.tools"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "[..] npm install ..."
  npm install
else
  echo "[OK] node_modules present"
fi

if [[ -n "$py" ]]; then
  if [[ -d .venv ]]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
  fi
  echo "[..] pip install -e . ..."
  "$py" -m pip install -e . -q || echo "[!] pip install failed (non-fatal for daemon-only)"
fi

APPS="${HOME}/Applications"
mkdir -p "$APPS"
LAUNCHER="$APPS/Fangyu-Worker.command"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
cd "$ROOT"
if [[ -f scripts/mac-env.sh ]]; then source scripts/mac-env.sh; fi
if [[ -d .venv ]]; then source .venv/bin/activate; fi
exec ./dev-worker.sh
EOF
chmod +x "$LAUNCHER"
echo "[OK] launcher: $LAUNCHER"

echo ""
echo "=== Install done ==="
echo "Daily use:"
echo "  1. Studio:  ./dev.sh   →  http://127.0.0.1:5173"
echo "  2. Worker:  double-click ~/Applications/Fangyu-Worker.command"
echo "             or: ./dev-worker.sh"
echo "  3. Verify:  序顶栏应出现「行 1」；或跑 ./scripts/mac-smoke.sh"
echo ""

if [[ "${FANGYU_INSTALL_NONINTERACTIVE:-}" != "1" ]]; then
  read -r -p "Start Worker now? [Y/n] " ans || ans=n
  if [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]; then
    ./dev-worker.sh &
    echo "[OK] worker starting in background"
  fi
fi
