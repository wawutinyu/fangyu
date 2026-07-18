#!/usr/bin/env bash
# Source this to put local Node/uv on PATH for fangyu Mac development.
# Usage: source scripts/mac-env.sh
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
TOOLS="$(cd "$ROOT/.." && pwd)/.tools"
[[ -d "$TOOLS/node/bin" ]] && export PATH="$TOOLS/node/bin:$PATH"
[[ -d "$TOOLS/uv" ]] && export PATH="$TOOLS/uv:$PATH"
[[ -f "$HOME/.local/bin/uv" ]] || true
export PATH="${HOME}/.local/bin:${PATH}"
if [[ -d "$ROOT/.venv" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.venv/bin/activate"
fi
echo "[fangyu] PATH ready — node=$(command -v node) python=$(command -v python 2>/dev/null || true)"
