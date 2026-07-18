#!/usr/bin/env bash
# 释放开发端口，避免旧进程干扰
set -euo pipefail

PORTS=(5173 5180 8000)
echo "[fangyu] 正在释放端口 ${PORTS[*]} ..."

for port in "${PORTS[@]}"; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    echo "  终止端口 $port → PID $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
done

echo
echo "[fangyu] 端口已清理。请重新启动："
echo "  ./dev.sh          — 方隅·序 + API"
echo "  ./dev-worker.sh   — 方隅·行 Worker"
echo "  ./dev-native.sh   — （可选）Tauri 原生，需 Rust"
